module.exports = {
  name: 'lockgs',
  aliases: ['lockgsettings'],
  category: 'group',
  description: '🔒 Lock group settings (only admins can edit)',
  usage: '.lockgs',
  adminOnly: true,
  botAdminNeeded: true,
  groupOnly: true,

  async execute(sock, msg, args, extra) {
    const { from, reply, react, isAdmins, isBotAdmins } = extra;
    if (!isAdmins) return reply('❌ Admins only.');
    if (!isBotAdmins) return reply('❌ Bot must be admin.');

    try {
      await react('🔒');
      await sock.groupSettingUpdate(from, 'locked');
      await reply(`╭═══〘 *GROUP LOCKED* 〙═══⊷❍
┃✯│ 🔒 Group settings locked
┃✯│ Only admins can edit info
╰══════════════════⊷❍`);
      await react('✅');
    } catch (e) {
      await reply(`❌ Error: ${e.message}`);
      await react('❌');
    }
  }
};