const axios = require('axios');
const config = require('../../config');

module.exports = {
  name: 'translate',
  aliases: ['tr', 'trans'],
  category: 'ai',
  description: '🌍 Translate text to another language',
  usage: '.translate <target> | <text>',

  async execute(sock, msg, args, extra) {
    const { reply, react } = extra;
    const q = args.join(' ').trim();
    if (!q) return reply(`╭═══〘 *USAGE* 〙═══⊷❍
┃✯│ .translate en | Hello world
╰══════════════════⊷❍`);

    let target = 'en';
    let text = q;
    if (q.includes('|')) {
      const parts = q.split('|').map(s => s.trim());
      target = parts[0].toLowerCase();
      text = parts.slice(1).join('|');
    }

    try {
      await react('🌍');
      
      const aiPrompt = `Translate the following text to ${target}: "${text}". Only provide the translation, no explanation.`;
      const baseUrl = config.apis?.princetech?.baseUrl || 'https://api.princetechn.com/api';
      const apikey = config.apis?.princetech?.apiKey || 'prince';
      const res = await axios.get(`${baseUrl}/ai/ai`, { params: { apikey, q: aiPrompt }, timeout: 30000 });
      const translation = res.data?.result;

      if (!translation) return reply('❌ Translation failed.');

      await reply(`╭═══〘 *TRANSLATION* 〙═══⊷❍
┃✯│ 🌐 *Target:* ${target.toUpperCase()}
┃✯│ 💬 *Original:* ${text}
┃✯│
┃✯│ ${translation}
╰══════════════════⊷❍`);
      await react('✅');
    } catch (e) {
      console.error(e);
      await reply(`❌ Error: ${e.message}`);
      await react('❌');
    }
  }
};
