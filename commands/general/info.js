const config = require('../../config');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const API_BASE = 'https://proboy-info.vercel.app/';

module.exports = {
  name: 'info',
  aliases: ['infosearch', 'siminfo', 'cnicinfo'],
  category: 'general',
  description: 'For Sim And Cnic information',
  usage: `${config.prefix}info <phone_or_cnic>`,

  async execute(sock, msg, args, extra) {
    try {
      const query = args.join(' ').trim();
      if (!query) {
        return extra.reply(
          `❌ *Usage:* ${this.usage}\n\n` +
          `Example:\n${config.prefix}info 0300xxxxx\n${config.prefix}info 3660164118134
        );
      }

      await extra.react('⏳');

      // Fetch API data
      const url = `${API_BASE}?q=${encodeURIComponent(query)}`;
      const { data } = await axios.get(url, { timeout: 10000 });

      if (!data || !data.data || !Array.isArray(data.data) || !data.data.length) {
        return extra.reply('❌ No information found for this query.');
      }

      // Build header with per‑line credits
      const botName = config.botName || 'Bot';
      const developer = data.developer || 'Unknown';
      const creditsList = data.credits || [];

      let caption = `╭───❖ *${botName} Info* ❖───╮\n`;
      caption += `│ 👨‍💻 Developer : ${developer}\n`;

      if (creditsList.length > 0) {
        caption += `│ 🎖 Credits\n`;
        creditsList.forEach(credit => {
          caption += `│    • ${credit}\n`;
        });
        caption += `│    ....\n`;
      }

      caption += `│ 📡 Query     : ${query}\n`;
      caption += `│ 📊 Results   : ${data.data.length} entries\n`;
      caption += `╰───────────────────────╯\n\n`;

      // Entries (max 10)
      const entriesToShow = data.data.slice(0, 10);
      entriesToShow.forEach((entry, i) => {
        caption += `📌 *Entry ${i + 1}:*\n`;
        caption += `   • Name    : ${entry.name || 'N/A'}\n`;
        caption += `   • Phone   : ${entry.phone || 'N/A'}\n`;
        caption += `   • CNIC    : ${entry.cnic || 'N/A'}\n`;
        caption += `   • Address : ${entry.address || 'N/A'}\n\n`;
      });

      if (data.data.length > 10) {
        caption += `\n⚠️ Showing first 10 results. Use more specific query if needed.`;
      }

      caption += `\n🔎 _${query}_ Result From.\n🤖 *${botName}*`;

      // Newsletter attribution (like in menu)
      const newsletterJid = config.newsletterJid || '';
      const contextInfo = newsletterJid ? {
        forwardingScore: 1,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid,
          newsletterName: botName,
          serverMessageId: -1
        }
      } : undefined;

      // Bot image (utils/bot_image.jpg or profile pic)
      const imagePath = path.join(__dirname, '../../utils/bot_image.jpg');
      let imageBuffer = null;
      if (fs.existsSync(imagePath)) {
        imageBuffer = fs.readFileSync(imagePath);
      } else {
        try {
          imageBuffer = { url: await sock.profilePictureUrl(sock.user.id, 'image') };
        } catch {}
      }

      // Send only image+text (no button)
      if (imageBuffer) {
        await sock.sendMessage(extra.from, {
          image: imageBuffer,
          caption,
          ...(contextInfo ? { contextInfo } : {}),
          mentions: [extra.sender]
        }, { quoted: msg });
      } else {
        await sock.sendMessage(extra.from, {
          text: caption,
          ...(contextInfo ? { contextInfo } : {}),
          mentions: [extra.sender]
        }, { quoted: msg });
      }

      await extra.react('✅');
    } catch (error) {
      console.error('[info]', error);
      await extra.reply(`❌ Failed to fetch information: ${error.message}`);
      await extra.react('❌');
    }
  }
};
