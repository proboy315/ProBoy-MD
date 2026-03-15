/**
 * Antidelete Plugin for ProBoy‑MD
 *
 * Stores incoming messages (including media) so they can be re-sent if a user
 * deletes them "for everyone".
 *
 * Notes:
 * - Media MUST be downloaded at receive-time (after delete it can’t be fetched).
 * - Works in private + groups + status broadcasts (status recoveries are sent to owner by default).
 * - No GiftedTech APIs. No noisy console logs.
 */

const { downloadMediaMessage, jidDecode, jidEncode } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const database = require('../../database');

const DB_DIR = path.join(__dirname, '..', '..', 'database');
const CACHE_FILE = path.join(DB_DIR, 'antidelete_cache_v2.json');
const MEDIA_DIR = path.join(DB_DIR, 'antidelete_media');
const CONFIG_PATH = path.join(__dirname, '..', '..', 'config.js');

const CACHE_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours
const MAX_RECORDS = 2000;

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

let messageCache = new Map(); // key -> record
const processedDeletes = new Map(); // deleteKey -> timestamp (dedupe)

const cacheKey = (remoteJid, id) => `${remoteJid || 'unknown'}|${id || 'unknown'}`;

const findCachedRecord = (remoteJid, id) => {
  if (!id) return null;

  if (remoteJid) {
    const directKey = cacheKey(remoteJid, id);
    const direct = messageCache.get(directKey);
    if (direct) return { mapKey: directKey, record: direct };
  }

  // Fallback: remoteJid may differ (e.g. PN vs LID). Match by message id only.
  const suffix = `|${id}`;
  for (const [k, v] of messageCache.entries()) {
    if (typeof k === 'string' && k.endsWith(suffix)) {
      return { mapKey: k, record: v };
    }
  }

  return null;
};

const safeReadJson = (filePath) => {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const safeWriteJson = (filePath, data) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch {
    return false;
  }
};

const getMessageContent = (msg) => {
  if (!msg || !msg.message) return null;
  let m = msg.message;
  if (m.ephemeralMessage) m = m.ephemeralMessage.message;
  if (m.viewOnceMessageV2) m = m.viewOnceMessageV2.message;
  if (m.viewOnceMessage) m = m.viewOnceMessage.message;
  if (m.documentWithCaptionMessage) m = m.documentWithCaptionMessage.message;
  return m;
};

const getFirstMessageType = (content) => {
  if (!content) return null;
  const keys = Object.keys(content);
  const protocolMessages = ['protocolMessage', 'senderKeyDistributionMessage', 'messageContextInfo'];
  const actual = keys.filter(k => !protocolMessages.includes(k));
  return actual[0] || null;
};

const normalizeOwnerJid = () => {
  const owner = Array.isArray(config.ownerNumber) ? config.ownerNumber[0] : null;
  if (!owner) return null;
  return owner.includes('@') ? owner : `${owner}@s.whatsapp.net`;
};

const getConfigDefaults = () => {
  const settings = config.antideleteSettings || {};
  const fallbackEnabled =
    typeof config.defaultGroupSettings?.antidelete === 'boolean'
      ? config.defaultGroupSettings.antidelete
      : true;

  return {
    enabled: typeof settings.enabled === 'boolean' ? settings.enabled : fallbackEnabled,
    dest: typeof settings.dest === 'string' && settings.dest.trim() ? settings.dest.trim() : 'chat',
    statusDest: typeof settings.statusDest === 'string' && settings.statusDest.trim() ? settings.statusDest.trim() : 'owner',
    bannerImageUrl: typeof settings.bannerImageUrl === 'string' ? settings.bannerImageUrl.trim() : ''
  };
};

const upsertAntideleteSettingsInConfig = (newSettings) => {
  try {
    const current = fs.readFileSync(CONFIG_PATH, 'utf8');
    const normalized = {
      enabled: !!newSettings.enabled,
      dest: String(newSettings.dest || 'chat'),
      statusDest: String(newSettings.statusDest || 'owner'),
      bannerImageUrl: String(newSettings.bannerImageUrl || '')
    };

    const block =
      `    antideleteSettings: {\n` +
      `      enabled: ${normalized.enabled},\n` +
      `      dest: '${normalized.dest.replace(/'/g, "\\'")}',\n` +
      `      statusDest: '${normalized.statusDest.replace(/'/g, "\\'")}',\n` +
      `      bannerImageUrl: '${normalized.bannerImageUrl.replace(/'/g, "\\'")}'\n` +
      `    },\n`;

    let updated = current;
    const existingBlockRegex = /(^\s*antideleteSettings\s*:\s*\{[\s\S]*?\}\s*,\s*$)/m;

    if (existingBlockRegex.test(updated)) {
      updated = updated.replace(existingBlockRegex, block.trimEnd());
      if (!updated.endsWith('\n')) updated += '\n';
      fs.writeFileSync(CONFIG_PATH, updated);
      return true;
    }

    const afterDefaultGroupRegex = /(^\s*defaultGroupSettings\s*:\s*\{[\s\S]*?\}\s*,\s*$)/m;
    if (afterDefaultGroupRegex.test(updated)) {
      updated = updated.replace(afterDefaultGroupRegex, (match) => `${match}\n${block.trimEnd()}`);
      if (!updated.endsWith('\n')) updated += '\n';
      fs.writeFileSync(CONFIG_PATH, updated);
      return true;
    }

    const endRegex = /\n\};\s*$/;
    if (endRegex.test(updated)) {
      updated = updated.replace(endRegex, `\n\n${block.trimEnd()}\n};\n`);
      fs.writeFileSync(CONFIG_PATH, updated);
      return true;
    }

    return false;
  } catch {
    return false;
  }
};

const lidMappingCache = new Map();

const getLidMappingValue = (user, direction) => {
  if (!user) return null;

  const key = `${direction}:${user}`;
  if (lidMappingCache.has(key)) return lidMappingCache.get(key);

  const sessionPath = path.join(__dirname, '..', '..', config.sessionName || 'session');
  const suffix = direction === 'pnToLid' ? '.json' : '_reverse.json';
  const filePath = path.join(sessionPath, `lid-mapping-${user}${suffix}`);

  if (!fs.existsSync(filePath)) {
    lidMappingCache.set(key, null);
    return null;
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    const value = raw ? JSON.parse(raw) : null;
    lidMappingCache.set(key, value || null);
    return value || null;
  } catch {
    lidMappingCache.set(key, null);
    return null;
  }
};

// Convert any LID JID to PN JID when possible (more reliable for sending)
const normalizeJidWithLid = (jid) => {
  if (!jid || typeof jid !== 'string') return jid;
  if (jid.endsWith('@g.us') || jid === 'status@broadcast') return jid;

  try {
    const decoded = jidDecode(jid);
    if (!decoded?.user) return jid;

    let user = decoded.user;
    const pnUser = getLidMappingValue(user, 'lidToPn');
    if (pnUser) user = pnUser;

    return jidEncode(user, 's.whatsapp.net');
  } catch {
    return jid;
  }
};

const guessExt = (type, mimetype, fileName) => {
  if (fileName && fileName.includes('.')) {
    const ext = path.extname(fileName).slice(1);
    if (ext) return ext;
  }
  const mt = (mimetype || '').toLowerCase();
  if (type === 'stickerMessage') return 'webp';
  if (type === 'imageMessage') return 'jpg';
  if (type === 'videoMessage') return 'mp4';
  if (type === 'audioMessage') return mt.includes('ogg') ? 'ogg' : 'mp3';
  if (mt.includes('pdf')) return 'pdf';
  if (mt.includes('zip')) return 'zip';
  if (mt.includes('rar')) return 'rar';
  if (mt.includes('7z')) return '7z';
  if (mt.includes('json')) return 'json';
  if (mt.includes('plain')) return 'txt';
  return 'bin';
};

const buildBannerContextInfo = (deleterJid, senderJid) => {
  const defaults = getConfigDefaults();
  const globalThumb = database.getGlobalSetting('antideleteBannerImageUrl');
  const thumb = (typeof globalThumb === 'string' ? globalThumb.trim() : '') || defaults.bannerImageUrl || config.menuImageUrl || '';
  if (!thumb) return undefined;

  const deleterNum = deleterJid ? String(deleterJid).split('@')[0] : 'Unknown';
  const senderNum = senderJid ? String(senderJid).split('@')[0] : 'Unknown';

  return {
    externalAdReply: {
      title: 'ANTIDELETE',
      body: `Deleted by: ${deleterNum} | Sender: ${senderNum}`,
      thumbnailUrl: thumb,
      sourceUrl: thumb,
      mediaType: 1,
      renderLargerThumbnail: true,
      showAdAttribution: false
    }
  };
};

const getContactName = (sock, jid) => {
  const j = normalizeJidWithLid(jid);
  const contact = sock?.store?.contacts?.[j] || sock?.contacts?.[j] || null;
  const name = contact?.notify || contact?.name || contact?.verifiedName || '';
  const cleaned = typeof name === 'string' ? name.trim() : '';
  return cleaned;
};

const pruneCache = () => {
  const now = Date.now();

  // TTL prune
  for (const [k, v] of messageCache.entries()) {
    if (!v || !v.timestamp || now - v.timestamp > CACHE_TTL_MS) {
      if (v?.media?.path) {
        try { fs.unlinkSync(v.media.path); } catch {}
      }
      messageCache.delete(k);
    }
  }

  // Size prune (oldest first)
  if (messageCache.size > MAX_RECORDS) {
    const sorted = Array.from(messageCache.entries()).sort((a, b) => (a[1]?.timestamp || 0) - (b[1]?.timestamp || 0));
    const removeCount = messageCache.size - MAX_RECORDS;
    for (let i = 0; i < removeCount; i++) {
      const [k, v] = sorted[i] || [];
      if (!k) continue;
      if (v?.media?.path) {
        try { fs.unlinkSync(v.media.path); } catch {}
      }
      messageCache.delete(k);
    }
  }

  // Delete dedupe prune
  for (const [k, ts] of processedDeletes.entries()) {
    if (!ts || now - ts > 5 * 60 * 1000) processedDeletes.delete(k);
  }
};

const loadCache = () => {
  const obj = safeReadJson(CACHE_FILE);
  if (!obj) return;
  const entries = Object.entries(obj);
  messageCache = new Map(entries);
  pruneCache();
};

const saveCache = () => {
  pruneCache();
  safeWriteJson(CACHE_FILE, Object.fromEntries(messageCache));
};

loadCache();

let saveScheduled = false;
const scheduleSave = () => {
  if (saveScheduled) return;
  saveScheduled = true;
  setTimeout(() => {
    saveScheduled = false;
    saveCache();
  }, 2000);
};

setInterval(() => {
  saveCache();
}, 60 * 1000);

module.exports = {
  name: 'antidelete',
  aliases: ['antidel'],
  category: 'general',
  description: 'Recover deleted messages (text + media) everywhere',
  usage: '.antidelete <on/off/status/setdest/setstatusdest/setbanner>',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const { reply, react } = extra;

    const subCmd = args[0] ? args[0].toLowerCase() : '';

    try {
      await react('⏳');

      if (subCmd === 'on' || subCmd === 'enable') {
        database.setGlobalSetting('antidelete', true);
        const defaults = getConfigDefaults();
        upsertAntideleteSettingsInConfig({ ...defaults, enabled: true });
        await reply('✅ Antidelete enabled globally.');
      } else if (subCmd === 'off' || subCmd === 'disable') {
        database.setGlobalSetting('antidelete', false);
        const defaults = getConfigDefaults();
        upsertAntideleteSettingsInConfig({ ...defaults, enabled: false });
        await reply('❌ Antidelete disabled globally.');
      } else if (subCmd === 'setdest') {
        const dest = (args[1] || '').trim();
        if (!dest) return reply(`❌ Usage: ${this.usage}\nExample: .antidelete setdest chat`);

        if (dest === 'chat') {
          database.setGlobalSetting('antideleteDest', 'chat');
          const defaults = getConfigDefaults();
          upsertAntideleteSettingsInConfig({ ...defaults, dest: 'chat' });
          await reply('✅ Recovery destination set to: original chat.');
        } else if (dest === 'owner') {
          database.setGlobalSetting('antideleteDest', 'owner');
          const defaults = getConfigDefaults();
          upsertAntideleteSettingsInConfig({ ...defaults, dest: 'owner' });
          await reply('✅ Recovery destination set to: owner DM.');
        } else {
          if (!dest.includes('@') || (!dest.endsWith('@s.whatsapp.net') && !dest.endsWith('@g.us'))) {
            return reply('❌ Invalid JID. Use e.g. 1234567890@s.whatsapp.net');
          }
          database.setGlobalSetting('antideleteDest', dest);
          const defaults = getConfigDefaults();
          upsertAntideleteSettingsInConfig({ ...defaults, dest });
          await reply(`✅ Recovery destination set to: ${dest}`);
        }
      } else if (subCmd === 'setstatusdest') {
        const dest = (args[1] || '').trim();
        if (!dest) return reply('❌ Example: .antidelete setstatusdest owner OR .antidelete setstatusdest 123@s.whatsapp.net');

        if (dest === 'owner') {
          database.setGlobalSetting('antideleteStatusDest', 'owner');
          const defaults = getConfigDefaults();
          upsertAntideleteSettingsInConfig({ ...defaults, statusDest: 'owner' });
          await reply('✅ Status recovery destination set to: owner DM.');
        } else {
          if (!dest.includes('@') || (!dest.endsWith('@s.whatsapp.net') && !dest.endsWith('@g.us'))) {
            return reply('❌ Invalid JID. Use e.g. 1234567890@s.whatsapp.net');
          }
          database.setGlobalSetting('antideleteStatusDest', dest);
          const defaults = getConfigDefaults();
          upsertAntideleteSettingsInConfig({ ...defaults, statusDest: dest });
          await reply(`✅ Status recovery destination set to: ${dest}`);
        }
      } else if (subCmd === 'setbanner') {
        const url = (args.slice(1).join(' ') || '').trim();
        database.setGlobalSetting('antideleteBannerImageUrl', url);
        const defaults = getConfigDefaults();
        upsertAntideleteSettingsInConfig({ ...defaults, bannerImageUrl: url });
        await reply(url ? '✅ Banner thumbnail URL updated.' : '✅ Banner thumbnail cleared.');
      } else if (subCmd === 'status') {
        const defaults = getConfigDefaults();
        const enabled = database.getGlobalSetting('antidelete');
        const effectiveEnabled = enabled === undefined ? defaults.enabled : !!enabled;
        const dest = database.getGlobalSetting('antideleteDest') || defaults.dest;
        const statusDest = database.getGlobalSetting('antideleteStatusDest') || defaults.statusDest;
        const banner = database.getGlobalSetting('antideleteBannerImageUrl') || defaults.bannerImageUrl;
        await reply(
          `📊 *Antidelete Status*\n\n` +
          `Enabled: ${effectiveEnabled ? '✅' : '❌'}\n` +
          `Recover to: ${dest}\n` +
          `Status recover to: ${statusDest}\n` +
          `Banner: ${banner ? '✅ set' : '❌ none'}\n` +
          `Cache: ${messageCache.size} items`
        );
      } else {
        await reply(
          `*Antidelete (Owner)*\n\n` +
          `.antidelete on\n` +
          `.antidelete off\n` +
          `.antidelete status\n` +
          `.antidelete setdest chat|owner|<jid>\n` +
          `.antidelete setstatusdest owner|<jid>\n` +
          `.antidelete setbanner <url>\n`
        );
      }

      await react('✅');
    } catch (error) {
      await reply(`❌ ${error.message}`);
      await react('❌');
    }
  },

  async handleMessage(sock, msg, extra) {
    const defaults = getConfigDefaults();
    const enabled = database.getGlobalSetting('antidelete');
    const effectiveEnabled = enabled === undefined ? defaults.enabled : !!enabled;
    if (!effectiveEnabled) return;

    const { from, sender } = extra;
    const msgId = msg.key?.id;
    if (!msgId) return;

    const content = getMessageContent(msg);
    if (!content) return;

    // Skip protocol-only messages (revoke, etc.)
    const type = getFirstMessageType(content);
    if (!type) return;

    // Respect per-chat toggle if present
    // (works for groups + private since database.js treats both as "chat settings")
    if (from !== 'status@broadcast') {
      const chatSettings = database.getChatSettings(from);
      if (chatSettings && chatSettings.antidelete === false) return;
    }

    const record = {
      timestamp: Date.now(),
      chatJid: from,
      msgId,
      sender,
      type,
      text: null,
      caption: null,
      media: null,
      flags: {
        viewOnce: !!(msg.message?.viewOnceMessageV2 || msg.message?.viewOnceMessage)
      }
    };

    const msgContent = content[type];

    if (type === 'conversation') {
      record.text = typeof msgContent === 'string' ? msgContent : null;
    } else if (type === 'extendedTextMessage') {
      record.text = msgContent?.text || null;
    } else if (type === 'imageMessage' || type === 'videoMessage') {
      record.caption = msgContent?.caption || null;
    } else if (type === 'documentMessage') {
      record.caption = msgContent?.caption || null;
    }

    if (type === 'imageMessage' || type === 'videoMessage' || type === 'audioMessage' || type === 'documentMessage' || type === 'stickerMessage') {
      try {
        const msgForDl = { ...msg, message: content };
        const buffer = await downloadMediaMessage(msgForDl, 'buffer', {});
        if (buffer && Buffer.isBuffer(buffer) && buffer.length) {
          const mimetype = msgContent?.mimetype || null;
          const fileName = msgContent?.fileName || null;
          const ext = guessExt(type, mimetype, fileName);
          const fileBase = `${Date.now()}_${msgId.replace(/[^a-zA-Z0-9_-]/g, '')}.${ext}`;
          const filePath = path.join(MEDIA_DIR, fileBase);
          fs.writeFileSync(filePath, buffer);

          record.media = {
            path: filePath,
            mimetype,
            fileName,
            ptt: !!msgContent?.ptt
          };
        }
      } catch {
        // Media may fail to download (e.g. missing keys); still keep metadata.
        record.media = record.media || null;
      }
    }

    const key = cacheKey(from, msgId);
    messageCache.set(key, record);
    scheduleSave();
  },

  async handleDelete(sock, deleteInfo) {
    const defaults = getConfigDefaults();
    const enabled = database.getGlobalSetting('antidelete');
    const effectiveEnabled = enabled === undefined ? defaults.enabled : !!enabled;
    if (!effectiveEnabled) return;

    const key = deleteInfo?.key;
    if (!key?.id) return;

    const deleteDedupeKey = cacheKey(key.remoteJid || 'unknown', key.id);
    if (processedDeletes.has(deleteDedupeKey)) return;
    processedDeletes.set(deleteDedupeKey, Date.now());

    const found = findCachedRecord(key.remoteJid, key.id);
    if (!found) return;
    const { mapKey: cachedKey, record: cached } = found;

    // Remove from cache so it can't be re-sent twice
    messageCache.delete(cachedKey);
    scheduleSave();

    const sender = cached.sender ? normalizeJidWithLid(cached.sender) : null;
    const chatJid = cached.chatJid;
    const deleter = deleteInfo?.deleter ? normalizeJidWithLid(deleteInfo.deleter) : null;

    // Determine destination for chat messages
    const destSetting = database.getGlobalSetting('antideleteDest') || defaults.dest;
    const statusDestSetting = database.getGlobalSetting('antideleteStatusDest') || defaults.statusDest;

    let targetJid = chatJid;
    if (chatJid === 'status@broadcast') {
      if (statusDestSetting === 'owner') targetJid = normalizeOwnerJid();
      else targetJid = statusDestSetting;
    } else if (destSetting === 'chat') {
      targetJid = chatJid;
    } else if (destSetting === 'owner') {
      targetJid = normalizeOwnerJid();
    } else {
      targetJid = destSetting;
    }

    if (!targetJid) return;
    targetJid = normalizeJidWithLid(targetJid);

    const mentions = [];
    if (sender) mentions.push(sender);
    if (deleter && deleter !== sender) mentions.push(deleter);

    const senderNum = sender ? String(sender).split('@')[0] : 'Unknown';
    const deleterNum = deleter ? String(deleter).split('@')[0] : senderNum;
    const senderName = sender ? getContactName(sock, sender) : '';
    const deleterName = deleter ? getContactName(sock, deleter) : '';

    const headerLines = [];
    headerLines.push('*ANTIDELETE*');
    headerLines.push(`🗑️ Deleted by: @${deleterNum}${deleterName ? ` (${deleterName})` : ''}`);
    headerLines.push(`👤 Sender: @${senderNum}${senderName ? ` (${senderName})` : ''}`);
    if (chatJid !== 'status@broadcast') headerLines.push(`💬 Chat: ${chatJid}`);
    else headerLines.push('📌 Source: status@broadcast');

    const baseCaption = headerLines.join('\n');
    const contextInfo = buildBannerContextInfo(deleter, sender);

    const type = cached.type;
    const mediaPath = cached.media?.path || null;

    try {
      if (type === 'conversation' || type === 'extendedTextMessage') {
        const text = cached.text || '';
        const out = `${baseCaption}\n\n📝 Text:\n${text}`.trim();
        await sock.sendMessage(targetJid, { text: out, mentions, contextInfo }, {});
        return;
      }

      if (type === 'imageMessage' && mediaPath) {
        const cap = cached.caption ? `${baseCaption}\n\n📝 Caption:\n${cached.caption}` : baseCaption;
        await sock.sendMessage(
          targetJid,
          { image: { url: mediaPath }, caption: cap, mentions, contextInfo, viewOnce: !!cached.flags?.viewOnce },
          {}
        );
        try { fs.unlinkSync(mediaPath); } catch {}
        return;
      }

      if (type === 'videoMessage' && mediaPath) {
        const cap = cached.caption ? `${baseCaption}\n\n📝 Caption:\n${cached.caption}` : baseCaption;
        await sock.sendMessage(
          targetJid,
          { video: { url: mediaPath }, caption: cap, mentions, contextInfo, viewOnce: !!cached.flags?.viewOnce },
          {}
        );
        try { fs.unlinkSync(mediaPath); } catch {}
        return;
      }

      if (type === 'documentMessage' && mediaPath) {
        const fileName = cached.media?.fileName || 'document';
        const mimetype = cached.media?.mimetype || undefined;
        const cap = cached.caption ? `${baseCaption}\n\n📝 Caption:\n${cached.caption}` : baseCaption;
        await sock.sendMessage(targetJid, { document: { url: mediaPath }, fileName, mimetype, caption: cap, mentions, contextInfo }, {});
        try { fs.unlinkSync(mediaPath); } catch {}
        return;
      }

      if (type === 'audioMessage' && mediaPath) {
        const mimetype = cached.media?.mimetype || 'audio/mpeg';
        await sock.sendMessage(targetJid, { text: baseCaption, mentions, contextInfo }, {});
        await sock.sendMessage(targetJid, { audio: { url: mediaPath }, mimetype, ptt: !!cached.media?.ptt }, {});
        try { fs.unlinkSync(mediaPath); } catch {}
        return;
      }

      if (type === 'stickerMessage' && mediaPath) {
        await sock.sendMessage(targetJid, { text: baseCaption, mentions, contextInfo }, {});
        await sock.sendMessage(targetJid, { sticker: { url: mediaPath } }, {});
        try { fs.unlinkSync(mediaPath); } catch {}
        return;
      }

      await sock.sendMessage(targetJid, { text: `${baseCaption}\n\n⚠️ Could not recover media/text for type: ${type}`.trim(), mentions, contextInfo }, {});
    } catch {
      // Swallow errors to avoid crashing the bot on revoke storms
    }
  }
};
