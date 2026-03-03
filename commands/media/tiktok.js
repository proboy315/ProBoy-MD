// commands/media/tiktok.js
const { ttdl } = require('ab-downloader');
const config = require('../../config');

module.exports = {
  name: 'tiktok',
  aliases: ['tt', 'ttdl'],
  category: 'media',
  description: 'Download TikTok videos or audio without watermark',
  usage: '.tiktok <url> [mp3/audio]',

  async execute(sock, msg, args, extra) {
    try {
      // Check if URL provided
      if (args.length === 0) {
        return extra.reply(`❌ Please provide a TikTok video URL.\n*Usage:* ${this.usage}\n*Example:* .tiktok https://vm.tiktok.com/xxxxx\n*Example (audio):* .tiktok https://vm.tiktok.com/xxxxx mp3`);
      }

      // Extract URL and optional format
      let url = args[0];
      let format = 'video'; // default
      if (args.length > 1) {
        const opt = args[1].toLowerCase();
        if (opt === 'mp3' || opt === 'audio') format = 'audio';
      }

      // Validate URL
      if (!url.match(/^https?:\/\/(www\.)?(tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com)\/.+/)) {
        return extra.reply('❌ Invalid TikTok URL. Please provide a valid TikTok video link.');
      }

      await extra.react('⏳');

      // Fetch data
      const data = await ttdl(url);

      // Check response structure (expected: array with one object)
      if (!data || !Array.isArray(data) || data.length === 0) {
        throw new Error('No data received from TikTok. The video might be private or unavailable.');
      }

      const content = data[0];
      if (!content || (!content.video && !content.audio)) {
        throw new Error('Invalid response structure from TikTok.');
      }

      // Determine what to send
      if (format === 'audio') {
        // Audio download
        if (!content.audio || !Array.isArray(content.audio) || content.audio.length === 0) {
          throw new Error('No audio found for this video.');
        }
        const audioUrl = content.audio[0];
        const title = content.title_audio || content.title || 'TikTok Audio';

        const caption = `🎵 *${title}*\n🔗 *Original URL:* ${url}\n\n${config.botName}`;

        await sock.sendMessage(extra.from, {
          audio: { url: audioUrl },
          mimetype: 'audio/mpeg',
          caption: caption
        }, { quoted: msg });
      } else {
        // Video download
        if (!content.video || !Array.isArray(content.video) || content.video.length === 0) {
          throw new Error('No video found for this URL.');
        }
        const videoUrl = content.video[0]; // usually the highest quality no-watermark
        const title = content.title || 'TikTok Video';

        const caption = `🎵 *${title}*\n🔗 *Original URL:* ${url}\n\n${config.botName}`;

        await sock.sendMessage(extra.from, {
          video: { url: videoUrl },
          mimetype: 'video/mp4',
          caption: caption
        }, { quoted: msg });
      }

      await extra.react('✅');
    } catch (error) {
      console.error('TikTok download error:', error);
      await extra.reply(`❌ Failed to download: ${error.message}`);
      await extra.react('❌');
    }
  }
};
