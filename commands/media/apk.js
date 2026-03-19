/**
 * Play Store Search Plugin
 * Searches for Android apps using PrinceTech API.
 * API: https://api.princetechn.com/api/search/playstore?apikey=prince&query=<term>
 */

const axios = require('axios');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

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

// Format rating with stars (optional)
function formatRating(rating) {
  const num = parseFloat(rating) || 0;
  const full = Math.floor(num);
  const half = num - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return '⭐'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
}

module.exports = {
  name: 'apk',
  aliases: ['playstore', 'appsearch', 'androidapp'],
  category: 'media',
  description: '📱 Search for Android apps on Google Play Store',
  usage: '.apk <app name or keyword>',

  async execute(sock, msg, args, extra) {
    const { reply, react, from } = extra;

    try {
      if (!args.length) {
        return reply(
          '❌ Please provide an app name or keyword.\n\n' +
          'Example: `.apk WhatsApp`'
        );
      }

      const query = args.join(' ');
      await react('🔍');

      const statusMsg = await sock.sendMessage(from, { text: `⏳ Searching Play Store for *${query}*...` }, { quoted: msg });
      const msgKey = statusMsg.key;

      const apiUrl = `https://api.princetechn.com/api/search/playstore?apikey=prince&query=${encodeURIComponent(query)}`;

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
          text: `❌ No apps found for *${query}*.`,
          edit: msgKey
        });
        await react('❌');
        return;
      }

      const results = data.results;
      const total = results.length;

      // Limit to 10 results to avoid spam
      const maxResults = 10;
      const displayResults = results.slice(0, maxResults);

      // Edit status message to show count
      await sock.sendMessage(from, {
        text: `📱 Found *${total}* app${total > 1 ? 's' : ''}. Showing top ${displayResults.length}.`,
        edit: msgKey
      });

      // Send each app as a separate message
      for (let i = 0; i < displayResults.length; i++) {
        const app = displayResults[i];
        const appNumber = i + 1;

        // Build text content
        let text = `╔══════════════════════╗\n`;
        text += `║   *📱 App #${appNumber}*   ║\n`;
        text += `╚══════════════════════╝\n\n`;
        text += `*${app.name}*\n`;
        text += `👤 *Developer:* ${app.developer}\n`;
        text += `🆔 *App ID:* \`${app.appId}\`\n`;
        text += `⭐ *Rating:* ${app.rating} ${formatRating(app.rating)}\n`;
        text += `📝 *Summary:* ${app.summary}\n\n`;
        text += `🔗 *Play Store:* ${app.link}\n`;
        if (app.link_dev) text += `👥 *More from developer:* ${app.link_dev}`;

        // Try to send with icon
        if (app.img) {
          try {
            const imgResp = await axios.get(app.img, {
              responseType: 'arraybuffer',
              timeout: 10000,
              headers: { 'User-Agent': USER_AGENTS[0] }
            });
            const imgBuffer = Buffer.from(imgResp.data);

            await sock.sendMessage(from, {
              image: imgBuffer,
              caption: text
            }, { quoted: msg });
          } catch (err) {
            // Icon download failed, send text only
            console.log(`Icon download failed for ${app.name}, sending text`);
            await sock.sendMessage(from, { text }, { quoted: msg });
          }
        } else {
          await sock.sendMessage(from, { text }, { quoted: msg });
        }

        // Small delay between messages
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Final confirmation
      await sock.sendMessage(from, {
        text: `✅ Sent ${displayResults.length} app result${displayResults.length > 1 ? 's' : ''}.`,
        edit: msgKey
      });
      await react('✅');
    } catch (error) {
      console.error('APK command error:', error);
      await reply(`❌ Unexpected error: ${error.message}`);
      await react('❌');
    }
  }
};
