const axios = require('axios');

module.exports = {
  name: 'blackbox',
  aliases: ['bbox', 'bb'],
  category: 'ai',
  description: '👾 Chat with BlackBox AI',
  usage: '.blackbox <your question>',

  async execute(sock, msg, args, extra) {
    const { reply, react } = extra;
    const query = args.join(' ');
    if (!query) return reply('❌ Please provide a question.\nExample: .blackbox What is AI?');

    try {
      await react('👾');
      const res = await axios.get(
        `https://api.princetechn.com/api/ai/ai?apikey=prince&q=${encodeURIComponent(query)}`,
        { timeout: 30000 }
      );
      const result = res.data?.result;

      if (!result) return reply('❌ No response from AI.');

      await reply(`╭═══〘 *BLACKBOX AI* 〙═══⊷❍
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
