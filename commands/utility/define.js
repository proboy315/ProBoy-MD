/**
 * Urban Dictionary Plugin
 * Fetches definitions for a given term using PrinceTech API.
 * API: https://api.princetechn.com/api/tools/define?apikey=prince&term=<term>
 */

const axios = require('axios');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'okhttp/4.9.3'
];

// Retry function with exponential backoff
async function fetchWithRetry(url, maxRetries = 3, timeout = 15000) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const userAgent = USER_AGENTS[(attempt - 1) % USER_AGENTS.length];
      const response = await axios.get(url, {
        timeout,
        headers: { 'User-Agent': userAgent }
      });
      return response;
    } catch (err) {
      lastError = err;
      if (attempt === maxRetries) break;
      const delay = Math.pow(2, attempt - 1) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

// Format date nicely
function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' });
}

module.exports = {
  name: 'define',
  aliases: ['urbandictionary', 'ud', 'dictionary', 'meaning'],
  category: 'utility',
  description: '📚 Get definitions from Urban Dictionary',
  usage: '.define <word or phrase>',

  async execute(sock, msg, args, extra) {
    const { reply, react, from } = extra;

    try {
      if (!args.length) {
        return reply(
          '❌ Please provide a word to define.\n\n' +
          'Example: `.define AI`'
        );
      }

      const term = args.join(' ');
      await react('📖');

      const statusMsg = await sock.sendMessage(from, { text: `⏳ Searching for *${term}*...` }, { quoted: msg });
      const msgKey = statusMsg.key;

      const apiUrl = `https://api.princetechn.com/api/tools/define?apikey=prince&term=${encodeURIComponent(term)}`;

      let response;
      try {
        response = await fetchWithRetry(apiUrl, 3, 15000);
      } catch (err) {
        await sock.sendMessage(from, {
          text: `❌ Failed after multiple attempts. API may be down.`,
          edit: msgKey
        });
        await react('❌');
        return;
      }

      const data = response.data;

      if (!data || !data.success || !Array.isArray(data.results) || data.results.length === 0) {
        await sock.sendMessage(from, {
          text: `❌ No definitions found for *${term}*.`,
          edit: msgKey
        });
        await react('❌');
        return;
      }

      const results = data.results;
      const total = results.length;

      // Build result message – show up to 5 definitions (to avoid too long messages)
      const maxDisplay = 5;
      const displayResults = results.slice(0, maxDisplay);
      let resultText = `📚 *Urban Dictionary: ${term}*\n`;
      resultText += `_${total} definition${total > 1 ? 's' : ''} found_\n\n`;

      displayResults.forEach((def, idx) => {
        resultText += `*${idx + 1}. ${def.word}* by _${def.author}_ (${formatDate(def.written_on)})\n`;
        resultText += `📝 *Definition:* ${def.definition.replace(/\[|\]/g, '')}\n`; // remove brackets
        if (def.example && def.example.trim()) {
          resultText += `💬 *Example:* ${def.example.replace(/\[|\]/g, '')}\n`;
        }
        resultText += `🔗 ${def.permalink}\n\n`;
      });

      if (total > maxDisplay) {
        resultText += `_... and ${total - maxDisplay} more definitions. Use the link above to see all._\n`;
      }

      resultText += `\n_Powered by ProBoy _`;

      // Edit the status message with result
      await sock.sendMessage(from, { text: resultText, edit: msgKey });
      await react('✅');
    } catch (error) {
      console.error('Define command error:', error);
      await reply(`❌ Unexpected error: ${error.message}`);
      await react('❌');
    }
  }
};
