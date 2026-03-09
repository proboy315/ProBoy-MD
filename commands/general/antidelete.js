/**
 * Antidelete Plugin for ProBoy‑MD
 * Caches messages in groups/private chats where antidelete is enabled.
 * When a message is deleted for everyone, it reposts the content immediately.
 * Supports: text, image, video, audio, document, sticker (with captions if any).
 * Works in groups, private chats, and status updates (global toggle).
 */

const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const config = require('../../config');
const database = require('../../database'); // Updated database with chat/global settings

// In-memory cache: messageId -> { msg, timestamp, sender, chatJid, isStatus }
const messageCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Clean old entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [id, data] of messageCache.entries()) {
    if (now - data.timestamp > CACHE_TTL) {
      messageCache.delete(id);
    }
  }
}, 60 * 1000);

module.exports = {
  name: 'antidelete',
  aliases: ['antidel', 'savedel'],
  category: 'general',
  description: 'Enable/disable anti‑delete in this chat (groups, DMs, and global for status)',
  usage: '.antidelete',
  // No groupOnly/privateOnly – works in both

  async execute(sock, msg, args, extra) {
    const { from, reply, react, isGroup } = extra;

    try {
      await react('⏳');

      // Determine the chat type
      const chatType = isGroup ? 'group' : (from === 'status@broadcast' ? 'status' : 'private');

      // For status, use a global setting (since you can't toggle per status)
      if (chatType === 'status') {
        const current = database.getGlobalSetting('antideleteStatus') || false;
        const newValue = !current;
        database.setGlobalSetting('antideleteStatus', newValue);
        const status = newValue ? 'enabled' : 'disabled';
        return reply(`✅ Anti‑delete for *status updates* has been *${status}* globally.`);
      }

      // For groups and private chats, use per-chat settings
      const settings = database.getChatSettings(from);
      const current = settings.antidelete || false;
      const newValue = !current;
      database.updateChatSettings(from, { antidelete: newValue });

      const status = newValue ? 'enabled' : 'disabled';
      await reply(`✅ Anti‑delete has been *${status}* for this ${chatType}.`);
      await react('✅');
    } catch (error) {
      console.error('Antidelete toggle error:', error);
      await reply(`❌ Failed to update setting: ${error.message}`);
      await react('❌');
    }
  },

  /**
   * Called by main handler for every incoming message.
   * Caches the message if antidelete is enabled for the chat (or globally for status).
   */
  async handleMessage(sock, msg, extra) {
    const { from, sender, isGroup } = extra;
    const msgId = msg.key.id;
    if (!msgId) return;

    // Determine chat type
    const isStatus = (from === 'status@broadcast');
    const chatJid = from;

    // Check if antidelete is enabled for this chat
    let enabled = false;
    if (isStatus) {
      enabled = database.getGlobalSetting('antideleteStatus') || false;
    } else {
      const settings = database.getChatSettings(chatJid);
      enabled = settings.antidelete || false;
    }

    if (!enabled) return;

    // Store in cache
    messageCache.set(msgId, {
      msg: msg,               // full Baileys message object
      timestamp: Date.now(),
      sender: sender,         // JID of the person who sent the message
      chatJid: chatJid,
      isStatus: isStatus
    });
  },

  /**
   * Called by main handler when a message is deleted for everyone.
   * @param {Object} sock - Baileys socket
   * @param {Object} deleteInfo - Contains { key: { id, remoteJid, fromMe? }, ... }
   */
  async handleDelete(sock, deleteInfo) {
    try {
      const { key } = deleteInfo;
      if (!key || !key.id || !key.remoteJid) return;

      const msgId = key.id;
      const chatJid = key.remoteJid;

      // Retrieve from cache
      const cached = messageCache.get(msgId);
      if (!cached) return; // message too old or not captured

      // Remove from cache to avoid re‑processing
      messageCache.delete(msgId);

      const originalMsg = cached.msg;
      const sender = cached.sender;
      const isStatus = cached.isStatus;

      // Determine where to send the recovered content
      let targetJid = chatJid; // default: same chat

      // For status deletions, send to the original sender as a DM
      if (isStatus) {
        targetJid = sender; // DM the person who posted the status
        // If the bot cannot DM that user (e.g., they haven't interacted), this will fail.
        // We'll catch and log.
      }

      // Build a notice
      let caption = `🚨 *Message deleted for everyone!*\n`;
      if (!isStatus) {
        caption += `👤 *Sender:* @${sender.split('@')[0]}\n`;
      } else {
        caption += `📌 *Status update deleted by* @${sender.split('@')[0]}\n`;
      }

      // Extract the actual message content
      const messageType = Object.keys(originalMsg.message || {})[0];
      const msgContent = originalMsg.message[messageType];

      if (!msgContent) return;

      // Helper to send with mention if target is a group or DM (not status broadcast)
      const sendOptions = (targetJid.endsWith('@g.us') || targetJid.endsWith('@s.whatsapp.net')) 
        ? { mentions: [sender] } 
        : {};

      // Handle different message types
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
        // Unsupported type – just notify
        caption += `⚠️ *Unsupported message type:* ${messageType}`;
        await sock.sendMessage(targetJid, { text: caption }, sendOptions);
      }
    } catch (error) {
      console.error('Antidelete handler error:', error);
    }
  }
};
