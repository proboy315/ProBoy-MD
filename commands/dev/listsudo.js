module.exports = {
  name: 'listsudo',
  aliases: ['sudolist'],
  category: 'dev',
  description: 'Show all sudo users',
  usage: '.listsudo',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const cfgNums = Array.isArray(extra.config.sudoNumbers) ? extra.config.sudoNumbers : [];
    const cfgJids = Array.isArray(extra.config.sudoJids) ? extra.config.sudoJids : [];
    const dbList = extra.database.getGlobalSetting('sudoUsers');
    const dyn = Array.isArray(dbList) ? dbList : [];

    const all = [...new Set([
      ...cfgNums.map(n => `${String(n).replace(/\D/g, '')}@s.whatsapp.net`).filter(v => !v.startsWith('@')),
      ...cfgJids,
      ...dyn
    ])];

    if (!all.length) return extra.reply('📋 No sudo users set.');
    return extra.reply(`*SUDO USERS*\n\n${all.map((x, i) => `${i + 1}. ${x}`).join('\n')}`);
  }
};

