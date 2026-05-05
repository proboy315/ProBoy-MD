const config = require('../../config');
const { loadCommands } = require('../../utils/commandLoader');
const fs = require('fs');
const path = require('path');

const BUG_CATEGORY_KEY = 'bug';

const collectBugCommands = (commands) => {
  const bugCommands = [];
  commands.forEach((cmd, name) => {
    if (!cmd || cmd.name !== name) return;
    const key = String(cmd.category || '').toLowerCase();
    if (key === BUG_CATEGORY_KEY) bugCommands.push(cmd);
  });
  bugCommands.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  return bugCommands;
};

const buildHeader = ({ total, owner, userTag, botName }) => {
  let text = `╭━  ${botName}  ━╮\n`;
  text += `┃  Owner: ${owner}\n`;
  text += `┃  User: @${userTag}\n`;
  text += `┃  Prefix: ${config.prefix}\n`;
  text += `┃  Bug Cmds: ${total}\n`;
  text += `╰━━━━━━━━━━━━━━━╯\n`;
  return text;
};

const buildBugMenuText = ({ commands, owner, userTag, botName }) => {
  let text = buildHeader({ total: commands.length, owner, userTag, botName });
  text += '\n';
  text += '╭─❖ BUG COMMANDS \n│ \n';
  if (!commands.length) {
    text += '│ -   No bug commands installed\n';
  } else {
    commands.forEach((cmd) => {
      text += `│ -   ${config.prefix}${cmd.name}\n`;
    });
  }
  text += '╰──────────────\n\n';
  text += `💡 Type ${config.prefix}help <command> for more info\n`;
  text += `🌟 Bot Version: ${config.version || '1.0.0'}\n`;
  return text;
};

const sendBugMenu = async (sock, msg, extra, text, botName) => {
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
  name: 'bugmenu',
  aliases: ['bugs', 'bugcommands'],
  category: 'general',
  description: 'Show bug category commands',
  usage: '.bugmenu',

  async execute(sock, msg, args, extra) {
    try {
      const commands = loadCommands();
      const bugCommands = collectBugCommands(commands);
      const ownerNames = Array.isArray(config.ownerName) ? config.ownerName : [config.ownerName];
      const displayOwner = ownerNames[0] || 'Bot Owner';
      const botName = config.botName || 'ProBoy-MD';
      const userTag = extra.sender.split('@')[0];

      const text = buildBugMenuText({
        commands: bugCommands,
        owner: displayOwner,
        userTag,
        botName
      });

      await sendBugMenu(sock, msg, extra, text, botName);
    } catch (error) {
      console.error('Bugmenu error:', error);
      await extra.reply(`❌ Error: ${error.message}`);
    }
  }
};
