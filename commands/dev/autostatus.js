const config = require('../../config');

const KEY_VIEW = 'autostatus_view';
const KEY_LIKE = 'autostatus_like';
const KEY_EMOJI = 'autostatus_emoji';

const readState = (db) => {
  const cfg = config.statusSettings || {};
  const view = db.getGlobalSetting(KEY_VIEW);
  const like = db.getGlobalSetting(KEY_LIKE);
  const emoji = db.getGlobalSetting(KEY_EMOJI);

  return {
    autoView: typeof view === 'boolean' ? view : !!cfg.autoView,
    autoLike: typeof like === 'boolean' ? like : !!cfg.autoLike,
    likeEmoji: typeof emoji === 'string' && emoji.trim() ? emoji.trim() : (cfg.likeEmoji || '💚')
  };
};

module.exports = {
  name: 'autostatus',
  aliases: ['statusauto', 'autostory'],
  category: 'dev',
  description: 'Auto view and auto like WhatsApp statuses',
  usage: `${config.prefix}autostatus <on|off|view|like|emoji|status> [emoji]`,
  ownerOnly: true,

  async onMessage(sock, msg, extra) {
    try {
      if (extra.from !== 'status@broadcast' || msg.key.fromMe) return;

      const db = extra.database;
      const state = readState(db);
      if (!state.autoView && !state.autoLike) return;

      if (state.autoView) {
        await sock.readMessages([msg.key]).catch(() => {});
      }

      if (state.autoLike) {
        await sock.sendMessage(extra.from, {
          react: { text: state.likeEmoji, key: msg.key }
        }).catch(() => {});
      }
    } catch {}
  },

  async execute(sock, msg, args, extra) {
    const db = extra.database;
    const sub = String(args[0] || 'status').toLowerCase();
    const state = readState(db);

    if (sub === 'on') {
      db.setGlobalSetting(KEY_VIEW, true);
      db.setGlobalSetting(KEY_LIKE, true);
      return extra.reply(`✅ Auto status view and like enabled.\nEmoji: ${state.likeEmoji}`);
    }

    if (sub === 'off') {
      db.setGlobalSetting(KEY_VIEW, false);
      db.setGlobalSetting(KEY_LIKE, false);
      return extra.reply('✅ Auto status view and like disabled.');
    }

    if (sub === 'view') {
      const next = String(args[1] || '').toLowerCase();
      if (!['on', 'off'].includes(next)) return extra.reply(`❌ Usage: ${config.prefix}autostatus view <on|off>`);
      db.setGlobalSetting(KEY_VIEW, next === 'on');
      return extra.reply(`✅ Auto status view ${next === 'on' ? 'enabled' : 'disabled'}.`);
    }

    if (sub === 'like') {
      const next = String(args[1] || '').toLowerCase();
      if (!['on', 'off'].includes(next)) return extra.reply(`❌ Usage: ${config.prefix}autostatus like <on|off>`);
      db.setGlobalSetting(KEY_LIKE, next === 'on');
      return extra.reply(`✅ Auto status like ${next === 'on' ? 'enabled' : 'disabled'}.`);
    }

    if (sub === 'emoji') {
      const emoji = String(args[1] || '').trim();
      if (!emoji) return extra.reply(`❌ Usage: ${config.prefix}autostatus emoji 💚`);
      db.setGlobalSetting(KEY_EMOJI, emoji);
      return extra.reply(`✅ Auto status like emoji set to ${emoji}`);
    }

    return extra.reply(
      `📊 *Auto Status*\n` +
      `View: ${state.autoView ? 'ON' : 'OFF'}\n` +
      `Like: ${state.autoLike ? 'ON' : 'OFF'}\n` +
      `Emoji: ${state.likeEmoji}\n\n` +
      `${config.prefix}autostatus on\n` +
      `${config.prefix}autostatus off\n` +
      `${config.prefix}autostatus view on\n` +
      `${config.prefix}autostatus like on\n` +
      `${config.prefix}autostatus emoji 💚`
    );
  }
};
