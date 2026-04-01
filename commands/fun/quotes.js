const axios = require('axios');
const config = require('../../config');

module.exports = {
  name: 'quotes',
  aliases: ['quoteapi'],
  category: 'fun',
  description: '📝 Get a random general quote',
  usage: '.quotes',
  async execute(sock, msg, args, extra) {
    const { reply, react } = extra;
    try {
      await react('📝');
      const baseUrl = config.apis?.princetech?.baseUrl || 'https://api.princetechn.com/api';
      const apikey = config.apis?.princetech?.apiKey || 'prince';
      const res = await axios.get(`${baseUrl}/fun/quotes`, { params: { apikey }, timeout: 30000 });
      if (res.data?.result) await reply(res.data.result);
      else await reply('❌ No quote found.');
      await react('✅');
    } catch (e) {
      await reply(`❌ Error: ${e.message}`);
      await react('❌');
    }
  }
};
