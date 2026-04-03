/**
 * Pinterest Downloader Plugin – Lightweight API
 * Uses https://backend1.tioo.eu.org/pinterest?url=...
 */

const axios = require('axios');
const config = require('../../config');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
  'okhttp/4.9.3'
];

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
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000));
    }
  }
  throw lastError;
}

// Helper to check if input is a Pinterest URL
function isPinterestUrl(input) {
  const patterns = [
    /pin\.it\//i,
    /pinterest\.com\/pin\//i,
    /pinterest\.com\/[^/]+\/[^/]+\/?/i
  ];
  return patterns.some(p => p.test(input));
}

// Helper to extract best quality image URL from a pin object
function getBestImageUrl(pin) {
  // Try direct image property
  if (pin.image) return pin.image;

  // Try images.orig (original)
  if (pin.images?.orig?.url) return pin.images.orig.url;

  // Try images.original
  if (pin.images?.original?.url) return pin.images.original.url;

  // Try images object (contains various sizes)
  if (pin.images) {
    const sizes = ['736x', '564x', '474x', '236x', '170x', '136x', '60x60'];
    for (const size of sizes) {
      if (pin.images[size]?.url) return pin.images[size].url;
    }
  }

  return null;
}

module.exports = {
  name: 'pinterest',
  aliases: ['pin', 'pindl'],
  category: 'media',
  description: '📌 Download images from Pinterest (URL or search)',
  usage: '.pinterest <url or search query>',

  async execute(sock, msg, args, extra) {
    const { from, reply, react } = extra;
    const input = args.join(' ').trim();

    if (!input) {
      return reply(`❌ Please provide a Pinterest URL or search query.\nExample: ${this.usage}`);
    }

    try {
      await react('⏳');

      const apiUrl = `https://backend1.tioo.eu.org/pinterest?url=${encodeURIComponent(input)}`;
      const response = await fetchWithRetry(apiUrl, 3, 15000);
      const data = response.data;

      if (!data?.success || !data?.result) {
        throw new Error(data?.message || 'Invalid API response');
      }

      const result = data.result;
      const isUrl = isPinterestUrl(input);

      if (isUrl) {
        // --- Single pin URL ---
        const imageUrl = getBestImageUrl(result);
        if (!imageUrl) throw new Error('No image URL found');

        const username = result.user?.username || result.user?.full_name || 'Unknown';
        const caption = `📌 *Pinterest Image*\n👤 *User:* ${username}\n\n${config.botName}`;

        await sock.sendMessage(from, {
          image: { url: imageUrl },
          caption: caption
        }, { quoted: msg });

        await react('✅');
      } else {
        // --- Search query ---
        const pins = result.result; // array of pins
        if (!Array.isArray(pins) || pins.length === 0) {
          throw new Error('No results found');
        }

        const limited = pins.slice(0, 10);
        let sentCount = 0;

        for (const pin of limited) {
          const imageUrl = getBestImageUrl(pin);
          if (!imageUrl) continue;

          const username = pin.user?.username || pin.user?.full_name || 'Unknown';
          const caption = `📌 *Pinterest Result ${sentCount + 1}*\n👤 *User:* ${username}\n\n${config.botName}`;

          await sock.sendMessage(from, {
            image: { url: imageUrl },
            caption: caption
          }, { quoted: msg });

          sentCount++;
          await new Promise(resolve => setTimeout(resolve, 500)); // delay to avoid rate limit
        }

        if (sentCount === 0) {
          await reply('❌ No downloadable images found in results.');
        } else {
          await reply(`✅ Sent ${sentCount} images from Pinterest search.`);
        }
        await react('✅');
      }
    } catch (error) {
      console.error('Pinterest error:', error);
      let errorMsg = '❌ Failed to process.';
      if (error.code === 'ECONNABORTED') errorMsg += ' Request timed out.';
      else errorMsg += ` ${error.message}`;
      await reply(errorMsg);
      await react('❌');
    }
  }
};
