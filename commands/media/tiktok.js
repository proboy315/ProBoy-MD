// commands/media/tiktok.js - Diagnostic Version
const { ttdl } = require('ab-downloader');
const config = require('../../config');
const axios = require('axios'); // Add this for URL checking

module.exports = {
  name: 'tiktok',
  aliases: ['tt', 'ttdl'],
  category: 'media',
  description: 'Download TikTok videos or audio',
  usage: '.tiktok <url> [mp3/audio]',

  async execute(sock, msg, args, extra) {
    try {
      if (args.length === 0) {
        return extra.reply(`❌ Please provide a TikTok video URL.\n*Usage:* ${this.usage}\n*Example:* .tiktok https://www.tiktok.com/@username/video/1234567890`);
      }

      let url = args[0];
      let format = 'video';
      if (args.length > 1 && ['mp3', 'audio'].includes(args[1].toLowerCase())) {
        format = 'audio';
      }

      await extra.react('⏳');

      // STEP 1: Check if URL is accessible
      await extra.reply('🔍 Checking URL accessibility...');
      try {
        const response = await axios.get(url, { timeout: 5000 });
        await extra.reply(`✅ URL is accessible (Status: ${response.status})`);
      } catch (err) {
        await extra.reply(`⚠️ URL check failed: ${err.message}\nTrying download anyway...`);
      }

      // STEP 2: Try different URL formats
      await extra.reply('🔄 Attempting to fetch TikTok data...');
      
      // Try with the original URL
      let data;
      try {
        data = await ttdl(url);
      } catch (err) {
        // If vt.tiktok.com fails, try converting to full URL
        if (url.includes('vt.tiktok.com')) {
          await extra.reply('⚠️ vt.tiktok.com link failed, trying alternative method...');
          
          // Try to resolve redirect
          try {
            const resolve = await axios.get(url, { maxRedirects: 5 });
            const fullUrl = resolve.request.res.responseUrl;
            await extra.reply(`🔄 Resolved to: ${fullUrl}`);
            data = await ttdl(fullUrl);
          } catch (resolveErr) {
            throw new Error(`Cannot resolve short URL: ${resolveErr.message}`);
          }
        } else {
          throw err;
        }
      }

      // STEP 3: Debug the response
      await extra.reply(`📦 Response type: ${typeof data}\nIs Array: ${Array.isArray(data)}\nLength: ${data?.length || 0}`);
      
      if (data && Array.isArray(data) && data.length > 0) {
        await extra.reply(`📋 First item keys: ${Object.keys(data[0]).join(', ')}`);
      }

      // STEP 4: Process as before
      if (!data || !Array.isArray(data) || data.length === 0) {
        throw new Error('No data received from TikTok API');
      }

      const content = data[0];
      
      if (format === 'audio') {
        if (!content.audio?.length) throw new Error('No audio found');
        const audioUrl = content.audio[0];
        const title = content.title_audio || content.title || 'TikTok Audio';
        
        await sock.sendMessage(extra.from, {
          audio: { url: audioUrl },
          mimetype: 'audio/mpeg',
          caption: `🎵 *${title}*\n🔗 ${url}\n\n${config.botName}`
        }, { quoted: msg });
      } else {
        if (!content.video?.length) throw new Error('No video found');
        const videoUrl = content.video[0];
        const title = content.title || 'TikTok Video';
        
        await sock.sendMessage(extra.from, {
          video: { url: videoUrl },
          mimetype: 'video/mp4',
          caption: `🎵 *${title}*\n🔗 ${url}\n\n${config.botName}`
        }, { quoted: msg });
      }

      await extra.react('✅');
    } catch (error) {
      console.error('TikTok error:', error);
      await extra.reply(`❌ Failed: ${error.message}`);
      await extra.react('❌');
      
      // Provide troubleshooting help
      if (error.message.includes('Hong Kong')) {
        await extra.reply('💡 *Tip:* The URL you used is region-restricted. Try a different TikTok video from a non-restricted region.');
      }
    }
  }
};
