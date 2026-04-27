// commands/utility/readmore.js
const config = require('../../config');

module.exports = {
  name: 'readmore',
  aliases: ['rdmore', 'rmore'],
  category: 'utility',
  description: 'Generate WhatsApp readmore effect with multiline + multiple sections',
  usage: '.readmore text1 + text2 + text3',
  ownerOnly: config.MODE !== 'public',
  modOnly: false,
  groupOnly: false,
  privateOnly: false,
  adminOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    try {
      const input = args.join(' ').trim();

      if (!input) {
        return extra.reply(
          `❌ *Usage:* ${this.usage}\n\n` +
          `*Example:* .readmore Hi + How are you + I am fine`
        );
      }

      if (!input.includes('+')) {
        return extra.reply(
          `❌ Use *+* to separate text parts!\n\n` +
          `*Example:* .readmore Hi + Hidden text`
        );
      }

      // Split all parts by +
      const parts = input
        .split('+')
        .map(p => p.trim())
        .filter(Boolean);

      if (parts.length < 2) {
        return extra.reply(`❌ Minimum 2 text parts required.`);
      }

      // WhatsApp Readmore invisible chars
      const invisibleChar = String.fromCharCode(8206);
      const readMore = invisibleChar.repeat(4001);

      // First line visible, others hidden after readmore
      let finalText = parts[0] + '\n' + readMore;

      for (let i = 1; i < parts.length; i++) {
        finalText += '\n' + parts[i];
      }

      await sock.sendMessage(
        extra.from,
        { text: finalText },
        { quoted: msg }
      );

      await extra.react('✅');

    } catch (error) {
      console.error('ReadMore Error:', error);
      await extra.reply('❌ Failed to generate readmore text!');
      await extra.react('❌');
    }
  }
};
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
