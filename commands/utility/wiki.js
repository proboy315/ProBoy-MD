/**
 * Wikipedia / Wikimedia Plugin
 * Fetches summary information for a given topic using PrinceTech API.
 * API: https://api.princetechn.com/api/search/wikimedia?apikey=prince&title=<term>
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
  return date.toLocaleString('en-PK', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

module.exports = {
  name: 'wiki',
  aliases: ['wikipedia', 'wikimedia', 'summary'],
  category: 'utility',
  description: '📖 Fetch Wikipedia-style summaries for any topic',
  usage: '.wiki <search term>',

  async execute(sock, msg, args, extra) {
    const { reply, react, from } = extra;

    try {
      if (!args.length) {
        return reply(
          '❌ Please provide a topic to search.\n\n' +
          'Example: `.wiki Elon Musk`'
        );
      }

      const term = args.join(' ');
      await react('📖');

      const statusMsg = await sock.sendMessage(from, { text: `⏳ Searching Wikipedia for *${term}*...` }, { quoted: msg });
      const msgKey = statusMsg.key;

      const apiUrl = `https://api.princetechn.com/api/search/wikimedia?apikey=prince&title=${encodeURIComponent(term)}`;

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

      if (!data || !data.success || !data.results) {
        await sock.sendMessage(from, {
          text: `❌ No results found for *${term}*.`,
          edit: msgKey
        });
        await react('❌');
        return;
      }

      const res = data.results;

      // Build text content
      let text = `╔══════════════════════╗\n`;
      text += `║   *📚 ${res.title}*   ║\n`;
      text += `╚══════════════════════╝\n\n`;
      if (res.description) text += `*${res.description}*\n\n`;
      text += `${res.extract}\n\n`;
      text += `🕒 *Last updated:* ${formatDate(res.lastModified)}\n`;
      text += `🔗 *Full article:* ${res.pageUrl}`;

      // If thumbnail exists, send as image with caption
      if (res.thumbnail && res.thumbnail.source) {
        try {
          // Download thumbnail
          const imgResp = await axios.get(res.thumbnail.source, {
            responseType: 'arraybuffer',
            timeout: 10000,
            headers: { 'User-Agent': USER_AGENTS[0] }
          });
          const imgBuffer = Buffer.from(imgResp.data);

          // Send image with caption
          await sock.sendMessage(from, {
            image: imgBuffer,
            caption: text
          }, { quoted: msg });

          // Delete the status message
          try { await sock.sendMessage(from, { delete: msgKey }); } catch {}
        } catch (err) {
          // If image download fails, fallback to text only
          console.log('Thumbnail download failed, sending text only');
          await sock.sendMessage(from, { text, edit: msgKey });
        }
      } else {
        // No thumbnail, just edit the status message with text
        await sock.sendMessage(from, { text, edit: msgKey });
      }

      await react('✅');
    } catch (error) {
      console.error('Wiki command error:', error);
      await reply(`❌ Unexpected error: ${error.message}`);
      await react('❌');
    }
  }
};
