/**
 * Short URL Plugin
 * Shortens long URLs using PrinceTech TinyURL API.
 * API: https://api.princetechn.com/api/tools/tinyurl?apikey=prince&url=<long_url>
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

// Basic URL validation
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = {
  name: 'shorturl',
  aliases: ['shorten', 'tinyurl', 'urlshort'],
  category: 'utility',
  description: '🔗 Shorten long URLs using TinyURL',
  usage: '.shorturl <long_url>',

  async execute(sock, msg, args, extra) {
    const { reply, react, from } = extra;

    try {
      if (!args.length) {
        return reply(
          '❌ Please provide a URL to shorten.\n\n' +
          'Example: `.shorturl https://example.com/very/long/path`'
        );
      }

      const longUrl = args.join(' ').trim();

      // Validate URL
      if (!isValidUrl(longUrl)) {
        return reply('❌ Invalid URL. Please provide a valid URL including http:// or https://');
      }

      await react('🔗');

      const statusMsg = await sock.sendMessage(from, { text: `⏳ Shortening URL...` }, { quoted: msg });
      const msgKey = statusMsg.key;

      const apiUrl = `https://api.princetechn.com/api/tools/tinyurl?apikey=prince&url=${encodeURIComponent(longUrl)}`;

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

      if (!data || !data.success || !data.result) {
        await sock.sendMessage(from, {
          text: `❌ Failed to shorten URL. API returned: ${data?.message || 'Invalid response'}`,
          edit: msgKey
        });
        await react('❌');
        return;
      }

      const shortUrl = data.result;

      // Build beautiful response
      const resultText = `╔══════════════════════╗
║   *🔗 Short URL*    ║
╚══════════════════════╝

📎 *Original:* ${longUrl}
✨ *Shortened:* ${shortUrl}

_Powered by ProBoy-MD_`;

      await sock.sendMessage(from, {
        text: resultText,
        edit: msgKey
      });
      await react('✅');
    } catch (error) {
      console.error('ShortURL error:', error);
      await reply(`❌ Unexpected error: ${error.message}`);
      await react('❌');
    }
  }
};