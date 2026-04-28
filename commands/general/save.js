/**
 * Simple Message Saver Plugin for ProBoy‑MD
 *
 * Usage: Reply to any message with .save
 * The bot will resend that message (text/media) to the current chat.
 */

const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const { tmpdir } = require('os');

module.exports = {
  name: 'save',
  aliases: ['saver'],
  category: 'general',
  description: 'Save any Status  by replying with .save (works for status forwards too)',
  usage: 'Reply to a Status with .save',

  async execute(sock, msg, args, extra) {
    const { reply, react, from } = extra;

    // Check if this is a reply
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const quotedMsgId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
    const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;

    if (!quoted || !quotedMsgId) {
      return reply('❌ Please reply to a Status you want to save.');
    }

    try {
      await react('⏳');

      // Reconstruct the quoted message object as best as possible
      const quotedMsg = {
        key: {
          remoteJid: from, // The original chat might be different, but we only need content
          id: quotedMsgId,
          participant: quotedParticipant
        },
        message: quoted
      };

      // Determine message type
      const msgType = Object.keys(quoted)[0];
      if (!msgType) return reply('❌ Unsupported message type.');

      // For media messages, we need to download if possible
      const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
      if (mediaTypes.includes(msgType)) {
        try {
          const buffer = await downloadMediaMessage(quotedMsg, 'buffer', {});
          if (buffer && Buffer.isBuffer(buffer) && buffer.length > 0) {
            // Save to temp file
            const ext = guessExt(msgType, quoted[msgType]?.mimetype, quoted[msgType]?.fileName);
            const tempFile = path.join(tmpdir(), `proboy_save_${Date.now()}.${ext}`);
            fs.writeFileSync(tempFile, buffer);

            const caption = quoted[msgType]?.caption || '';

            // Send based on type
            if (msgType === 'imageMessage') {
              await sock.sendMessage(from, { image: { url: tempFile }, caption }, { quoted: msg });
            } else if (msgType === 'videoMessage') {
              await sock.sendMessage(from, { video: { url: tempFile }, caption }, { quoted: msg });
            } else if (msgType === 'audioMessage') {
              await sock.sendMessage(from, { audio: { url: tempFile }, mimetype: quoted[msgType]?.mimetype, ptt: !!quoted[msgType]?.ptt }, { quoted: msg });
            } else if (msgType === 'documentMessage') {
              await sock.sendMessage(from, { document: { url: tempFile }, fileName: quoted[msgType]?.fileName || 'document', mimetype: quoted[msgType]?.mimetype, caption }, { quoted: msg });
            } else if (msgType === 'stickerMessage') {
              await sock.sendMessage(from, { sticker: { url: tempFile } }, { quoted: msg });
            }

            // Clean up
            try { fs.unlinkSync(tempFile); } catch {}
          } else {
            return reply('❌ Failed to download media.');
          }
        } catch (err) {
          console.error('Media download error:', err);
          return reply('❌ Could not download media. It may be expired or unsupported.');
        }
      } else {
        // Text message (conversation, extendedTextMessage, etc.)
        let text = '';
        if (msgType === 'conversation') {
          text = quoted.conversation;
        } else if (msgType === 'extendedTextMessage') {
          text = quoted.extendedTextMessage?.text || '';
        } else {
          // Maybe button/list etc. – fallback to simple text
          text = JSON.stringify(quoted) || 'Unsupported message type.';
        }

        await sock.sendMessage(from, { text: `📌 *Saved Message:*\n\n${text}` }, { quoted: msg });
      }

      await react('✅');
    } catch (error) {
      console.error('Save command error:', error);
      await reply(`❌ Error: ${error.message}`);
      await react('❌');
    }
  }
};

// Helper to guess file extension
function guessExt(type, mimetype, fileName) {
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
  }
