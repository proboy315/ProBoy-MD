const axios = require('axios');
const config = require('../../config');

module.exports = {
  name: 'gemini',
  aliases: ['geminiai', 'geminichat', 'ai2'],
  category: 'ai',
  description: '💎 Chat with Gemini AI',
  usage: '.gemini <your question>',

  async execute(sock, msg, args, extra) {
    const { reply, react } = extra;
    const query = args.join(' ');
    if (!query) return reply('❌ Please provide a question.\nExample: .gemini What is love?');

    try {
      await react('💎');
      
      let result;
      try {
        const baseUrl = config.apis?.geminiProxy?.baseUrl || 'https://ymd-ai.onrender.com';
        const res = await axios.get(`${baseUrl}/api/gemini`, { params: { q: query }, timeout: 30000 });
        result = res.data?.data;
      } catch (e) {
        // Fallback to Prince API
        const baseUrl = config.apis?.princetech?.baseUrl || 'https://api.princetechn.com/api';
        const apikey = config.apis?.princetech?.apiKey || 'prince';
        const res = await axios.get(`${baseUrl}/ai/ai`, { params: { apikey, q: query }, timeout: 30000 });
        result = res.data?.result;
      }

      if (!result) return reply('❌ No response from AI.');

      await reply(`╭═══〘 *GEMINI AI* 〙═══⊷❍
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
