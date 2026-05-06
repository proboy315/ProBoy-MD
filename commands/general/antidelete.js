/**
 * Antidelete Plugin for ProBoy‑MD – LID Fix Edition
 * Uses exact normalizeJidWithLid logic from handler.js (local copy)
 * to convert LID numbers into real phone numbers.
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

const CACHE_TTL_MS = 48 * 60 * 60 * 1000;
const MAX_RECORDS = 2000;
const MEDIA_TTL_MS = Math.max(15 * 60 * 1000, Number(process.env.ANTIDELETE_MEDIA_TTL_MS || 2 * 60 * 60 * 1000));
const MAX_MEDIA_TOTAL_BYTES = Math.max(20 * 1024 * 1024, Number(process.env.ANTIDELETE_MAX_MEDIA_BYTES || 250 * 1024 * 1024));
const MAX_SINGLE_MEDIA_BYTES = Math.max(512 * 1024, Number(process.env.ANTIDELETE_MAX_FILE_BYTES || 15 * 1024 * 1024));

const getDb = (sock, extra) => extra?.database || sock?.sessionDb || defaultDatabase;

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });

let messageCache = new Map();
const processedDeletes = new Map();

const cacheKey = (remoteJid, id) => `${remoteJid || 'unknown'}|${id || 'unknown'}`;

const findCachedRecord = (remoteJid, id) => {
  if (!id) return null;
  if (remoteJid) {
    const directKey = cacheKey(remoteJid, id);
    const direct = messageCache.get(directKey);
    if (direct) return { mapKey: directKey, record: direct };
  }
  const suffix = `|${id}`;
  for (const [k, v] of messageCache.entries()) {
    if (typeof k === 'string' && k.endsWith(suffix)) return { mapKey: k, record: v };
  }
  return null;
};

const safeReadJson = (filePath) => {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};

const safeWriteJson = (filePath, data) => {
  try { fs.writeFileSync(filePath, JSON.stringify(data, null, 2)); } catch {}
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
  return keys.filter(k => !protocolMessages.includes(k))[0] || null;
};

const getConfigDefaults = () => {
  const settings = config.antideleteSettings || {};
  const fallbackEnabled = typeof config.defaultGroupSettings?.antidelete === 'boolean' ? config.defaultGroupSettings.antidelete : true;
  return {
    enabled: typeof settings.enabled === 'boolean' ? settings.enabled : fallbackEnabled,
    dest: settings.dest || 'chat',
    statusDest: settings.statusDest || 'bot',
    bannerImageUrl: settings.bannerImageUrl || ''
  };
};

const upsertAntideleteSettingsInConfig = (newSettings) => {
  try {
    const current = fs.readFileSync(CONFIG_PATH, 'utf8');
    const normalized = {
      enabled: !!newSettings.enabled,
      dest: String(newSettings.dest || 'chat'),
      statusDest: String(newSettings.statusDest || 'bot'),
      bannerImageUrl: String(newSettings.bannerImageUrl || '')
    };
    const block = `    antideleteSettings: {\n` +
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
      updated = updated.replace(afterDefaultGroupRegex, (m) => `${m}\n${block.trimEnd()}`);
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
  } catch { return false; }
};

// ─── LID mapping helpers (exact copy from handler.js, but local to this plugin) ───
const lidMappingCache = new Map();
let authDirCache = { expiresAt: 0, dirs: [] };

const getAuthDirectories = () => {
  const now = Date.now();
  if (authDirCache.expiresAt > now && authDirCache.dirs.length) return authDirCache.dirs;
  const dirs = [];
  const primarySession = path.join(__dirname, '..', '..', config.sessionName || 'session');
  if (fs.existsSync(primarySession)) dirs.push(primarySession);
  const sessionsRoot = path.join(__dirname, '..', '..', 'sessions');
  if (fs.existsSync(sessionsRoot)) {
    try {
      for (const entry of fs.readdirSync(sessionsRoot, { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name.startsWith('auth-')) {
          dirs.push(path.join(sessionsRoot, entry.name));
        }
      }
    } catch {}
  }
  authDirCache = { expiresAt: now + 30000, dirs: [...new Set(dirs.map(d => path.resolve(d)))] };
  return authDirCache.dirs;
};

const getLidMappingValue = (user, direction) => {
  if (!user) return null;
  const cacheKey = `${direction}:${user}`;
  if (lidMappingCache.has(cacheKey)) return lidMappingCache.get(cacheKey);
  const suffix = direction === 'pnToLid' ? '.json' : '_reverse.json';
  for (const sessionPath of getAuthDirectories()) {
    const filePath = path.join(sessionPath, `lid-mapping-${user}${suffix}`);
    if (!fs.existsSync(filePath)) continue;
    try {
      const raw = fs.readFileSync(filePath, 'utf8').trim();
      const value = raw ? JSON.parse(raw) : null;
      lidMappingCache.set(cacheKey, value || null);
      return value || null;
    } catch { continue; }
  }
  lidMappingCache.set(cacheKey, null);
  return null;
};

const normalizeJidWithLid = (jid) => {
  if (!jid) return jid;
  if (typeof jid !== 'string') return jid;
  if (jid.endsWith('@g.us') || jid === 'status@broadcast') return jid;
  try {
    const decoded = jidDecode(jid);
    if (!decoded?.user) {
      const raw = jid.split(':')[0].split('@')[0];
      return `${raw}@s.whatsapp.net`;
    }
    let user = decoded.user;
    let server = decoded.server === 'c.us' ? 's.whatsapp.net' : decoded.server;
    const mapToPn = () => {
      const pnUser = getLidMappingValue(user, 'lidToPn');
      if (pnUser) {
        user = pnUser;
        server = server === 'hosted.lid' ? 'hosted' : 's.whatsapp.net';
        return true;
      }
      return false;
    };
    if (server === 'lid' || server === 'hosted.lid') {
      mapToPn();
    } else if (server === 's.whatsapp.net' || server === 'hosted') {
      mapToPn();
    }
    if (server === 'hosted') return jidEncode(user, 'hosted');
    return jidEncode(user, 's.whatsapp.net');
  } catch { return jid; }
};

const getPhoneNumber = (jid) => {
  if (!jid) return '';
  const normalized = normalizeJidWithLid(jid);
  return String(normalized).split('@')[0].replace(/\D/g, '');
};

// ─── Contact name & Chat name ───
const getContactName = (sock, jid) => {
  const phoneJid = normalizeJidWithLid(jid);
  const contact = sock?.store?.contacts?.[phoneJid] || null;
  return contact?.notify || contact?.name || contact?.verifiedName || '';
};

const getChatName = async (sock, jid) => {
  if (jid === 'status@broadcast') return 'Status Broadcast';
  if (jid.endsWith('@g.us')) {
    try {
      const metadata = await sock.groupMetadata(jid);
      return metadata.subject || 'Unknown Group';
    } catch { return 'Unknown Group'; }
  }
  const name = getContactName(sock, jid);
  return name || getPhoneNumber(jid) || 'Private Chat';
};

// ─── Banner context ───
const buildBannerContextInfo = (sock, deleterJid, senderJid) => {
  const defaults = getConfigDefaults();
  const thumb = defaults.bannerImageUrl || '';
  if (!thumb) return undefined;
  const websiteUrl = config.social?.website || 'https://proboy.vercel.app';
  const deleterNum = getPhoneNumber(deleterJid);
  const senderNum = getPhoneNumber(senderJid);
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

// ─── Cache management ───
const pruneCache = () => {
  const now = Date.now();
  for (const [k, v] of messageCache.entries()) {
    if (!v?.timestamp || now - v.timestamp > CACHE_TTL_MS) {
      if (v?.media?.path) try { fs.unlinkSync(v.media.path); } catch {}
      messageCache.delete(k);
    }
    if (v?.media?.path && now - v.timestamp > MEDIA_TTL_MS) {
      try { fs.unlinkSync(v.media.path); } catch {}
      v.media = null;
      messageCache.set(k, v);
    }
  }
  if (messageCache.size > MAX_RECORDS) {
    const sorted = [...messageCache.entries()].sort((a,b) => (a[1]?.timestamp||0)-(b[1]?.timestamp||0));
    for (let i=0; i<messageCache.size-MAX_RECORDS; i++) {
      const [k,v] = sorted[i]||[];
      if (k) { if(v?.media?.path) try{fs.unlinkSync(v.media.path)}catch{}; messageCache.delete(k); }
    }
  }
  for (const [k,ts] of processedDeletes.entries()) {
    if (!ts || Date.now()-ts>5*60*1000) processedDeletes.delete(k);
  }
};

const cleanupMediaDir = () => {
  try {
    if (!fs.existsSync(MEDIA_DIR)) return;
    const now = Date.now();
    const files = fs.readdirSync(MEDIA_DIR).map(name=>{
      const full = path.join(MEDIA_DIR,name);
      try { const st=fs.statSync(full); if(!st.isFile()) return null; return {full,mtimeMs:st.mtimeMs,size:st.size}; } catch { return null; }
    }).filter(Boolean);
    for(const f of files) if(now-f.mtimeMs>MEDIA_TTL_MS) try{fs.unlinkSync(f.full)}catch{}
    const remaining = fs.readdirSync(MEDIA_DIR).map(name=>{
      const full = path.join(MEDIA_DIR,name);
      try { const st=fs.statSync(full); if(!st.isFile()) return null; return {full,mtimeMs:st.mtimeMs,size:st.size}; } catch { return null; }
    }).filter(Boolean);
    let total = remaining.reduce((a,b)=>a+(b.size||0),0);
    if(total<=MAX_MEDIA_TOTAL_BYTES) return;
    const sortedByOld = remaining.sort((a,b)=>a.mtimeMs-b.mtimeMs);
    for(const f of sortedByOld) {
      if(total<=MAX_MEDIA_TOTAL_BYTES) break;
      try{fs.unlinkSync(f.full)}catch{}
      total-=f.size||0;
    }
  } catch {}
};

const loadCache = () => {
  const obj = safeReadJson(CACHE_FILE);
  if (obj) messageCache = new Map(Object.entries(obj));
  pruneCache();
};

const saveCache = () => { pruneCache(); safeWriteJson(CACHE_FILE, Object.fromEntries(messageCache)); };
loadCache();
let saveScheduled = false;
const scheduleSave = () => {
  if (saveScheduled) return;
  saveScheduled = true;
  setTimeout(() => { saveScheduled=false; saveCache(); }, 2000);
};
setInterval(() => saveCache(), 60*1000);
cleanupMediaDir();
setInterval(() => cleanupMediaDir(), 5*60*1000);

// ==================== Plugin Export ====================
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
    const subCmd = args[0]?.toLowerCase() || '';

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
      } else if (subCmd === 'chat') {
        database.setGlobalSetting('antideleteDest', 'chat');
        const defaults = getConfigDefaults();
        upsertAntideleteSettingsInConfig({ ...defaults, dest: 'chat', statusDest: defaults.statusDest || 'bot' });
        await reply('✅ Recovery destination set to: original chat.\nStatuses go to bot number.');
      } else if (subCmd === 'bot') {
        database.setGlobalSetting('antideleteDest', 'bot');
        database.setGlobalSetting('antideleteStatusDest', 'bot');
        const defaults = getConfigDefaults();
        upsertAntideleteSettingsInConfig({ ...defaults, dest: 'bot', statusDest: 'bot' });
        await reply('✅ Recovery destination set to: bot number.');
      } else if (subCmd === 'jid' || (subCmd && subCmd.includes('@'))) {
        const jid = subCmd === 'jid' ? (args[1]?.trim() || '') : subCmd;
        const normalized = (jid.endsWith('@lid')||jid.endsWith('@hosted.lid')||jid.includes('@')) ? jid : `${jid.replace(/\D/g,'')}@s.whatsapp.net`;
        if (!normalized.includes('@')) return reply('❌ Invalid JID.');
        database.setGlobalSetting('antideleteDest', normalized);
        database.setGlobalSetting('antideleteStatusDest', normalized);
        const defaults = getConfigDefaults();
        upsertAntideleteSettingsInConfig({ ...defaults, dest: normalized, statusDest: normalized });
        await reply(`✅ All deletes sent to: ${normalized}`);
      } else if (subCmd === 'status') {
        const defaults = getConfigDefaults();
        const enabled = database.getGlobalSetting('antidelete');
        const effEnabled = enabled===undefined ? defaults.enabled : !!enabled;
        const dest = database.getGlobalSetting('antideleteDest') || defaults.dest;
        const statusDest = database.getGlobalSetting('antideleteStatusDest') || defaults.statusDest || dest;
        const banner = database.getGlobalSetting('antideleteBannerImageUrl') || defaults.bannerImageUrl;
        await reply(`📊 *Antidelete Status*\n\nEnabled: ${effEnabled?'✅':'❌'}\nMessage dest: ${dest}\nStatus dest: ${statusDest}\nBanner: ${banner?'✅ set':'❌ none'}\nCache size: ${messageCache.size}`);
      } else {
        await reply(`*Antidelete (Owner)*\n\n.antidelete on/.off/.status/.chat/.bot/.jid <jid>`);
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
    const effectiveEnabled = enabled===undefined ? defaults.enabled : !!enabled;
    if (!effectiveEnabled) return;

    const { from, sender } = extra;
    const msgId = msg.key?.id;
    if (!msgId) return;

    const content = getMessageContent(msg);
    if (!content) return;

    const type = getFirstMessageType(content);
    if (!type) return;

    if (from !== 'status@broadcast') {
      const chatSettings = database.getChatSettings(from);
      if (chatSettings?.antidelete === false) return;
    }

    // Normalize sender immediately using our local normalizer
    const normalizedSender = normalizeJidWithLid(sender) || sender;

    const record = {
      timestamp: Date.now(),
      chatJid: from,
      msgId,
      sender: normalizedSender,   // always store phone JID
      type,
      text: null,
      caption: null,
      media: null,
      flags: { viewOnce: !!(msg.message?.viewOnceMessageV2 || msg.message?.viewOnceMessage) }
    };

    const msgContent = content[type];

    if (type === 'conversation') {
      record.text = typeof msgContent === 'string' ? msgContent : null;
    } else if (type === 'extendedTextMessage') {
      record.text = msgContent?.text || null;
    } else if (type === 'imageMessage' || type === 'videoMessage' || type === 'documentMessage') {
      record.caption = msgContent?.caption || null;
    }

    if (['imageMessage','videoMessage','audioMessage','documentMessage','stickerMessage'].includes(type)) {
      try {
        const buffer = await downloadMediaMessage(
          { ...msg, message: content },
          'buffer',
          {},
          { logger: undefined, reuploadRequest: sock.updateMediaMessage }
        );
        if (buffer && Buffer.isBuffer(buffer) && buffer.length && buffer.length <= MAX_SINGLE_MEDIA_BYTES) {
          const mimetype = msgContent?.mimetype || null;
          const fileName = msgContent?.fileName || null;
          const ext = (() => {
            if (fileName?.includes('.')) return path.extname(fileName).slice(1);
            if (type==='stickerMessage') return 'webp';
            if (type==='imageMessage') return 'jpg';
            if (type==='videoMessage') return 'mp4';
            if (type==='audioMessage') return mimetype?.includes('ogg') ? 'ogg' : 'mp3';
            return 'bin';
          })();
          const fileBase = `${Date.now()}_${msgId.replace(/[^a-zA-Z0-9_-]/g,'')}.${ext}`;
          const filePath = path.join(MEDIA_DIR, fileBase);
          fs.writeFileSync(filePath, buffer);
          record.media = { path: filePath, mimetype, fileName, ptt: !!msgContent?.ptt };
        }
      } catch {}
    }

    messageCache.set(cacheKey(from, msgId), record);
    scheduleSave();
  },

  async handleDelete(sock, deleteInfo) {
    const database = getDb(sock, null);
    const defaults = getConfigDefaults();
    const enabled = database.getGlobalSetting('antidelete');
    const effectiveEnabled = enabled===undefined ? defaults.enabled : !!enabled;
    if (!effectiveEnabled) return;

    const key = deleteInfo?.key;
    if (!key?.id) return;

    const deleteDedupeKey = cacheKey(key.remoteJid || 'unknown', key.id);
    if (processedDeletes.has(deleteDedupeKey)) return;
    processedDeletes.set(deleteDedupeKey, Date.now());

    const found = findCachedRecord(key.remoteJid, key.id);
    if (!found) return;
    const { mapKey: cacheKeyToDelete, record: cached } = found;
    messageCache.delete(cacheKeyToDelete);
    scheduleSave();

    // Normalize both sender & deleter using our local function
    const rawDeleter = deleteInfo?.deleter || null;
    const senderJid = cached.sender ? normalizeJidWithLid(cached.sender) : null;
    const deleterJid = rawDeleter ? normalizeJidWithLid(rawDeleter) : null;

    const senderNum = senderJid ? getPhoneNumber(senderJid) : 'Unknown';
    const deleterNum = deleterJid ? getPhoneNumber(deleterJid) : (senderNum || 'Unknown');

    const chatJid = cached.chatJid;
    const isGroup = chatJid?.endsWith('@g.us');
    const isStatus = chatJid === 'status@broadcast';

    // Destination
    const destSetting = database.getGlobalSetting('antideleteDest') || defaults.dest;
    const statusDestSetting = database.getGlobalSetting('antideleteStatusDest') || defaults.statusDest || destSetting;
    const botJid = sock.user?.id ? normalizeJidWithLid(sock.user.id) : null;
    let targetJid;
    if (isStatus) {
      targetJid = (statusDestSetting === 'chat' || statusDestSetting === 'bot' || statusDestSetting === 'owner') ? botJid : normalizeJidWithLid(statusDestSetting);
    } else {
      if (destSetting === 'chat') targetJid = chatJid;
      else if (destSetting === 'bot' || destSetting === 'owner') targetJid = botJid;
      else targetJid = normalizeJidWithLid(destSetting);
    }
    if (!targetJid) return;

    // Mentions
    const mentions = [];
    if (senderJid && !senderJid.endsWith('@g.us') && senderJid !== 'status@broadcast') mentions.push(senderJid);
    if (deleterJid && deleterJid !== senderJid && !deleterJid.endsWith('@g.us') && deleterJid !== 'status@broadcast') mentions.push(deleterJid);

    // Header
    const chatName = await getChatName(sock, chatJid);
    let header = `*ANTIDELETE DETECTED*\n`;
    header += `Type: ${isStatus ? 'Status' : 'Message'}\n`;
    if (isGroup) {
      header += `Group: ${chatName}\n`;
    } else if (!isStatus) {
      header += `Chat: ${chatName}\n`;
    } else {
      header += `From: Status Broadcast\n`;
    }
    header += `Sender: @${senderNum}\n`;
    header += `Deleted By: @${deleterNum}`;

    const baseCaption = header;
    const contextInfo = buildBannerContextInfo(sock, deleterJid, senderJid);

    const type = cached.type;
    const mediaPath = cached.media?.path || null;

    try {
      if (type === 'conversation' || type === 'extendedTextMessage') {
        const text = cached.text || '';
        const out = `${baseCaption}\n\n📝 Text:\n${text}`;
        await sock.sendMessage(targetJid, { text: out, mentions, contextInfo }, {});
        return;
      }
      if (type === 'imageMessage' && mediaPath) {
        const cap = `${baseCaption}${cached.caption ? '\n\n📝 Caption:\n'+cached.caption : ''}${cached.flags?.viewOnce ? '\n\n🔓 Recovered from view-once' : ''}`;
        await sock.sendMessage(targetJid, { image: { url: mediaPath }, caption: cap, mentions, contextInfo }, {});
        try { fs.unlinkSync(mediaPath); } catch {}
        return;
      }
      if (type === 'videoMessage' && mediaPath) {
        const cap = `${baseCaption}${cached.caption ? '\n\n📝 Caption:\n'+cached.caption : ''}${cached.flags?.viewOnce ? '\n\n🔓 Recovered from view-once' : ''}`;
        await sock.sendMessage(targetJid, { video: { url: mediaPath }, caption: cap, mentions, contextInfo }, {});
        try { fs.unlinkSync(mediaPath); } catch {}
        return;
      }
      if (type === 'documentMessage' && mediaPath) {
        const cap = `${baseCaption}${cached.caption ? '\n\n📝 Caption:\n'+cached.caption : ''}`;
        await sock.sendMessage(targetJid, { document: { url: mediaPath }, fileName: cached.media?.fileName || 'document', mimetype: cached.media?.mimetype, caption: cap, mentions, contextInfo }, {});
        try { fs.unlinkSync(mediaPath); } catch {}
        return;
      }
      if (type === 'audioMessage' && mediaPath) {
        await sock.sendMessage(targetJid, { text: baseCaption, mentions, contextInfo }, {});
        await sock.sendMessage(targetJid, { audio: { url: mediaPath }, mimetype: cached.media?.mimetype || 'audio/mpeg', ptt: !!cached.media?.ptt }, {});
        try { fs.unlinkSync(mediaPath); } catch {}
        return;
      }
      if (type === 'stickerMessage' && mediaPath) {
        await sock.sendMessage(targetJid, { text: baseCaption, mentions, contextInfo }, {});
        await sock.sendMessage(targetJid, { sticker: { url: mediaPath } }, {});
        try { fs.unlinkSync(mediaPath); } catch {}
        return;
      }
      await sock.sendMessage(targetJid, { text: `${baseCaption}\n\n⚠️ Could not recover media/text of type: ${type}`, mentions, contextInfo }, {});
    } catch {}
  }
};