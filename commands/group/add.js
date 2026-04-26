/**
 * Add Members Plugin – Add users to group by phone numbers
 * Usage:
 *   .add 92300123456,92300765432               → add to current group (bot must be admin)
 *   .add groupJid 92300123456,92300765432        → add to specific group (bot tries even if not admin)
 * Max 10 numbers, adds with random delay to avoid ban.
 */

const database = require('../../database');

module.exports = {
  name: 'add',
  aliases: ['addmember', 'addm'],
  category: 'group',
  description: 'Add members to a group using phone numbers',
  usage: '.add [groupJid] 92300123456,92300765432 (max 10)',
  groupOnly: false,          // can be used in private chat with group JID
  adminOnly: true,           // sender must be admin of the target group (or owner)
  botAdminNeeded: false,     // we handle bot admin permission dynamically

  async execute(sock, msg, args, extra) {
    try {
      const { from, reply, react, isGroup, sender, isOwner, config } = extra;
      let targetGroupJid = null;
      let numbersInput = '';

      // --- Parse arguments: first arg could be a group JID or a number
      if (args.length === 0) {
        return reply(`❌ Please provide phone numbers.\nExample: ${this.usage}`);
      }

      const firstArg = args[0].trim();
      if (firstArg.includes('@g.us') || firstArg.includes('@lid') || firstArg.includes('@') && firstArg.split('@')[1]?.startsWith('lid')) {
        // First argument is a group JID
        targetGroupJid = firstArg.replace(/[^0-9@a-z.]/g, ''); // sanitize slightly
        numbersInput = args.slice(1).join(' ');
      } else {
        // All arguments are numbers
        numbersInput = args.join(' ');
        // If we are in a group, default target to current group; otherwise error
        if (isGroup) {
          targetGroupJid = from;
        } else {
          return reply('❌ Please specify a group JID first.\nExample: .add 123456789@g.us 92300123456,92300765432');
        }
      }

      // Sanitize number input: remove spaces, split by comma
      const numbers = numbersInput
        .replace(/\s+/g, '')        // remove all spaces
        .split(',')
        .filter(n => n.trim() !== '');

      const MAX_NUMBERS = 10;
      if (numbers.length > MAX_NUMBERS) {
        return reply(`❌ You can only add up to ${MAX_NUMBERS} numbers at once.`);
      }
      if (numbers.length === 0) {
        return reply('❌ No valid numbers provided.');
      }

      // --- Permission checks for the target group
      // Owner can always add anywhere.
      if (!isOwner) {
        // If target is current group, verify sender is admin (already enforced by adminOnly)
        // For a different group, we need to check if sender is admin in that group.
        if (targetGroupJid !== from) {
          try {
            const meta = await sock.groupMetadata(targetGroupJid);
            const participant = meta.participants.find(p => p.id === sender || p.id.split('@')[0] === sender.split('@')[0]);
            if (!participant || !['admin', 'superadmin'].includes(participant.admin)) {
              return reply('❌ You are not an admin of the target group.');
            }
          } catch (e) {
            return reply('❌ Could not verify your admin status in that group. Make sure the bot is in the group.');
          }
        }
      }

      // --- Optional: warn if bot is not admin in the target group (add may still succeed if group allows)
      try {
        const meta = await sock.groupMetadata(targetGroupJid);
        const botId = sock.user?.id;
        const botParticipant = meta.participants.find(p => p.id === botId || p.lid === sock.user?.lid);
        if (!botParticipant || !['admin', 'superadmin'].includes(botParticipant.admin)) {
          // Not admin – but still try adding; some groups allow all members to add.
          // We'll just proceed without blocking.
        }
      } catch {}

      await react('⏳');

      // --- Add members with random delays
      const results = [];
      const added = [];
      const failed = [];

      for (const rawNumber of numbers) {
        try {
          // Clean number: keep only digits
          const cleaned = rawNumber.replace(/\D/g, '');
          if (!cleaned || cleaned.length < 7) {
            failed.push({ number: rawNumber, reason: 'Invalid number' });
            continue;
          }

          const jid = `${cleaned}@s.whatsapp.net`;

          // Attempt to add
          await sock.groupParticipantsUpdate(targetGroupJid, [jid], 'add');
          added.push(cleaned);

          // Random delay between 2 and 5 seconds to avoid ban (only if more than one number)
          if (numbers.indexOf(rawNumber) < numbers.length - 1) {
            const delay = Math.floor(Math.random() * 3000) + 2000; // 2000-5000ms
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        } catch (err) {
          let reason = 'Failed';
          const msg = err.message?.toLowerCase() || '';
          if (msg.includes('not-authorized') || msg.includes('forbidden')) {
            reason = 'Bot lacks permission to add (bot not admin?)';
          } else if (msg.includes('not-found') || msg.includes('participant')) {
            reason = 'Number not on WhatsApp';
          } else if (msg.includes('already')) {
            reason = 'Already in group';
          } else if (msg.includes('bad-request')) {
            reason = 'Invalid participant JID';
          } else {
            reason = err.message || reason;
          }
          failed.push({ number: rawNumber, reason });
        }
      }

      // Build response
      let response = '📋 *Add Results*\n\n';
      if (added.length > 0) {
        response += `✅ *Added (${added.length}):*\n${added.map(n => `• ${n}`).join('\n')}\n\n`;
      }
      if (failed.length > 0) {
        response += `❌ *Failed (${failed.length}):*\n${failed.map(f => `• ${f.number} – ${f.reason}`).join('\n')}\n`;
      }
      if (numbers.length > 1) {
        response += `\n_Added with random delays to avoid ban._`;
      }

      await reply(response);
      await react(added.length > 0 ? '✅' : '❌');
    } catch (error) {
      console.error('Add command error:', error);
      await extra.reply('❌ An unexpected error occurred while adding members.');
      await extra.react('❌');
    }
  }
};
