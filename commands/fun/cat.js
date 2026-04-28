const axios = require('axios');

module.exports = {
  name: 'cat',
  aliases: [],
  category: 'fun',
  description: '🐱 Get a random cat image',
  usage: '.cat',
  async execute(sock, msg, args, extra) {
    const { reply, react, from } = extra;
    try {
      await react('🐱');
      const res = await axios.get('https://api.thecatapi.com/v1/images/search');
      const url = res.data?.[0]?.url;
      if (!url) return reply('❌ No cat found.');
      await sock.sendMessage(from, { image: { url }, caption: '🐱 Random Cat' }, { quoted: msg });
      await react('✅');
    } catch (e) {
      await reply(`❌ Error: ${e.message}`);
      await react('❌');
    }
  }
};