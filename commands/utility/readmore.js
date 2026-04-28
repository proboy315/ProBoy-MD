// commands/utility/readmore.js

const { sendInteractiveMessage } = require('../../utils/button');
const config = require('../../config');

module.exports = {
  name: 'readmore',
  aliases: ['rdmore', 'rmore'],
  category: 'utility',
  description: 'Multi-step readmore with copy button',
  usage: '.readmore 1 + 2 + 3 + 4',

  ownerOnly: false,
  modOnly: false,
  groupOnly: false,
  privateOnly: false,
  adminOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const { reply, react, from } = extra;

    try {
      if (!args.length) {
        return reply(`❌ Example:\n${this.usage}`);
      }

      const input = args.join(' ').trim();

      if (!input.includes('+')) {
        return reply(`❌ Use + sign\n\nExample:\n${this.usage}`);
      }

      await react('⏳');

      const parts = input
        .split('+')
        .map(x => x.trim())
        .filter(Boolean);

      const invisible = String.fromCharCode(8206).repeat(4001);

      let collected = '';

      for (let i = 0; i < parts.length; i++) {

        collected += (collected ? '\n\n' : '') + parts[i];

        let msgText = collected;

        // If more parts remaining add readmore
        if (i < parts.length - 1) {
          msgText += '\n' + invisible;
        }

        await sendInteractiveMessage(sock, from, {
          text: msgText,
          footer: config.botName || 'Bot',
          interactiveButtons: [
            {
              name: 'cta_copy',
              buttonParamsJson: JSON.stringify({
                display_text: '📋 Copy Text',
                copy_code: collected
              })
            }
          ]
        }, { quoted: msg });

        // delay for progressive feel
        if (i < parts.length - 1) {
          await new Promise(r => setTimeout(r, 1200));
        }
      }

      await react('✅');

    } catch (error) {
      console.error('Readmore Error:', error);
      await reply(`❌ Failed: ${error.message}`);
      await react('❌');
    }
  }
};
