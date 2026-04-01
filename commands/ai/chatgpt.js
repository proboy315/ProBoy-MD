const axios = require('axios');
const config = require('../../config');

module.exports = {
  name: 'chatgpt',
  aliases: ['gptai', 'gpt', 'ai5'],
  category: 'ai',
  description: '🧠 Chat with ChatGPT',
  usage: '.chatgpt <your question>',

  async execute(sock, msg, args, extra) {
    const { reply, react } = extra;
    const query = args.join(' ');
    if (!query) return reply('❌ Please provide a question.\nExample: .chatgpt Explain quantum physics');

    try {
      await react('🧠');
      
      let result;
      try {
        const baseUrl = config.apis?.dreaded?.baseUrl || 'https://api.dreaded.site/api';
        const res = await axios.get(`${baseUrl}/chatgpt`, { params: { text: query }, timeout: 30000 });
        result = res.data?.result?.prompt;
      } catch (e) {
        // Fallback to Prince API
        const baseUrl = config.apis?.princetech?.baseUrl || 'https://api.princetechn.com/api';
        const apikey = config.apis?.princetech?.apiKey || 'prince';
        const res = await axios.get(`${baseUrl}/ai/ai`, { params: { apikey, q: query }, timeout: 30000 });
        result = res.data?.result;
      }

      if (!result) return reply('❌ No response from AI.');

      await reply(`╭═══〘 *CHATGPT* 〙═══⊷❍
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
