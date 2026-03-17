/**
 * Urban Dictionary Plugin – All Definitions in Separate Messages
 * Fetches all definitions for a term and sends each in a formatted message.
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

// Clean text by removing brackets [ ] used in Urban Dictionary
function cleanText(text) {
  if (!text) return '';
  return text.replace(/\[|\]/g, '');
}

module.exports = {
  name: 'define',
  aliases: ['urbandictionary', 'ud', 'dictionary', 'meaning'],
  category: 'utility',
  description: '📚 Get definitions from Urban Dictionary (all definitions in separate messages)',
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

      // Edit status message to show count
      await sock.sendMessage(from, {
        text: `📚 Found *${total}* definition${total > 1 ? 's' : ''} for *${term}*. Sending...`,
        edit: msgKey
      });

      // Send each definition as a separate formatted message
      for (let i = 0; i < results.length; i++) {
        const def = results[i];
        const defNumber = i + 1;

        // Clean definition and example
        const definition = cleanText(def.definition);
        const example = cleanText(def.example || '');

        // Build the message
        let msgText = `╔══════════════════════════╗\n`;
        msgText += `║  *📘 Definition #${defNumber}*  ║\n`;
        msgText += `╚══════════════════════════╝\n\n`;
        msgText += `*Word:* ${def.word}\n`;
        msgText += `*Author:* ${def.author}\n`;
        msgText += `*Date:* ${formatDate(def.written_on)}\n\n`;
        msgText += `*Definition:*\n${definition}\n\n`;
        if (example) {
          msgText += `*Example:*\n${example}\n\n`;
        }
        msgText += `🔗 ${def.permalink}\n`;
        if (def.thumbs_up > 0 || def.thumbs_down > 0) {
          msgText += `👍 ${def.thumbs_up}  👎 ${def.thumbs_down}\n`;
        }
        msgText += `\n_Powered by Urban Dictionary_`;

        await sock.sendMessage(from, { text: msgText }, { quoted: msg });

        // Small delay to avoid flooding
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Send completion message and delete the original status
      await sock.sendMessage(from, {
        text: `✅ All ${total} definition${total > 1 ? 's' : ''} sent.`,
        edit: msgKey
      });
      await react('✅');
    } catch (error) {
      console.error('Define command error:', error);
      await reply(`❌ Unexpected error: ${error.message}`);
      await react('❌');
    }
  }
};
