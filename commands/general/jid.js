/**
 * JID Command – Get JID of chat or replied user/group
 * Shows stylish box with copy button.
 */

const { sendInteractiveMessage } = require('gifted-btns');

module.exports = {
  name: 'jid',
  aliases: ['jidinfo', 'chatid'],
  category: 'general',
  description: '📇 Get JID (WhatsApp ID) of current chat or replied user/group',
  usage: '.jid (reply to a message to get sender\'s JID)',

  async execute(sock, msg, args, extra) {
    const { from, sender, reply, react, isGroup, quoted } = extra;

    try {
      await react('🔍');

      let targetJid = null;
      let targetType = '';

      // If replying to a message, get the sender's JID
      if (quoted) {
        targetJid = quoted.sender; // quoted object contains sender
        targetType = 'User';
        if (quoted.sender && quoted.sender.endsWith('@g.us')) targetType = 'Group';
      }

      // If no reply, use current chat JID
      if (!targetJid) {
        targetJid = from;
        targetType = isGroup ? 'Group' : 'Private Chat';
      }

      // Build the stylish message
      const box = `╭═══〘 *JID INFO* 〙═══⊷❍
┃✯│ 📌 *Type:* ${targetType}
┃✯│ 🆔 *JID:* ${targetJid}
╰══════════════════⊷❍`;

      // Send interactive message with copy button
      await sendInteractiveMessage(sock, from, {
        text: box,
        footer: 'ProBoy‑MD',
        interactiveButtons: [
          {
            name: 'copy',
            buttonParamsJson: JSON.stringify({ display_text: '📋 Copy JID', id: targetJid })
          }
        ]
      }, { quoted: msg });

      await react('✅');
    } catch (error) {
      console.error('JID command error:', error);
      await reply(`❌ Error: ${error.message}`);
      await react('❌');
    }
  }
};
