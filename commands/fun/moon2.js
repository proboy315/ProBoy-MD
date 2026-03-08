// Simple moon phase animation (single emoji)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
  name: 'moon2',
  aliases: ['moonemoji'],
  category: 'fun',
  description: 'Animated moon phases (single emoji)',
  usage: '.moon2',
  ownerOnly: false,

  async execute(sock, msg, args, extra) {
    const { from, react } = extra;
    await react('🌑');

    const frames = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];
    const sentMsg = await sock.sendMessage(from, { text: '🌑' }, { quoted: msg });

    let cycles = 0;
    while (cycles < 10) {
      for (let i = 0; i < frames.length; i++) {
        await sleep(200);
        await sock.sendMessage(from, { text: frames[i], edit: sentMsg.key });
      }
      cycles++;
    }
    await react('🌕');
  }
};
