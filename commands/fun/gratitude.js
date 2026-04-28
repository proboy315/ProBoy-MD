const axios = require('axios');
const config = require('../../config');

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
      const baseUrl = config.apis?.princetech?.baseUrl || 'https://api.princetechn.com/api';
      const apikey = config.apis?.princetech?.apiKey || 'prince';
      const res = await axios.get(`${baseUrl}/fun/gratitude`, { params: { apikey }, timeout: 30000 });
      if (res.data?.result) await reply(res.data.result);
      else await reply('❌ No quote found.');
      await react('✅');
    } catch (e) {
      await reply(`❌ Error: ${e.message}`);
      await react('❌');
    }
  }
};
