const database = require('../../database');
const config = require('../../config');

const tracker = new Map(); // key -> timestamps[]

const now = () => Date.now();

module.exports = {
  name: 'antispam',
  aliases: ['aspam'],
  category: 'group',
  description: 'Anti-spam rate limit',
  usage: '.antispam <on/off/status/set> ...',
  groupOnly: true,
  adminOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const { from, reply, react } = extra;
      const sub = (args[0] || '').toLowerCase();
      const s = database.getGroupSettings(from);

      if (!sub || sub === 'help') {
        return reply(
          `*AntiSpam*\n\n` +
          `.antispam on/off\n` +
          `.antispam status\n` +
          `.antispam set <limit> <windowSec>\n` +
          `.antispam action warn|delete`
        );
      }

      await react('⏳');

      if (sub === 'on') {
        database.updateGroupSettings(from, { antiSpam: true });
        await reply('✅ AntiSpam enabled.');
      } else if (sub === 'off') {
        database.updateGroupSettings(from, { antiSpam: false });
        await reply('❌ AntiSpam disabled.');
      } else if (sub === 'status') {
        await reply(
          `*AntiSpam Status*\n\n` +
          `Enabled: ${s.antiSpam ? '✅' : '❌'}\n` +
          `Limit: ${s.antiSpamLimit || 6}\n` +
          `Window: ${s.antiSpamWindowSec || 8}s\n` +
          `Action: ${(s.antiSpamAction || 'warn')}`
        );
      } else if (sub === 'set') {
        const limit = parseInt(args[1], 10);
        const windowSec = parseInt(args[2], 10);
        if (!Number.isFinite(limit) || limit < 2 || limit > 30 || !Number.isFinite(windowSec) || windowSec < 2 || windowSec > 60) {
          return reply('❌ Usage: .antispam set <limit 2-30> <windowSec 2-60>\nExample: .antispam set 6 8');
        }
        database.updateGroupSettings(from, { antiSpamLimit: limit, antiSpamWindowSec: windowSec });
        await reply(`✅ AntiSpam updated: ${limit} msgs / ${windowSec}s`);
      } else if (sub === 'action') {
        const action = (args[1] || '').toLowerCase();
        if (!['warn', 'delete'].includes(action)) return reply('❌ Usage: .antispam action warn|delete');
        database.updateGroupSettings(from, { antiSpamAction: action });
        await reply(`✅ AntiSpam action set to: ${action}`);
      } else {
        await reply('❌ Unknown option. Type: .antispam help');
      }

      await react('✅');
    } catch (e) {
      await extra.reply(`❌ ${e.message}`);
      await extra.react('❌');
    }
  },

  async handleMessage(sock, msg, extra) {
    try {
      if (!extra.isGroup) return;
      const from = extra.from;
      const sender = extra.sender;
      const s = database.getGroupSettings(from);
      if (!s.antiSpam) return;
      if (!sender || msg.key.fromMe) return;

      // skip command messages
      const content = extra.utils?.getMessageContent ? extra.utils.getMessageContent(msg) : msg.message;
      const text =
        content?.conversation ||
        content?.extendedTextMessage?.text ||
        content?.imageMessage?.caption ||
        content?.videoMessage?.caption ||
        '';
      if (text && text.trim().startsWith(config.prefix || '.')) return;

      const limit = s.antiSpamLimit || 6;
      const windowMs = (s.antiSpamWindowSec || 8) * 1000;
      const key = `${from}|${sender}`;

      const ts = tracker.get(key) || [];
      const t = now();
      const filtered = ts.filter(x => t - x < windowMs);
      filtered.push(t);
      tracker.set(key, filtered);

      if (filtered.length < limit) return;

      // enforce
      const action = (s.antiSpamAction || 'warn').toLowerCase();
      try {
        await sock.sendMessage(from, { delete: msg.key });
      } catch {}

      if (action === 'warn') {
        const warnData = database.addWarning(from, sender, 'Spam');
        const maxWarnings = config.maxWarnings || 3;
        const botIsAdmin = !!extra.isBotAdmin;
        if (warnData.count >= maxWarnings && botIsAdmin) {
          try { await sock.groupParticipantsUpdate(from, [sender], 'remove'); } catch {}
        }
      }
    } catch {
      // ignore
    }
  }
};
