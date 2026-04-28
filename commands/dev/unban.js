const normalizeNumber = (v) => String(v || '').replace(/\D/g, '');

const resolveTarget = (msg, args) => {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  const mentioned = ctx?.mentionedJid || [];
  if (mentioned.length) return mentioned[0];
  if (ctx?.participant && ctx.stanzaId && ctx.quotedMessage) return ctx.participant;
  const raw = (args[0] || '').trim();
  if (!raw) return null;
  if (raw.includes('@')) return raw;
  const num = normalizeNumber(raw);
  return num ? `${num}@s.whatsapp.net` : null;
};

module.exports = {
  name: 'unban',
  aliases: ['delban'],
  category: 'dev',
  description: 'Unban user from bot commands',
  usage: '.unban @user | number',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const target = resolveTarget(msg, args);
    if (!target) return extra.reply(`❌ Usage: ${this.usage}`);

    const normalized = extra.utils?.normalizeJidWithLid ? extra.utils.normalizeJidWithLid(target) : target;
    const targetNum = normalizeNumber(normalized.split('@')[0]);

    const list = extra.database.getGlobalSetting('bannedUsers');
    const arr = Array.isArray(list) ? list : [];
    const filtered = arr.filter(item => normalizeNumber(String(item).split('@')[0]) !== targetNum);
    if (filtered.length === arr.length) return extra.reply('❌ User not banned.');

    extra.database.setGlobalSetting('bannedUsers', filtered);
    await extra.react('✅');
    return extra.reply(`✅ Unbanned: ${targetNum}`);
  }
};

