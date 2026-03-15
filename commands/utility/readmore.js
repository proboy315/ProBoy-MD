// commands/utility/readmore.js
const config = require('../../config');

module.exports = {
  name: 'readmore',
  aliases: ['rdmore', 'rmore'],
  category: 'utility',
  description: 'Generate WhatsApp readmore effect (hidden text after +)',
  usage: '.readmore <text before> + <text after>',
  ownerOnly: config.MODE !== 'public', // if MODE is not public, only owner can use
  modOnly: false,
  groupOnly: false,
  privateOnly: false,
  adminOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    try {
      // Join arguments and trim
      const input = args.join(' ').trim();

      // Validate input
      if (!input) {
        return extra.reply(
          `❌ *Usage:* ${this.usage}\n\n` +
          `*Example:* .readmore Hello everyone + This text will appear after clicking read more`
        );
      }

      // Check if input contains the separator
      if (!input.includes('+')) {
        return extra.reply(
          `❌ Use *+* to separate visible text from hidden text!\n\n` +
          `*Example:* .readmore Hello + Hidden message here`
        );
      }

      // Generate readmore text with invisible characters (4001 times)
      const invisibleChar = String.fromCharCode(8206); // zero-width space
      const readmoreText = input.replace(/\+/g, invisibleChar.repeat(4001));

      // Send the formatted message (as a normal text message)
      await sock.sendMessage(extra.from, { text: readmoreText }, { quoted: msg });

      // Optional: react to indicate success (not strictly necessary)
      await extra.react('✅');
    } catch (error) {
      console.error('ReadMore Error:', error);
      await extra.reply('❌ Failed to generate readmore text!');
      await extra.react('❌');
    }
  }
};
