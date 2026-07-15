const { sendInteractiveMessage } = require('../../utils/gifted-btns');
const config = require('../../config');

module.exports = {
  name: 'readmore',
  aliases: ['rdmore', 'rmore'],
  category: 'utility',
  description: 'Multi‑step readmore with copy button (single message)',
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

      // Split and clean parts
      const parts = input
        .split('+')
        .map(x => x.trim())
        .filter(Boolean);

      // Full visible text (all parts joined) – used for copy button
      const fullVisibleText = parts.join('\n\n');

      // Build the message with readmore effect
      let msgText;
      const invisible = '\u200e'.repeat(4001); // left‑to‑right mark filler

      if (parts.length === 1) {
        // Only one part – no readmore needed
        msgText = parts[0];
      } else {
        // First part visible, rest hidden until "Read more"
        const firstPart = parts[0];
        const restParts = parts.slice(1).join('\n\n');
        msgText = firstPart + '\n' + invisible + '\n' + restParts;
      }

      // Send SINGLE interactive message
      await sendInteractiveMessage(
        sock,
        from,
        {
          text: msgText,
          footer: config.botName || 'Bot',
          interactiveButtons: [
            {
              name: 'cta_copy',
              buttonParamsJson: JSON.stringify({
                display_text: '📋 Copy Text',
                copy_code: fullVisibleText,   // clean text without invisible chars
              }),
            },
          ],
        },
        { quoted: msg }
      );

      await react('✅');
    } catch (error) {
      console.error('Readmore Error:', error);
      await reply(`❌ Failed: ${error.message}`);
      await react('❌');
    }
  },
};
