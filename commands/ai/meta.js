const axios = require('axios');

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
        const res = await axios.get(`https://api.siputzx.my.id/api/ai/metaai?query=${encodeURIComponent(query)}`);
        result = res.data?.data;
      } catch (e) {
        // Fallback to Prince API
        const res = await axios.get(`https://api.princetechn.com/api/ai/ai?apikey=prince&q=${encodeURIComponent(query)}`);
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