// Moon phases grid animation
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
  name: 'moon',
  aliases: ['moonphase'],
  category: 'fun',
  description: 'Shows a cool moon phase animation',
  usage: '.moon',
  ownerOnly: false, // anyone can use

  async execute(sock, msg, args, extra) {
    const { from, reply, react } = extra;
    await react('🌕'); // optional reaction

    const frames = [
      '🌗🌗🌗🌗🌗\n🌓🌓🌓🌓🌓\n🌗🌗🌗🌗🌗\n🌓🌓🌓🌓🌓\n🌗🌗🌗🌗🌗',
      '🌘🌘🌘🌘🌘\n🌔🌔🌔🌔🌔\n🌘🌘🌘🌘🌘\n🌔🌔🌔🌔🌔\n🌘🌘🌘🌘🌘',
      '🌑🌑🌑🌑🌑\n🌕🌕🌕🌕🌕\n🌑🌑🌑🌑🌑\n🌕🌕🌕🌕🌕\n🌑🌑🌑🌑🌑',
      '🌒🌒🌒🌒🌒\n🌖🌖🌖🌖🌖\n🌒🌒🌒🌒🌒\n🌖🌖🌖🌖🌖\n🌒🌒🌒🌒🌒',
      '🌓🌓🌓🌓🌓\n🌗🌗🌗🌗🌗\n🌓🌓🌓🌓🌓\n🌗🌗🌗🌗🌗\n🌓🌓🌓🌓🌓',
      '🌔🌔🌔🌔🌔\n🌘🌘🌘🌘🌘\n🌔🌔🌔🌔🌔\n🌘🌘🌘🌘🌘\n🌔🌔🌔🌔🌔',
      '🌕🌕🌕🌕🌕\n🌑🌑🌑🌑🌑\n🌕🌕🌕🌕🌕\n🌑🌑🌑🌑🌑\n🌕🌕🌕🌕🌕',
      '🌖🌖🌖🌖🌖\n🌒🌒🌒🌒🌒\n🌖🌖🌖🌖🌖\n🌒🌒🌒🌒🌒\n🌖🌖🌖🌖🌖',
    ];

    // Send initial message
    const sentMsg = await sock.sendMessage(from, { text: '🌕 Moon animation...' }, { quoted: msg });

    let cycles = 0;
    while (cycles < 20) { // repeat 20 times
      for (let i = 0; i < frames.length; i++) {
        await sleep(300);
        await sock.sendMessage(from, { text: frames[i], edit: sentMsg.key });
      }
      cycles++;
    }
    await react('✅');
  }
};
