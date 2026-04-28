const database = require('../../database');
const config = require('../../config');

const parseMentionOrQuoted = (msg) => {
  const ctx =
    msg.message?.extendedTextMessage?.contextInfo ||
    msg.message?.imageMessage?.contextInfo ||
    msg.message?.videoMessage?.contextInfo ||
    null;

  const mentioned = ctx?.mentionedJid || [];
  if (mentioned.length) return mentioned[0];

  const quoted = ctx?.participant;
  if (quoted) return quoted;

  return null;
};

const parseDurationMs = (s) => {
  const raw = String(s || '').trim().toLowerCase();
  if (!raw) return null;
  const m = raw.match(/^(\d+)(s|m|h|d)$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2];
  const mult = unit === 's' ? 1000 : unit === 'm' ? 60000 : unit === 'h' ? 3600000 : 86400000;
  return n * mult;
};

const ensureMuted = (settings) => {
  if (!settings.mutedUsers || typeof settings.mutedUsers !== 'object') settings.mutedUsers = {};
  return settings.mutedUsers;
};

module.exports = {
  name: 'warn',
  aliases: ['unwarn', 'warnings', 'mute', 'unmute', 'tagall', 'kickall'],
  category: 'group',
  description: 'Moderation commands (warn/mute/tagall/kickall)',
  usage: '.warn/.unwarn/.warnings | .mute/.unmute | .tagall | .kickall confirm',
  groupOnly: true,
  adminOnly: true,

  async execute(sock, msg, args, extra) {
    const { from, sender, reply, react, groupMetadata, commandName } = extra;
    const invoked = (commandName || '').toLowerCase();

    try {
      await react('⏳');

      // ============ WARN / UNWARN / WARNINGS ============
      if (invoked === 'warn' || invoked === 'unwarn' || invoked === 'warnings') {
        if (invoked === 'warnings') {
          const target = parseMentionOrQuoted(msg) || sender;
          const data = database.getWarnings(from, target);
          const lines = data.warnings.map((w, i) => `- ${i + 1}. ${w.reason}`).slice(-10);
          await reply(`*Warnings for @${target.split('@')[0]}*\nCount: ${data.count}\n\n${lines.length ? lines.join('\n') : 'No warnings.'}`);
          return react('✅');
        }

        const target = parseMentionOrQuoted(msg);
        if (!target) return reply('❌ Mention a user or reply to their message.');

        if (invoked === 'unwarn') {
          const ok = database.removeWarning(from, target);
          await reply(ok ? '✅ Removed 1 warning.' : 'ℹ️ No warnings to remove.');
          return react('✅');
        }

        const reason = args.slice(1).join(' ').trim() || 'No reason';
        const data = database.addWarning(from, target, reason);
        const maxWarnings = config.maxWarnings || 3;
        const botIsAdmin = await extra.isBotAdmin(sock, from);

        await sock.sendMessage(from, {
          text: `⚠️ Warning for @${target.split('@')[0]}\nReason: ${reason}\nCount: ${data.count}/${maxWarnings}`,
          mentions: [target]
        }, { quoted: msg });

        if (data.count >= maxWarnings && botIsAdmin) {
          try { await sock.groupParticipantsUpdate(from, [target], 'remove'); } catch {}
        }
        return react('✅');
      }

      // ============ MUTE / UNMUTE ============
      if (invoked === 'mute' || invoked === 'unmute') {
        const target = parseMentionOrQuoted(msg);
        if (!target) return reply('❌ Mention a user or reply to their message.');

        const settings = database.getGroupSettings(from);
        const muted = ensureMuted(settings);

        if (invoked === 'unmute') {
          delete muted[target];
          database.updateGroupSettings(from, { mutedUsers: muted });
          await reply(`✅ Unmuted @${target.split('@')[0]}`);
          return react('✅');
        }

        const dur = parseDurationMs(args[1]) || 10 * 60 * 1000;
        const until = Date.now() + dur;
        muted[target] = until;
        database.updateGroupSettings(from, { mutedUsers: muted });
        await reply(`✅ Muted @${target.split('@')[0]} for ${Math.round(dur / 60000)} min`);
        return react('✅');
      }

      // ============ TAGALL ============
      if (invoked === 'tagall') {
        const members = groupMetadata?.participants?.map(p => p.id || p.jid).filter(Boolean) || [];
        const message = args.join(' ').trim() || 'Tagall';
        await sock.sendMessage(from, { text: message, mentions: members }, { quoted: msg });
        return react('✅');
      }

      // ============ KICKALL (Owner only) ============
      if (invoked === 'kickall') {
        const confirm = (args[0] || '').toLowerCase() === 'confirm' || (args[1] || '').toLowerCase() === 'confirm';
        if (!confirm) return reply('❌ Usage: .kickall confirm');
        const botIsAdmin = !!extra.isBotAdmin;
        if (!botIsAdmin) return reply(config.messages.botAdminNeeded || 'Bot must be admin.');

        const participants = groupMetadata?.participants || [];
        const toKick = participants
          .filter(p => !(p.admin === 'admin' || p.admin === 'superadmin'))
          .map(p => p.id || p.jid)
          .filter(Boolean);

        const chunkSize = 5;
        for (let i = 0; i < toKick.length; i += chunkSize) {
          const chunk = toKick.slice(i, i + chunkSize);
          try { await sock.groupParticipantsUpdate(from, chunk, 'remove'); } catch {}
        }

        await reply(`✅ Kicked: ${toKick.length}`);
        return react('✅');
      }

      await reply('❌ Unknown moderation command.');
      await react('❌');
    } catch (e) {
      await reply(`❌ ${e.message}`);
      await react('❌');
    }
  },

  async handleMessage(sock, msg, extra) {
    try {
      if (!extra.isGroup) return;
      const from = extra.from;
      const sender = extra.sender;
      if (!sender || msg.key.fromMe) return;

      const settings = database.getGroupSettings(from);
      const muted = ensureMuted(settings);
      const until = muted[sender];
      if (!until) return;

      if (Date.now() > until) {
        delete muted[sender];
        database.updateGroupSettings(from, { mutedUsers: muted });
        return;
      }

      // delete muted user's messages if bot admin
      const botIsAdmin = await extra.isBotAdmin(sock, from);
      if (!botIsAdmin) return;
      try { await sock.sendMessage(from, { delete: msg.key }); } catch {}
    } catch {
      // ignore
    }
  }
};
