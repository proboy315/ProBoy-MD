const axios = require('axios');

module.exports = {
  name: 'getpp',
  aliases: ['gp', 'getpic'],
  category: 'general',
  description: 'Get profile picture of a user or group',
  usage: '.getpp [@mention | reply | phone number]',
  
  async execute(sock, msg, args, extra) {
    try {
      let targetUser = null;
      let targetType = 'user'; // 'user' or 'chat'

      // 1. Check if it's a reply
      const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (quotedMessage) {
        targetUser = msg.message.extendedTextMessage.contextInfo.participant;
      }
      // 2. Check for mentioned user
      else if (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
        targetUser = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
      }
      // 3. Check if an argument is provided (phone number)
      else if (args.length > 0) {
        // Clean the input: remove all non‑digits
        const rawNumber = args[0].replace(/\D/g, '');
        if (!rawNumber) {
          return extra.reply('❌ Please provide a valid phone number (e.g., .getpp 1234567890)');
        }
        targetUser = `${rawNumber}@s.whatsapp.net`;
      }
      // 4. No target → use the current chat (group or private)
      else {
        targetUser = extra.from; // group JID or private chat JID
        targetType = 'chat';
      }

      if (!targetUser) {
        return extra.reply('❌ Could not identify target. Use `.getpp @mention`, reply to a message, or provide a number.');
      }

      // Try to fetch the profile picture
      try {
        const ppUrl = await sock.profilePictureUrl(targetUser, 'image');
        
        if (!ppUrl) {
          return extra.reply('❌ Profile picture not found for this target.');
        }

        // Download the image
        const response = await axios.get(ppUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data);

        // Prepare caption
        let caption;
        if (targetType === 'chat') {
          if (extra.isGroup) {
            caption = '🖼️ Group profile picture';
          } else {
            caption = '👤 Contact profile picture';
          }
          // Add usage hint
          caption += '\n\n💡 *Usage:* `.getpp @mention` / reply / `.getpp number`';
        } else {
          // For a specific user, mention them
          caption = `👤 Profile picture of @${targetUser.split('@')[0]}`;
        }

        // Send the image
        await sock.sendMessage(extra.from, { 
          image: buffer,
          caption: caption,
          mentions: targetType === 'user' ? [targetUser] : []
        }, { quoted: msg });

      } catch (profileError) {
        // Handle common WhatsApp profile picture errors
        const errMsg = profileError.message || '';
        if (errMsg.includes('item-not-found') || 
            errMsg.includes('404') || 
            errMsg.includes('not found') ||
            errMsg.includes('500')) {
          // No profile picture exists
          return extra.reply('❌ This user/group does not have a profile picture.');
        } else if (errMsg.includes('forbidden') || errMsg.includes('401')) {
          return extra.reply('❌ Profile picture is private or not available.');
        } else {
          // Generic error
          console.error('Profile picture error:', profileError);
          return extra.reply('❌ Failed to retrieve profile picture.');
        }
      }

    } catch (error) {
      console.error('Unexpected error in getpp:', error);
      extra.reply('❌ An unexpected error occurred. Please try again later.');
    }
  }
};