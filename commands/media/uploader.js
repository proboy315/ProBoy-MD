/**
 * Uploader Plugin for ProBoy‑MD
 * Uploads any media file to Catbox.moe and returns the direct URL.
 * Supports: images, videos, audio, documents (up to 200MB).
 */

const axios = require('axios');
const FormData = require('form-data');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { tmpdir } = require('os');
const path = require('path');
const fs = require('fs');

const MAX_SIZE = 200 * 1024 * 1024; // 200MB
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'okhttp/4.9.3'
];

// Format file size
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Get media buffer from message
async function getMediaBuffer(sock, msg) {
  // Check if it's a reply with media
  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (quoted) {
    // Determine media type from quoted message
    const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
    for (const type of mediaTypes) {
      if (quoted[type]) {
        return await downloadMediaMessage(
          { key: msg.key, message: quoted },
          'buffer',
          {},
          { logger: undefined, reuploadRequest: sock.updateMediaMessage }
        );
      }
    }
  }

  // Check if current message has media
  const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
  for (const type of mediaTypes) {
    if (msg.message?.[type]) {
      return await downloadMediaMessage(msg, 'buffer', {});
    }
  }

  return null;
}

// Upload buffer to Catbox
async function uploadToCatbox(buffer, originalFilename) {
  const tempFile = path.join(tmpdir(), `upload_${Date.now()}_${originalFilename || 'file'}`);
  fs.writeFileSync(tempFile, buffer);

  try {
    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append('fileToUpload', fs.createReadStream(tempFile), originalFilename || 'file');

    const response = await axios.post('https://catbox.moe/user/api.php', form, {
      headers: {
        ...form.getHeaders(),
        'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
      },
      timeout: 60000, // 60 seconds for upload
      maxContentLength: MAX_SIZE,
      maxBodyLength: MAX_SIZE
    });

    return response.data; // returns the URL as plain text
  } finally {
    fs.unlinkSync(tempFile);
  }
}

module.exports = {
  name: 'upload',
  aliases: ['catbox', 'up', 'uploader', 'fileupload'],
  category: 'media',
  description: '📤 Upload any media  and get a permanent link',
  usage: '.upload (reply to a media file) or send media with caption .upload',

  async execute(sock, msg, args, extra) {
    const { reply, react, from } = extra;

    try {
      await react('📤');

      // Get media buffer
      const buffer = await getMediaBuffer(sock, msg);
      if (!buffer) {
        return reply(
          '❌ No media found.\n\n' +
          'Usage:\n' +
          '• Reply to an image/video/audio/document with `.upload`\n' +
          '• Send media with caption `.upload`'
        );
      }

      // Check size
      if (buffer.length > MAX_SIZE) {
        return reply(`❌ File too large (${formatBytes(buffer.length)}). Max allowed: ${formatBytes(MAX_SIZE)}`);
      }

      // Determine original filename (if available)
      let originalFilename = 'file';
      const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (quoted) {
        if (quoted.imageMessage) originalFilename = quoted.imageMessage.fileName || 'image.jpg';
        else if (quoted.videoMessage) originalFilename = quoted.videoMessage.fileName || 'video.mp4';
        else if (quoted.audioMessage) originalFilename = quoted.audioMessage.fileName || 'audio.mp3';
        else if (quoted.documentMessage) originalFilename = quoted.documentMessage.fileName || 'document.bin';
        else if (quoted.stickerMessage) originalFilename = 'sticker.webp';
      } else {
        if (msg.message?.imageMessage) originalFilename = msg.message.imageMessage.fileName || 'image.jpg';
        else if (msg.message?.videoMessage) originalFilename = msg.message.videoMessage.fileName || 'video.mp4';
        else if (msg.message?.audioMessage) originalFilename = msg.message.audioMessage.fileName || 'audio.mp3';
        else if (msg.message?.documentMessage) originalFilename = msg.message.documentMessage.fileName || 'document.bin';
        else if (msg.message?.stickerMessage) originalFilename = 'sticker.webp';
      }

      await react('⏳');
      await reply('⏳ Uploading...');

      // Upload
      const fileUrl = await uploadToCatbox(buffer, originalFilename);

      if (!fileUrl || !fileUrl.startsWith('https://')) {
        throw new Error('Invalid response from Catbox');
      }

      // Send result
      const responseText = `📤 *Upload Complete!*\n\n` +
        `📄 *File Name:* ${originalFilename}\n` +
        `📦 *File Size:* ${formatBytes(buffer.length)}\n` +
        `🔗 *File URL:* ${fileUrl}\n\n` +
        `_Link never expires (up to 200MB)_`;

      await sock.sendMessage(from, { text: responseText }, { quoted: msg });
      await react('✅');
    } catch (error) {
      console.error('Upload error:', error);
      let errorMsg = '❌ Upload failed.';
      if (error.code === 'ECONNABORTED') errorMsg += ' Request timed out.';
      else if (error.response?.status === 413) errorMsg += ' File too large for server.';
      else if (error.message.includes('ENOTFOUND')) errorMsg += ' Network error.';
      else errorMsg += ` Reason: ${error.message}`;
      await reply(errorMsg);
      await react('❌');
    }
  }
};