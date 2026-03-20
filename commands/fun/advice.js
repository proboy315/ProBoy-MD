const axios = require('axios');

module.exports = {
  name: 'advice',
  aliases: [],
  category: 'fun',
  description: '💡 Get a random piece of advice',
  usage: '.advice',
  async execute(sock, msg, args, extra) {
    const { reply, react } = extra;
    try {
      await react('💡');
      const res = await axios.get('https://api.princetechn.com/api/fun/advice?apikey=prince');
      if (res.data?.result) await reply(res.data.result);
      else await reply('❌ No advice found.');
      await react('✅');
    } catch (e) {
      await reply(`❌ Error: ${e.message}`);
      await react('❌');
    }
  }
};