/**
 * Menu Command - Display all available commands
 * Styled as per new minimal design
 */

const config = require('../../config');
const { loadCommands } = require('../../utils/commandLoader');
const fs = require('fs');
const path = require('path');
const { sendButtons } = require('../../utils/button');

const CATEGORY_ORDER = [
  { key: 'general', name: 'GENERAL COMMANDS' },
  { key: 'ai', name: 'AI COMMANDS' },
  { key: 'group', name: 'GROUP COMMANDS' },
  { key: 'dev', name: 'DEV COMMANDS' },
  { key: 'owner', name: 'DEV COMMANDS (LEGACY)' },
  { key: 'media', name: 'MEDIA COMMANDS' },
  { key: 'fun', name: 'FUN COMMANDS' },
  { key: 'utility', name: 'UTILITY COMMANDS' },
  { key: 'anime', name: 'ANIME COMMANDS' },
  { key: 'textmaker', name: 'TEXTMAKER COMMANDS' }
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
  let text = `╭━  ${botName}  ━╮\n`;
  text += `┃  Owner: ${owner}\n`;
  text += `┃  User: @${userTag}\n`;
  text += `┃  Prefix: ${config.prefix}\n`;
  text += `┃  Cmds: ${commands.size}\n`;
  text += `╰━━━━━━━━━━━━━━━╯\n`;
  return text;
};

const buildSimpleCategoryMenu = ({ commands, categories, owner, userTag, botName }) => {
  const available = CATEGORY_ORDER.filter(c => (categories[c.key] || []).length > 0);
  let text = buildHeader({ commands, owner, userTag, botName });
  text += '\n';
  text += 'Select Category\n';
  for (const cat of available) text += `${cat.key}\n`;
  return text;
};

const buildCategoryCommandsText = ({ commands, categories, owner, userTag, botName, categoryKey }) => {
  const cat = CATEGORY_ORDER.find(c => c.key === categoryKey);
  const cmdList = categories[categoryKey] || [];

  let text = buildHeader({ commands, owner, userTag, botName });
  text += '\n';

  if (!cat || !cmdList.length) {
    text += `❌ Category not found: ${categoryKey}\n`;
    return text;
  }

  text += `╭─❖ ${cat.name} \n│ \n`;
  cmdList.forEach(cmd => {
    text += `│ -   ${config.prefix}${cmd.name}\n`;
  });
  text += '╰──────────────';
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
    text += `╭─❖ ${cat.name} \n│ \n`;
    cmdList.forEach(cmd => {
      text += `│ -   ${config.prefix}${cmd.name}\n`;
    });
    text += '╰──────────────\n\n';
  }
  text += `💡 Type ${config.prefix}help <command> for more info\n`;
  text += `🌟 Bot Version: ${config.version || '1.0.0'}\n`;
  return text;
};

const getChannelLink = () => {
  return (
    config.social?.channel ||
    config.social?.whatsappChannel ||
    process.env.WHATSAPP_CHANNEL_URL ||
    config.social?.website ||
    'https://proboy.vercel.app'
  );
};

const sendMenuMessage = async (sock, msg, extra, text, botName) => {
  const imagePath = path.join(__dirname, '../../utils/bot_image.jpg');
  if (fs.existsSync(imagePath)) {
    const imageBuffer = fs.readFileSync(imagePath);
    await sock.sendMessage(extra.from, {
      image: imageBuffer,
      caption: text,
      mentions: [extra.sender],
      contextInfo: {
        forwardingScore: 1,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: config.newsletterJid || '120363161513685998@newsletter',
          newsletterName: botName,
          serverMessageId: -1
        }
      }
    }, { quoted: msg });
    return;
  }

  await sock.sendMessage(extra.from, {
    text,
    mentions: [extra.sender]
  }, { quoted: msg });
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

      // Get owner name and bot name
      const ownerNames = Array.isArray(config.ownerName) ? config.ownerName : [config.ownerName];
      const displayOwner = ownerNames[0] || 'Bot Owner';
      const botName = config.botName || 'ProBoy-MD';
      const userTag = extra.sender.split('@')[0];
      const channelLink = getChannelLink();

      if (buttonMode) {
        if (!categoryKey) {
          const menuText = buildSimpleCategoryMenu({ commands, categories, owner: displayOwner, userTag, botName });
          await sendMenuMessage(sock, msg, extra, menuText, botName);

          const categoryButtons = CATEGORY_ORDER
            .filter(c => (categories[c.key] || []).length > 0)
            .map(c => ({
              type: 'quick_reply',
              displayText: c.key.toUpperCase().slice(0, 20),
              id: `cmd_menu_cat_${c.key}`
            }));

          for (let i = 0; i < categoryButtons.length; i += 3) {
            const chunk = categoryButtons.slice(i, i + 3);
            await sendButtons(sock, extra.from, {
              text: i === 0 ? 'Select category' : 'More categories',
              footer: botName,
              buttons: chunk,
              quoted: msg
            });
          }

          await sendButtons(sock, extra.from, {
            text: 'Channel',
            footer: botName,
            buttons: [{ type: 'url', displayText: 'View Channel', url: channelLink }],
            quoted: msg
          });
          return;
        }

        const categoryText = buildCategoryCommandsText({
          commands,
          categories,
          owner: displayOwner,
          userTag,
          botName,
          categoryKey
        });
        await sendMenuMessage(sock, msg, extra, categoryText, botName);

        await sendButtons(sock, extra.from, {
          text: 'Menu Actions',
          footer: botName,
          buttons: [
            { type: 'quick_reply', displayText: 'BACK', id: 'cmd_menu_home' },
            { type: 'url', displayText: 'View Channel', url: channelLink }
          ],
          quoted: msg
        });
        return;
      }

      const menuText = buildFullMenuText({ commands, categories, owner: displayOwner, userTag, botName, categoryKey });
      await sendMenuMessage(sock, msg, extra, menuText, botName);
    } catch (error) {
      console.error('Menu error:', error);
      await extra.reply(`❌ Error: ${error.message}`);
    }
  }
};
