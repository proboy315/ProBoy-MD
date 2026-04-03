/**
 * TikTok Downloader – Lightweight API
 * Uses https://backend1.tioo.eu.org/ttdl?url=...
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { tmpdir } = require('os');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
  'okhttp/4.9.3'
];

async function fetchWithRetry(url, maxRetries = 3, timeout = 15000) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const userAgent = USER_AGENTS[(attempt - 1) % USER_AGENTS.length];
      const response = await axios.get(url, {
        timeout,
        headers: { 'User-Agent': userAgent }
      });
      return response;
    } catch (err) {
      lastError = err;
      if (attempt === maxRetries) break;
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000));
    }
  }
  throw lastError;
}

// Expand short TikTok URLs (vt.tiktok.com)
async function expandTikTokUrl(shortUrl) {
  try {
    const response = await axios.get(shortUrl, {
      maxRedirects: 0,
      validateStatus: status => status === 302,
      headers: { 'User-Agent': USER_AGENTS[0] }
    });
    return response.headers.location;
  } catch (e) {
    return shortUrl;
  }
}

function extractUsername(url) {
  const match = url.match(/tiktok\.com\/@([A-Za-z0-9_.]+)/i);
  return match ? match[1] : null;
}

module.exports = {
  name: 'tiktok',
  aliases: ['tt', 'ttdl'],
  category: 'media',
  description: '🎵 Download TikTok videos (no watermark)',
  usage: '.tiktok <url>',

  async execute(sock, msg, args, extra) {
    const { from, reply, react, config } = extra;

    let url = args.join(' ').trim();
    if (!url) {
      return reply(`❌ Please provide a TikTok video URL.\nExample: ${this.usage}`);
    }

    try {
      await react('⏳');

      // Expand short URL if needed
      if (url.includes('vt.tiktok.com')) {
        const fullUrl = await expandTikTokUrl(url);
        if (fullUrl) url = fullUrl;
      }

      // Call the new lightweight API
      const apiUrl = `https://backend1.tioo.eu.org/ttdl?url=${encodeURIComponent(url)}`;
      const response = await fetchWithRetry(apiUrl, 3, 15000);
      const data = response.data;

      if (!data?.status || !data?.video || !data.video[0]) {
        throw new Error(data?.message || 'Invalid API response');
      }

      const videoUrl = data.video[0];
      const title = data.title || 'TikTok Video';
      const username = extractUsername(url);

      // Download the video file
      const videoResp = await axios.get(videoUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: { 'User-Agent': USER_AGENTS[0] }
      });
      const videoBuffer = Buffer.from(videoResp.data);

      // Save to temp file
      const tempFile = path.join(tmpdir(), `tiktok_${Date.now()}.mp4`);
      fs.writeFileSync(tempFile, videoBuffer);

      // Build caption
      let caption = `🎵 *${title}*`;
      if (username) caption += `\n👤 *Username:* @${username}`;
      caption += `\n\n${config.botName}`;

      // Send video
      await sock.sendMessage(from, {
        video: { url: tempFile },
        mimetype: 'video/mp4',
        caption: caption.trim()
      }, { quoted: msg });

      // Clean up
      fs.unlinkSync(tempFile);

      await react('✅');
    } catch (error) {
      console.error('TikTok download error:', error);
      let errorMsg = '❌ Failed to download.';
      if (error.code === 'ECONNABORTED') errorMsg += ' Request timed out.';
      else errorMsg += ` ${error.message}`;
      await reply(errorMsg);
      await react('❌');
    }
  }
};
