/**
 * Menu Command -  Inspired Premium Design
 * Logic: Original | Design: Modern Bordered
 */

const config = require('../../config');
const { loadCommands } = require('../../utils/commandLoader');
const fs = require('fs');
const path = require('path');
const { sendButtons } = require('../../utils/button');

const CATEGORY_ORDER = [
  { key: 'general', name: 'MAIN' },
  { key: 'ai', name: 'AI' },
  { key: 'group', name: 'GROUP' },
  { key: 'dev', name: 'OWNER' },
  { key: 'owner', name: 'OWNER (LEGACY)' },
  { key: 'media', name: 'DOWNLOAD' },
  { key: 'fun', name: 'FUN' },
  { key: 'utility', name: 'UTILITY' },
  { key: 'anime', name: 'ANIME' },
  { key: 'textmaker', name: 'TOOLS' }
];

const collectCategories = (commands) => {
  const categories = {};
  commands.forEach((cmd, name) => {
    if (cmd.name === name) {
      const key = String(cmd.category || '').toLowerCase();
      if (!categories[key]) categories[key] = [];
      categories[key].push(cmd);
    }
  });
  for (const key of Object.keys(categories)) {
    categories[key].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }
  return categories;
};

const buildHeader = ({ commands, owner, userTag, botName }) => {
  let text = `*╭┈───〔 ${botName.toUpperCase()} 〕┈───⊷*\n`;
  text += `*├✦ Owner:* ${owner}\n`;
  text += `*├✦ User:* @${userTag}\n`;
  text += `*├✦ Commands:* ${commands.size}\n`;
  text += `*├✦ Prefix:* ${config.prefix}\n`;
  text += `*├✦ Version:* ${config.version || '1.0.0'}\n`;
  text += `*╰───────────────────⊷*\n`;
  return text;
};

const buildCategoryCommandsText = ({ commands, categories, owner, userTag, botName, categoryKey }) => {
  const cat = CATEGORY_ORDER.find(c => c.key === categoryKey);
  const cmdList = categories[categoryKey] || [];

  let text = buildHeader({ commands, owner, userTag, botName }) + '\n';

  if (!cat || !cmdList.length) {
    text += `_❌ Category not found_\n`;
    return text;
  }

  text += `\`『 ${cat.name} 』\`\n`;
  text += `╭───────────────────⊷\n`;
  cmdList.forEach(cmd => {
    // Converting command name to small caps style like your example
    const smallCapsName = cmd.name.toLowerCase().replace(/[a-z]/g, char => 
      "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ"[char.charCodeAt(0) - 97] || char
    );
    text += `*┋ ✦ ${config.prefix} ${smallCapsName}*\n`;
  });
  text += `╰───────────────────⊷`;
  return text;
};

const buildFullMenuText = ({ commands, categories, owner, userTag, botName, categoryKey }) => {
  const filtered = categoryKey
    ? CATEGORY_ORDER.filter(c => c.key === categoryKey)
    : CATEGORY_ORDER;

  let text = buildHeader({ commands, owner, userTag, botName }) + '\n';
  
  for (const cat of filtered) {
    const cmdList = categories[cat.key];
    if (!cmdList || !cmdList.length) continue;
    
    text += `\`『 ${cat.name} 』\`\n`;
    text += `╭───────────────────⊷\n`;
    cmdList.forEach(cmd => {
      const smallCapsName = cmd.name.toLowerCase().replace(/[a-z]/g, char => 
        "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ"[char.charCodeAt(0) - 97] || char
      );
      text += `*┋ ✦ ${config.prefix} ${smallCapsName}*\n`;
    });
    text += `╰───────────────────⊷\n\n`;
  }
  
  text += `> *©  ${config.botName}*`;
  return text;
};

const sendMenuMessage = async (sock, msg, extra, text, botName) => {
  const imagePath = path.join(__dirname, '../../utils/bot_image.jpg');
  const contextInfo = {
    forwardingScore: 1,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: config.newsletterJid || '98136462770302@lid',
      newsletterName: `| ${botName}`,
      serverMessageId: -1
    }
  };

  if (fs.existsSync(imagePath)) {
    await sock.sendMessage(extra.from, {
      image: fs.readFileSync(imagePath),
      caption: text,
      mentions: [extra.sender],
      contextInfo
    }, { quoted: msg });
  } else {
    await sock.sendMessage(extra.from, { text, mentions: [extra.sender], contextInfo }, { quoted: msg });
  }
};

module.exports = {
  name: 'menu',
  aliases: ['help', 'commands'],
  category: 'general',
  description: 'Show all available commands',
  usage: '.menu',

  async execute(sock, msg, args, extra) {
    try {
      const commands = loadCommands();
      const categories = collectCategories(commands);
      const requestedCategory = String(args[0] || '').toLowerCase();
      const categoryKey = CATEGORY_ORDER.some(c => c.key === requestedCategory) ? requestedCategory : null;
      const db = extra.database;
      const buttonMode = !!db?.getGlobalSetting?.('menuButtonsEnabled');

      const ownerNames = Array.isArray(config.ownerName) ? config.ownerName : [config.ownerName];
      const displayOwner = ownerNames[0] || 'Fahad Arain';
      const botName = config.botName || 'ProBoy-MD';
      const userTag = extra.sender.split('@')[0];
      const channelLink = config.social?.whatsappChannel || 'https://proboy.vercel.app';

      if (buttonMode && !categoryKey) {
        const menuText = buildHeader({ commands, owner: displayOwner, userTag, botName }) + "\nSelect a category below:";
        await sendMenuMessage(sock, msg, extra, menuText, botName);

        const categoryButtons = CATEGORY_ORDER
          .filter(c => (categories[c.key] || []).length > 0)
          .map(c => ({
            type: 'quick_reply',
            displayText: c.name,
            id: `cmd_menu_cat_${c.key}`
          }));

        for (let i = 0; i < categoryButtons.length; i += 3) {
          await sendButtons(sock, extra.from, {
            text: i === 0 ? 'Categories' : 'More',
            footer: '${config.prefix} ',
            buttons: categoryButtons.slice(i, i + 3),
            quoted: msg
          });
        }
        return;
      }

      const menuText = categoryKey 
        ? buildCategoryCommandsText({ commands, categories, owner: displayOwner, userTag, botName, categoryKey })
        : buildFullMenuText({ commands, categories, owner: displayOwner, userTag, botName });

      await sendMenuMessage(sock, msg, extra, menuText, botName);

    } catch (error) {
      console.error('Menu error:', error);
      await extra.reply(`❌ Error: ${error.message}`);
    }
  }
};
