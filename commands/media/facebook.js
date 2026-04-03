/**
 * Facebook Video Downloader Plugin – Lightweight API
 * Uses https://backend1.tioo.eu.org/fbdown?url=...
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
  name: 'facebook',
  aliases: ['fb', 'fbdl'],
  category: 'media',
  description: '📘 Download Facebook videos (supports HD)',
  usage: '.facebook <url> [hd]',

  async execute(sock, msg, args, extra) {
    const { from, reply, react } = extra;

    const url = args[0];
    if (!url) {
      return reply(`❌ Please provide a Facebook video URL.\nExample: ${this.usage}`);
    }

    // Check if user wants HD (any case, any position after URL)
    const remainingArgs = args.slice(1).join(' ').trim().toLowerCase();
    const wantHD = remainingArgs === 'hd';

    try {
      await react('⏳');

      const apiUrl = `https://backend1.tioo.eu.org/fbdown?url=${encodeURIComponent(url)}`;
      const response = await fetchWithRetry(apiUrl, 3, 15000);
      const data = response.data;

      if (!data?.status) {
        throw new Error(data?.message || 'Invalid API response');
      }

      // Determine video URL based on user's preference
      let videoUrl;
      if (wantHD) {
        videoUrl = data.HD || data.hd;
        if (!videoUrl) {
          // HD not available, fallback to normal
          videoUrl = data.Normal_video || data.normal_video;
          if (videoUrl) {
            await reply('ℹ️ HD version not available, sending normal quality instead.');
          }
        }
      } else {
        videoUrl = data.Normal_video || data.normal_video || data.HD || data.hd;
      }

      if (!videoUrl) {
        throw new Error('No downloadable video URL found');
      }

      const qualityText = wantHD && videoUrl === (data.HD || data.hd) ? ' (HD)' : '';
      const caption = `📘 *Facebook Video${qualityText}*\n\n${config.botName}`;

      await sock.sendMessage(from, {
        video: { url: videoUrl },
        mimetype: 'video/mp4',
        caption: caption
      }, { quoted: msg });

      await react('✅');
    } catch (error) {
      console.error('Facebook download error:', error);
      let errorMsg = '❌ Failed to download.';
      if (error.code === 'ECONNABORTED') errorMsg += ' Request timed out.';
      else errorMsg += ` ${error.message}`;
      await reply(errorMsg);
      await react('❌');
    }
  }
};
