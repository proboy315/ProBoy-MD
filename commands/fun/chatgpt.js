const axios = require('axios');

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
        const res = await axios.get(`https://api.dreaded.site/api/chatgpt?text=${encodeURIComponent(query)}`);
        result = res.data?.result?.prompt;
      } catch (e) {
        // Fallback to Prince API
        const res = await axios.get(`https://api.princetechn.com/api/ai/ai?apikey=prince&q=${encodeURIComponent(query)}`);
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