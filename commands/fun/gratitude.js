const axios = require('axios');

module.exports = {
  name: 'gratitude',
  aliases: [],
  category: 'fun',
  description: '🙏 Get a gratitude quote',
  usage: '.gratitude',
  async execute(sock, msg, args, extra) {
    const { reply, react } = extra;
    try {
      await react('🙏');
      const res = await axios.get('https://api.princetechn.com/api/fun/gratitude?apikey=prince');
      if (res.data?.result) await reply(res.data.result);
      else await reply('❌ No quote found.');
      await react('✅');
    } catch (e) {
      await reply(`❌ Error: ${e.message}`);
      await react('❌');
    }
  }
};