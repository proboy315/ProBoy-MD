const config = require('../../config');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ─── Settings ──────────────────────────────────────
const DELAY_MS = 4000; // 4 seconds delay before auto‑reply
const DB_KEY = 'autoreply_triggers'; // stores: { trigger: data }
const MEDIA_DIR = path.join(__dirname, '../../database/autoreply_media');

// ensure media directory exists
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });

// ─── Helpers ────────────────────────────────────────
function isMediaMessage(obj) {
  if (!obj) return false;
  const mediaTypes = ['imageMessage','videoMessage','audioMessage','voiceMessage','stickerMessage'];
  return mediaTypes.some(t => obj[t]);
}

function getMediaType(obj) {
  if (obj.imageMessage) return 'image';
  if (obj.videoMessage) return 'video';
  if (obj.audioMessage) return 'audio';
  if (obj.voiceMessage) return 'voice';
  if (obj.stickerMessage) return 'sticker';
  return null;
}

function generateMediaFileName(mediaType) {
  const extMap = {
    image: 'jpg',
    video: 'mp4',
    audio: 'mp3',
    voice: 'ogg',
    sticker: 'webp'
  };
  const ext = extMap[mediaType] || 'bin';
  return `${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
}

async function downloadQuotedMedia(sock, msg) {
  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (!quoted || !isMediaMessage(quoted)) return null;

  const mediaType = getMediaType(quoted);
  if (!mediaType) return null;

  const buffer = await downloadMediaMessage(
    { key: msg.key, message: quoted },
    'buffer',
    {},
    { logger: undefined, reuploadRequest: sock.updateMediaMessage }
  );
  return { buffer, mediaType, mimetype: quoted[mediaType + 'Message']?.mimetype || undefined };
}

async function sendMediaReply(sock, chatId, mediaData, caption = '') {
  const { mediaType, filePath, mimetype } = mediaData;

  const common = { quoted: undefined }; // we'll set quoted per call
  if (mediaType === 'image') {
    await sock.sendMessage(chatId, { image: { url: filePath }, caption, mimetype }, common);
  } else if (mediaType === 'video') {
    await sock.sendMessage(chatId, { video: { url: filePath }, caption, mimetype }, common);
  } else if (mediaType === 'audio' || mediaType === 'voice') {
    await sock.sendMessage(chatId, { audio: { url: filePath }, mimetype, ptt: mediaType === 'voice' }, common);
  } else if (mediaType === 'sticker') {
    await sock.sendMessage(chatId, { sticker: { url: filePath } }, common);
  } else {
    // fallback text
    await sock.sendMessage(chatId, { text: caption || 'Auto reply media' }, common);
  }
}

// ─── Module Export ──────────────────────────────────
module.exports = {
  name: 'autoreply',
  aliases: ['areply', 'replybot'],
  category: 'utility',
  description: 'Set auto‑replies (text or media) with a 4s delay. Global, owner only.',
  usage: `.autoreply trigger+response  OR  reply to media with .autoreply trigger+caption`,
  ownerOnly: true,

  // ▸ handleMessage – perform delayed reply
  async handleMessage(sock, msg, extra) {
    try {
      if (msg.key.fromMe) return;

      const content = extra.utils.getMessageContent(msg);
      const text = (content?.conversation || content?.extendedTextMessage?.text || '').trim();
      if (!text) return;

      const triggers = extra.database.getGlobalSetting(DB_KEY) || {};
      const lowerText = text.toLowerCase();

      for (const [trigger, data] of Object.entries(triggers)) {
        if (lowerText === trigger.toLowerCase()) {
          // Delay then send
          setTimeout(async () => {
            try {
              if (data.type === 'text') {
                await sock.sendMessage(extra.from, { text: data.content }, { quoted: msg });
              } else if (data.type === 'media') {
                await sendMediaReply(sock, extra.from, data, data.caption || '');
              }
            } catch {}
          }, DELAY_MS);
          break; // only one reply per message, even with delay
        }
      }
    } catch {}
  },

  // ▸ execute – owner controls
  async execute(sock, msg, args, extra) {
    const db = extra.database;
    let triggers = db.getGlobalSetting(DB_KEY) || {};

    try {
      if (!args.length) {
        return extra.reply(
          `📋 *Auto‑Reply (Global)*\n\n` +
          `❇️ Add text: \`${config.prefix}autoreply hi+Hello!\`\n` +
          `🖼️ Add media: reply to an image/video/voice with \`${config.prefix}autoreply hello+\` (optional caption after +)\n` +
          `🗑️ Remove: \`${config.prefix}autoreply remove <trigger>\`\n` +
          `📃 List: \`${config.prefix}autoreply list\`\n` +
          `🧹 Clear all: \`${config.prefix}autoreply clear\``
        );
      }

      const full = args.join(' ').trim();
      const firstWord = args[0].toLowerCase();

      // ── Subcommands: remove, list, clear ──
      if (['remove', 'list', 'clear'].includes(firstWord)) {
        if (firstWord === 'remove') {
          const trigger = args.slice(1).join(' ').trim();
          if (!trigger) return extra.reply('❌ Please specify the trigger to remove.');
          if (!triggers[trigger]) return extra.reply(`❌ No auto‑reply for "${trigger}".`);
          // Delete associated media file if exists
          const data = triggers[trigger];
          if (data.type === 'media' && data.filePath) {
            try { fs.unlinkSync(data.filePath); } catch {}
          }
          delete triggers[trigger];
          db.setGlobalSetting(DB_KEY, triggers);
          return extra.reply(`✅ Removed auto‑reply for "${trigger}".`);
        }
        else if (firstWord === 'list') {
          const entries = Object.entries(triggers);
          if (!entries.length) return extra.reply('📭 No auto‑replies configured.');
          let list = '*📋 Current Auto‑Replies:*\n\n';
          for (const [trig, data] of entries) {
            const type = data.type === 'text' ? '💬 Text' : `${data.mediaType || '📎'} Media`;
            list += `• *${trig}* → ${type}`;
            if (data.type === 'text') list += `: ${data.content}`;
            else list += (data.caption ? ` (caption: ${data.caption})` : '');
            list += '\n';
          }
          await extra.reply(list);
          return;
        }
        else if (firstWord === 'clear') {
          // Delete all media files
          for (const data of Object.values(triggers)) {
            if (data.type === 'media' && data.filePath) {
              try { fs.unlinkSync(data.filePath); } catch {}
            }
          }
          db.setGlobalSetting(DB_KEY, {});
          return extra.reply('🗑️ All auto‑replies cleared.');
        }
      }

      // ── Add new trigger ──
      // Format: trigger+response | or reply to media with trigger+caption
      const plusIndex = full.indexOf('+');
      if (plusIndex === -1) {
        return extra.reply('❌ Use `trigger+response` format.\nExample: `.autoreply hi+Hello!`');
      }

      const trigger = full.slice(0, plusIndex).trim();
      const responseText = full.slice(plusIndex + 1).trim();

      if (!trigger) return extra.reply('❌ Trigger cannot be empty.');

      // Check if a quoted media message exists
      const quotedMedia = await downloadQuotedMedia(sock, msg);
      if (quotedMedia) {
        // Media auto‑reply
        const fileName = generateMediaFileName(quotedMedia.mediaType);
        const filePath = path.join(MEDIA_DIR, fileName);
        fs.writeFileSync(filePath, quotedMedia.buffer);

        triggers[trigger] = {
          type: 'media',
          mediaType: quotedMedia.mediaType,
          filePath, // absolute path
          mimetype: quotedMedia.mimetype,
          caption: responseText || ''  // optional caption
        };
        db.setGlobalSetting(DB_KEY, triggers);
        await extra.reply(`✅ Media auto‑reply added!\n• *Trigger:* ${trigger}\n• *Media type:* ${quotedMedia.mediaType}${responseText ? `\n• *Caption:* ${responseText}` : ''}`);
      } else {
        // Plain text auto‑reply
        if (!responseText) return extra.reply('❌ Please provide a response after `+` (or reply to a media).');
        triggers[trigger] = { type: 'text', content: responseText };
        db.setGlobalSetting(DB_KEY, triggers);
        await extra.reply(`✅ Text auto‑reply added!\n• *Trigger:* ${trigger}\n• *Response:* ${responseText}`);
      }
    } catch (error) {
      console.error('[autoreply]', error);
      await extra.reply(`❌ ${error.message}`);
    }
  }
};