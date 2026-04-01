/**
 * List Command - Stylish command list (like menu.js)
 */

const fs = require('fs');
const path = require('path');
const config = require('../../config');
const { loadCommands } = require('../../utils/commandLoader');
const ui = require('../../utils/ui');

module.exports = {
  name: 'list',
  aliases: ['commands', 'all'],
  description: 'Display all available commands in a stylish format',
  usage: '.list',
  category: 'general',
  
  async execute(sock, msg, args, extra) {
    try {
      const prefix = config.prefix;
      const commands = loadCommands();
      const categories = {};

      // Group commands by category (main names only)
      commands.forEach((cmd, name) => {
        if (cmd.name === name) {
          const cat = (cmd.category || 'other').toLowerCase();
          if (!categories[cat]) categories[cat] = [];
          categories[cat].push(cmd);
        }
      });

      // Build the stylish header (same as menu.js)
      const ownerNames = Array.isArray(config.ownerName) ? config.ownerName : [config.ownerName];
      const displayOwner = ownerNames[0] || config.ownerName || 'Bot Owner';
      
      let menuText = `${ui.headerLine('Commands')}\n\n`;
      menuText += `👑 Owner: ${displayOwner}\n`;
      menuText += `👤 User: @${extra.sender.split('@')[0]}\n`;
      menuText += `⚡ Prefix: ${config.prefix}\n`;
      menuText += `🧩 Total Commands: ${commands.size}\n\n`;

      // Sort categories and build each section
      const sortedCats = Object.keys(categories).sort();
      for (const cat of sortedCats) {
        const catUpper = cat.toUpperCase();
        menuText += `╭════〘 *${catUpper} COMMANDS* 〙════⊷❍\n`;
        categories[cat].forEach(cmd => {
          menuText += `┃✯│ _${config.prefix}${cmd.name}_\n`;
        });
        menuText += `┃✯╰─────────────────❍\n`;
        menuText += `╰══════════════════⊷❍\n\n`;
      }

      // Footer with help tip and social links (as text, optional)
      menuText += `╰━━━━━━━━━━━━━━━━━\n\n`;
      menuText += `💡 Type ${config.prefix}help <command> for more info\n`;
      menuText += `🌟 Bot Version: ${config.version || '1.0.0'}\n\n`;
      menuText += `📌 *Follow us:*\n`;
      menuText += `🔗 TikTok: ${config.social?.tiktok || 'https://www.tiktok.com/@itx_proboy/'}\n`;
      menuText += `🔗 GitHub: ${config.social?.github || 'https://github.com/proboy315/ProBoy-MD/'}\n`;
      menuText += `🔗 Channel: https://whatsapp.com/channel/0029Va90zAnIHphOuO8Msp3A\n`;

      // Try to send with bot image (like menu.js)
      const imagePath = path.join(__dirname, '../../utils/bot_image.jpg');
      
      if (fs.existsSync(imagePath)) {
        const imageBuffer = fs.readFileSync(imagePath);
        await sock.sendMessage(extra.from, {
          image: imageBuffer,
          caption: menuText,
          mentions: [extra.sender],
          contextInfo: {
            forwardingScore: 1,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
              newsletterJid: config.newsletterJid || '120363161513685998@newsletter',
              newsletterName: config.botName,
              serverMessageId: -1
            }
          }
        }, { quoted: msg });
      } else {
        await sock.sendMessage(extra.from, {
          text: menuText,
          mentions: [extra.sender]
        }, { quoted: msg });
      }
      
    } catch (error) {
      console.error('list.js error:', error);
      await extra.reply('❌ Failed to generate stylish command list.');
    }
  }
};
