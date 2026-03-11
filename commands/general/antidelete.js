/**
 * Antidelete Plugin for ProBoy‑MD
 * Global toggle: once enabled, monitors all chats.
 * Stores messages persistently in JSON file.
 * Configurable destination: same chat, bot's DM, or custom JID.
 */

const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const database = require('../../database');

// Path for persistent message cache
const CACHE_FILE = path.join(__dirname, '../../database/antidelete_cache.json');

// In‑memory cache: messageId -> { msg, timestamp, sender, chatJid }
let messageCache = new Map();

// Load existing cache from file
function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, 'utf8');
      const obj = JSON.parse(raw);
      // Convert plain object back to Map
      messageCache = new Map(Object.entries(obj));
      // Optional: clean expired entries on load
      const now = Date.now();
      for (const [id, data] of messageCache.entries()) {
        if (now - data.timestamp > 5 * 60 * 1000) {
          messageCache.delete(id);
        }
      }
    }
  } catch (e) {
    console.error('Failed to load antidelete cache:', e);
  }
}

// Save cache to file
function saveCache() {
  try {
    const obj = Object.fromEntries(messageCache);
    fs.writeFileSync(CACHE_FILE, JSON.stringify(obj, null, 2));
  } catch (e) {
    console.error('Failed to save antidelete cache:', e);
  }
}

// Clean old entries every minute and save
setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const [id, data] of messageCache.entries()) {
    if (now - data.timestamp > 5 * 60 * 1000) { // 5 minutes TTL
      messageCache.delete(id);
      changed = true;
    }
  }
  if (changed) saveCache();
}, 60 * 1000);

// Load on startup
loadCache();

module.exports = {
  name: 'antidelete',
  aliases: ['antidel'],
  category: 'general',
  description: 'Global antidelete system with destination options',
  usage: '.antidelete <on/off/status/setdest> [jid or "chat"]',

  async execute(sock, msg, args, extra) {
    const { from, reply, react, sender, isOwner } = extra;

    // Only owner can change settings
    if (!isOwner) {
      return reply('❌ Only bot owner can configure antidelete.');
    }

    const subCmd = args[0] ? args[0].toLowerCase() : '';

    try {
      await react('⏳');

      if (subCmd === 'on' || subCmd === 'enable') {
        database.setGlobalSetting('antidelete', true);
        await reply('✅ Antidelete is now **globally enabled**. It will monitor all chats.');
      }
      else if (subCmd === 'off' || subCmd === 'disable') {
        database.setGlobalSetting('antidelete', false);
        await reply('❌ Antidelete is now disabled.');
      }
      else if (subCmd === 'setdest') {
        const dest = args[1] ? args[1].trim() : '';
        if (!dest) {
          return reply('❌ Please provide a destination JID or "chat".\nExample: .antidelete setdest 1234567890@s.whatsapp.net\nOr: .antidelete setdest chat');
        }
        if (dest === 'chat') {
          database.setGlobalSetting('antideleteDest', null);
          await reply('✅ Deleted messages will be sent back to the **original chat**.');
        } else {
          // Validate JID format (basic)
          if (!dest.includes('@') || (!dest.endsWith('@s.whatsapp.net') && !dest.endsWith('@g.us'))) {
            return reply('❌ Invalid JID. Use format like 1234567890@s.whatsapp.net');
          }
          database.setGlobalSetting('antideleteDest', dest);
          await reply(`✅ Deleted messages will be sent to: ${dest}`);
        }
      }
      else if (subCmd === 'status') {
        const enabled = database.getGlobalSetting('antidelete') || false;
        const dest = database.getGlobalSetting('antideleteDest');
        const destDisplay = dest ? dest : 'original chat';
        await reply(`📊 *Antidelete Status*\n\nEnabled: ${enabled ? '✅' : '❌'}\nDestination: ${destDisplay}`);
      }
      else {
        // Show help
        await reply(
          `*Antidelete Commands (Owner only)*\n\n` +
          `.antidelete on – Enable globally\n` +
          `.antidelete off – Disable\n` +
          `.antidelete setdest <jid> – Send recovered messages to specific JID\n` +
          `.antidelete setdest chat – Send back to original chat\n` +
          `.antidelete status – Show current settings`
        );
      }

      await react('✅');
    } catch (error) {
      console.error('Antidelete command error:', error);
      await reply(`❌ ${error.message}`);
      await react('❌');
    }
  },

  async handleMessage(sock, msg, extra) {
    // Only if antidelete is globally enabled
    const enabled = database.getGlobalSetting('antidelete');
    if (!enabled) return;

    const { from, sender } = extra;
    const msgId = msg.key.id;
    if (!msgId) return;

    // Ignore system broadcasts
    if (from === 'status@broadcast') return; // Status updates are handled separately if needed, but we'll ignore for now

    // Store in cache (with timestamp)
    messageCache.set(msgId, {
      msg: msg,
      timestamp: Date.now(),
      sender: sender,
      chatJid: from
    });

    // Save to disk after each store (optional, but we can batch with interval)
    // For simplicity, we save on every store (could be heavy, but okay for low traffic)
    saveCache();
  },

  async handleDelete(sock, deleteInfo) {
    const enabled = database.getGlobalSetting('antidelete');
    if (!enabled) return;

    const { key } = deleteInfo;
    if (!key || !key.id || !key.remoteJid) return;

    const msgId = key.id;
    const cached = messageCache.get(msgId);
    if (!cached) return; // not in cache

    // Remove from cache
    messageCache.delete(msgId);
    saveCache();

    const originalMsg = cached.msg;
    const sender = cached.sender;
    const chatJid = cached.chatJid;

    // Determine destination
    let targetJid = database.getGlobalSetting('antideleteDest');
    if (!targetJid) {
      targetJid = chatJid; // send back to original chat
    }

    // Build caption
    let caption = `🚨 *Message deleted for everyone!*\n`;
    caption += `👤 *Original sender:* @${sender.split('@')[0]}\n`;
    caption += `📍 *From chat:* ${chatJid}\n`;

    const messageType = Object.keys(originalMsg.message || {})[0];
    const msgContent = originalMsg.message[messageType];
    if (!msgContent) return;

    // Helper to send with mention if target is a group or DM
    const sendOptions = (targetJid.endsWith('@g.us') || targetJid.endsWith('@s.whatsapp.net'))
      ? { mentions: [sender] }
      : {};

    try {
      if (messageType === 'conversation' || messageType === 'extendedTextMessage') {
        const text = msgContent.text || msgContent;
        caption += `💬 *Message:* ${text}`;
        await sock.sendMessage(targetJid, { text: caption }, sendOptions);
      }
      else if (messageType === 'imageMessage') {
        if (msgContent.caption) caption += `📝 *Caption:* ${msgContent.caption}\n`;
        const buffer = await downloadMediaMessage(originalMsg, 'buffer', {});
        await sock.sendMessage(targetJid, {
          image: buffer,
          caption: caption.trim(),
          ...sendOptions
        });
      }
      else if (messageType === 'videoMessage') {
        if (msgContent.caption) caption += `📝 *Caption:* ${msgContent.caption}\n`;
        const buffer = await downloadMediaMessage(originalMsg, 'buffer', {});
        await sock.sendMessage(targetJid, {
          video: buffer,
          caption: caption.trim(),
          ...sendOptions
        });
      }
      else if (messageType === 'audioMessage') {
        const buffer = await downloadMediaMessage(originalMsg, 'buffer', {});
        await sock.sendMessage(targetJid, {
          audio: buffer,
          mimetype: msgContent.mimetype || 'audio/mpeg',
          caption: caption.trim(),
          ...sendOptions
        });
      }
      else if (messageType === 'documentMessage') {
        const buffer = await downloadMediaMessage(originalMsg, 'buffer', {});
        await sock.sendMessage(targetJid, {
          document: buffer,
          fileName: msgContent.fileName || 'document',
          mimetype: msgContent.mimetype,
          caption: caption.trim(),
          ...sendOptions
        });
      }
      else if (messageType === 'stickerMessage') {
        const buffer = await downloadMediaMessage(originalMsg, 'buffer', {});
        await sock.sendMessage(targetJid, {
          sticker: buffer,
          caption: caption.trim(),
          ...sendOptions
        });
      }
      else {
        caption += `⚠️ *Unsupported message type:* ${messageType}`;
        await sock.sendMessage(targetJid, { text: caption }, sendOptions);
      }
    } catch (err) {
      console.error('Antidelete recovery error:', err);
    }
  }
};
