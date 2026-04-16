const axios = require('axios');
const config = require('../../config');

module.exports = {
  name: 'meta',
  aliases: ['metaai', 'metachat', 'ai4'],
  category: 'ai',
  description: '🌐 Chat with Meta AI',
  usage: '.meta <your question>',

  async execute(sock, msg, args, extra) {
    const { reply, react } = extra;
    const query = args.join(' ');
    if (!query) return reply('❌ Please provide a question.\nExample: .meta Who is Mark?');

    try {
      await react('🌐');
      
      let result;
      try {
        const baseUrl = config.apis?.siputzx?.baseUrl || 'https://api.siputzx.my.id';
        const res = await axios.get(`${baseUrl}/api/ai/metaai`, { params: { query }, timeout: 30000 });
        result = res.data?.data;
      } catch (e) {
        // Fallback to Prince API
        const baseUrl = config.apis?.princetech?.baseUrl || 'https://api.princetechn.com/api';
        const apikey = config.apis?.princetech?.apiKey || 'prince';
        const res = await axios.get(`${baseUrl}/ai/ai`, { params: { apikey, q: query }, timeout: 30000 });
        result = res.data?.result;
      }

      if (!result) return reply('❌ No response from AI.');

      await reply(`╭═══〘 *META AI* 〙═══⊷❍
┃✯│ 💬 *Q:* ${query}
┃✯│
┃✯│ ${result}
╰══════════════════⊷❍`);
      await react('✅');
    } catch (e) {
      console.error(e);
      await reply(`❌ Error: ${e.message}`);
      await react('❌');
    }
  }
};
