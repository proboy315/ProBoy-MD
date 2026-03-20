const axios = require('axios');

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
      const res = await axios.get(`https://api.princetechn.com/api/ai/ai?apikey=prince&q=${encodeURIComponent(aiPrompt)}`);
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