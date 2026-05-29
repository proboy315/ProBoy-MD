const config = require('../../config');
const fs = require('fs');
const path = require('path');

// ─── Database Keys ──────────────────────────────────
const KEY_ENABLED = 'firstmsg_enabled';
const KEY_MESSAGE = 'firstmsg_message';
const KEY_GREETED = 'firstmsg_greeted';

const pendingGreets = new Set();

// ─── Helpers ────────────────────────────────────────
function loadState(db) {
  const enabled = db.getGlobalSetting(KEY_ENABLED) === true;
  const message = db.getGlobalSetting(KEY_MESSAGE) || '';
  let greeted = [];
  try {
    const arr = db.getGlobalSetting(KEY_GREETED);
    if (Array.isArray(arr)) greeted = arr;
  } catch {}
  return { enabled, message, greeted };
}

function saveGreeted(db, sender, greeted) {
  if (!greeted.includes(sender)) {
    greeted.push(sender);
    db.setGlobalSetting(KEY_GREETED, greeted);
  }
}

/**
 * Extract the raw message text after the command and 'set'.
 * Works even if there is a space after the prefix (e.g. ". firstmessage set").
 * Preserves newlines and any formatting.
 */
function getRawText(cmdName, body) {
  const prefix = config.prefix;
  // Find the first occurrence of the prefix
  const prefixIdx = body.indexOf(prefix);
  if (prefixIdx === -1) return '';

  // Remove everything up to and including the prefix
  let rest = body.slice(prefixIdx + prefix.length).replace(/^\s+/, ''); // leading spaces

  // First word is the command name
  const cmdMatch = rest.match(/^(\S+)/);
  if (!cmdMatch) return '';
  const foundCmd = cmdMatch[1];
  if (foundCmd.toLowerCase() !== cmdName.toLowerCase()) return '';

  // Remove command name and any whitespace after it
  rest = rest.slice(foundCmd.length).replace(/^\s+/, '');

  // Now 'rest' should either start with 'set' (and after that the message)
  if (/^set\b/i.test(rest)) {
    rest = rest.slice(3).replace(/^\s+/, ''); // remove 'set' and its following spaces
    return rest;
  }

  // 'set' not present – shouldn't happen for set command
  return '';
}

module.exports = {
  name: 'firstmessage',
  aliases: ['firstmsg', 'greet', 'welcomemsg'],
  category: 'utility',
  description: 'Send a customizable auto‑reply to first‑time private messages (newline friendly)',
  usage: `${config.prefix}firstmessage <on|off|set|status|reset>`,
  ownerOnly: true,

  // ▸ handleMessage – called for EVERY incoming message
  async handleMessage(sock, msg, extra) {
    try {
      if (msg.key.fromMe) return;
      if (extra.isGroup) return;
      if (!extra.sender) return;

      const db = extra.database;
      const { enabled, message, greeted } = loadState(db);
      if (!enabled) return;
      if (greeted.includes(extra.sender) || pendingGreets.has(extra.sender)) return;

      pendingGreets.add(extra.sender);
      try {
        const botName = config.botName || 'ProBoy-MD';
        const newsletterJid = config.newsletterJid || '120363161513685998@newsletter';
        const caption = message || `👋 Hello! Welcome to ${botName}.`;

        const contextInfo = {
          forwardingScore: 1,
          isForwarded: true,
          forwardedNewsletterMessageInfo: {
            newsletterJid,
            newsletterName: botName,
            serverMessageId: -1
          }
        };

        // Image: local bot_image.jpg first, fallback to profile picture
        const imagePath = path.join(__dirname, '../../utils/bot_image.jpg');
        let image = null;
        if (fs.existsSync(imagePath)) {
          image = fs.readFileSync(imagePath);
        } else {
          try {
            image = { url: await sock.profilePictureUrl(sock.user.id, 'image') };
          } catch {}
        }

        if (image) {
          await sock.sendMessage(extra.from, {
            image,
            caption,
            contextInfo,
            mentions: [extra.sender]
          }, { quoted: msg });
        } else {
          await sock.sendMessage(extra.from, {
            text: caption,
            contextInfo,
            mentions: [extra.sender]
          }, { quoted: msg });
        }

        saveGreeted(db, extra.sender, greeted);
      } finally {
        pendingGreets.delete(extra.sender);
      }
    } catch (_) {}
  },

  // ▸ execute – manual controls
  async execute(sock, msg, args, extra) {
    try {
      const db = extra.database;
      const { enabled, message, greeted } = loadState(db);

      const sub = (args[0] || '').toLowerCase();
      if (!sub || !['on', 'off', 'set', 'status', 'reset'].includes(sub)) {
        return extra.reply(
          `❌ *Usage:* ${this.usage}\n\n` +
          `🟢 \`on\`         – Enable first‑message\n` +
          `🔴 \`off\`        – Disable it\n` +
          `✏️ \`set <msg>\`   – Set greeting (multi‑line OK)\n` +
          `📊 \`status\`     – Show current state\n` +
          `🔄 \`reset\`      – Clear greeted list`
        );
      }

      switch (sub) {
        case 'on':
          if (enabled) return extra.reply('⚠️ Already ON.');
          db.setGlobalSetting(KEY_ENABLED, true);
          await extra.react('🟢');
          return extra.reply('✅ First message enabled.');

        case 'off':
          if (!enabled) return extra.reply('⚠️ Already OFF.');
          db.setGlobalSetting(KEY_ENABLED, false);
          await extra.react('🔴');
          return extra.reply('✅ First message disabled.');

        case 'set': {
          // Get full raw message body (conversation / extendedTextMessage)
          const msgContent = extra.utils.getMessageContent(msg);
          const body = msgContent?.conversation || msgContent?.extendedTextMessage?.text || '';

          // Try main command name + all aliases
          let raw = getRawText(this.name, body);
          if (!raw) {
            for (const alias of (this.aliases || [])) {
              raw = getRawText(alias, body);
              if (raw) break;
            }
          }
          // Final fallback (only if raw is completely empty)
          if (!raw) {
            raw = args.slice(1).join(' '); // this one will lose newlines, but shouldn't happen now
          }
          if (!raw.trim()) return extra.reply('❌ Please provide a message.');

          db.setGlobalSetting(KEY_MESSAGE, raw);
          await extra.react('✏️');
          return extra.reply(`✅ Greeting set to:\n\`\`\`\n${raw}\n\`\`\``);
        }

        case 'status':
          return extra.reply(
            `📊 *First Message Status*\n` +
            `• State  : ${enabled ? '🟢 ON' : '🔴 OFF'}\n` +
            `• Message:\n\`\`\`\n${message || '(default)'}\n\`\`\`\n` +
            `• Greeted: ${greeted.length} users`
          );

        case 'reset':
          db.setGlobalSetting(KEY_GREETED, []);
          pendingGreets.clear();
          await extra.react('🔄');
          return extra.reply('✅ Greeted list cleared.');
      }
    } catch (error) {
      console.error('[firstmessage]', error);
      await extra.reply(`❌ ${error.message}`);
    }
  }
};