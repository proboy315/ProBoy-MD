// commands/owner/groupjids.js
/**
 * .groupjids – List all groups the bot is in with their names and JIDs (owner only)
 * Usage: .groupjids
 */

module.exports = {
  name: 'groupjids',
  aliases: ['gjids', 'groups', 'groupids'],
  category: 'dev',
  description: 'List all groups with name and JID',
  usage: '.groupjids',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const { reply, react, config } = extra;

    try {
      await react('⏳');

      const chats = await sock.groupFetchAllParticipating();
      const entries = Object.entries(chats);

      if (!entries.length) {
        return reply('❌ Bot is not a member of any group.');
      }

      let message = `📋 *Groups (${entries.length}):*\n\n`;
      entries.forEach(([jid, info], i) => {
        const name = info.subject || 'Unnamed';
        message += `${i + 1}. ${name} → ${jid}\n`;
      });

      await reply(message);
      await react('✅');
    } catch (error) {
      console.error('groupjids error:', error);
      await reply(`❌ ${error.message}`);
      await react('❌');
    }
  }
};