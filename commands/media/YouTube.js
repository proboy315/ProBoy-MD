/**
 * YouTube Downloader Plugin – Lightweight API
 * Uses:
 *   - https://backend1.tioo.eu.org/YouTube?url=<url> for direct download
 *   - https://backend1.tioo.eu.org/yts?q=<query> for search
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

// Helper: Check if text is a YouTube URL
function isYoutubeUrl(text) {
  const patterns = [
    /youtube\.com\/watch\?v=/,
    /youtu\.be\//,
    /youtube\.com\/shorts\//,
    /youtube\.com\/embed\//,
    /m\.youtube\.com\/watch\?v=/
  ];
  return patterns.some(pattern => pattern.test(text));
}

// Helper: Search YouTube and get top video info
async function searchYoutube(query) {
  const apiUrl = `https://backend1.tioo.eu.org/yts?q=${encodeURIComponent(query)}`;
  const response = await fetchWithRetry(apiUrl, 3, 15000);
  const data = response.data;

  if (!data?.status || !data?.videos || data.videos.length === 0) {
    throw new Error('No videos found for your query.');
  }

  const topVideo = data.videos[0];
  return {
    title: topVideo.title,
    videoUrl: topVideo.url,
    author: topVideo.author?.name || 'Unknown'
  };
}

// Helper: Download video info from URL
async function downloadYoutube(url) {
  const apiUrl = `https://backend1.tioo.eu.org/YouTube?url=${encodeURIComponent(url)}`;
  const response = await fetchWithRetry(apiUrl, 3, 20000);
  const data = response.data;

  if (!data?.status || !data?.mp4) {
    throw new Error('Could not extract video URL.');
  }

  return {
    mp4: data.mp4,
    title: data.title || 'YouTube Video',
    author: data.author || 'Unknown',
    thumbnail: data.thumbnail || null
  };
}

module.exports = {
  name: 'yt',
  aliases: ['youtube', 'ytdl'],
  category: 'media',
  description: '🎬 Download YouTube videos (supports URL or search query)',
  usage: '.yt <url or search query>',

  async execute(sock, msg, args, extra) {
    const { from, reply, react } = extra;

    const input = args.join(' ').trim();
    if (!input) {
      return reply(`❌ Please provide a YouTube URL or search query.\nExample: ${this.usage}`);
    }

    try {
      await react('⏳');

      let videoInfo;

      if (isYoutubeUrl(input)) {
        // Direct URL – download directly
        videoInfo = await downloadYoutube(input);
      } else {
        // Search query
        const searchInfo = await searchYoutube(input);
        videoInfo = await downloadYoutube(searchInfo.videoUrl);
        // If the download didn't return an author, use the search one
        if (videoInfo.author === 'Unknown' && searchInfo.author !== 'Unknown') {
          videoInfo.author = searchInfo.author;
        }
      }

      // Build caption
      let caption = `🎬 *${videoInfo.title}*`;
      if (videoInfo.author && videoInfo.author !== 'Unknown') {
        caption += `\n👤 *Author:* ${videoInfo.author}`;
      }
      caption += `\n\n${config.botName}`;

      // Prepare context info for thumbnail (if available)
      const contextInfo = videoInfo.thumbnail ? {
        externalAdReply: {
          title: videoInfo.title,
          body: 'YouTube Video',
          thumbnailUrl: videoInfo.thumbnail,
          mediaType: 1,
          renderLargerThumbnail: true
        }
      } : undefined;

      // Send video
      await sock.sendMessage(from, {
        video: { url: videoInfo.mp4 },
        mimetype: 'video/mp4',
        caption: caption,
        contextInfo
      }, { quoted: msg });

      await react('✅');
    } catch (error) {
      console.error('YouTube plugin error:', error);
      let errorMsg = '❌ Failed to download.';
      if (error.code === 'ECONNABORTED') errorMsg += ' Request timed out.';
      else errorMsg += ` ${error.message}`;
      await reply(errorMsg);
      await react('❌');
    }
  }
};
