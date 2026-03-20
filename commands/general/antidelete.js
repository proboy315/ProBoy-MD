/**
 * Antidelete Plugin for ProBoy‑MD
 *
 * Stores incoming messages (including media) so they can be re-sent if a user
 * deletes them "for everyone".
 *
 * Simplified per owner request:
 * - Status deletes always go to bot's own number.
 * - Command: .antidelete on/off/status/chat/jid/bot
 * - Thumbnail links to social.website from config.
 * - Header shows "From: <group/contact name>" instead of raw JID.
 */

const { downloadMediaMessage, jidDecode, jidEncode } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const defaultDatabase = require('../../database');

const DB_DIR = path.join(__dirname, '..', '..', 'database');
const CACHE_FILE = path.join(DB_DIR, 'antidelete_cache_v2.json');
const MEDIA_DIR = path.join(DB_DIR, 'antidelete_media');
const CONFIG_PATH = path.join(__dirname, '..', '..', 'config.js');

const CACHE_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours (records)
const MAX_RECORDS = 2000;
const MEDIA_TTL_MS = Math.max(30 * 60 * 1000, Number(process.env.ANTIDELETE_MEDIA_TTL_MS || 12 * 60 * 60 * 1000)); // default 12h
const MAX_MEDIA_TOTAL_BYTES = Math.max(20 * 1024 * 1024, Number(process.env.ANTIDELETE_MAX_MEDIA_BYTES || 250 * 1024 * 1024)); // default 250MB
const MAX_SINGLE_MEDIA_BYTES = Math.max(512 * 1024, Number(process.env.ANTIDELETE_MAX_FILE_BYTES || 15 * 1024 * 1024)); // default 15MB

const getDb = (sock, extra) => extra?.database || sock?.sessionDb || defaultDatabase;

// Ensure directories exist
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });

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

  // Fallback: match by message id only
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

const getConfigDefaults = () => {
  const settings = config.antideleteSettings || {};
  const fallbackEnabled =
    typeof config.defaultGroupSettings?.antidelete === 'boolean'
      ? config.defaultGroupSettings.antidelete
      : true;

  return {
    enabled: typeof settings.enabled === 'boolean' ? settings.enabled : fallbackEnabled,
    dest: typeof settings.dest === 'string' && settings.dest.trim() ? settings.dest.trim() : 'chat',
    bannerImageUrl: typeof settings.bannerImageUrl === 'string' ? settings.bannerImageUrl.trim() : ''
  };
};

const upsertAntideleteSettingsInConfig = (newSettings) => {
  try {
    const current = fs.readFileSync(CONFIG_PATH, 'utf8');
    const normalized = {
      enabled: !!newSettings.enabled,
      dest: String(newSettings.dest || 'chat'),
      bannerImageUrl: String(newSettings.bannerImageUrl || '')
    };

    const block =
      `    antideleteSettings: {\n` +
      `      enabled: ${normalized.enabled},\n` +
      `      dest: '${normalized.dest.replace(/'/g, "\\'")}',\n` +
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

// Lid mapping (same as before)
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

// Build banner with thumbnail linking to website
// Build banner with thumbnail linking to website
const buildBannerContextInfo = (sock, deleterJid, senderJid) => {
  const defaults = getConfigDefaults();
  const thumb = defaults.bannerImageUrl || '';
  if (!thumb) return undefined;

  const websiteUrl = config.social?.website || 'https://proboy.vercel.app';
  const deleterNum = deleterJid ? String(deleterJid).split('@')[0] : 'Unknown';
  const senderNum = senderJid ? String(senderJid).split('@')[0] : 'Unknown';

  return {
    externalAdReply: {
      title: 'ANTIDELETE',
      body: `Deleted by: ${deleterNum} | Sender: ${senderNum}`,
      thumbnailUrl: thumb,
      sourceUrl: websiteUrl,
      mediaType: 1,
      renderLargerThumbnail: true,
      showAdAttribution: false
    }
  };
};

// Get contact name for display
const getContactName = (sock, jid) => {
  const j = normalizeJidWithLid(jid);
  const contact = sock?.store?.contacts?.[j] || sock?.contacts?.[j] || null;
  const name = contact?.notify || contact?.name || contact?.verifiedName || '';
  const cleaned = typeof name === 'string' ? name.trim() : '';
  return cleaned;
};

// Get chat name (group subject or contact name)
const getChatName = async (sock, jid) => {
  if (jid === 'status@broadcast') return 'Status Broadcast';
  if (jid.endsWith('@g.us')) {
    try {
      const metadata = await sock.groupMetadata(jid);
      return metadata.subject || 'Unknown Group';
    } catch {
      return 'Unknown Group';
    }
  } else {
    // Private chat – try contact name, else number
    const name = getContactName(sock, jid);
    if (name) return name;
    const number = jid.split('@')[0];
    return number || 'Private Chat';
  }
};

const pruneCache = () => {
  const now = Date.now();
  for (const [k, v] of messageCache.entries()) {
    if (!v || !v.timestamp || now - v.timestamp > CACHE_TTL_MS) {
      if (v?.media?.path) {
        try { fs.unlinkSync(v.media.path); } catch {}
      }
      messageCache.delete(k);
    }
    // Media retention (delete old media files earlier than record TTL)
    if (v?.media?.path && v.timestamp && now - v.timestamp > MEDIA_TTL_MS) {
      try { fs.unlinkSync(v.media.path); } catch {}
      v.media = null;
      messageCache.set(k, v);
    }
  }
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
  for (const [k, ts] of processedDeletes.entries()) {
    if (!ts || now - ts > 5 * 60 * 1000) processedDeletes.delete(k);
  }
};

const cleanupMediaDir = () => {
  try {
    if (!fs.existsSync(MEDIA_DIR)) return;
    const now = Date.now();
    const files = fs.readdirSync(MEDIA_DIR).map((name) => {
      const full = path.join(MEDIA_DIR, name);
      try {
        const st = fs.statSync(full);
        if (!st.isFile()) return null;
        return { full, mtimeMs: st.mtimeMs, size: st.size };
      } catch {
        return null;
      }
    }).filter(Boolean);

    // Delete old files
    for (const f of files) {
      if (now - f.mtimeMs > MEDIA_TTL_MS) {
        try { fs.unlinkSync(f.full); } catch {}
      }
    }

    // Enforce total size cap
    const remaining = fs.readdirSync(MEDIA_DIR).map((name) => {
      const full = path.join(MEDIA_DIR, name);
      try {
        const st = fs.statSync(full);
        if (!st.isFile()) return null;
        return { full, mtimeMs: st.mtimeMs, size: st.size };
      } catch {
        return null;
      }
    }).filter(Boolean);

    let total = remaining.reduce((a, b) => a + (b.size || 0), 0);
    if (total <= MAX_MEDIA_TOTAL_BYTES) return;

    const sortedByOld = remaining.sort((a, b) => a.mtimeMs - b.mtimeMs);
    for (const f of sortedByOld) {
      if (total <= MAX_MEDIA_TOTAL_BYTES) break;
      try { fs.unlinkSync(f.full); } catch {}
      total -= (f.size || 0);
    }
  } catch {
    // ignore
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

// Keep media folder from growing forever
setInterval(() => {
  cleanupMediaDir();
}, 10 * 60 * 1000);

module.exports = {
  name: 'antidelete',
  aliases: ['antidel'],
  category: 'general',
  description: 'Recover deleted messages (text + media) everywhere',
  usage: '.antidelete <on/off/status/chat/jid/bot> [jid]',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const { reply, react } = extra;
    const database = getDb(sock, extra);

    const subCmd = args[0] ? args[0].toLowerCase() : '';

    try {
      await react('⏳');

      if (subCmd === 'on' || subCmd === 'enable') {
        database.setGlobalSetting('antidelete', true);
        const defaults = getConfigDefaults();
        upsertAntideleteSettingsInConfig({ ...defaults, enabled: true });
        await reply('✅ Antidelete enabled globally.');
      } 
      else if (subCmd === 'off' || subCmd === 'disable') {
        database.setGlobalSetting('antidelete', false);
        const defaults = getConfigDefaults();
        upsertAntideleteSettingsInConfig({ ...defaults, enabled: false });
        await reply('❌ Antidelete disabled globally.');
      } 
      else if (subCmd === 'chat') {
        database.setGlobalSetting('antideleteDest', 'chat');
        const defaults = getConfigDefaults();
        upsertAntideleteSettingsInConfig({ ...defaults, dest: 'chat' });
        await reply('✅ Recovery destination set to: original chat.');
      } 
      else if (subCmd === 'bot') {
        database.setGlobalSetting('antideleteDest', 'bot');
        const defaults = getConfigDefaults();
        upsertAntideleteSettingsInConfig({ ...defaults, dest: 'bot' });
        await reply('✅ Recovery destination set to: bot number.');
      } 
      else if (subCmd === 'jid') {
        const jid = args[1] ? args[1].trim() : '';
        if (!jid) return reply('❌ Please provide a JID.\nExample: .antidelete jid 1234567890@s.whatsapp.net');
        let normalized = jid;
        if (!jid.includes('@')) normalized = `${jid}@s.whatsapp.net`;
        if (!normalized.endsWith('@s.whatsapp.net') && !normalized.endsWith('@g.us')) {
          return reply('❌ Invalid JID. Use e.g. 1234567890@s.whatsapp.net');
        }
        database.setGlobalSetting('antideleteDest', normalized);
        const defaults = getConfigDefaults();
        upsertAntideleteSettingsInConfig({ ...defaults, dest: normalized });
        await reply(`✅ Recovery destination set to: ${normalized}`);
      } 
      else if (subCmd === 'status') {
        const defaults = getConfigDefaults();
        const enabled = database.getGlobalSetting('antidelete');
        const effectiveEnabled = enabled === undefined ? defaults.enabled : !!enabled;
        const dest = database.getGlobalSetting('antideleteDest') || defaults.dest;
        const banner = database.getGlobalSetting('antideleteBannerImageUrl') || defaults.bannerImageUrl;
        const botJid = sock.user?.id || 'unknown';
        await reply(
          `📊 *Antidelete Status*\n\n` +
          `Enabled: ${effectiveEnabled ? '✅' : '❌'}\n` +
          `Recover to: ${dest} (non-status)\n` +
          `Status always goes to: ${botJid}\n` +
          `Banner: ${banner ? '✅ set' : '❌ none'}\n` +
          `Cache: ${messageCache.size} items`
        );
      } 
      else {
        await reply(
          `*Antidelete (Owner)*\n\n` +
          `.antidelete on\n` +
          `.antidelete off\n` +
          `.antidelete status\n` +
          `.antidelete chat      (send to original chat)\n` +
          `.antidelete bot       (send to bot number)\n` +
          `.antidelete jid <jid> (send to custom JID)\n`
        );
      }

      await react('✅');
    } catch (error) {
      await reply(`❌ ${error.message}`);
      await react('❌');
    }
  },

  async handleMessage(sock, msg, extra) {
    const database = getDb(sock, extra);
    const defaults = getConfigDefaults();
    const enabled = database.getGlobalSetting('antidelete');
    const effectiveEnabled = enabled === undefined ? defaults.enabled : !!enabled;
    if (!effectiveEnabled) return;

    const { from, sender } = extra;
    const msgId = msg.key?.id;
    if (!msgId) return;

    const content = getMessageContent(msg);
    if (!content) return;

    const type = getFirstMessageType(content);
    if (!type) return;

    // Respect per-chat toggle if present
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
    
    if (['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'].includes(type)) {
      try {
        const msgForDl = { ...msg, message: content };
        const buffer = await downloadMediaMessage(
          msgForDl,
          'buffer',
          {},
          { logger: undefined, reuploadRequest: sock.updateMediaMessage }
        );
        if (buffer && Buffer.isBuffer(buffer) && buffer.length) {
          if (buffer.length > MAX_SINGLE_MEDIA_BYTES) {
            record.media = null;
          } else {
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
        }
      } catch {
        // Media may fail to download; still keep metadata.
        record.media = record.media || null;
      }
    }

    const key = cacheKey(from, msgId);
    messageCache.set(key, record);
    scheduleSave();
  },

  async handleDelete(sock, deleteInfo) {
    const database = getDb(sock, null);
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

    // Determine destination
    const destSetting = database.getGlobalSetting('antideleteDest') || defaults.dest;
    const botJid = sock.user?.id; // bot's own number

    let targetJid;
    if (chatJid === 'status@broadcast') {
      // Status deletes always go to bot's own number
      targetJid = botJid;
    } else {
      if (destSetting === 'chat') {
        targetJid = chatJid;
      } else if (destSetting === 'bot') {
        targetJid = botJid;
      } else {
        // Assume it's a JID string
        targetJid = destSetting;
      }
    }

    if (!targetJid) return;
    targetJid = normalizeJidWithLid(targetJid);

    // Build mentions
    const mentions = [];
    if (sender) mentions.push(sender);
    if (deleter && deleter !== sender) mentions.push(deleter);

    const senderNum = sender ? String(sender).split('@')[0] : 'Unknown';
    const deleterNum = deleter ? String(deleter).split('@')[0] : senderNum;
    const senderName = sender ? getContactName(sock, sender) : '';
    const deleterName = deleter ? getContactName(sock, deleter) : '';

    // Get chat name for display
    const chatName = await getChatName(sock, chatJid);

    const headerLines = [];
    headerLines.push('*ANTIDELETE*');
    headerLines.push(`🗑️ Deleted by: @${deleterNum}${deleterName ? ` (${deleterName})` : ''}`);
    headerLines.push(`👤 Sender: @${senderNum}${senderName ? ` (${senderName})` : ''}`);
    headerLines.push(`📌 From: ${chatName}`);

    const baseCaption = headerLines.join('\n');
    const contextInfo = buildBannerContextInfo(sock, deleter, sender);

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
