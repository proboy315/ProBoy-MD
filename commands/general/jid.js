/**
 * .jid command – Get JID from reply / mention / current chat
 */

module.exports = {
    name: 'jid',
    aliases: ['getjid', 'jidinfo'],
    category: 'general',
    description: 'Get WhatsApp JID of a user, group, or channel',
    usage: '.jid (reply to message / @mention / direct)',

    async execute(sock, msg, args, extra) {
        try {
            let targetJid = null;
            let sourceType = '';

            // 1. Priority: Quoted message (reply)
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (quoted) {
                // Get the original message key from context
                const quotedKey = msg.message.extendedTextMessage.contextInfo;
                if (quotedKey.participant) {
                    targetJid = quotedKey.participant; // Group participant who sent quoted msg
                    sourceType = 'Reply (Sender)';
                } else if (quotedKey.remoteJid) {
                    targetJid = quotedKey.remoteJid;
                    sourceType = targetJid.endsWith('@g.us') ? 'Reply (Group)' : 'Reply (User)';
                }
            }

            // 2. Next: Mentions (@user)
            if (!targetJid) {
                const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
                if (mentions.length > 0) {
                    targetJid = mentions[0]; // First mentioned user
                    sourceType = 'Mention';
                }
            }

            // 3. Fallback: Current chat
            if (!targetJid) {
                targetJid = msg.key.remoteJid;
                sourceType = targetJid.endsWith('@g.us') ? 'Current Group' : 'Private Chat';
            }

            // Determine JID type and format info
            const jidType = getJidType(targetJid);
            const normalizedNumber = targetJid.split('@')[0].replace(/[^0-9]/g, '') || 'N/A';
            const server = targetJid.split('@')[1] || 'unknown';

            const response = `╭═══〘 *JID INFORMATION* 〙═══⊷❍
┃✯│ 📌 *Source:* ${sourceType}
┃✯│ 🆔 *JID:* ${targetJid}
┃✯│ 📱 *Type:* ${jidType}
┃✯│ 🔢 *Number/ID:* ${normalizedNumber}
┃✯│ 🌐 *Server:* ${server}
╰══════════════════⊷❍`;

            await extra.reply(response);
            await extra.react('✅');

        } catch (error) {
            console.error('jid command error:', error);
            await extra.reply(`❌ Error: ${error.message}`);
            await extra.react('❌');
        }
    }
};

/**
 * Determine human-readable JID type
 */
function getJidType(jid) {
    if (!jid) return 'Unknown';
    if (jid === 'status@broadcast') return 'Status Broadcast';
    if (jid.includes('@broadcast')) return 'Broadcast';
    if (jid.includes('@newsletter')) return 'Newsletter';
    if (jid.includes('@g.us')) return 'Group';
    if (jid.includes('@s.whatsapp.net')) return 'User (WhatsApp)';
    if (jid.includes('@lid')) return 'LID (Linked Device)';
    if (jid.includes('@hosted')) return 'Hosted';
    return 'Other';
                  }
