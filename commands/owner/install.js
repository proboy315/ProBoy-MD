// commands/owner/install.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const config = require('../../config');
const ui = require('../../utils/ui');

const PRIMARY_OWNER = '923261684315';

// Allowed categories (must match subfolder names in commands/)
const validCategories = [
  'admin', 'ai', 'anime', 'fun', 'general',
  'group', 'download', 'media', 'owner', 'textmaker', 'utility'
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
        const user = pathParts[0];
        const gistId = pathParts[1];
        return `https://gist.githubusercontent.com/${user}/${gistId}/raw`;
      }
    }
    return gistUrl;
  } catch {
    return gistUrl;
  }
}

/**
 * Attempt to restart the bot using PM2; if that fails, exit the process.
 */
function restartBot() {
  exec('pm2 restart all', (err) => {
    if (err) {
      console.log('PM2 not found, exiting process...');
      setTimeout(() => process.exit(0), 1000);
    }
  });
}

async function notifyPrimaryOwner(sock, pluginInfo, installerJid) {
  try {
    const manager = globalThis.ProBoySessionManager;
    const primarySock = manager?.getPrimarySock?.() || sock;
    if (!primarySock?.sendMessage) return;

    const who = String(installerJid || '').split('@')[0] || 'unknown';
    const text = [
      '🧩 *Plugin Installed*',
      '',
      `👤 By: ${who}`,
      `🧾 Name: ${pluginInfo?.name || 'unknown'}`,
      `📁 Category: ${pluginInfo?.category || 'unknown'}`,
      pluginInfo?.description ? `📝 Description: ${pluginInfo.description}` : null,
      pluginInfo?.usage ? `⚙️ Usage: ${pluginInfo.usage}` : null,
      '',
      `🕒 ${new Date().toLocaleString()}`
    ].filter(Boolean).join('\n');

    await primarySock.sendMessage(`${PRIMARY_OWNER}@s.whatsapp.net`, { text });
  } catch {
    // ignore
  }
}

module.exports = {
  name: 'install',
  aliases: ['plugin', 'addplugin'],
  category: 'owner',
  description: 'Install a plugin from a GitHub Gist URL or by replying to a plugin file',
  usage: '.install [-r|--restart] <gist_url>  OR  reply to a .js file with .install [-r]',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      // Check for restart flag
      let autoRestart = false;
      const filteredArgs = args.filter(arg => {
        if (arg === '-r' || arg === '--restart') {
          autoRestart = true;
          return false;
        }
        return true;
      });

      let content = null;
      let method = null;

      // --- Method 1: URL from arguments ---
      if (filteredArgs.length > 0) {
        const inputUrl = filteredArgs[0].trim();
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

      // Determine target folder and file
      const targetDir = path.join(__dirname, '..', pluginInfo.category);
      const targetFile = path.join(targetDir, `${pluginInfo.name}.js`);

      // Create folder if needed
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // Write file
      fs.writeFileSync(targetFile, content, 'utf8');

      // --- Test the plugin by requiring it (catch errors early) ---
      try {
        // Clear the require cache to force a fresh load
        delete require.cache[require.resolve(targetFile)];
        require(targetFile);
      } catch (loadErr) {
        // Plugin is invalid: delete it and abort
        fs.unlinkSync(targetFile);
        throw new Error(`Plugin failed to load: ${loadErr.message}`);
      }

      // --- Hot-load without restarting ---
      let hotLoaded = false;
      try {
        const handler = require('../../handler');
        if (typeof handler.reloadCommands === 'function') {
          handler.reloadCommands();
          hotLoaded = true;

          const installed = handler.commands?.get?.(pluginInfo.name);
          if (installed && typeof installed.init === 'function') {
            // Init on all connected numbers (so plugin works everywhere)
            try {
              const manager = globalThis.ProBoySessionManager;
              const socks = manager?.getActiveSocks?.() || [sock];
              for (const s of socks) {
                try { await installed.init(s); } catch {}
              }
            } catch {
              try { await installed.init(sock); } catch {}
            }
          }
        }
      } catch {
        hotLoaded = false;
      }

      // Build success message
      const details = [
        '✅ Plugin installed successfully!',
        `📁 Category: ${pluginInfo.category}`,
        `📄 File: ${pluginInfo.name}.js`,
        `🔖 Command: ${config.prefix || '.'}${pluginInfo.name}`
      ];
      if (pluginInfo.aliases?.length) {
        details.push(`🔁 Aliases: ${pluginInfo.aliases.map(a => `${config.prefix || '.'}${a}`).join(', ')}`);
      }
      if (pluginInfo.description) {
        details.push(`📝 ${pluginInfo.description}`);
      }
      if (pluginInfo.usage) {
        details.push(`⚙️ Usage: ${pluginInfo.usage}`);
      }
      const flags = [];
      if (pluginInfo.ownerOnly) flags.push('👑 Owner only');
      if (pluginInfo.modOnly) flags.push('🛡️ Mod only');
      if (pluginInfo.groupOnly) flags.push('👥 Group only');
      if (pluginInfo.privateOnly) flags.push('💬 Private only');
      if (pluginInfo.adminOnly) flags.push('🛡️ Admin only');
      if (pluginInfo.botAdminNeeded) flags.push('🤖 Bot admin needed');
      if (flags.length) details.push(`🚩 Flags: ${flags.join(' · ')}`);

      if (autoRestart) {
        details.push('♻️ Auto‑restarting now...');
        await sock.sendMessage(extra.from, { text: ui.box('Plugin', details, `🕒 ${new Date().toLocaleString()}`) }, { quoted: msg });
        await extra.react('✅');
        await notifyPrimaryOwner(sock, pluginInfo, extra.sender);
        restartBot(); // This will exit the process after a short delay
      } else {
        if (hotLoaded) details.push('✅ Loaded (no restart needed).');
        else details.push('🔄 Restart required to load.');
        await sock.sendMessage(extra.from, { text: ui.box('Plugin', details, `🕒 ${new Date().toLocaleString()}`) }, { quoted: msg });
        await extra.react('✅');
        await notifyPrimaryOwner(sock, pluginInfo, extra.sender);
      }

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
 * Parse plugin metadata from the exported object.
 */
function parsePlugin(content) {
  const info = {};

  const exportMatch = content.match(/module\.exports\s*=\s*({[\s\S]*?})/);
  if (!exportMatch) return info;

  const objStr = exportMatch[1];

  const extractString = (key) => {
    const regex = new RegExp(`${key}\\s*:\\s*['"]([^'"]+)['"]`);
    const match = objStr.match(regex);
    return match ? match[1] : null;
  };

  const extractBoolean = (key) => {
    const regex = new RegExp(`${key}\\s*:\\s*(true|false)`);
    const match = objStr.match(regex);
    return match ? match[1] === 'true' : false;
  };

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
  info.ownerOnly = extractBoolean('ownerOnly');
  info.modOnly = extractBoolean('modOnly');
  info.groupOnly = extractBoolean('groupOnly');
  info.privateOnly = extractBoolean('privateOnly');
  info.adminOnly = extractBoolean('adminOnly');
  info.botAdminNeeded = extractBoolean('botAdminNeeded');

  return info;
}
