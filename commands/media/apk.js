/**
 * APK Download Plugin
 * Downloads APK files using PrinceTech APK download API.
 * API: https://api.princetechn.com/api/download/apkdl?apikey=prince&appName=<app_name>
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
async function fetchWithRetry(url, maxRetries = 3, timeout = 30000, responseType = 'json') {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const userAgent = USER_AGENTS[(attempt - 1) % USER_AGENTS.length];
      const response = await axios.get(url, {
        timeout,
        responseType,
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

// Basic input validation (no spaces? app names can have spaces, so just ensure non-empty)
function isValidAppName(name) {
  return name && name.trim().length > 0;
}

module.exports = {
  name: 'apk',
  aliases: ['apkdownload', 'getapk', 'downloadapk'],
  category: 'media',
  description: '📱 Download APK files for Android apps',
  usage: '.apk <app name>',

  async execute(sock, msg, args, extra) {
    const { reply, react, from } = extra;

    try {
      if (!args.length) {
        return reply(
          '❌ Please provide an app name.\n\n' +
          'Example: `.apk WhatsApp`'
        );
      }

      const appName = args.join(' ').trim();

      if (!isValidAppName(appName)) {
        return reply('❌ Invalid app name.');
      }

      await react('📥');

      const statusMsg = await sock.sendMessage(from, { text: `⏳ Fetching APK details for *${appName}*...` }, { quoted: msg });
      const msgKey = statusMsg.key;

      // Step 1: Get APK info from API
      const infoUrl = `https://api.princetechn.com/api/download/apkdl?apikey=prince&appName=${encodeURIComponent(appName)}`;

      let infoResponse;
      try {
        infoResponse = await fetchWithRetry(infoUrl, 3, 15000);
      } catch (err) {
        await sock.sendMessage(from, {
          text: `❌ Failed to fetch APK info after multiple attempts. API may be down.`,
          edit: msgKey
        });
        await react('❌');
        return;
      }

      const infoData = infoResponse.data;

      if (!infoData || !infoData.success || !infoData.result) {
        await sock.sendMessage(from, {
          text: `❌ No APK found for *${appName}*.`,
          edit: msgKey
        });
        await react('❌');
        return;
      }

      const { appname, appicon, developer, download_url } = infoData.result;

      if (!download_url) {
        await sock.sendMessage(from, {
          text: `❌ APK download URL not available for *${appname}*.`,
          edit: msgKey
        });
        await react('❌');
        return;
      }

      // Update status
      await sock.sendMessage(from, {
        text: `📥 Downloading APK: *${appname}*...`,
        edit: msgKey
      });

      // Step 2: Download the APK file
      let apkBuffer;
      try {
        const apkResponse = await fetchWithRetry(download_url, 2, 60000, 'arraybuffer');
        apkBuffer = Buffer.from(apkResponse.data);
      } catch (err) {
        await sock.sendMessage(from, {
          text: `❌ Failed to download APK file.`,
          edit: msgKey
        });
        await react('❌');
        return;
      }

      // Step 3: Download the app icon (for thumbnail)
      let iconBuffer = null;
      if (appicon) {
        try {
          const iconResponse = await axios.get(appicon, {
            responseType: 'arraybuffer',
            timeout: 10000,
            headers: { 'User-Agent': USER_AGENTS[0] }
          });
          iconBuffer = Buffer.from(iconResponse.data);
        } catch (err) {
          console.log('Icon download failed, sending without thumbnail');
        }
      }

      // Step 4: Send the APK as a document with thumbnail
      const fileName = `${appname.replace(/[^a-zA-Z0-9]/g, '_')}.apk`;

      const caption = `╔══════════════════════╗
║   *📱 APK File*     ║
╚══════════════════════╝

📦 *App:* ${appname}
👤 *Developer:* ${developer || 'Unknown'}
🔗 *Source:* ${download_url}

_Powered by PrinceTech_`;

      const messageOptions = {
        document: apkBuffer,
        fileName: fileName,
        mimetype: 'application/vnd.android.package-archive',
        caption: caption
      };

      // Add thumbnail if available
      if (iconBuffer) {
        messageOptions.thumbnail = iconBuffer; // Baileys accepts thumbnail as buffer
      }

      await sock.sendMessage(from, messageOptions, { quoted: msg });

      // Delete the status message
      try { await sock.sendMessage(from, { delete: msgKey }); } catch {}

      await react('✅');
    } catch (error) {
      console.error('APK download error:', error);
      await reply(`❌ Unexpected error: ${error.message}`);
      await react('❌');
    }
  }
};
