const axios = require('axios');
const config = require('../../config');

module.exports = {
  name: 'imagine',
  aliases: ['imagegen', 'genimg', 'ai7'],
  category: 'ai',
  description: '🎨 Generate an image from text',
  usage: '.imagine <description>',

  async execute(sock, msg, args, extra) {
    const { reply, react, from } = extra;
    const prompt = args.join(' ');
    if (!prompt) return reply('❌ Please provide an image description.\nExample: .imagine a beautiful sunset');

    try {
      await react('🎨');
      await reply('⏳ Generating image...');

      const baseUrl = config.apis?.dreaded?.baseUrl || 'https://api.dreaded.site/api';
      const res = await axios.get(`${baseUrl}/imagine`, { params: { text: prompt }, timeout: 30000 });
      const imageUrl = res.data?.result;

      if (!imageUrl) return reply('❌ Image generation failed.');

      await sock.sendMessage(from, {
        image: { url: imageUrl },
        caption: `╭═══〘 *AI IMAGE* 〙═══⊷❍
┃✯│ 🎨 *Prompt:* ${prompt}
╰══════════════════⊷❍`
      }, { quoted: msg });
      await react('✅');
    } catch (e) {
      console.error(e);
      await reply(`❌ Error: ${e.message}`);
      await react('❌');
    }
  }
};
