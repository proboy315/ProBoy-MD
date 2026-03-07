// commands/owner/install.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const config = require('../../config');

// Allowed categories (must match subfolder names in commands/)
const validCategories = [
  'admin', 'ai', 'anime', 'fun', 'general',
  'group', 'media', 'owner', 'textmaker', 'utility'
];

/**
 * Convert a GitHub Gist URL to its raw content URL.
 * Example: https://gist.github.com/user/123abc → https://gist.githubusercontent.com/user/123abc/raw
 */
function gistToRawUrl(gistUrl) {
  try {
    const url = new URL(gistUrl);
    if (url.hostname === 'gist.github.com') {
      const pathParts = url.pathname.split('/').filter(p => p);
      if (pathParts.length >= 2) {
        // pathParts = [username, gistId, ...]
        const user = pathParts[0];
        const gistId = pathParts[1];
        return `https://gist.githubusercontent.com/${user}/${gistId}/raw`;
      }
    }
    // If it's already a raw URL or other, return as is
    return gistUrl;
  } catch {
    return gistUrl;
  }
}

module.exports = {
  name: 'install',
  aliases: ['plugin', 'addplugin'],
  category: 'owner',
  description: 'Install a plugin from a GitHub Gist URL or by replying to a plugin file',
  usage: '.install <gist_url>  OR  reply to a .js file with .install',
  ownerOnly: true, // Only owners can install plugins (file system access)

  async execute(sock, msg, args, extra) {
    try {
      let content = null;
      let method = null;

      // --- Method 1: URL from arguments ---
      if (args.length > 0) {
        const inputUrl = args[0].trim();
        const rawUrl = gistToRawUrl(inputUrl);
        method = 'url';
        await extra.react('⏳');

        const response = await axios.get(rawUrl, {
          timeout: 15000,
          headers: { 'User-Agent': 'ProBoy-MD-Installer' }
        });
        content = response.data;
      }
      // --- Method 2: Reply to a file message ---
      else {
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quoted) {
          return extra.reply('❌ Please reply to a `.js` file or provide a Gist URL.\n' + this.usage);
        }
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

        // Download the file using Baileys' official function
        const buffer = await downloadMediaMessage(
          { key: msg.key, message: quoted },
          'buffer',
          {},
          { logger: undefined, reuploadRequest: sock.updateMediaMessage }
        );
        content = buffer.toString('utf8');
      }

      if (!content) throw new Error('Failed to retrieve plugin content.');

      // --- Parse plugin metadata ---
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

      // Create folder if it doesn't exist
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // Write file
      fs.writeFileSync(targetFile, content, 'utf8');

      // Build success message with extracted details
      const details = [
        '✅ *Plugin installed successfully!*',
        '',
        `📁 *Category:* ${pluginInfo.category}`,
        `📄 *Filename:* ${pluginInfo.name}.js`,
        `🔖 *Command:* ${pluginInfo.name}`,
      ];
      if (pluginInfo.aliases?.length) {
        details.push(`🔁 *Aliases:* ${pluginInfo.aliases.join(', ')}`);
      }
      if (pluginInfo.description) {
        details.push(`📝 *Description:* ${pluginInfo.description}`);
      }
      if (pluginInfo.usage) {
        details.push(`⚙️ *Usage:* ${pluginInfo.usage}`);
      }
      const flags = [];
      if (pluginInfo.ownerOnly) flags.push('👑 Owner only');
      if (pluginInfo.modOnly) flags.push('🛡️ Mod only');
      if (pluginInfo.groupOnly) flags.push('👥 Group only');
      if (pluginInfo.privateOnly) flags.push('💬 Private only');
      if (pluginInfo.adminOnly) flags.push('🛡️ Admin only');
      if (pluginInfo.botAdminNeeded) flags.push('🤖 Bot admin needed');
      if (flags.length) details.push(`🚩 *Flags:* ${flags.join(' · ')}`);

      details.push('', '🔄 Restart the bot to load the new command.');

      await sock.sendMessage(extra.from, { text: details.join('\n') }, { quoted: msg });
      await extra.react('✅');

    } catch (error) {
      console.error('Install error:', error);
      let errorMsg = '❌ Installation failed: ';
      if (error.response) {
        errorMsg += `HTTP ${error.response.status} – ${error.response.statusText}`;
      } else {
        errorMsg += error.message;
      }
      await extra.reply(errorMsg);
      await extra.react('❌');
    }
  }
};

/**
 * Naive parser to extract plugin metadata from the exported object.
 * Expects the plugin to follow: module.exports = { name: '...', category: '...', ... }
 */
function parsePlugin(content) {
  const info = {};

  // Find module.exports block
  const exportMatch = content.match(/module\.exports\s*=\s*({[\s\S]*?})/);
  if (!exportMatch) return info;

  const objStr = exportMatch[1];

  // Helper to extract string value
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

  // Helper to extract array of strings (aliases)
  const extractArray = (key) => {
    const regex = new RegExp(`${key}\\s*:\\s*\\[([\\s\\S]*?)\\]`);
    const match = objStr.match(regex);
    if (!match) return [];
    const arrStr = match[1];
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
