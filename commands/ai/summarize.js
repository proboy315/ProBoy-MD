const axios = require('axios');
const config = require('../../config');

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
      const baseUrl = config.apis?.princetech?.baseUrl || 'https://api.princetechn.com/api';
      const apikey = config.apis?.princetech?.apiKey || 'prince';
      const res = await axios.get(`${baseUrl}/ai/ai`, { params: { apikey, q: aiPrompt }, timeout: 30000 });
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
