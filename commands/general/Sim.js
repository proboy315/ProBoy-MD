/**
 * SIM Database Lookup Plugin – General Category
 * Fetches Pakistani SIM owner details from public database.
 * Includes retry logic and multiple user-agents for reliability.
 */

const axios = require('axios');

// List of user-agents to rotate
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
];

// Retry function with exponential backoff
async function fetchWithRetry(url, maxRetries = 3, timeout = 20000) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const userAgent = USER_AGENTS[(attempt - 1) % USER_AGENTS.length];
      const response = await axios.get(url, {
        timeout,
        headers: { 'User-Agent': userAgent }
      });
      return response; // success
    } catch (err) {
      lastError = err;
      if (attempt === maxRetries) break;
      // wait before retry (exponential: 1s, 2s, 4s...)
      const delay = Math.pow(2, attempt - 1) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

module.exports = {
  name: 'sim',
  aliases: ['simdatabase', 'simdetails', 'siminfo', 'cnicinfo', 'numberinfo', 'simdata', 'simowner'],
  category: 'general',
  description: '🔍 Lookup Pakistani SIM owner details (use ethically)',
  usage: '.sim <pakistani mobile number or 13-digit CNIC>',

  async execute(sock, msg, args, extra) {
    const { reply, react, from } = extra;

    try {
      await react('⚠️');

      // Check input
      if (!args.length) {
        return reply(`❌ Please provide a Pakistani mobile number or CNIC.\n\nExample: ${this.usage}`);
      }

      await react('⏳');

      // Extract digits
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

      // API request with retry
      const apiUrl = `https://ammar-sim-database-api-786.vercel.app/api/database?number=${encodeURIComponent(query)}`;
      
      let response;
      try {
        response = await fetchWithRetry(apiUrl, 3, 20000);
      } catch (err) {
        console.error('All retries failed:', err);
        return reply('❌ The API is currently unreachable. Possible reasons:\n' +
          '• The service may be down or blocked\n' +
          '• Your network might have restrictions\n' +
          '• Try again later or use a VPN\n\n' +
          '_If the problem persists, the API may no longer be public._');
      }

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

      // Show up to 5 records (avoid spam)
      const records = result.data.slice(0, 5);

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

        // Small delay between messages
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      await react('✅');
    } catch (error) {
      console.error('SIM command unexpected error:', error);
      await reply(`❌ Unexpected error: ${error.message}`);
      await react('❌');
    }
  }
};
