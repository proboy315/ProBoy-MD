const axios = require('axios');

const SUPPORTED_LANGS = ['javascript','typescript','python','swift','ruby','csharp','go','rust','php','matlab','r','java','c','cpp'];

module.exports = {
  name: 'aicode',
  aliases: ['codeai', 'codechat', 'ai6'],
  category: 'ai',
  description: '💻 Generate code using AI',
  usage: '.aicode <language> | <prompt>',

  async execute(sock, msg, args, extra) {
    const { reply, react } = extra;
    const q = args.join(' ').trim();
    if (!q) return reply(`╭═══〘 *USAGE* 〙═══⊷❍
┃✯│ .aicode javascript | reverse a string
┃✯│ Languages: ${SUPPORTED_LANGS.join(', ')}
╰══════════════════⊷❍`);

    let lang = 'javascript';
    let prompt = q;
    if (q.includes('|')) {
      const parts = q.split('|').map(s => s.trim());
      lang = parts[0].toLowerCase();
      prompt = parts.slice(1).join('|');
    }

    if (!SUPPORTED_LANGS.includes(lang)) {
      return reply(`❌ Unsupported language. Use: ${SUPPORTED_LANGS.join(', ')}`);
    }

    try {
      await react('💻');
      
      let code;
      try {
        const res = await axios.get(`https://api.dreaded.site/api/aicode?prompt=${encodeURIComponent(prompt)}&language=${encodeURIComponent(lang)}`);
        code = res.data?.result?.prompt?.code;
      } catch (e) {
        // Fallback to Prince API
        const aiPrompt = `Write ${lang} code for: ${prompt}. Only provide the code, no explanation.`;
        const res = await axios.get(`https://api.princetechn.com/api/ai/ai?apikey=prince&q=${encodeURIComponent(aiPrompt)}`);
        code = res.data?.result;
      }

      if (!code) return reply('❌ No code generated.');

      await reply(`╭═══〘 *AI CODE* 〙═══⊷❍
┃✯│ 📝 *Language:* ${lang}
┃✯│ 💬 *Prompt:* ${prompt}
┃✯│
┃✯│ \`\`\`${lang}
┃✯│ ${code}
┃✯│ \`\`\`
╰══════════════════⊷❍`);
      await react('✅');
    } catch (e) {
      console.error(e);
      await reply(`❌ Error: ${e.message}`);
      await react('❌');
    }
  }
};