const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
  name: 'clock',
  aliases: ['time'],
  category: 'fun',
  description: 'Animated analog clock',
  usage: '.clock',
  ownerOnly: false,

  async execute(sock, msg, args, extra) {
    const { from, react } = extra;
    await react('🕐');

    const frames = ['🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚', '🕛'];
    const sentMsg = await sock.sendMessage(from, { text: '🕐' }, { quoted: msg });

    let cycles = 0;
    while (cycles < 3) {
      for (let i = 0; i < frames.length; i++) {
        await sleep(300);
        await sock.sendMessage(from, { text: frames[i], edit: sentMsg.key });
      }
      cycles++;
    }
    await react('⏰');
  }
};
