// Square face animation
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
  name: 'face',
  aliases: ['smiley'],
  category: 'fun',
  description: 'Animated square face',
  usage: '.face',
  ownerOnly: false,

  async execute(sock, msg, args, extra) {
    const { from, react } = extra;
    await react('😐');

    const frames = [
      "◻️◻️◻️◻️◻️\n◻️◻️◻️◻️◻️\n◻️◻️◼️◻️◻️\n◻️◻️◻️◻️◻️\n◻️◻️◻️◻️◻️",
      "◻️◻️◻️◻️◻️\n◻️◻️◻️◻️◻️\n◻️◻️◻️◻️◻️\n◻️◻️◻️◻️◻️\n◻️◻️◻️◻️◻️",
      "◻️◻️◻️◻️◻️\n◻️◼️◻️◼️◻️\n◻️◻️◻️◻️◻️\n◻️◼️◼️◼️◻️\n◻️◻️◻️◻️◻️",
    ];

    const sentMsg = await sock.sendMessage(from, { text: '◻️◻️◻️◻️' }, { quoted: msg });

    let cycles = 0;
    while (cycles < 10) {
      for (let i = 0; i < frames.length; i++) {
        await sleep(600);
        await sock.sendMessage(from, { text: frames[i], edit: sentMsg.key });
      }
      cycles++;
    }
    await react('😊');
  }
};
