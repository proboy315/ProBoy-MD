const { sendButtons } = require('../../utils/button');

module.exports = {
    name: 'jid',
    aliases: ['getjid', 'jidinfo'],
    category: 'general',
    description: 'Get JID from reply / mention / current chat with copy button',
    usage: '.jid (reply / @mention / direct)',

    async execute(sock, msg, args, extra) {
        try {
            let targetJid = null;
            let sourceType = '';

            // 1. Quoted message (reply)
            const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
            if (contextInfo?.quotedMessage) {
                if (contextInfo.participant) {
                    targetJid = contextInfo.participant;
                    sourceType = 'Reply (Sender)';
                } else if (contextInfo.remoteJid) {
                    targetJid = contextInfo.remoteJid;
                    sourceType = targetJid.endsWith('@g.us') ? 'Reply (Group)' : 'Reply (User)';
                }
            }

            // 2. Mentions (@user)
            if (!targetJid) {
                const mentions = contextInfo?.mentionedJid || [];
                if (mentions.length > 0) {
                    targetJid = mentions[0];
                    sourceType = 'Mention';
                }
            }

            // 3. Current chat
            if (!targetJid) {
                targetJid = msg.key.remoteJid;
                sourceType = targetJid.endsWith('@g.us') ? 'Current Group' : 'Private Chat';
            }

            const jidType = getJidType(targetJid);
            const cleanNumber = targetJid.split('@')[0].replace(/[^0-9]/g, '') || 'N/A';
            const server = targetJid.split('@')[1] || 'unknown';

            const displayText = `📌 *Source:* ${sourceType}\n🆔 *JID:* ${targetJid}\n📱 *Type:* ${jidType}\n🔢 *Number:* ${cleanNumber}\n🌐 *Server:* ${server}`;

            await sendButtons(sock, extra.from, {
                text: displayText,
                footer: 'ProBoy-MD',
                buttons: [
                    {
                        type: 'copy',
                        displayText: '📋 Copy JID',
                        copyCode: targetJid
                    }
                ],
                quoted: msg
            });

            await extra.react('✅');

        } catch (error) {
            console.error('jid command error:', error);
            await extra.reply(`❌ ${error.message}`);
            await extra.react('❌');
        }
    }
};

function getJidType(jid) {
    if (!jid) return 'Unknown';
    if (jid === 'status@broadcast') return 'Status Broadcast';
    if (jid.includes('@broadcast')) return 'Broadcast';
    if (jid.includes('@newsletter')) return 'Newsletter';
    if (jid.includes('@g.us')) return 'Group';
    if (jid.includes('@s.whatsapp.net')) return 'User';
    if (jid.includes('@lid')) return 'LID';
    if (jid.includes('@hosted')) return 'Hosted';
    return 'Other';
                }                }
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
