/**
 * QR Code Generator Plugin (No Scan)
 * Creates QR codes from:
 * - Direct text/URL
 * - Any media file (image, video, audio, document, sticker) – uploads media and generates QR of its URL
 */

const axios = require('axios');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { tmpdir } = require('os');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'okhttp/4.9.3'
];

// ==================== CREATE QR ====================
async function createQR(text) {
  const url = `https://api.princetechn.com/api/tools/createqr?apikey=prince&query=${encodeURIComponent(text)}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const userAgent = USER_AGENTS[(attempt - 1) % USER_AGENTS.length];
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 15000,
        headers: { 'User-Agent': userAgent }
      });
      return Buffer.from(response.data);
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000));
    }
  }
}

// ==================== UPLOAD MEDIA ====================
async function uploadToCatbox(buffer, originalFilename) {
  const tempFile = path.join(tmpdir(), `qr_upload_${Date.now()}_${originalFilename || 'file'}`);
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
      timeout: 60000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    return response.data; // returns the URL as plain text
  } finally {
    fs.unlinkSync(tempFile);
  }
}

// ==================== GET MEDIA FROM MESSAGE ====================
async function getMediaBufferAndName(sock, msg) {
  // Check if current message has media
  const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
  for (const type of mediaTypes) {
    if (msg.message?.[type]) {
      const buffer = await downloadMediaMessage(msg, 'buffer', {});
      let filename = null;
      if (type === 'imageMessage') filename = msg.message.imageMessage.fileName || 'image.jpg';
      else if (type === 'videoMessage') filename = msg.message.videoMessage.fileName || 'video.mp4';
      else if (type === 'audioMessage') filename = msg.message.audioMessage.fileName || 'audio.mp3';
      else if (type === 'documentMessage') filename = msg.message.documentMessage.fileName || 'document.bin';
      else if (type === 'stickerMessage') filename = 'sticker.webp';
      return { buffer, filename };
    }
  }

  // Check quoted message
  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (quoted) {
    for (const type of mediaTypes) {
      if (quoted[type]) {
        const buffer = await downloadMediaMessage(
          { key: msg.key, message: quoted },
          'buffer',
          {},
          { logger: undefined, reuploadRequest: sock.updateMediaMessage }
        );
        let filename = null;
        if (type === 'imageMessage') filename = quoted.imageMessage.fileName || 'image.jpg';
        else if (type === 'videoMessage') filename = quoted.videoMessage.fileName || 'video.mp4';
        else if (type === 'audioMessage') filename = quoted.audioMessage.fileName || 'audio.mp3';
        else if (type === 'documentMessage') filename = quoted.documentMessage.fileName || 'document.bin';
        else if (type === 'stickerMessage') filename = 'sticker.webp';
        return { buffer, filename };
      }
    }
  }

  return null;
}

// ==================== MAIN COMMAND ====================
module.exports = {
  name: 'qr',
  aliases: ['qrcode', 'qrcreate', 'makeqr', 'generateqr'],
  category: 'utility',
  description: '📷 Generate QR code from text/URL or from any media file (uploads media first)',
  usage: '.qr <text>  or  reply to any media with .qr',

  async execute(sock, msg, args, extra) {
    const { reply, react, from } = extra;

    try {
      // First, check if there's a media file (attached or quoted)
      const media = await getMediaBufferAndName(sock, msg);

      if (media) {
        // ========== MEDIA MODE ==========
        await react('📤');
        const statusMsg = await sock.sendMessage(from, { text: '⏳ Uploading media and generating QR...' }, { quoted: msg });
        const msgKey = statusMsg.key;

        try {
          // Upload media to Catbox
          const mediaUrl = await uploadToCatbox(media.buffer, media.filename);
          if (!mediaUrl || !mediaUrl.startsWith('http')) throw new Error('Upload failed');

          // Generate QR code for the URL
          const qrBuffer = await createQR(mediaUrl);

          // Send QR image with info
          await sock.sendMessage(from, {
            image: qrBuffer,
            caption: `✅ QR Code for uploaded file:\n📄 *Filename:* ${media.filename}\n🔗 *URL:* ${mediaUrl}`
          }, { quoted: msg });

          // Delete status message
          try { await sock.sendMessage(from, { delete: msgKey }); } catch {}
          await react('✅');
        } catch (err) {
          await sock.sendMessage(from, {
            text: `❌ Failed: ${err.message}`,
            edit: msgKey
          });
          await react('❌');
        }
      } else {
        // ========== TEXT MODE ==========
        if (!args.length) {
          return reply(
            '❌ No input.\n\n' +
            'Usage:\n' +
            '• `.qr hello world` – generate QR from text\n' +
            '• Reply to any image/video/audio/document with `.qr` – upload media and generate QR of its URL'
          );
        }

        const text = args.join(' ');
        await react('📷');
        const statusMsg = await sock.sendMessage(from, { text: '⏳ Generating QR code...' }, { quoted: msg });
        const msgKey = statusMsg.key;

        try {
          const qrBuffer = await createQR(text);
          await sock.sendMessage(from, {
            image: qrBuffer,
            caption: `✅ QR Code for:\n${text}`
          }, { quoted: msg });
          try { await sock.sendMessage(from, { delete: msgKey }); } catch {}
          await react('✅');
        } catch (err) {
          await sock.sendMessage(from, {
            text: `❌ Failed to generate QR: ${err.message}`,
            edit: msgKey
          });
          await react('❌');
        }
      }
    } catch (error) {
      console.error('QR command error:', error);
      await reply(`❌ Unexpected error: ${error.message}`);
      await react('❌');
    }
  }
};
