// commands/general/numlist.js
/**
 * .numlist – List real phone numbers of group members (comma‑separated)
 * Usage: .numlist (inside group) OR .numlist 123456789@g.us
 *
 * Only actual phone numbers (e.g., 923261684315) are returned.
 * Unresolvable LIDs or invalid entries are skipped.
 */

module.exports = {
  name: 'numlist',
  aliases: ['numbers', 'members', 'listnumbers'],
  category: 'general',
  description: 'Get comma‑separated phone numbers of a group',
  usage: '.numlist [groupJid]',

  async execute(sock, msg, args, extra) {
    const { from, reply, react, isGroup, groupMetadata, utils } = extra;
    const { normalizeJidWithLid, normalizeJid } = utils;

    try {
      await react('⏳');

      // Determine target JID
      let targetJid = null;
      if (args.length > 0) {
        const input = args[0].trim();
        if (!input.endsWith('@g.us'))
          return reply('❌ Please provide a valid group JID (ends with @g.us).');
        targetJid = input;
      } else {
        if (!isGroup)
          return reply('❌ This command must be used in a group or provide a group JID.');
        targetJid = from;
      }

      // Fetch group metadata
      let meta = groupMetadata;
      if (!meta || targetJid !== from) {
        meta = await sock.groupMetadata(targetJid);
      }
      if (!meta?.participants?.length)
        return reply('❌ Could not retrieve group information.');

      // Helper to check if a string looks like a phone number (7-15 digits)
      const isPhoneNumber = (str) => /^\d{7,15}$/.test(str);

      // Extract phone numbers
      const numbers = meta.participants
        .map(p => {
          // Prefer phoneNumber field if available (some WhatsApp versions)
          if (p.phoneNumber) {
            const num = normalizeJid(p.phoneNumber);
            if (isPhoneNumber(num)) return num;
          }

          // Use the participant ID (could be LID or PN)
          const normalizedJid = normalizeJidWithLid(p.id);
          const num = normalizeJid(normalizedJid);
          if (isPhoneNumber(num)) return num;

          // If still not a phone number, try using lid mapping manually
          // (normalizeJidWithLid already attempted this, but we'll double-check)
          return null;
        })
        .filter(Boolean);   // remove nulls

      if (!numbers.length)
        return reply('❌ No valid phone numbers found (all participants may have hidden their numbers).');

      // Return pure comma‑separated list
      await reply(numbers.join(','));
      await react('✅');
    } catch (error) {
      console.error('numlist error:', error);
      await reply(`❌ ${error.message}`);
      await react('❌');
    }
  }
};