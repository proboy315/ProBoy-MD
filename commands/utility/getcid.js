/**
 * Get WhatsApp Channel ID (Newsletter JID) from invite link
 * Uses Baileys newsletterMetadata method.
 */

module.exports = {
  name: 'getcid',
  aliases: ['getchannelid', 'cid', 'channelid'],
  category: 'utility',
  description: '📢 Get WhatsApp Channel ID from invite link',
  usage: '.getcid <channel-invite-link>',

  async execute(sock, msg, args, extra) {
    const { reply, react } = extra;

    const link = args[0];
    if (!link) {
      return reply(`❌ Please provide a channel invite link.\nExample: ${this.usage}`);
    }

    // Extract invite code from URL
    let inviteCode = null;
    if (link.includes('whatsapp.com/channel/')) {
      const parts = link.split('/');
      inviteCode = parts[parts.length - 1];
    } else {
      return reply('❌ Invalid link. Provide a valid WhatsApp Channel invite link.');
    }

    if (!inviteCode || inviteCode.length < 10) {
      return reply('❌ Could not extract invite code from the link.');
    }

    try {
      await react('⏳');

      // Correct Baileys method to get newsletter/channel metadata from invite code
      const channelInfo = await sock.newsletterMetadata('invite', inviteCode);

      if (!channelInfo || !channelInfo.id) {
        throw new Error('No channel information found.');
      }

      const name = channelInfo.name || 'Unknown Channel';
      const channelId = channelInfo.id;
      const description = channelInfo.description || 'No description';
      const subscribers = channelInfo.subscribers || '?';
      const state = channelInfo.state || 'ACTIVE';

      const resultText = `╭═══〘 *CHANNEL ID* 〙═══⊷❍
┃✯│ 📢 *Name:* ${name}
┃✯│ 🆔 *ID:* ${channelId}
┃✯│ 📝 *Description:* ${description}
┃✯│ 👥 *Subscribers:* ${subscribers}
┃✯│ 🔗 *Invite Link:* ${link}
╰══════════════════⊷❍`;

      await reply(resultText);
      await react('✅');
    } catch (error) {
      console.error('Get channel ID error:', error);
      await reply(`❌ Failed to get channel ID: ${error.message}`);
      await react('❌');
    }
  }
};
