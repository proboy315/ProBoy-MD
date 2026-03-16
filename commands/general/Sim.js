/**
 * SIM Database Lookup Plugin – Use at your own risk!
 * Fetches Pakistani SIM owner details (name, address, CNIC) from public database.
 * Based on data.js (auto‑responder) but converted to a manual command.
 */

const axios = require('axios');

module.exports = {
  name: 'sim',
  aliases: ['simdatabase', 'simdetails', 'siminfo', 'cnicinfo', 'numberinfo'],
  category: 'general',
  description: '⚠️ Lookup Pakistani SIM owner details (use ethically)',
  usage: '.sim <pakistani mobile number or 13-digit CNIC>',
  
  async execute(sock, msg, args, extra) {
    const { reply, react, from } = extra;

    try {
      // Show warning first
      await react('⚠️');
      await reply(
        '*⚠️ WARNING ⚠️*\n' +
        'This command accesses personal data from public databases.\n' +
        'Use it only for ethical purposes (e.g., your own number).\n' +
        'The bot owner is not responsible for misuse.\n\n' +
        '_Proceeding in 3 seconds..._'
      );

      // Small delay to let user read warning
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check if number/CNIC is provided
      if (!args.length) {
        return reply(`❌ Please provide a Pakistani mobile number or CNIC.\n\nExample: ${this.usage}`);
      }

      await react('⏳');

      // Extract only digits from arguments
      const raw = args.join('').replace(/\D/g, '');
      if (!raw) {
        return reply('❌ Invalid input. Only digits allowed.');
      }

      let query = null;

      // Pakistani mobile number detection
      if (raw.length === 11 && raw.startsWith('03')) {
        query = raw; // 03123456789
      }
      else if (raw.length === 10 && raw.startsWith('3')) {
        query = '0' + raw; // 3123456789 → 03123456789
      }
      else if (raw.length === 12 && raw.startsWith('92')) {
        query = '0' + raw.slice(2); // 923123456789 → 03123456789
      }
      // CNIC detection (13 digits)
      else if (raw.length === 13) {
        query = raw; // 1234512345671
      } else {
        return reply('❌ Invalid Pakistani mobile number or CNIC.\n\n' +
          '✅ Mobile formats: 03123456789, 3123456789, 923123456789\n' +
          '✅ CNIC format: 13 digits (e.g., 1234512345671)');
      }

      // API request
      const apiUrl = `https://ammar-sim-database-api-786.vercel.app/api/database?number=${encodeURIComponent(query)}`;
      const response = await axios.get(apiUrl, { timeout: 15000 });
      const result = response.data;

      // No records found
      if (!result || !result.data || !Array.isArray(result.data) || result.data.length === 0) {
        return reply(`
🚫 *NO RECORD FOUND*
━━━━━━━━━━━━━━━━━━━
Input: \`${query}\`


        `);
      }

      // Show up to 3 records (spam protection)
      const records = result.data.slice(0, 3);

      for (let i = 0; i < records.length; i++) {
        const r = records[i];

        const replyText = `
╔════════════════════
║ 📂 *DATA RECORD ${i + 1}/${records.length}*
║ ──────────────────
║ 👤 *Name*     : ${r.name || 'N/A'}
║ 📞 *Number*   : ${r.number || 'N/A'}
║ 🆔 *CNIC*     : ${r.cnic || 'N/A'}
║ 🏠 *Address*  : ${r.address || 'N/A'}
╚════════════════════

✅ STATUS: DATA RETRIEVED
━━━━━━━━━━━━━━━━━━━━━━━━━

`;

        await sock.sendMessage(from, { text: replyText }, { quoted: msg });

        // Anti‑spam delay between multiple records
        await new Promise(resolve => setTimeout(resolve, 700));
      }

      await react('✅');
    } catch (error) {
      console.error('SIM command error:', error);
      if (error.code === 'ECONNABORTED') {
        await reply('❌ Request timed out. The API may be down.');
      } else if (error.response) {
        await reply(`❌ API error: ${error.response.status} – ${error.response.statusText}`);
      } else {
        await reply(`❌ Failed to fetch data: ${error.message}`);
      }
      await react('❌');
    }
  }
};
