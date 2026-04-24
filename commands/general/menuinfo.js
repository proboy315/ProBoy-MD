/**
 * CmdList – Generate a text file with all command details (name, aliases, desc, usage, category)
 * Sends as a single document message.
 */

const config = require('../../config');
const { loadCommands } = require('../../utils/commandLoader');
const fs = require('fs');
const path = require('path');
const { tmpdir } = require('os');

module.exports = {
  name: 'menuinfo',
  aliases: ['allcmds', 'cmdinfoall'],
  category: 'general',
  description: '📄 Generate a text file with all command details (single document)',
  usage: '.menuinfo',
  ownerOnly: false, // anyone can use, but file will be sent to current chat

  async execute(sock, msg, args, extra) {
    const { from, reply, react, config: cfg } = extra;
    const commands = loadCommands();
    const prefix = cfg.prefix;

    await react('⏳');
    const statusMsg = await sock.sendMessage(from, { text: '📄 Generating command list...' }, { quoted: msg });
    const statusKey = statusMsg.key;

    try {
      // Group commands by category
      const categories = {};
      commands.forEach((cmd, name) => {
        if (cmd.name === name) {
          const cat = cmd.category || 'general';
          if (!categories[cat]) categories[cat] = [];
          categories[cat].push({ name, cmd });
        }
      });

      // Sort each category alphabetically
      for (const cat in categories) {
        categories[cat].sort((a, b) => a.name.localeCompare(b.name));
      }

      // Build the text content
      const botName = cfg.botName || 'ProBoy-MD';
      const timestamp = new Date().toLocaleString();
      let content = `╔════════════════════════════════════╗\n`;
      content += `║        ${botName} - COMMAND LIST         ║\n`;
      content += `╚════════════════════════════════════╝\n\n`;
      content += `📅 Generated: ${timestamp}\n`;
      content += `⚡ Prefix: ${prefix}\n`;
      content += `📦 Total commands: ${commands.size}\n\n`;
      content += `────────────────────────────────────────\n\n`;

      const categoryOrder = [
        'general', 'ai', 'group', 'owner', 'media', 'fun', 'utility', 'anime', 'textmaker'
      ];
      const categoryNames = {
        general: 'GENERAL COMMANDS',
        ai: 'AI COMMANDS',
        group: 'GROUP COMMANDS',
        owner: 'OWNER COMMANDS',
        media: 'MEDIA COMMANDS',
        fun: 'FUN COMMANDS',
        utility: 'UTILITY COMMANDS',
        anime: 'ANIME COMMANDS',
        textmaker: 'TEXTMAKER COMMANDS'
      };

      for (const catKey of categoryOrder) {
        const cmdList = categories[catKey];
        if (!cmdList || cmdList.length === 0) continue;
        content += `═══ ${categoryNames[catKey]} (${cmdList.length}) ═══\n\n`;
        for (const { name, cmd } of cmdList) {
          const description = cmd.description || 'No description';
          const usage = cmd.usage || `${prefix}${name}`;
          const aliases = cmd.aliases && cmd.aliases.length ? cmd.aliases.join(', ') : 'None';
          content += `◆ ${prefix}${name}\n`;
          content += `  📝 Description: ${description}\n`;
          if (aliases !== 'None') content += `  🔗 Aliases: ${aliases}\n`;
          content += `  💡 Usage: ${usage}\n`;
          content += `  📂 Category: ${catKey}\n\n`;
        }
        content += `────────────────────────────────────────\n\n`;
      }

      content += `💡 Tip: Use .menuinfo <command> for more details.\n`;
      content += `🌟 Bot Version: ${cfg.version || '1.0.0'}\n`;

      // Save to temp file
      const fileName = `proboy_commands_${Date.now()}.txt`;
      const filePath = path.join(tmpdir(), fileName);
      fs.writeFileSync(filePath, content, 'utf8');

      // Get bot image for thumbnail
      const imagePath = path.join(__dirname, '../../utils/bot_image.jpg');
      let imageBuffer = null;
      if (fs.existsSync(imagePath)) {
        imageBuffer = fs.readFileSync(imagePath);
      }

      // Send as document with optional thumbnail
      await sock.sendMessage(from, {
        document: fs.readFileSync(filePath),
        fileName: fileName,
        mimetype: 'text/plain',
        caption: `📄 *Command List Generated*\n\n📦 ${commands.size} commands\n📅 ${timestamp}`,
        thumbnail: imageBuffer,
        contextInfo: {
          forwardingScore: 1,
          isForwarded: true,
          forwardedNewsletterMessageInfo: {
            newsletterJid: cfg.newsletterJid || '120363161513685998@newsletter',
            newsletterName: botName,
            serverMessageId: -1
          }
        }
      }, { quoted: msg });

      // Clean up
      fs.unlinkSync(filePath);
      await sock.sendMessage(from, { text: `✅ Command list sent as \`${fileName}\`.`, edit: statusKey });
      await react('✅');
    } catch (error) {
      console.error('CmdList error:', error);
      await sock.sendMessage(from, { text: `❌ Failed: ${error.message}`, edit: statusKey });
      await react('❌');
    }
  }
};