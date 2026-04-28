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
  name: 'ban',
  aliases: ['userban'],
  category: 'dev',
  description: 'Ban user from bot commands',
  usage: '.ban @user | number',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const target = resolveTarget(msg, args);
    if (!target) return extra.reply(`❌ Usage: ${this.usage}`);

    const normalized = extra.utils?.normalizeJidWithLid ? extra.utils.normalizeJidWithLid(target) : target;
    const targetNum = normalizeNumber(normalized.split('@')[0]);
    const ownerNums = (Array.isArray(extra.config.ownerNumber) ? extra.config.ownerNumber : []).map(normalizeNumber);
    const sudoCfg = (Array.isArray(extra.config.sudoNumbers) ? extra.config.sudoNumbers : []).map(normalizeNumber);
    const sudoDyn = (Array.isArray(extra.database.getGlobalSetting('sudoUsers')) ? extra.database.getGlobalSetting('sudoUsers') : [])
      .map(x => normalizeNumber(String(x).split('@')[0]));
    if (ownerNums.includes(targetNum) || sudoCfg.includes(targetNum) || sudoDyn.includes(targetNum)) {
      return extra.reply('❌ Cannot ban owner/sudo.');
    }

    const list = extra.database.getGlobalSetting('bannedUsers');
    const arr = Array.isArray(list) ? list : [];
    const key = `${targetNum}@s.whatsapp.net`;
    if (arr.includes(key)) return extra.reply('ℹ️ User already banned.');

    arr.push(key);
    extra.database.setGlobalSetting('bannedUsers', arr);
    await extra.react('✅');
    return extra.reply(`✅ Banned: ${key}`);
  }
};

