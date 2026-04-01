/**
 * TikTok Downloader – Multi‑Method File Download
 * Downloads video directly, saves temp file, sends, and cleans up.
 */

const axios = require('axios');
const { ttdl } = require('ab-downloader');
const fs = require('fs');
const path = require('path');
const { tmpdir } = require('os');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'okhttp/4.9.3'
];

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

// ==================== METHOD 1: ab-downloader (returns video URL) ====================
async function getVideoUrlFromAbDownloader(url) {
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

// ==================== METHOD 2: TikMate (returns video URL) ====================
async function getVideoUrlFromTikMate(url) {
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

// ==================== METHOD 3: TikDown.io (returns video URL) ====================
async function getVideoUrlFromTikDown(url) {
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

// ==================== METHOD 4: Direct download from any URL (if we already have one) ====================
async function downloadVideoBuffer(videoUrl) {
  try {
    const response = await axios.get(videoUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: { 'User-Agent': USER_AGENTS[0] }
    });
    return Buffer.from(response.data);
  } catch (e) {
    console.log('Direct download failed:', e.message);
    return null;
  }
}

// ==================== MAIN COMMAND ====================
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

      // Step 1: Get a working video URL
      const urlProviders = [
        { name: 'ab-downloader', func: getVideoUrlFromAbDownloader },
        { name: 'TikMate', func: getVideoUrlFromTikMate },
        { name: 'TikDown.io', func: getVideoUrlFromTikDown }
      ];

      let videoInfo = null;
      for (const provider of urlProviders) {
        try {
          const info = await provider.func(url);
          if (info && info.videoUrl) {
            videoInfo = info;
            console.log(`✅ Got video URL from ${provider.name}`);
            break;
          }
        } catch (err) {
          console.log(`❌ ${provider.name} failed:`, err.message);
        }
      }

      if (!videoInfo || !videoInfo.videoUrl) {
        throw new Error('Could not get a valid video URL from any source.');
      }

      // Step 2: Download the video file
      const videoBuffer = await downloadVideoBuffer(videoInfo.videoUrl);
      if (!videoBuffer) {
        throw new Error('Failed to download video file.');
      }

      // Step 3: Save to temp file
      const tempFile = path.join(tmpdir(), `tiktok_${Date.now()}.mp4`);
      fs.writeFileSync(tempFile, videoBuffer);

      // Step 4: Build caption
      let caption = `🎵 *${videoInfo.title}*`;
      if (videoInfo.username) caption += `\n👤 *Username:* @${videoInfo.username}`;
      caption += `\n\n${config.botName}`;

      // Step 5: Send video
      await sock.sendMessage(from, {
        video: { url: tempFile },
        mimetype: 'video/mp4',
        caption: caption.trim()
      }, { quoted: msg });

      // Step 6: Clean up
      fs.unlinkSync(tempFile);

      await react('✅');
    } catch (error) {
      console.error('TikTok download error:', error);
      await reply(`❌ Failed to download: ${error.message}`);
      await react('❌');
    }
  }
};
