const axios = require('axios');

module.exports = {
  name: 'valentine',
  aliases: ['valentines', 'valentinesday'],
  category: 'fun',
  description: '❤️ Get a random Valentine’s Day wish',
  usage: '.valentine',
  async execute(sock, msg, args, extra) {
    const { reply, react } = extra;
    try {
      await react('❤️');
      const res = await axios.get('https://api.princetechn.com/api/fun/valentines?apikey=prince');
      if (res.data?.result) await reply(res.data.result);
      else await reply('❌ No wish found.');
      await react('✅');
    } catch (e) {
      await reply(`❌ Error: ${e.message}`);
      await react('❌');
    }
  }
};