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
  name: 'removesudo',
  aliases: ['delsudo'],
  category: 'dev',
  description: 'Remove sudo user',
  usage: '.removesudo @user | number',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    if (!extra.isOwner) return extra.reply('❌ Only main owner can manage sudo users.');
    const target = resolveTarget(msg, args);
    if (!target) return extra.reply(`❌ Usage: ${this.usage}`);

    const db = extra.database;
    const list = db.getGlobalSetting('sudoUsers');
    const current = Array.isArray(list) ? list : [];

    const normalized = extra.utils?.normalizeJidWithLid ? extra.utils.normalizeJidWithLid(target) : target;
    const num = normalizeNumber(normalized.split('@')[0]);
    const candidates = new Set([normalized, `${num}@s.whatsapp.net`, num]);

    const filtered = current.filter(item => {
      const s = String(item || '').trim();
      const n = normalizeNumber(s.split('@')[0]);
      return !candidates.has(s) && !candidates.has(n);
    });

    if (filtered.length === current.length) return extra.reply('❌ User not in sudo list.');
    db.setGlobalSetting('sudoUsers', filtered);
    await extra.react('✅');
    return extra.reply('✅ Sudo removed.');
  }
};

