// commands/owner/install.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('../../config');

// Allowed categories (must match subfolder names in commands/)
const validCategories = [
  'admin', 'ai', 'anime', 'fun', 'general',
  'group', 'media', 'owner', 'textmaker', 'utility'
];

module.exports = {
  name: 'install',
  aliases: ['plugin', 'addplugin'],
  category: 'owner',
  description: 'Install a plugin from a GitHub Gist URL or by replying to a plugin file',
  usage: '.install <gist_url>  OR  reply to a .js file with .install',
  ownerOnly: true, // Only owners can install plugins (file system access)

  async execute(sock, msg, args, extra) {
    try {
      // Determine method: URL or reply
      let content = null;
      let method = null;

      if (args.length > 0) {
        // Method 1: URL (must be gist.github.com)
        const url = args[0].trim();
        if (!url.includes('gist.github.com')) {
          return extra.reply('❌ Only GitHub Gist URLs are supported.\nExample: https://gist.github.com/username/123456789');
        }
        method = 'url';
        await extra.react('⏳');
        // Convert to raw URL if needed
        const rawUrl = url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
        // Gist raw URL format: https://gist.githubusercontent.com/username/gistid/raw/filename.js
        // But simple replacement may not always work. Better to fetch the gist API? Simpler: just assume user provides raw URL.
        // We'll try to fetch directly.
        const response = await axios.get(rawUrl, { timeout: 10000 });
        content = response.data;
      } else {
        // Method 2: Reply to a file message
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quoted) {
          return extra.reply('❌ Please reply to a `.js` file or provide a Gist URL.\n' + this.usage);
        }
        // Check if quoted message is a document (likely a .js file)
        const doc = quoted.documentMessage;
        if (!doc) {
          return extra.reply('❌ Quoted message is not a file. Please reply to a `.js` plugin file.');
        }
        const fileName = doc.fileName || '';
        if (!fileName.endsWith('.js')) {
          return extra.reply('❌ File must be a `.js` JavaScript file.');
        }
        method = 'reply';
        await extra.react('⏳');
        // Download the file
        const stream = await sock.downloadMediaMessage(msg.message.extendedTextMessage.contextInfo.quotedMessage);
        content = stream.toString('utf8');
      }

      if (!content) {
        throw new Error('Failed to retrieve plugin content.');
      }

      // Parse the plugin file to extract metadata
      const pluginInfo = parsePlugin(content);
      if (!pluginInfo.name) {
        throw new Error('Could not determine plugin name. Ensure the plugin exports a valid command object.');
      }
      if (!pluginInfo.category || !validCategories.includes(pluginInfo.category)) {
        throw new Error(`Invalid or missing category. Allowed: ${validCategories.join(', ')}`);
      }

      // Determine target folder
      const targetDir = path.join(__dirname, '..', pluginInfo.category);
      const targetFile = path.join(targetDir, `${pluginInfo.name}.js`);

      // Ensure category folder exists
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // Write file
      fs.writeFileSync(targetFile, content, 'utf8');

      // Build success message with plugin details
      const details = [
        '✅ *Plugin installed successfully!*',
        '',
        `📁 *Category:* ${pluginInfo.category}`,
        `📄 *Filename:* ${pluginInfo.name}.js`,
        `🔖 *Command:* ${pluginInfo.name}`,
      ];
      if (pluginInfo.aliases && pluginInfo.aliases.length) {
        details.push(`🔁 *Aliases:* ${pluginInfo.aliases.join(', ')}`);
      }
      if (pluginInfo.description) {
        details.push(`📝 *Description:* ${pluginInfo.description}`);
      }
      if (pluginInfo.usage) {
        details.push(`⚙️ *Usage:* ${pluginInfo.usage}`);
      }
      // Add flags if present
      const flags = [];
      if (pluginInfo.ownerOnly) flags.push('👑 Owner only');
      if (pluginInfo.modOnly) flags.push('🛡️ Mod only');
      if (pluginInfo.groupOnly) flags.push('👥 Group only');
      if (pluginInfo.privateOnly) flags.push('💬 Private only');
      if (pluginInfo.adminOnly) flags.push('🛡️ Admin only');
      if (pluginInfo.botAdminNeeded) flags.push('🤖 Bot admin needed');
      if (flags.length) {
        details.push(`🚩 *Flags:* ${flags.join(' · ')}`);
      }

      details.push('', '🔄 Restart the bot to load the new command.');

      await sock.sendMessage(extra.from, { text: details.join('\n') }, { quoted: msg });
      await extra.react('✅');
    } catch (error) {
      console.error('Install error:', error);
      await extra.reply(`❌ Installation failed: ${error.message}`);
      await extra.react('❌');
    }
  }
};

/**
 * Naive parser to extract plugin metadata from the exported object.
 * Expects the plugin to follow the standard structure:
 * module.exports = { name: '...', category: '...', ... }
 */
function parsePlugin(content) {
  const info = {};

  // Find module.exports block
  const exportMatch = content.match(/module\.exports\s*=\s*({[\s\S]*?})/);
  if (!exportMatch) return info;

  const objStr = exportMatch[1];

  // Helper to extract string value for a key
  const extractString = (key) => {
    const regex = new RegExp(`${key}\\s*:\\s*['"]([^'"]+)['"]`);
    const match = objStr.match(regex);
    return match ? match[1] : null;
  };

  // Helper to extract boolean
  const extractBoolean = (key) => {
    const regex = new RegExp(`${key}\\s*:\\s*(true|false)`);
    const match = objStr.match(regex);
    return match ? match[1] === 'true' : false;
  };

  // Helper to extract array of strings (for aliases)
  const extractArray = (key) => {
    const regex = new RegExp(`${key}\\s*:\\s*\\[([\\s\\S]*?)\\]`);
    const match = objStr.match(regex);
    if (!match) return [];
    const arrStr = match[1];
    // Extract quoted strings
    const items = [];
    const itemRegex = /['"]([^'"]+)['"]/g;
    let itemMatch;
    while ((itemMatch = itemRegex.exec(arrStr)) !== null) {
      items.push(itemMatch[1]);
    }
    return items;
  };

  info.name = extractString('name');
  info.category = extractString('category');
  info.description = extractString('description');
  info.usage = extractString('usage');
  info.aliases = extractArray('aliases');

  // Flags
  info.ownerOnly = extractBoolean('ownerOnly');
  info.modOnly = extractBoolean('modOnly');
  info.groupOnly = extractBoolean('groupOnly');
  info.privateOnly = extractBoolean('privateOnly');
  info.adminOnly = extractBoolean('adminOnly');
  info.botAdminNeeded = extractBoolean('botAdminNeeded');

  return info;
}
