const axios = require('axios');

module.exports = {
  name: 'christmas',
  aliases: [],
  category: 'fun',
  description: '🎄 Get a random Christmas wish',
  usage: '.christmas',
  async execute(sock, msg, args, extra) {
    const { reply, react } = extra;
    try {
      await react('🎄');
      const res = await axios.get('https://api.princetechn.com/api/fun/christmas?apikey=prince');
      if (res.data?.result) await reply(res.data.result);
      else await reply('❌ No wish found.');
      await react('✅');
    } catch (e) {
      await reply(`❌ Error: ${e.message}`);
      await react('❌');
    }
  }
};