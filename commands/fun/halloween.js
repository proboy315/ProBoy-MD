const axios = require('axios');
const config = require('../../config');

module.exports = {
  name: 'halloween',
  aliases: [],
  category: 'fun',
  description: '🎃 Get a random Halloween wish',
  usage: '.halloween',
  async execute(sock, msg, args, extra) {
    const { reply, react } = extra;
    try {
      await react('🎃');
      const baseUrl = config.apis?.princetech?.baseUrl || 'https://api.princetechn.com/api';
      const apikey = config.apis?.princetech?.apiKey || 'prince';
      const res = await axios.get(`${baseUrl}/fun/halloween`, { params: { apikey }, timeout: 30000 });
      if (res.data?.result) await reply(res.data.result);
      else await reply('❌ No wish found.');
      await react('✅');
    } catch (e) {
      await reply(`❌ Error: ${e.message}`);
      await react('❌');
    }
  }
};
