/**
 * .check
 * Demo command showing the button framework (utils/buttonManager.js):
 *   - 3 COMMAND buttons (Owner / Alive / Ping) — clicking runs that command
 *   - 1 CUSTOM SCRIPT button — clicking runs an arbitrary registered
 *     function, not tied to any command at all.
 *
 * NOTE: sent as TWO messages (3 buttons + 1 button), not one message with
 * 4 buttons. WhatsApp only reliably renders up to 3 quick_reply buttons
 * per message — cramming a 4th into the same message causes taps to fall
 * back to just re-sending the button's label as plain text instead of a
 * real button click (see PROMPT.MD §5.8 "Common mistakes"). Chunking into
 * multiple messages is the documented fix (same pattern as
 * utils/button.js's sendCommandMenu).
 *
 * See PROMPT.MD §17 for the full write-up of the button framework.
 */

const config = require('../../config');
const buttonManager = require('../../utils/buttonManager');
const { sendInteractiveMessage } = require('../../utils/gifted-btns');

// Register the custom action ONCE, at module load time. The handler can do
// literally anything — send a message, call an API, edit the database,
// chain into another command, whatever you want.
buttonManager.registerAction('check_custom_demo', async (sock, msg, extra) => {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  await extra.reply(
    `✨ *This reply came from a custom script, not a command!*\n\n` +
    `You can put anything here — I just checked \`process.uptime()\` as an example:\n` +
    `Bot has been running for ${hours}h ${minutes}m.`
  );
});

module.exports = {
  name: 'check',
  category: 'utility',
  description: 'Demo: buttons that run commands + a button that runs a custom script',
  usage: `${config.prefix}check`,

  async execute(sock, msg, args, extra) {
    const { reply, react, from } = extra;
    try {
      await react('⏳');

      // Message 1: 3 command buttons (the WhatsApp-reliable maximum).
      await sendInteractiveMessage(sock, from, {
        text: '🔘 *Button Framework Demo (1/2)*\n\nTap any button below:',
        footer: config.botName,
        interactiveButtons: [
          buttonManager.commandButton('👑 Owner', '.owner'),
          buttonManager.commandButton('💚 Alive', '.alive'),
          buttonManager.commandButton('🏓 Ping', '.ping')
        ]
      }, { quoted: msg });

      // Message 2: the custom-script button, on its own.
      await sendInteractiveMessage(sock, from, {
        text: '🔘 *Button Framework Demo (2/2)*\n\nAnd here\'s one that runs a custom script instead of a command:',
        footer: config.botName,
        interactiveButtons: [
          buttonManager.customButton('✨ Custom Script', 'check_custom_demo')
        ]
      }, { quoted: msg });

      await react('✅');
    } catch (error) {
      await reply(`❌ ${error.message}`);
      await react('❌');
    }
  }
};
