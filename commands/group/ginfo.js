const axios = require('axios');

module.exports = {
  name: 'ginfo',
  aliases: ['groupinfo'],
  category: 'group',
  description: 'ℹ️ Get detailed group information',
  usage: '.ginfo',
  groupOnly: true,

  async execute(sock, msg, args, extra) {
    const { from, reply, react, groupMetadata } = extra;
    if (!groupMetadata) return reply('❌ Could not fetch group info.');

    try {
      await react('ℹ️');
      let ppUrl;
      try {
        ppUrl = await sock.profilePictureUrl(from, 'image');
      } catch {
        ppUrl = config.apis?.defaultAssets?.fallbackGroupPpUrl || 'https://telegra.ph/file/265c672094dfa87caea19.jpg';
      }

      const created = groupMetadata.creation ? new Date(groupMetadata.creation * 1000).toLocaleString() : 'Unknown';
      const desc = groupMetadata.desc || 'No description';
      const owner = groupMetadata.owner || 'Unknown';
      const participants = groupMetadata.participants?.length || 0;

      const caption = `╭═══〘 *GROUP INFO* 〙═══⊷❍
┃✯│ 📛 *Name:* ${groupMetadata.subject}
┃✯│ 🆔 *JID:* ${from}
┃✯│ 👑 *Owner:* @${owner.split('@')[0]}
┃✯│ 📅 *Created:* ${created}
┃✯│ 👥 *Members:* ${participants}
┃✯│ 📝 *Description:*
┃✯│ ${desc}
╰══════════════════⊷❍`;

      await sock.sendMessage(from, {
        image: { url: ppUrl },
        caption,
        mentions: [owner]
      }, { quoted: msg });
      await react('✅');
    } catch (e) {
      console.error(e);
      await reply(`❌ Error: ${e.message}`);
      await react('❌');
    }
  }
};
