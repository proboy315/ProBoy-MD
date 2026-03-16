/**
 * SIM Database Lookup Plugin – Use at your own risk!
 * Fetches Pakistani SIM owner details from public database.
 * API: https://ammar-sim-database-api-786.vercel.app
 */

const axios = require('axios');

module.exports = {
  name: 'sim',
  aliases: ['simdatabase', 'simdetails', 'siminfo', 'cnicinfo', 'numberinfo', 'simdata'],
  category: 'general',
  description: '⚠️ Lookup Pakistani SIM owner details (use ethically)',
  usage: '.sim <pakistani mobile number or 13-digit CNIC>',

  async execute(sock, msg, args, extra) {
    const { reply, react, from } = extra;

    try {
      // Quick warning (no delay)
      await react('⚠️');
      
      // Check if input provided
      if (!args.length) {
        return reply(`❌ Please provide a Pakistani mobile number or CNIC.\n\nExample: ${this.usage}`);
      }

      await react('⏳');

      // Extract only digits
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

      // Check API response
      if (!result || !result.success || !result.data || !Array.isArray(result.data) || result.data.length === 0) {
        return reply(`
🚫 *NO RECORD FOUND*
━━━━━━━━━━━━━━━━━━━
Input: \`${query}\`

*Use at your own risk.*
        `);
      }

      // Show up to 5 records (to avoid spam)
      const records = result.data.slice(0, 5);

      // Send each record
      for (let i = 0; i < records.length; i++) {
        const r = records[i];

        const replyText = `
╔════════════════════
║ 📂 *RECORD ${i + 1}/${records.length}*
║ ──────────────────
║ 👤 *Name*     : ${r.full_name || 'N/A'}
║ 📞 *Number*   : ${r.sim_number || 'N/A'}
║ 🆔 *CNIC*     : ${r.cnic || 'N/A'}
║ 🏠 *Address*  : ${r.address || 'N/A'}
╚════════════════════

⚠️ *Use at your own risk.*
`;

        await sock.sendMessage(from, { text: replyText }, { quoted: msg });

        // Small delay between multiple messages
        await new Promise(resolve => setTimeout(resolve, 500));
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
