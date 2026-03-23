// commands/media/instagram.js
const { igdl } = require('ab-downloader');
const config = require('../../config');

module.exports = {
  name: 'ig',
  aliases: ['ig', 'igdl', 'instagram'],
  category: 'media',
  description: 'Download Instagram reels/videos',
  usage: '.ig <instagram url>',

  async execute(sock, msg, args, extra) {
    try {
      // Check if URL provided
      const url = args.join(' ').trim();
      if (!url) {
        return extra.reply(`❌ Please provide an Instagram URL.\n*Usage:* ${this.usage}`);
      }

      // React with processing
      await extra.react('⏳');

      // Fetch Instagram media
      const data = await igdl(url);
      
      // Check if data exists and has items
      if (!data || !Array.isArray(data) || data.length === 0) {
        throw new Error('No media found at the provided URL.');
      }

      // Get first item (usually the video)
      const media = data[0];
      if (!media.url) {
        throw new Error('Could not extract video URL.');
      }

      // Prepare caption
      const caption = `📸 *Instagram Video Downloaded*\n🔗 * URL:* ${url}\n\n${config.botName}`;

      // Send the video
      await sock.sendMessage(extra.from, {
        video: { url: media.url },
        mimetype: 'video/mp4',
        caption: caption
      }, { quoted: msg });

      // Success reaction
      await extra.react('✅');
    } catch (error) {
      console.error('Instagram download error:', error);
      await extra.reply(`❌ Failed to download: ${error.message}`);
      await extra.react('❌');
    }
  }
};
