const axios = require('axios');

module.exports = {
  name: 'summarize',
  aliases: ['sum', 'summary', 'tldr'],
  category: 'ai',
  description: '📝 Summarize a long text',
  usage: '.summarize <text>',

  async execute(sock, msg, args, extra) {
    const { reply, react } = extra;
    const text = args.join(' ');
    if (!text) return reply('❌ Please provide text to summarize.');

    try {
      await react('📝');
      
      const aiPrompt = `Summarize the following text concisely: "${text}"`;
      const res = await axios.get(`https://api.princetechn.com/api/ai/ai?apikey=prince&q=${encodeURIComponent(aiPrompt)}`);
      const summary = res.data?.result;

      if (!summary) return reply('❌ Summarization failed.');

      await reply(`╭═══〘 *SUMMARY* 〙═══⊷❍
┃✯│ 📝 ${summary}
╰══════════════════⊷❍`);
      await react('✅');
    } catch (e) {
      console.error(e);
      await reply(`❌ Error: ${e.message}`);
      await react('❌');
    }
  }
};