const axios = require('axios');

module.exports = {
  name: 'dog',
  aliases: [],
  category: 'fun',
  description: '🐶 Get a random dog image',
  usage: '.dog',
  async execute(sock, msg, args, extra) {
    const { reply, react, from } = extra;
    try {
      await react('🐶');
      const res = await axios.get('https://dog.ceo/api/breeds/image/random');
      const url = res.data?.message;
      if (!url) return reply('❌ No dog found.');
      await sock.sendMessage(from, { image: { url }, caption: '🐶 Random Dog' }, { quoted: msg });
      await react('✅');
    } catch (e) {
      await reply(`❌ Error: ${e.message}`);
      await react('❌');
    }
  }
};