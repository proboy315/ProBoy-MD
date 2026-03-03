// commands/media/tiktok.js
const { downloadTiktok } = require('@mrnima/tiktok-downloader');
const config = require('../../config');

module.exports = {
  name: 'tiktok',
  aliases: ['tt', 'ttdl'],
  category: 'media',
  description: 'Download TikTok videos, audio, or images',
  usage: '.tiktok <url>',

  async execute(sock, msg, args, extra) {
    try {
      // Validate URL
      const url = args.join(' ').trim();
      if (!url) {
        return extra.reply(`❌ Please provide a TikTok URL.\n*Usage:* ${this.usage}\n*Example:* .tiktok https://vm.tiktok.com/xxxxx`);
      }
      if (!/tiktok\.com\//i.test(url)) {
        return extra.reply('❌ Invalid TikTok link. Make sure it contains tiktok.com');
      }

      await extra.react('⏳');

      // Fetch data
      const response = await downloadTiktok(url);

      // Check status
      if (!response || !response.status) {
        throw new Error(response?.message || 'Failed to fetch TikTok data');
      }

      const result = response.result;
      const title = result.title || 'TikTok Content';
      const thumbnail = result.image; // thumbnail image (may be present)

      // Determine what to send (priority: video → audio → images)
      const dl = result.dl_link;

      if (dl.download_mp4_hd || dl.download_mp4_1 || dl.download_mp4_2) {
        // Video available
        const videoUrl = dl.download_mp4_hd || dl.download_mp4_1 || dl.download_mp4_2;
        const caption = `🎬 *${title}*\n🔗 ${url}\n\n${config.botName}`;

        await sock.sendMessage(extra.from, {
          video: { url: videoUrl },
          mimetype: 'video/mp4',
          caption
        }, { quoted: msg });
      } else if (dl.download_mp3) {
        // Audio available (no video)
        const audioUrl = dl.download_mp3;
        const caption = `🎵 *${title}*\n🔗 ${url}\n\n${config.botName}`;

        await sock.sendMessage(extra.from, {
          audio: { url: audioUrl },
          mimetype: 'audio/mpeg',
          caption
        }, { quoted: msg });
      } else if (dl.images && Array.isArray(dl.images) && dl.images.length > 0) {
        // Image post – send first image
        const imageUrl = dl.images[0];
        const caption = `🖼️ *${title}*\n🔗 ${url}\n\n${config.botName}`;

        await sock.sendMessage(extra.from, {
          image: { url: imageUrl },
          caption
        }, { quoted: msg });
      } else {
        throw new Error('No downloadable media found for this URL');
      }

      await extra.react('✅');
    } catch (error) {
      console.error('TikTok download error:', error);
      await extra.reply(`❌ Failed: ${error.message}`);
      await extra.react('❌');
    }
  }
};
