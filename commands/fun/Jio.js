// JIO network boosting animation
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
  name: 'jio',
  aliases: ['network', 'jionet'],
  category: 'fun',
  description: 'JIO network boosting animation',
  usage: '.jio',
  ownerOnly: false,

  async execute(sock, msg, args, extra) {
    const { from, react } = extra;
    await react('📡');

    const frames = [
      "```█ ▇ ▆ ▅ ▄ ▂ ▁```",
      "```▒ ▇ ▆ ▅ ▄ ▂ ▁```",
      "```▒ ▒ ▆ ▅ ▄ ▂ ▁```",
      "```▒ ▒ ▒ ▅ ▄ ▂ ▁```",
      "```▒ ▒ ▒ ▒ ▄ ▂ ▁```",
      "```▒ ▒ ▒ ▒ ▒ ▂ ▁```",
      "```▒ ▒ ▒ ▒ ▒ ▒ ▁```",
      "```▒ ▒ ▒ ▒ ▒ ▒ ▒```",
      "*Optimising JIO NETWORK...*",
      "```▒ ▒ ▒ ▒ ▒ ▒ ▒```",
      "```▁ ▒ ▒ ▒ ▒ ▒ ▒```",
      "```▁ ▂ ▒ ▒ ▒ ▒ ▒```",
      "```▁ ▂ ▄ ▒ ▒ ▒ ▒```",
      "```▁ ▂ ▄ ▅ ▒ ▒ ▒```",
      "```▁ ▂ ▄ ▅ ▆ ▒ ▒```",
      "```▁ ▂ ▄ ▅ ▆ ▇ ▒```",
      "```▁ ▂ ▄ ▅ ▆ ▇ █```",
      "*JIO NETWORK Boosted....*",
    ];

    const sentMsg = await sock.sendMessage(from, { text: '```Connecting To JIO NETWORK ....```' }, { quoted: msg });

    // Run once
    for (let i = 0; i < frames.length; i++) {
      await sleep(1400);
      await sock.sendMessage(from, { text: frames[i], edit: sentMsg.key });
    }
    await react('✅');
  }
};
