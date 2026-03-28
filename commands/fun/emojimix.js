/**
 * Emoji Mix Plugin – Google Kitchen Emoji Blender
 * Combines two emojis into a creative new image.
 */

const axios = require('axios');

// User‑agents for fallback (though this API is direct, we still include for consistency)
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
  'okhttp/4.9.3'
];

// Helper to get Unicode code point (hex, lowercase, 4+ digits)
function getEmojiCode(emoji) {
  // Handle multi‑codepoint emojis (like flags, skin tones) by taking the first character
  const firstChar = [...emoji][0];
  const codePoint = firstChar.codePointAt(0);
  return codePoint.toString(16).toLowerCase();
}

module.exports = {
  name: 'emojimix',
  aliases: ['mixemoji', 'emojiblend'],
  category: 'fun',
  description: '🎨 Mix two emojis together using Google Kitchen',
  usage: '.emojimix <emoji1> <emoji2>\nExample: .emojimix 😂 🔥',

  async execute(sock, msg, args, extra) {
    const { from, reply, react, sender, isGroup, groupMetadata } = extra;

    // Validate arguments
    if (args.length < 2) {
      return reply(`╭═══〘 *USAGE* 〙═══⊷❍
┃✯│ .emojimix <emoji1> <emoji2>
┃✯│ Example: .emojimix 😂 🔥
╰══════════════════⊷❍`);
    }

    const e1 = args[0];
    const e2 = args[1];

    // Basic validation – emojis are at least one character (they are, but ensure)
    if (!e1 || !e2) {
      return reply('❌ Please provide two valid emojis.');
    }

    try {
      await react('🎨');

      const cp1 = getEmojiCode(e1);
      const cp2 = getEmojiCode(e2);
      const url = `https://www.gstatic.com/android/keyboard/emojikitchen/20201001/u${cp1}/u${cp1}_u${cp2}.png`;

      // Attempt to download the image
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 10000,
        headers: { 'User-Agent': USER_AGENTS[0] }
      });

      if (response.status !== 200 || !response.data) {
        throw new Error('Image not found');
      }

      const buffer = Buffer.from(response.data);
      const caption = `╭═══〘 *EMOJI MIX* 〙═══⊷❍
┃✯│ 🎨 ${e1} + ${e2}
╰══════════════════⊷❍`;

      await sock.sendMessage(from, {
        image: buffer,
        caption: caption
      }, { quoted: msg });

      await react('✅');
    } catch (error) {
      console.error('Emoji mix error:', error);
      // Fallback: combination not available
      await reply(`❌ *Emoji combination not available.*\n\nTry other emojis like:\n• 😂 🔥\n• 🐱 🌈\n• 🎃 👻\n• ❤️ 🔥\n• 🐶 🐱`);
      await react('❌');
    }
  }
};
