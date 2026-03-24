/**
 * Wallpaper Search Plugin
 * Fetches HD wallpapers from PrinceTech API.
 * API: https://api.princetechn.com/api/search/wallpaper?apikey=prince&query=<term>
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

module.exports = {
  name: 'wallpapers',
  aliases: ['wallpaper', 'hdwallpaper', 'wp', 'walpaper', 'walpapers'],
  category: 'media',
  description: '🖼️ Search for HD wallpapers (up to 10 results)',
  usage: '.wallpapers <search term>',

  async execute(sock, msg, args, extra) {
    const { reply, react, from } = extra;

    try {
      if (!args.length) {
        return reply(
          '❌ Please provide a search term.\n\n' +
          'Example: `.wallpapers sunset`'
        );
      }

      const query = args.join(' ');
      await react('🔍');

      const statusMsg = await sock.sendMessage(from, { text: `⏳ Searching wallpapers for *${query}*...` }, { quoted: msg });
      const msgKey = statusMsg.key;

      const apiUrl = `https://api.princetechn.com/api/search/wallpaper?apikey=prince&query=${encodeURIComponent(query)}`;

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
          text: `❌ No wallpapers found for *${query}*.`,
          edit: msgKey
        });
        await react('❌');
        return;
      }

      const results = data.results;
      const total = results.length;
      const maxResults = 10;
      const displayResults = results.slice(0, maxResults);

      await sock.sendMessage(from, {
        text: `🖼️ Found *${total}* wallpapers. Sending first ${displayResults.length}.`,
        edit: msgKey
      });

      let sentCount = 0;
      for (let i = 0; i < displayResults.length; i++) {
        const item = displayResults[i];
        const category = item.type || 'Unknown';
        // Pick the first (largest) image from the array
        const imageUrl = item.image && item.image[0] ? item.image[0] : null;
        if (!imageUrl) continue;

        try {
          const imgResp = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 15000,
            headers: { 'User-Agent': USER_AGENTS[0] }
          });
          const imgBuffer = Buffer.from(imgResp.data);

          const caption = `╔══════════════════════╗
║   *🖼️ Wallpaper ${i+1}/${displayResults.length}*   ║
╚══════════════════════╝

📂 *Category:* ${category}
🔍 *Query:* ${query}

_Powered by PrinceTech_`;

          await sock.sendMessage(from, {
            image: imgBuffer,
            caption: caption
          }, { quoted: msg });
          sentCount++;
        } catch (err) {
          console.log(`Failed to download ${imageUrl}:`, err.message);
          // Skip failed image
        }
        // Small delay between sends
        await new Promise(resolve => setTimeout(resolve, 800));
      }

      // Final status
      if (sentCount === 0) {
        await sock.sendMessage(from, {
          text: `❌ Failed to download any wallpapers.`,
          edit: msgKey
        });
        await react('❌');
      } else {
        await sock.sendMessage(from, {
          text: `✅ Sent ${sentCount} wallpaper${sentCount > 1 ? 's' : ''}.`,
          edit: msgKey
        });
        await react('✅');
      }
    } catch (error) {
      console.error('Wallpaper search error:', error);
      await reply(`❌ Unexpected error: ${error.message}`);
      await react('❌');
    }
  }
};
