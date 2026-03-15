/**

 * Add Members Plugin – Add users to group by phone numbers

 * Usage: .add <number1,number2,...> (max 10 numbers)

 */

const database = require('../../database');

module.exports = {

  name: 'add',

  aliases: ['addmember'],

  category: 'group',

  description: 'Add members to the group using phone numbers',

  usage: '.add 92300123456,92300765432 (max 10)',

  groupOnly: true,

  adminOnly: true,

  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {

    try {

      // No arguments? Show usage

      if (!args.length) {

        return extra.reply(`❌ Please provide phone numbers.\nExample: ${this.usage}`);

      }

      // Join all arguments and split by commas

      const input = args.join(' ').replace(/\s+/g, ''); // Remove spaces

      const numbers = input.split(',').filter(n => n.trim() !== '');

      // Check limit

      const MAX_NUMBERS = 10;

      if (numbers.length > MAX_NUMBERS) {

        return extra.reply(`❌ You can only add up to ${MAX_NUMBERS} numbers at once.`);

      }

      if (numbers.length === 0) {

        return extra.reply('❌ No valid numbers provided.');

      }

      // Process each number

      const results = [];

      const added = [];

      const failed = [];

      for (const rawNumber of numbers) {

        try {

          // Clean the number: remove any non-digit characters

          const cleaned = rawNumber.replace(/\D/g, '');

          if (!cleaned) {

            failed.push({ number: rawNumber, reason: 'Invalid format' });

            continue;

          }

          // Ensure it's a full number with country code (assume Pakistan if not? but better to keep as is)

          // WhatsApp JID format: <number>@s.whatsapp.net

          const jid = `${cleaned}@s.whatsapp.net`;

          // Attempt to add

          await sock.groupParticipantsUpdate(extra.from, [jid], 'add');

          // If no error, consider added (but we should verify? groupParticipantsUpdate may not throw for invalid numbers,

          // but it usually throws if number not on WhatsApp. We'll rely on try/catch)

          added.push(cleaned);

        } catch (err) {

          // Determine failure reason

          let reason = 'Unknown error';

          if (err.message?.includes('not-authorized')) {

            reason = 'Bot lacks permission';

          } else if (err.message?.includes('participant')) {

            reason = 'Number not on WhatsApp';

          } else if (err.message?.includes('already')) {

            reason = 'Already in group';

          } else {

            reason = err.message || 'Failed';

          }

          failed.push({ number: rawNumber, reason });

        }

      }

      // Build response message

      let response = '📋 *Add Results*\n\n';

      if (added.length > 0) {

        response += `✅ *Added (${added.length}):*\n`;

        added.forEach(num => response += `• ${num}\n`);

        response += '\n';

      }

      if (failed.length > 0) {

        response += `❌ *Failed (${failed.length}):*\n`;

        failed.forEach(f => response += `• ${f.number} – ${f.reason}\n`);

      }

      await extra.reply(response);

    } catch (error) {

      console.error('Add command error:', error);

      await extra.reply('❌ An unexpected error occurred while adding members.');

    }

  }

};