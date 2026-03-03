// commands/media/tiktok.js
const { ttdl } = require('ab-downloader');
const config = require('../../config');

module.exports = {
  name: 'tiktok',
  aliases: ['tt', 'ttdl'],
  category: 'media',
  description: 'Download TikTok videos without watermark',
  usage: '.tiktok <url>',

  async execute(sock, msg, args, extra) {
    try {
      // Check if URL provided
      const url = args.join(' ').trim();
      if (!url) {
        return extra.reply(`❌ Please provide a TikTok video URL.\n*Usage:* ${this.usage}`);
      }

      // React with processing
      await extra.react('⏳');

      // Fetch TikTok video data
      const data = await ttdl(url);

      // Validate response structure
      if (!data || !Array.isArray(data) || data.length === 0) {
        throw new Error('No data received from TikTok.');
      }

      const videoData = data[0]; // First item contains video info
      if (!videoData.video || !Array.isArray(videoData.video) || videoData.video.length === 0) {
        throw new Error('No video URL found.');
      }

      // Get the video URL (first one, usually no watermark)
      const videoUrl = videoData.video[0];
      const title = videoData.title || 'TikTok Video';

      // Prepare caption
      const caption = `🎵 *${title}*\n🔗 *Original URL:* ${url}\n\n${config.botName}`;

      // Send the video
      await sock.sendMessage(extra.from, {
        video: { url: videoUrl },
        mimetype: 'video/mp4',
        caption: caption
      }, { quoted: msg });

      // Success reaction
      await extra.react('✅');
    } catch (error) {
      console.error('TikTok download error:', error);
      await extra.reply(`❌ Failed to download: ${error.message}`);
      await extra.react('❌');
    }
  }
};
