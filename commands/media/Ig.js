/**
 * Instagram Downloader Plugin – Lightweight API
 * Uses https://backend1.tioo.eu.org/igdl
 */

const axios = require('axios');
const config = require('../../config');

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

module.exports = {
  name: 'ig',
  aliases: ['igdl', 'instagram'],
  category: 'media',
  description: '📸 Download Instagram reels/videos',
  usage: '.ig <instagram url>',

  async execute(sock, msg, args, extra) {
    const { from, reply, react } = extra;

    const url = args.join(' ').trim();
    if (!url) {
      return reply(`❌ Please provide an Instagram URL.\n*Usage:* ${this.usage}`);
    }

    try {
      await react('⏳');

      const apiUrl = `https://backend1.tioo.eu.org/igdl?url=${encodeURIComponent(url)}`;
      const response = await fetchWithRetry(apiUrl, 3, 15000);

      const data = response.data;
      if (!Array.isArray(data) || data.length === 0 || !data[0]?.url) {
        throw new Error('No media found at the provided URL.');
      }

      const media = data[0];
      const videoUrl = media.url;

      const caption = `📸 *Instagram Video Downloaded*\n🔗 *URL:* ${url}\n\n${config.botName}`;

      await sock.sendMessage(from, {
        video: { url: videoUrl },
        mimetype: 'video/mp4',
        caption: caption
      }, { quoted: msg });

      await react('✅');
    } catch (error) {
      console.error('Instagram download error:', error);
      let errorMsg = '❌ Failed to download.';
      if (error.code === 'ECONNABORTED') errorMsg += ' Request timed out.';
      else errorMsg += ` ${error.message}`;
      await reply(errorMsg);
      await react('❌');
    }
  }
};
