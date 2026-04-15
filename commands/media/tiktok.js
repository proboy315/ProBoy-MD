/**
 * TikTok Downloader – Working with tikwm.com API
 * Fetches video details, downloads no-watermark video, and sends with rich caption.
 * No interactive buttons – just video and caption.
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

// Format numbers (e.g., 2524 → 2.5K)
function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

// Format duration (seconds → MM:SS)
function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

module.exports = {
  name: 'tiktok',
  aliases: ['tt', 'ttdl', 'tiktokdl'],
  category: 'media',
  description: '🎵 Download TikTok videos (no watermark) with rich info',
  usage: '.tiktok <url>',

  async execute(sock, msg, args, extra) {
    const { from, reply, react, config } = extra;

    let url = args.join(' ').trim();
    if (!url) {
      return reply(`❌ Please provide a TikTok video URL.\nExample: ${this.usage}`);
    }

    try {
      await react('⏳');
      const statusMsg = await sock.sendMessage(from, {
        text: '⏳ Fetching TikTok video...'
      }, { quoted: msg });
      const statusKey = statusMsg.key;

      // Expand short URL if needed
      if (url.includes('vt.tiktok.com')) {
        const fullUrl = await expandTikTokUrl(url);
        if (fullUrl) url = fullUrl;
      }

      // Call tikwm.com API
      const apiUrl = `https://tikwm.com/api/?url=${encodeURIComponent(url)}`;
      const response = await fetchWithRetry(apiUrl, 3, 15000);
      const data = response.data;

      if (data.code !== 0 || !data.data) {
        throw new Error(data.msg || 'Invalid API response');
      }

      const videoData = data.data;

      // Extract video URL (no-watermark version)
      let videoUrl = videoData.play;
      if (videoData.wmplay) {
        videoUrl = videoData.wmplay;
      }

      if (!videoUrl) {
        throw new Error('No video URL found');
      }

      // Download video
      const videoResp = await axios.get(videoUrl, {
        responseType: 'arraybuffer',
        timeout: 60000,
        headers: { 'User-Agent': USER_AGENTS[0] }
      });
      const videoBuffer = Buffer.from(videoResp.data);

      // Save to temp file
      const tempFile = path.join(tmpdir(), `tiktok_${Date.now()}.mp4`);
      fs.writeFileSync(tempFile, videoBuffer);

      // Extract video info
      const title = videoData.title || 'TikTok Video';
      const author = videoData.author?.nickname || 'Unknown';
      const authorId = videoData.author?.unique_id || '';
      const region = videoData.region || 'Unknown';
      const duration = videoData.duration || 0;
      const playCount = formatNumber(videoData.play_count || 0);
      const diggCount = formatNumber(videoData.digg_count || 0);
      const commentCount = formatNumber(videoData.comment_count || 0);
      const shareCount = formatNumber(videoData.share_count || 0);
      const musicTitle = videoData.music_info?.title || 'Unknown';
      const musicAuthor = videoData.music_info?.author || 'Unknown';

      // Build caption with box format (no button)
      const caption = `╭═══〘 *🎵 TIKTOK VIDEO* 〙═══⊷❍
┃✯│ 📝 *Title:* ${title.length > 50 ? title.substring(0, 50) + '...' : title}
┃✯│ 👤 *Author:* ${author} (@${authorId})
┃✯│ 🌍 *Region:* ${region}
┃✯│ ⏱️ *Duration:* ${formatDuration(duration)}
┃✯│
┃✯│ 📊 *Stats:*
┃✯│ 👁️ Plays: ${playCount}
┃✯│ ❤️ Likes: ${diggCount}
┃✯│ 💬 Comments: ${commentCount}
┃✯│ 🔄 Shares: ${shareCount}
┃✯│
┃✯│ 🎵 *Music:* ${musicTitle}
┃✯│ 👨‍🎤 *Artist:* ${musicAuthor}
╰══════════════════⊷❍`;

      // Delete status message
      try { await sock.sendMessage(from, { delete: statusKey }); } catch {}

      // Send the video with caption
      await sock.sendMessage(from, {
        video: { url: tempFile },
        mimetype: 'video/mp4',
        caption: caption
      }, { quoted: msg });

      // Clean up
      fs.unlinkSync(tempFile);

      await react('✅');
    } catch (error) {
      console.error('TikTok download error:', error);
      let errorMsg = '❌ Failed to download.';
      if (error.code === 'ECONNABORTED') {
        errorMsg = '❌ Request timed out. Please try again.';
      } else if (error.response?.status === 403) {
        errorMsg = '❌ Access denied. The video may be private or region-restricted.';
      } else if (error.message) {
        errorMsg = `❌ ${error.message}`;
      }
      await reply(errorMsg);
      await react('❌');
    }
  }
};