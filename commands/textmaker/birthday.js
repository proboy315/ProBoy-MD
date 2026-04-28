/**
 * Birthday Command
 * Generates a birthday cake image with a name using ephoto360.
 * Fallback: uses AI image generation if ephoto360 fails.
 */

const axios = require('axios');
const { sendInteractiveMessage } = require('gifted-btns');
const config = require('../../config');

// User‑agent list for requests
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
  'okhttp/4.9.3'
];

// ===================== EPHOTO360 SCRAPER =====================
// We'll reuse the working ephoto360 endpoint for birthday cakes
// The old URL was 404, so we use a known working one
const EPHOTO_URL = 'https://en.ephoto360.com/write-name-on-red-rose-birthday-cake-images-462.html';

async function fetchEphotoImage(name) {
  try {
    const formData = new URLSearchParams();
    formData.append('text[]', name);
    formData.append('submit', 'Create');

    const response = await axios.post(EPHOTO_URL, formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
        'Referer': EPHOTO_URL
      },
      timeout: 30000,
      maxRedirects: 0,
      validateStatus: status => status < 400
    });

    // Extract image URL from response HTML
    const html = response.data;
    const match = html.match(/<img[^>]+src=["']([^"']+\.(?:jpg|jpeg|png|webp))["'][^>]*>/i);
    if (match && match[1]) {
      let imgUrl = match[1];
      if (!imgUrl.startsWith('http')) imgUrl = 'https://en.ephoto360.com' + imgUrl;
      return imgUrl;
    }
    throw new Error('No image found in response');
  } catch (err) {
    console.error('Ephoto360 error:', err.message);
    return null;
  }
}

// ===================== FALLBACK: AI IMAGE GENERATION =====================
async function generateAIBirthdayImage(name) {
  try {
    const prompt = `A beautiful birthday cake with red roses, with the name "${name}" written on it in elegant gold letters, realistic style, high quality, 4k`;
    const apiUrl = `https://api.dreaded.site/api/imagine?text=${encodeURIComponent(prompt)}`;
    const response = await axios.get(apiUrl, {
      timeout: 45000,
      headers: { 'User-Agent': USER_AGENTS[0] },
      responseType: 'arraybuffer'
    });
    return Buffer.from(response.data);
  } catch (err) {
    console.error('AI image generation failed:', err.message);
    return null;
  }
}

// ===================== MAIN COMMAND =====================
module.exports = {
  name: 'birthday',
  aliases: ['bday', 'happybirthday'],
  category: 'textmaker',
  description: '🎂 Generate a birthday cake image with your name',
  usage: '.birthday <name>',

  async execute(sock, msg, args, extra) {
    const { reply, react, from } = extra;

    const name = args.join(' ');
    if (!name) {
      return reply(`╭═══〘 *USAGE* 〙═══⊷❍
┃✯│ .birthday <name>
┃✯│ Example: .birthday Ali
╰══════════════════⊷❍`);
    }

    try {
      await react('🎂');
      const statusMsg = await sock.sendMessage(from, {
        text: `⏳ Generating birthday image for *${name}*...\n_This may take up to 30 seconds._`
      }, { quoted: msg });
      const statusKey = statusMsg.key;

      // Try ephoto360 first
      let imageUrl = await fetchEphotoImage(name);
      let buffer = null;

      if (imageUrl) {
        // Download the image
        const imgResp = await axios.get(imageUrl, {
          responseType: 'arraybuffer',
          timeout: 15000,
          headers: { 'User-Agent': USER_AGENTS[0] }
        });
        buffer = Buffer.from(imgResp.data);
      }

      // Fallback to AI if ephoto360 failed
      if (!buffer) {
        await sock.sendMessage(from, {
          text: '⚠️ Ephoto360 service unavailable. Trying AI generation...',
          edit: statusKey
        });
        buffer = await generateAIBirthdayImage(name);
      }

      if (!buffer) {
        throw new Error('All methods failed');
      }

      // Send the image
      await sock.sendMessage(from, {
        image: buffer,
        caption: `╭═══〘 *HAPPY BIRTHDAY* 〙═══⊷❍
┃✯│ 🎂 To: ${name}
┃✯│ ✨ May your day be filled with joy!
╰══════════════════⊷❍`
      }, { quoted: msg });

      // Delete status message
      try { await sock.sendMessage(from, { delete: statusKey }); } catch {}
      await react('✅');
    } catch (error) {
      console.error('Birthday command error:', error);
      await reply(`❌ Failed to generate birthday image: ${error.message}`);
      await react('❌');
    }
  }
};
