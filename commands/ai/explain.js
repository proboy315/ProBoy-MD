const axios = require('axios');

module.exports = {
  name: 'explain',
  aliases: ['eli5', 'define'],
  category: 'ai',
  description: '📚 Explain a concept simply',
  usage: '.explain <topic>',

  async execute(sock, msg, args, extra) {
    const { reply, react } = extra;
    const topic = args.join(' ');
    if (!topic) return reply('❌ Please provide a topic to explain.');

    try {
      await react('📚');
      
      const aiPrompt = `Explain "${topic}" in simple terms.`;
      const res = await axios.get(`https://api.princetechn.com/api/ai/ai?apikey=prince&q=${encodeURIComponent(aiPrompt)}`);
      const explanation = res.data?.result;

      if (!explanation) return reply('❌ Explanation failed.');

      await reply(`╭═══〘 *EXPLANATION* 〙═══⊷❍
┃✯│ 📚 *Topic:* ${topic}
┃✯│
┃✯│ ${explanation}
╰══════════════════⊷❍`);
      await react('✅');
    } catch (e) {
      console.error(e);
      await reply(`❌ Error: ${e.message}`);
      await react('❌');
    }
  }
};