const database = require('../../database');
const config = require('../../config');

const cleanWord = (w) => String(w || '').trim().toLowerCase();

const extractText = (content) =>
  content?.conversation ||
  content?.extendedTextMessage?.text ||
  content?.imageMessage?.caption ||
  content?.videoMessage?.caption ||
  '';

module.exports = {
  name: 'antibadword',
  aliases: ['badword', 'abw'],
  category: 'group',
  description: 'Detect bad words and act',
  usage: '.antibadword <on/off/status/action/add/del/list/clear>',
  groupOnly: true,
  adminOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const { from, reply, react } = extra;
      const sub = (args[0] || '').toLowerCase();
      const s = database.getGroupSettings(from);
      const list = Array.isArray(s.badwords) ? s.badwords : [];

      if (!sub || sub === 'help') {
        return reply(
          `*AntiBadWord*\n\n` +
          `.antibadword on/off\n` +
          `.antibadword status\n` +
          `.antibadword action warn|delete\n` +
          `.antibadword add <word>\n` +
          `.antibadword del <word>\n` +
          `.antibadword list\n` +
          `.antibadword clear`
        );
      }

      await react('⏳');

      if (sub === 'on') {
        database.updateGroupSettings(from, { antibadword: true });
        await reply('✅ AntiBadWord enabled.');
      } else if (sub === 'off') {
        database.updateGroupSettings(from, { antibadword: false });
        await reply('❌ AntiBadWord disabled.');
      } else if (sub === 'status') {
        await reply(
          `*AntiBadWord Status*\n\n` +
          `Enabled: ${s.antibadword ? '✅' : '❌'}\n` +
          `Action: ${(s.antibadwordAction || 'warn')}\n` +
          `Words: ${list.length}`
        );
      } else if (sub === 'action') {
        const action = (args[1] || '').toLowerCase();
        if (!['warn', 'delete'].includes(action)) return reply('❌ Usage: .antibadword action warn|delete');
        database.updateGroupSettings(from, { antibadwordAction: action });
        await reply(`✅ Action set to: ${action}`);
      } else if (sub === 'add') {
        const w = cleanWord(args.slice(1).join(' '));
        if (!w) return reply('❌ Usage: .antibadword add <word>');
        const next = Array.from(new Set([...list, w]));
        database.updateGroupSettings(from, { badwords: next });
        await reply(`✅ Added: ${w}`);
      } else if (sub === 'del' || sub === 'remove') {
        const w = cleanWord(args.slice(1).join(' '));
        if (!w) return reply('❌ Usage: .antibadword del <word>');
        const next = list.filter(x => x !== w);
        database.updateGroupSettings(from, { badwords: next });
        await reply(`✅ Removed: ${w}`);
      } else if (sub === 'list') {
        await reply(list.length ? `✅ Badwords:\n- ${list.join('\n- ')}` : 'ℹ️ Badwords list is empty.');
      } else if (sub === 'clear') {
        database.updateGroupSettings(from, { badwords: [] });
        await reply('✅ Badwords cleared.');
      } else {
        await reply('❌ Unknown option. Type: .antibadword help');
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
      if (!s.antibadword) return;
      if (!sender || msg.key.fromMe) return;

      const content = extra.utils?.getMessageContent ? extra.utils.getMessageContent(msg) : msg.message;
      const text = String(extractText(content) || '').toLowerCase();
      if (!text) return;

      const bad = Array.isArray(s.badwords) ? s.badwords : [];
      if (!bad.length) return;

      const hit = bad.find(w => w && text.includes(String(w).toLowerCase()));
      if (!hit) return;

      const action = (s.antibadwordAction || 'warn').toLowerCase();

      if (action === 'delete') {
        try { await sock.sendMessage(from, { delete: msg.key }); } catch {}
        return;
      }

      // warn
      try { await sock.sendMessage(from, { delete: msg.key }); } catch {}
      const warnData = database.addWarning(from, sender, `Badword: ${hit}`);
      const maxWarnings = config.maxWarnings || 3;
      const botIsAdmin = !!extra.isBotAdmin;
      if (warnData.count >= maxWarnings && botIsAdmin) {
        try { await sock.groupParticipantsUpdate(from, [sender], 'remove'); } catch {}
      }
    } catch {
      // ignore
    }
  }
};
