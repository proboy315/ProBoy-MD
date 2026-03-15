/**
 * Group Link Command - Get group invite link
 */

module.exports = {
    name: '.invite',
    aliases: ['link', 'invite','grouplink'],
    category: 'group',
    description: 'Get group invite link',
    usage: '.invite',
    groupOnly: true,
    adminOnly: true,
    botAdminNeeded: true,
    
    async execute(sock, msg, args, extra) {
      try {
        const code = await sock.groupInviteCode(extra.from);
        const link = `https://chat.whatsapp.com/${code}`;
        
        let text = `🔗 *GROUP INVITE LINK*\n\n`;
        text += `📱 Group: ${extra.groupMetadata.subject}\n`;
        text += `🔗 Link: ${link}\n\n`;
        
        
        await extra.reply(text);
        
      } catch (error) {
        await extra.reply(`❌ Error: ${error.message}`);
      }
    }
  };
  