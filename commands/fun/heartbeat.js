const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
  name: 'heartbeat',
  aliases: ['heart'],
  category: 'fun',
  description: 'Beating heart animation',
  usage: '.heartbeat',
  ownerOnly: false,

  async execute(sock, msg, args, extra) {
    const { from, react } = extra;
    await react('❤️');

    const frames = ['🖤', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤'];
    const sentMsg = await sock.sendMessage(from, { text: '❤️' }, { quoted: msg });

    let cycles = 0;
    while (cycles < 5) {
      for (let i = 0; i < frames.length; i++) {
        await sleep(200);
        await sock.sendMessage(from, { text: frames[i], edit: sentMsg.key });
      }
      cycles++;
    }
    await react('💖');
  }
};
