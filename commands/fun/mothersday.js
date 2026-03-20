const axios = require('axios');

module.exports = {
  name: 'mothersday',
  aliases: [],
  category: 'fun',
  description: '👩 Get a random Mother’s Day wish',
  usage: '.mothersday',
  async execute(sock, msg, args, extra) {
    const { reply, react } = extra;
    try {
      await react('👩');
      const res = await axios.get('https://api.princetechn.com/api/fun/mothersday?apikey=prince');
      if (res.data?.result) await reply(res.data.result);
      else await reply('❌ No wish found.');
      await react('✅');
    } catch (e) {
      await reply(`❌ Error: ${e.message}`);
      await react('❌');
    }
  }
};