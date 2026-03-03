// commands/media/tiktok.js
const { ttdl } = require('ab-downloader');
const { sendInteractiveMessage } = require('gifted-btns');
const config = require('../../config');

// Temporary cache for media data (auto‑clears after 10 minutes)
const mediaCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

setInterval(() => {
  const now = Date.now();
  for (const [id, data] of mediaCache) {
    if (now - data.timestamp > CACHE_TTL) mediaCache.delete(id);
  }
}, 60000);

module.exports = {
  name: 'tiktok',
  aliases: ['tt', 'ttdl'],
  category: 'media',
  description: 'Download TikTok videos/audio with quality selection',
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
      const data = await ttdl(url);
      
      // Validate response structure
      if (!data || !Array.isArray(data) || data.length === 0) {
        throw new Error('No data received from TikTok');
      }

      const media = data[0];
      const title = media?.title || 'TikTok Video';
      const thumbnail = media?.thumbnail;
      const videos = Array.isArray(media?.video) ? media.video : [];
      const audios = Array.isArray(media?.audio) ? media.audio : [];

      if (videos.length === 0 && audios.length === 0) {
        throw new Error('No downloadable media found for this URL');
      }

      // Generate cache ID
      const cacheId = `tt_${Date.now()}_${msg.key.id.slice(0, 4)}`;
      mediaCache.set(cacheId, {
        timestamp: Date.now(),
        title,
        video: videos[0] || null,
        audio: audios[0] || null
      });

      // Build interactive buttons
      const buttons = [];
      if (videos.length > 0) {
        buttons.push({
          name: 'quick_reply',
          buttonParamsJson: JSON.stringify({ display_text: '🎬 Video', id: `tt:${cacheId}:video` })
        });
      }
      if (audios.length > 0) {
        buttons.push({
          name: 'quick_reply',
          buttonParamsJson: JSON.stringify({ display_text: '🎵 Audio', id: `tt:${cacheId}:audio` })
        });
        buttons.push({
          name: 'quick_reply',
          buttonParamsJson: JSON.stringify({ display_text: '📄 Audio as Document', id: `tt:${cacheId}:document` })
        });
      }

      // Prepare message options
      const messageOptions = {
        text: `*${title}*\n\nChoose an option below:`,
        footer: config.botName,
        interactiveButtons: buttons
      };
      if (thumbnail) {
        messageOptions.image = { url: thumbnail };
      }

      // Send interactive message
      await sendInteractiveMessage(sock, extra.from, messageOptions, { quoted: msg });
      await extra.react('✅');
    } catch (error) {
      console.error('TikTok command error:', error);
      await extra.reply(`❌ Failed: ${error.message}`);
      await extra.react('❌');
    }
  },

  async handleButtonResponse(sock, msg, extra) {
    try {
      // Extract button response
      const button = msg.message?.buttonsResponseMessage || msg.message?.interactiveResponseMessage;
      if (!button) return;

      const buttonId = button.selectedButtonId || button.id;
      if (!buttonId || !buttonId.startsWith('tt:')) return;

      // Parse button ID
      const [_, cacheId, type] = buttonId.split(':');
      const cached = mediaCache.get(cacheId);
      if (!cached) {
        return extra.reply('❌ This selection has expired. Please run the command again.');
      }

      await extra.react('⏳');

      // Send media based on type
      if (type === 'video') {
        if (!cached.video) throw new Error('Video URL not available');
        await sock.sendMessage(extra.from, {
          video: { url: cached.video },
          mimetype: 'video/mp4',
          caption: `🎬 *${cached.title}*\n\n${config.botName}`
        }, { quoted: msg });
      } else if (type === 'audio') {
        if (!cached.audio) throw new Error('Audio URL not available');
        await sock.sendMessage(extra.from, {
          audio: { url: cached.audio },
          mimetype: 'audio/mpeg',
          ptt: false, // normal audio, not voice note
          caption: `🎵 *${cached.title}*\n\n${config.botName}`
        }, { quoted: msg });
      } else if (type === 'document') {
        if (!cached.audio) throw new Error('Audio URL not available');
        await sock.sendMessage(extra.from, {
          document: { url: cached.audio },
          mimetype: 'audio/mpeg',
          fileName: `${cached.title}.mp3`,
          caption: `📄 *${cached.title}*\n\n${config.botName}`
        }, { quoted: msg });
      }

      // Clean up cache after successful send
      mediaCache.delete(cacheId);
      await extra.react('✅');
    } catch (error) {
      console.error('TikTok button handler error:', error);
      await extra.reply(`❌ Failed to send: ${error.message}`);
      await extra.react('❌');
    }
  }
};
