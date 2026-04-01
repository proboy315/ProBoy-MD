const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { tmpdir } = require('os');
const config = require('../config');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'okhttp/4.9.3'
];

async function uploadToCatbox(buffer, originalFilename = 'file') {
  const name = String(originalFilename || 'file');
  const tempFile = path.join(tmpdir(), `catbox_${Date.now()}_${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`);
  fs.writeFileSync(tempFile, buffer);

  try {
    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append('fileToUpload', fs.createReadStream(tempFile), name);

    const uploadUrl = config.apis?.catbox?.uploadUrl || 'https://catbox.moe/user/api.php';
    const response = await axios.post(uploadUrl, form, {
      headers: {
        ...form.getHeaders(),
        'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
      },
      timeout: 60000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    return typeof response.data === 'string' ? response.data.trim() : null;
  } finally {
    try { fs.unlinkSync(tempFile); } catch {}
  }
}

module.exports = { uploadToCatbox };
