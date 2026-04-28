const database = require('../../database');

const getNumber = (jid) => (typeof jid === 'string' ? jid.split('@')[0] : '');

const parseCodes = (input) =>
  input
    .split(',')
    .map(s => s.trim().replace(/^\+/, ''))
    .filter(Boolean);

module.exports = {
  name: 'antifake',
  aliases: ['afake'],
  category: 'group',
  description: 'Kick new members not matching allowed country codes',
  usage: '.antifake <on/off/status/set> ...',
  groupOnly: true,
  adminOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const { from, reply, react } = extra;
      const sub = (args[0] || '').toLowerCase();
      const s = database.getGroupSettings(from);

      if (!sub || sub === 'help') {
        return reply(
          `*AntiFake*\n\n` +
          `.antifake on/off\n` +
          `.antifake status\n` +
          `.antifake set <codes>\n` +
          `Example: .antifake set 92,1`
        );
      }

      await react('⏳');

      if (sub === 'on') {
        database.updateGroupSettings(from, { antifake: true });
        await reply('✅ AntiFake enabled.');
      } else if (sub === 'off') {
        database.updateGroupSettings(from, { antifake: false });
        await reply('❌ AntiFake disabled.');
      } else if (sub === 'status') {
        const codes = Array.isArray(s.antifakeAllowedCodes) ? s.antifakeAllowedCodes : [];
        await reply(
          `*AntiFake Status*\n\n` +
          `Enabled: ${s.antifake ? '✅' : '❌'}\n` +
          `Allowed codes: ${codes.length ? codes.join(', ') : 'none (set codes first)'}`
        );
      } else if (sub === 'set') {
        const codes = parseCodes(args.slice(1).join(' '));
        if (!codes.length) return reply('❌ Usage: .antifake set 92,1');
        database.updateGroupSettings(from, { antifakeAllowedCodes: codes });
        await reply(`✅ Allowed codes set: ${codes.join(', ')}`);
      } else {
        await reply('❌ Unknown option. Type: .antifake help');
      }

      await react('✅');
    } catch (e) {
      await extra.reply(`❌ ${e.message}`);
      await extra.react('❌');
    }
  },

  async handleGroupUpdate(sock, update, extra) {
    try {
      const { id, participants, action } = update;
      if (action !== 'add') return;
      const s = database.getGroupSettings(id);
      if (!s.antifake) return;

      const allowed = Array.isArray(s.antifakeAllowedCodes) ? s.antifakeAllowedCodes : [];
      if (!allowed.length) return;

      const groupMetadata = extra.groupMetadata;
      if (!groupMetadata) return;

      const botId = sock.user?.id ? sock.user.id.split(':')[0] : null;
      const botJid = botId ? `${botId}@s.whatsapp.net` : null;
      const botIsAdmin = botJid
        ? groupMetadata.participants?.some(p => (p.id || p.jid) === botJid && (p.admin === 'admin' || p.admin === 'superadmin'))
        : false;
      if (!botIsAdmin) return;

      for (const p of participants || []) {
        const jid = typeof p === 'string' ? p : (p.id || p.jid || p.participant);
        const num = getNumber(jid);
        if (!num) continue;
        const ok = allowed.some(code => num.startsWith(String(code)));
        if (!ok) {
          try { await sock.groupParticipantsUpdate(id, [jid], 'remove'); } catch {}
        }
      }
    } catch {
      // ignore
    }
  }
};

