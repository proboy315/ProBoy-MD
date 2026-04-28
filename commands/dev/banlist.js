module.exports = {
  name: 'banlist',
  aliases: ['listban'],
  category: 'dev',
  description: 'List banned users',
  usage: '.banlist',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const list = extra.database.getGlobalSetting('bannedUsers');
    const arr = Array.isArray(list) ? list : [];
    if (!arr.length) return extra.reply('📋 No banned users.');
    return extra.reply(`*BANNED USERS*\n\n${arr.map((x, i) => `${i + 1}. ${x}`).join('\n')}`);
  }
};

