/**
 * Remini / Upscale Plugin – Multi‑API Fallback
 * Enhances image quality using multiple services.
 * Automatically tries different methods until one succeeds.
 */

const axios = require('axios');
const FormData = require('form-data');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { tmpdir } = require('os');

// ==================== CONFIG ====================
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const TIMEOUT = 60000; // 60 seconds per API call
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'okhttp/4.9.3',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

// ==================== HELPER FUNCTIONS ====================

// Format bytes for size message
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Upload buffer to Catbox (returns URL)
async function uploadToCatbox(buffer) {
  const tempFile = path.join(tmpdir(), `remini_upload_${Date.now()}.jpg`);
  fs.writeFileSync(tempFile, buffer);
  try {
    const form = new FormData();
    form.append('fileToUpload', fs.createReadStream(tempFile), 'image.jpg');
    form.append('reqtype', 'fileupload');

    const response = await axios.post('https://catbox.moe/user/api.php', form, {
      headers: {
        ...form.getHeaders(),
        'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
      },
      timeout: 30000
    });
    return response.data; // returns direct URL
  } finally {
    fs.unlinkSync(tempFile);
  }
}

// Upload buffer to Telegraph (alternative)
async function uploadToTelegraph(buffer) {
  const form = new FormData();
  form.append('file', buffer, { filename: 'image.jpg', contentType: 'image/jpeg' });
  const response = await axios.post('https://telegra.ph/upload', form, {
    headers: form.getHeaders(),
    timeout: 30000
  });
  return 'https://telegra.ph' + response.data[0].src;
}

// Get image buffer from reply or URL
async function getImageBuffer(sock, msg, args) {
  // Case 1: Reply to an image message
  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (quoted?.imageMessage) {
    return await downloadMediaMessage(
      { key: msg.key, message: quoted },
      'buffer',
      {},
      { logger: undefined, reuploadRequest: sock.updateMediaMessage }
    );
  }

  // Case 2: Current message contains image
  if (msg.message?.imageMessage) {
    return await downloadMediaMessage(msg, 'buffer', {});
  }

  // Case 3: URL argument
  if (args.length) {
    const url = args.join(' ').trim();
    try {
      new URL(url); // validate
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: { 'User-Agent': USER_AGENTS[0] }
      });
      return Buffer.from(response.data);
    } catch {
      return null;
    }
  }

  return null;
}

// ==================== ENHANCEMENT METHODS ====================

// Method 1: Prince Technet API
async function enhanceViaPrince(buffer) {
  try {
    const url = await uploadToCatbox(buffer);
    const apiUrl = `https://api.princetechn.com/api/tools/remini?apikey=prince&url=${encodeURIComponent(url)}`;
    const response = await axios.get(apiUrl, {
      timeout: TIMEOUT,
      headers: { 'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)] }
    });
    if (response.data?.success && response.data?.result?.image_url) {
      const imgResp = await axios.get(response.data.result.image_url, {
        responseType: 'arraybuffer',
        timeout: 30000
      });
      return Buffer.from(imgResp.data);
    }
    throw new Error('Invalid API response');
  } catch (e) {
    throw e;
  }
}

// Method 2: David Cyril Tech API
async function enhanceViaDavid(buffer) {
  try {
    const url = await uploadToCatbox(buffer);
    const apiUrl = `https://apis.davidcyriltech.my.id/remini?url=${encodeURIComponent(url)}`;
    const response = await axios.get(apiUrl, {
      responseType: 'arraybuffer',
      timeout: TIMEOUT,
      headers: { 'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)] }
    });
    // The API returns the image directly on success
    if (response.status === 200 && response.data.length > 1000) {
      return Buffer.from(response.data);
    }
    throw new Error('Invalid image data');
  } catch (e) {
    throw e;
  }
}

// Method 3: Vyro.ai (inferenceengine) – works directly with buffer
async function enhanceViaVyro(buffer) {
  return new Promise(async (resolve, reject) => {
    try {
      const form = new FormData();
      form.append('model_version', '1');
      form.append('image', buffer, { filename: 'enhance_image_body.jpg', contentType: 'image/jpeg' });

      const response = await axios.post('https://inferenceengine.vyro.ai/enhance', form, {
        headers: {
          ...form.getHeaders(),
          'User-Agent': 'okhttp/4.9.3',
          'Connection': 'Keep-Alive',
          'Accept-Encoding': 'gzip'
        },
        responseType: 'arraybuffer',
        timeout: TIMEOUT
      });

      if (response.status === 200 && response.data.length > 1000) {
        resolve(Buffer.from(response.data));
      } else {
        reject(new Error('Vyro returned invalid data'));
      }
    } catch (e) {
      reject(e);
    }
  });
}

// Method 4: remini-api.onrender.com (fallback)
async function enhanceViaReminiApi(buffer) {
  try {
    const url = await uploadToCatbox(buffer);
    const apiUrl = `https://remini-api.onrender.com/enhance-image?url=${encodeURIComponent(url)}`;
    const response = await axios.get(apiUrl, {
      timeout: TIMEOUT,
      headers: { 'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)] }
    });
    if (response.data?.image_data) {
      const imgResp = await axios.get(response.data.image_data, {
        responseType: 'arraybuffer',
        timeout: 30000
      });
      return Buffer.from(imgResp.data);
    }
    throw new Error('Invalid API response');
  } catch (e) {
    throw e;
  }
}

// Method 5: Neoxr API (if available – but no key shown, try generic)
async function enhanceViaNeoxr(buffer) {
  try {
    const url = await uploadToTelegraph(buffer);
    const apiUrl = `https://api.neoxr.my.id/api/remini?url=${encodeURIComponent(url)}`; // guess endpoint
    const response = await axios.get(apiUrl, {
      timeout: TIMEOUT,
      headers: { 'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)] }
    });
    if (response.data?.data?.url) {
      const imgResp = await axios.get(response.data.data.url, {
        responseType: 'arraybuffer',
        timeout: 30000
      });
      return Buffer.from(imgResp.data);
    }
    throw new Error('Invalid Neoxr response');
  } catch (e) {
    throw e;
  }
}

// ==================== MAIN COMMAND ====================

module.exports = {
  name: 'remini',
  aliases: ['upscale', 'enhance', 'hd', 'hdr', 'remini2', 'enhanceimage', 'imageenhancer'],
  category: 'general',
  description: '🔍 Enhance/upscale image quality using AI (multi‑API fallback)',
  usage: '.remini (reply to an image) OR .remini <image_url>',

  async execute(sock, msg, args, extra) {
    const { reply, react, from } = extra;

    try {
      await react('📸');

      // Get image buffer
      const buffer = await getImageBuffer(sock, msg, args);
      if (!buffer) {
        return reply(
          '❌ No image found.\n\n' +
          'Usage:\n' +
          '• Reply to an image with `.remini`\n' +
          '• Send image with caption `.remini`\n' +
          '• `.remini <image_url>`'
        );
      }

      // Size check
      if (buffer.length > MAX_FILE_SIZE) {
        return reply(`❌ Image too large (${formatBytes(buffer.length)}). Max allowed: ${formatBytes(MAX_FILE_SIZE)}`);
      }

      await react('⏳');
      await reply('⏳ Enhancing image... (may take up to 60 seconds)');

      // Define methods in priority order
      const methods = [
        { name: 'Prince Technet', func: enhanceViaPrince },
        { name: 'David Cyril', func: enhanceViaDavid },
        { name: 'Remini API', func: enhanceViaReminiApi },
        { name: 'Vyro.ai', func: enhanceViaVyro },
        { name: 'Neoxr', func: enhanceViaNeoxr }
      ];

      let lastError = null;
      let enhancedBuffer = null;

      for (const method of methods) {
        try {
          console.log(`Trying method: ${method.name}`);
          enhancedBuffer = await method.func(buffer);
          if (enhancedBuffer && enhancedBuffer.length > 1000) {
            console.log(`Success with method: ${method.name}`);
            break;
          }
        } catch (err) {
          console.log(`Method ${method.name} failed:`, err.message);
          lastError = err;
          // continue to next method
        }
      }

      if (!enhancedBuffer) {
        throw new Error(`All enhancement methods failed. Last error: ${lastError?.message || 'Unknown'}`);
      }

      // Send enhanced image
      await sock.sendMessage(from, {
        image: enhancedBuffer,
        caption: '✨ *Image enhanced successfully!*\n\n_Powered by multi‑API fallback_'
      }, { quoted: msg });

      await react('✅');
    } catch (error) {
      console.error('Remini command error:', error);
      await reply(`❌ Failed to enhance image.\n\nReason: ${error.message}`);
      await react('❌');
    }
  }
};
