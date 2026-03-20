// commands/fun/boom.js
const config = require('../../config');

/**
 * Normalize phone number: remove non-digits
 */
function normalizeNumber(num) {
  return String(num || '').replace(/[^0-9]/g, '');
}

/**
 * Convert normalized number to JID
 */
function toJid(num) {
  const n = normalizeNumber(num);
  return n ? `${n}@s.whatsapp.net` : null;
}

module.exports = {
  name: 'boom',
  aliases: ['repeat', 'spam'],
  category: 'fun',
  description: 'Repeat a message multiple times (max 20). Optionally send to another number.',
  usage: '.boom <message,count[,number]>',

  // Permissions: none by default (adjust as needed)
  ownerOnly: true,
  modOnly: false,
  groupOnly: false,
  privateOnly: false,
  adminOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    try {
      const raw = args.join(' ').trim();
      if (!raw) {
        return extra.reply(
          '*Boom usage:*\n' +
          '• `.boom hi,2` (send 2 times in current chat)\n' +
          '• `.boom hi,2,923027598023` (send to that number)'
        );
      }

      const parts = raw.split(',').map(x => x.trim());
      const message = parts[0];
      const count = parseInt(parts[1]);
      const num = parts[2] || '';

      const MAX_COUNT = 20;

      if (!message || isNaN(count) || count <= 0 || count > MAX_COUNT) {
        return extra.reply(
          `_Format:_ \`.boom message,count[,number]\`\n` +
          `_Note:_ count must be between 1 and ${MAX_COUNT}`
        );
      }

      // Determine target JID
      let targetJid;
      if (num) {
        targetJid = toJid(num);
        if (!targetJid) {
          return extra.reply('_Invalid number. Use format with country code (e.g., 923001234567)_');
        }
      } else {
        targetJid = extra.from; // current chat
      }

      await extra.react('⏳');

      // Send message count times with small delay to avoid rate limits
      for (let i = 0; i < count; i++) {
        await sock.sendMessage(targetJid, { text: message });
        if (count > 5) {
          await new Promise(resolve => setTimeout(resolve, 300)); // 300ms delay
        }
      }

      await extra.react('✅');
    } catch (error) {
      console.error('Boom command error:', error);
      await extra.reply('❌ An error occurred while sending messages.');
      await extra.react('❌');
    }
  }
};