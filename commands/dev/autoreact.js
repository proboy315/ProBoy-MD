// commands/utility/autoreact.js
const config = require('../../config');

// Database keys for global settings
const KEY_ENABLED = 'autoreact_enabled';
const KEY_EMOJI = 'autoreact_emoji';

let enabled = false;
let emoji = '🌹';
let dbRef = null;

// ─── Load/Save ───────────────────────────────────────
function loadFromDB(db) {
  try {
    const val = db.getGlobalSetting(KEY_ENABLED);
    if (typeof val === 'boolean') enabled = val;
    else if (typeof val === 'string') enabled = (val === 'true'); // fallback
  } catch (_) {}
  try {
    const e = db.getGlobalSetting(KEY_EMOJI);
    if (typeof e === 'string' && e.length) emoji = e;
  } catch (_) {}
}

function saveToDB(db) {
  try { db.setGlobalSetting(KEY_ENABLED, enabled); } catch (_) {}
  try { db.setGlobalSetting(KEY_EMOJI, emoji); } catch (_) {}
}

module.exports = {
  name: 'autoreact',
  aliases: ['areact', 'autoreact'],
  category: 'dev',
  description: 'Auto‑react to every incoming message with a chosen emoji',
  usage: `${config.prefix}autoreact <on|off|set|status>`,
  ownerOnly: true,

  // ▸ onMessage hook
  async onMessage(sock, msg, extra) {
    try {
      if (extra.database !== dbRef) {
        dbRef = extra.database;
        loadFromDB(dbRef);
      }
      if (enabled && extra.react) await extra.react(emoji);
    } catch (_) {}
  },

  // ▸ execute
  async execute(sock, msg, args, extra) {
    try {
      if (extra.database !== dbRef) {
        dbRef = extra.database;
        loadFromDB(dbRef);
      }
      const sub = args[0]?.toLowerCase();

      if (!sub || !['on', 'off', 'set', 'status'].includes(sub)) {
        return extra.reply(
          `❌ *Usage:* ${this.usage}\n\n` +
          `🟢 \`on\`      - Turn ON\n` +
          `🔴 \`off\`     - Turn OFF\n` +
          `✨ \`set 👍\`   - Change emoji\n` +
          `📊 \`status\`  - Show status`
        );
      }

      switch (sub) {
        case 'on':
          if (enabled) return extra.reply('⚠️ Already ON.');
          enabled = true;
          saveToDB(extra.database);
          await extra.react('🟢');
          return extra.reply(`✅ Auto‑react ON — ${emoji}`);

        case 'off':
          if (!enabled) return extra.reply('⚠️ Already OFF.');
          enabled = false;
          saveToDB(extra.database);
          await extra.react('🔴');
          return extra.reply('✅ Auto‑react OFF');

        case 'set':
          if (!args[1]) return extra.reply(`❌ Provide an emoji.\nUsage: ${config.prefix}autoreact set 👍`);
          emoji = args[1];
          saveToDB(extra.database);
          if (enabled) await extra.react(emoji);
          return extra.reply(`✅ Emoji changed → ${emoji}`);

        case 'status':
          return extra.reply(
            `📊 *Auto‑React Status*\n• State: ${enabled ? '🟢 ON' : '🔴 OFF'}\n• Emoji: ${emoji}`
          );
      }
    } catch (error) {
      console.error('[autoreact]', error);
      await extra.reply(`❌ ${error.message}`);
    }
  }
};
