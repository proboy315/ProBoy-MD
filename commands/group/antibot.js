const database = require('../../database');
const config = require('../../config');
const { jidDecode, jidEncode } = require('@whiskeysockets/baileys');

const cooldown = new Map(); // key -> ts

const normalizeToPn = (jid) => {
  try {
    if (!jid || typeof jid !== 'string') return jid;
    if (jid.endsWith('@g.us') || jid === 'status@broadcast') return jid;
    const d = jidDecode(jid);
    if (!d?.user) return jid;
    return jidEncode(d.user, 's.whatsapp.net');
  } catch {
    return jid;
  }
};

const getName = (sock, jid) => {
  const pn = normalizeToPn(jid);
  const c1 = sock?.store?.contacts?.[jid];
  const c2 = sock?.store?.contacts?.[pn];
  const name = c1?.notify || c1?.name || c2?.notify || c2?.name || '';
  return typeof name === 'string' ? name.trim() : '';
};

const suspiciousName = (name) => {
  const n = String(name || '').toLowerCase();
  if (!n) return false;
  // Aggressive patterns based on common bot branding
  return (
    /(^|[\s._-])(xmd|md|x-md|wa-bot|wabot|bot|robot|assistant)([\s._-]|$)/i.test(n) ||
    /-md\b/i.test(n) ||
    /\bmd\b/i.test(n) ||
    /\bbot\b/i.test(n)
  );
};

const suspiciousCommand = (text) => {
  const t = String(text || '').trim();
  if (!t) return false;
  const prefixes = ['.', '/', '#', '!', '$'];
  if (!prefixes.includes(t[0])) return false;
  const cmd = t.slice(1).split(/\s+/)[0]?.toLowerCase() || '';
  if (!cmd) return false;
  const common = new Set([
    'menu', 'help', 'ping', 'alive', 'owner', 'repo', 'play', 'song', 'yta', 'yt', 'tiktok', 'fb', 'facebook',
    'ig', 'instagram', 'sticker', 's', 'img', 'image', 'ai', 'gpt', 'prompt', 'command', 'commands'
  ]);
  return common.has(cmd) || cmd.endsWith('md') || cmd.endsWith('xmd');
};

const warnAndMaybeRemove = async (sock, groupId, userJid, reason, extra) => {
  const key = `${groupId}|${userJid}`;
  const last = cooldown.get(key) || 0;
  if (Date.now() - last < 30_000) return;
  cooldown.set(key, Date.now());

  const data = database.addWarning(groupId, userJid, `AntiBot: ${reason}`);
  const maxWarnings = config.maxWarnings || 3;
  const botIsAdmin = !!extra.isBotAdmin;

  try {
    await sock.sendMessage(groupId, {
      text: `🤖 *AntiBot*\nUser: @${userJid.split('@')[0]}\nReason: ${reason}\nWarn: ${data.count}/${maxWarnings}`,
      mentions: [userJid]
    });
  } catch {}

  if (data.count >= maxWarnings && botIsAdmin) {
    try { await sock.groupParticipantsUpdate(groupId, [userJid], 'remove'); } catch {}
  }
};

module.exports = {
  name: 'antibot',
  aliases: ['abot'],
  category: 'group',
  description: 'Remove detected bot accounts on join (best-effort)',
  usage: '.antibot <on/off/status>',
  groupOnly: true,
  adminOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const { from, reply, react } = extra;
      const sub = (args[0] || '').toLowerCase();
      const s = database.getGroupSettings(from);

      if (!sub || sub === 'help') {
        return reply(`*AntiBot*\n\n.antibot on/off\n.antibot status`);
      }

      await react('⏳');

      if (sub === 'on') {
        database.updateGroupSettings(from, { antibot: true });
        await reply('✅ AntiBot enabled.');
      } else if (sub === 'off') {
        database.updateGroupSettings(from, { antibot: false });
        await reply('❌ AntiBot disabled.');
      } else if (sub === 'status') {
        await reply(`AntiBot: ${s.antibot ? '✅ ON' : '❌ OFF'}`);
      } else {
        await reply('❌ Unknown option. Type: .antibot help');
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
      if (!s.antibot) return;

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
        if (!jid) continue;
        const info = groupMetadata.participants?.find(x => (x.id || x.jid) === jid) || null;

        // Skip admins
        if (info?.admin === 'admin' || info?.admin === 'superadmin') continue;

        // Detection 1: metadata bot flags (if present)
        const metaBot = info?.isBot === true || info?.bot === true || info?.verifiedLevel === 2;

        // Detection 2: contact/name branding patterns
        const name = getName(sock, jid);
        const nameBot = suspiciousName(name);

        if (metaBot || nameBot) {
          await warnAndMaybeRemove(sock, id, normalizeToPn(jid) || jid, metaBot ? 'bot metadata' : `name: ${name || 'unknown'}`, extra);
        }
      }
    } catch {
      // ignore
    }
  }
  ,

  async handleMessage(sock, msg, extra) {
    try {
      if (!extra.isGroup) return;
      const s = database.getGroupSettings(extra.from);
      if (!s.antibot) return;
      if (!extra.sender || msg.key.fromMe) return;
      if (extra.isAdmin || extra.isOwner) return;

      const content = extra.utils?.getMessageContent ? extra.utils.getMessageContent(msg) : msg.message;
      const text =
        content?.conversation ||
        content?.extendedTextMessage?.text ||
        content?.imageMessage?.caption ||
        content?.videoMessage?.caption ||
        '';

      if (!suspiciousCommand(text)) return;
      await warnAndMaybeRemove(sock, extra.from, normalizeToPn(extra.sender) || extra.sender, `bot command: ${text.slice(0, 40)}`, extra);
    } catch {
      // ignore
    }
  }
};
