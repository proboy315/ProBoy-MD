/**
 * TikTok Downloader Plugin – Multi‑API Fallback
 * Uses:
 * 1) ab-downloader (ttdl)
 * 2) TikMate API (free, no key)
 * 3) TikDown.io API (fallback)
 * 4) Direct dl.tiktokio.com method (based on your screenshot)
 */

const axios = require('axios');
const { ttdl } = require('ab-downloader');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'okhttp/4.9.3'
];

function extractUsername(url) {
  const match = url.match(/tiktok\.com\/@([A-Za-z0-9_.]+)/i);
  return match ? match[1] : null;
}

// ==================== METHOD 1: ab-downloader ====================
async function fetchWithAbDownloader(url) {
  try {
    const response = await ttdl(url);
    if (response && response.video && response.video[0]) {
      return {
        videoUrl: response.video[0],
        title: response.title || 'TikTok Video',
        username: extractUsername(url)
      };
    }
  } catch (e) {
    console.log('ab-downloader failed:', e.message);
  }
  return null;
}

// ==================== METHOD 2: TikMate API ====================
async function fetchWithTikMate(url) {
  try {
    const apiUrl = `https://api.tikmate.app/api/tiktok?url=${encodeURIComponent(url)}`;
    const response = await axios.get(apiUrl, {
      timeout: 15000,
      headers: { 'User-Agent': USER_AGENTS[0] }
    });
    const data = response.data;
    if (data && data.video_url) {
      return {
        videoUrl: data.video_url,
        title: data.title || 'TikTok Video',
        username: extractUsername(url)
      };
    }
  } catch (e) {}
  return null;
}

// ==================== METHOD 3: TikDown.io API ====================
async function fetchWithTikDown(url) {
  try {
    const form = new URLSearchParams();
    form.append('q', url);
    form.append('lang', 'en');
    const response = await axios.post('https://tikdownloader.io/api/ajaxSearch', form.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENTS[0],
        'Referer': 'https://tikdownloader.io/'
      },
      timeout: 15000
    });
    const data = response.data;
    if (data && data.video && data.video[0]) {
      return {
        videoUrl: data.video[0],
        title: data.title || 'TikTok Video',
        username: extractUsername(url)
      };
    }
  } catch (e) {}
  return null;
}

// ==================== METHOD 4: dl.tiktokio.com (based on your screenshot) ====================
async function fetchWithTikTokio(url) {
  try {
    // Try to get the video ID from the URL
    const videoIdMatch = url.match(/\/video\/(\d+)/);
    if (!videoIdMatch) return null;
    const videoId = videoIdMatch[1];
    // Use the API endpoint that returns JSON like in your screenshot
    // (This is a guess; you may need to adjust the endpoint)
    const apiUrl = `https://dl.tiktokio.com/api/v1/tiktok?url=${encodeURIComponent(url)}`;
    const response = await axios.get(apiUrl, {
      timeout: 15000,
      headers: { 'User-Agent': USER_AGENTS[0] }
    });
    const data = response.data;
    if (data && data.video && data.video[0]) {
      return {
        videoUrl: data.video[0],
        title: data.title || 'TikTok Video',
        username: extractUsername(url)
      };
    }
  } catch (e) {}
  return null;
}

// ==================== MAIN COMMAND ====================
module.exports = {
  name: 'tiktok',
  aliases: ['tt', 'ttdl'],
  category: 'media',
  description: '🎵 Download TikTok videos (no watermark)',
  usage: '.tiktok <url>',

  async execute(sock, msg, args, extra) {
    const { from, reply, react } = extra;

    const url = args.join(' ').trim();
    if (!url) {
      return reply(`❌ Please provide a TikTok video URL.\nExample: ${this.usage}`);
    }

    try {
      await react('⏳');

      // Try methods in order
      const methods = [
        { name: 'ab-downloader', func: fetchWithAbDownloader },
        { name: 'TikMate', func: fetchWithTikMate },
        { name: 'TikDown.io', func: fetchWithTikDown },
        { name: 'TikTokio', func: fetchWithTikTokio }
      ];

      let result = null;
      for (const method of methods) {
        try {
          result = await method.func(url);
          if (result && result.videoUrl) {
            console.log(`✅ TikTok download succeeded with ${method.name}`);
            break;
          }
        } catch (err) {
          console.log(`❌ ${method.name} failed:`, err.message);
        }
      }

      if (!result || !result.videoUrl) {
        throw new Error('All download methods failed. The video may be private or region-restricted.');
      }

      // Build caption
      let caption = `🎵 *${result.title}*`;
      if (result.username) caption += `\n👤 *Username:* @${result.username}`;
      caption += `\n\n${config.botName}`;

      // Send video
      await sock.sendMessage(from, {
        video: { url: result.videoUrl },
        mimetype: 'video/mp4',
        caption: caption.trim()
      }, { quoted: msg });

      await react('✅');
    } catch (error) {
      console.error('TikTok download error:', error);
      await reply(`❌ Failed to download: ${error.message}`);
      await react('❌');
    }
  }
};
