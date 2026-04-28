const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
  name: 'roll',
  aliases: ['dice'],
  category: 'fun',
  description: 'Rolls a dice with animation',
  usage: '.roll',
  ownerOnly: false,

  async execute(sock, msg, args, extra) {
    const { from, react } = extra;
    await react('🎲');

    const frames = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    const sentMsg = await sock.sendMessage(from, { text: '🎲 Rolling...' }, { quoted: msg });

    for (let i = 0; i < 15; i++) {
      const random = Math.floor(Math.random() * frames.length);
      await sleep(200);
      await sock.sendMessage(from, { text: frames[random], edit: sentMsg.key });
    }
    const final = frames[Math.floor(Math.random() * frames.length)];
    await sleep(300);
    await sock.sendMessage(from, { text: `🎲 Result: ${final}`, edit: sentMsg.key });
    await react('✅');
  }
};
