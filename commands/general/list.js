/**
 * List Command - Stylish command list (like menu.js)
 */

const fs = require('fs');
const path = require('path');
const config = require('../../config');
const { loadCommands } = require('../../utils/commandLoader');
const ui = require('../../utils/ui');
const MAX_CAPTION_LENGTH = 900;
const MAX_TEXT_CHUNK = 3500;

const chunkText = (text, max = MAX_TEXT_CHUNK) => {
  const input = String(text || '');
  if (input.length <= max) return [input];

  const chunks = [];
  let remaining = input;
  while (remaining.length > max) {
    let slice = remaining.slice(0, max);
    const breakAt = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf(' '));
    if (breakAt > 500) slice = slice.slice(0, breakAt);
    chunks.push(slice.trim());
    remaining = remaining.slice(slice.length).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
};

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
      Object.keys(categories).forEach(cat => {
        categories[cat].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
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
      menuText += `🔗 TikTok: ${config.social?.tiktok || config.social?.Tiktok || 'Not set'}\n`;
      menuText += `🔗 GitHub: ${config.social?.github || 'Not set'}\n`;
      menuText += `🔗 Website: ${config.social?.website || 'Not set'}\n`;

      // Try to send with bot image (like menu.js)
      const imagePath = path.join(__dirname, '../../utils/bot_image.jpg');
      
      if (fs.existsSync(imagePath) && menuText.length <= MAX_CAPTION_LENGTH) {
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
        const chunks = chunkText(menuText);
        for (let i = 0; i < chunks.length; i++) {
          await sock.sendMessage(extra.from, {
            text: chunks[i],
            mentions: [extra.sender]
          }, { quoted: i === 0 ? msg : null });
        }
      }
      
    } catch (error) {
      console.error('list.js error:', error);
      await extra.reply('❌ Failed to generate stylish command list.');
    }
  }
};
