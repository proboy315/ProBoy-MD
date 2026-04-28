module.exports = {
  name: 'unlockgs',
  aliases: ['unlockgsettings'],
  category: 'group',
  description: '🔓 Unlock group settings (all members can edit)',
  usage: '.unlockgs',
  adminOnly: true,
  botAdminNeeded: true,
  groupOnly: true,

  async execute(sock, msg, args, extra) {
    const { from, reply, react, isAdmins, isBotAdmins } = extra;
    if (!isAdmins) return reply('❌ Admins only.');
    if (!isBotAdmins) return reply('❌ Bot must be admin.');

    try {
      await react('🔓');
      await sock.groupSettingUpdate(from, 'unlocked');
      await reply(`╭═══〘 *GROUP UNLOCKED* 〙═══⊷❍
┃✯│ 🔓 Group settings unlocked
┃✯│ All members can edit info
╰══════════════════⊷❍`);
      await react('✅');
    } catch (e) {
      await reply(`❌ Error: ${e.message}`);
      await react('❌');
    }
  }
};