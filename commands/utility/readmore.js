// commands/utility/readmore.js

const { sendInteractiveMessage } = require('gifted-btns');
const config = require('../../config');

module.exports = {
  name: 'readmore',
  aliases: ['rdmore', 'rmore'],
  category: 'utility',
  description: 'Generate WhatsApp readmore text',
  usage: '.readmore Hi + how are you + I am fine',

  ownerOnly: config.MODE !== 'public',
  modOnly: false,
  groupOnly: false,
  privateOnly: false,
  adminOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const { reply, react, from } = extra;

    try {
      if (!args.length) {
        return reply(
          `❌ Please provide text.\n\nExample:\n${this.usage}`
        );
      }

      const input = args.join(' ').trim();

      if (!input.includes('+')) {
        return reply(
          `❌ Use *+* to separate text.\n\nExample:\n.readmore Hi + Hidden text`
        );
      }

      await react('⏳');

      // Split text
      const parts = input
        .split('+')
        .map(v => v.trim())
        .filter(v => v);

      if (parts.length < 2) {
        return reply('❌ Minimum 2 text parts required.');
      }

      // Readmore chars
      const invisible = String.fromCharCode(8206).repeat(4001);

      // Build final text
      let finalText = parts[0] + '\n' + invisible;

      for (let i = 1; i < parts.length; i++) {
        finalText += '\n' + parts[i];
      }

      // Send interactive with copy button
      await sendInteractiveMessage(sock, from, {
        text: finalText,
        footer: 'ProBoy-MD',
        interactiveButtons: [
          {
            name: 'cta_copy',
            buttonParamsJson: JSON.stringify({
              display_text: '📋 Copy Text',
              copy_code: finalText
            })
          }
        ]
      }, { quoted: msg });

      await react('✅');

    } catch (error) {
      console.error('Readmore Error:', error);
      await reply(`❌ Failed: ${error.message}`);
      await react('❌');
    }
  }
};
