const axios = require('axios');

module.exports = {
  name: 'funfact',
  aliases: ['factapi'],
  category: 'fun',
  description: '🧠 Get a random fun fact',
  usage: '.funfact',
  async execute(sock, msg, args, extra) {
    const { reply, react } = extra;
    try {
      await react('🧠');
      const res = await axios.get('https://uselessfacts.jsph.pl/random.json?language=en');
      const fact = res.data?.text;
      if (!fact) return reply('❌ No fact found.');
      await reply(`🧠 *Random Fun Fact*\n\n${fact}`);
      await react('✅');
    } catch (e) {
      await reply(`❌ Error: ${e.message}`);
      await react('❌');
    }
  }
};