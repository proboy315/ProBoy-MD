/**
 * .forward command – Forward replied message to multiple JIDs
 * Usage: .forward jid1,jid2,jid3,...
 * Example: .forward 923001234567@s.whatsapp.net,7769897832644@lid,123456789@g.us
 */

module.exports = {
    name: 'forward',
    aliases: ['fwd', 'sendto'],
    category: 'owner', // ya 'utility' agar aap chahein
    description: 'Forward a replied message to multiple JIDs/LIDs',
    usage: '.forward jid1,jid2,jid3,...',
    ownerOnly: true,   // sirf owner use kare (ya modOnly: true)
    modOnly: false,

    async execute(sock, msg, args, extra) {
        // Check if there's a replied message
        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        if (!contextInfo?.quotedMessage) {
            return extra.reply('❌ Please reply to a message you want to forward.');
        }

        // Parse JIDs from args (comma separated)
        const rawJids = args.join(' ').split(',').map(j => j.trim()).filter(Boolean);
        if (rawJids.length === 0) {
            return extra.reply('❌ Please provide at least one JID.\n\nExample:\n.forward 923001234567@s.whatsapp.net,7769897832644@lid');
        }

        // Validate JIDs (basic format check)
        const validJids = rawJids.filter(jid => jid.includes('@'));
        if (validJids.length === 0) {
            return extra.reply('❌ No valid JIDs found. JID must contain "@" (e.g., number@s.whatsapp.net, lid@lid)');
        }

        await extra.react('⏳');
        
        // Get the quoted message details
        const quotedMessage = contextInfo.quotedMessage;
        const quotedKey = {
            remoteJid: contextInfo.remoteJid || msg.key.remoteJid,
            fromMe: false,
            id: contextInfo.stanzaId,
            participant: contextInfo.participant
        };

        let successCount = 0;
        let failCount = 0;
        const failedJids = [];

        // Forward to each valid JID
        for (const targetJid of validJids) {
            try {
                // Use Baileys forward method (or sendMessage with forward)
                await sock.sendMessage(targetJid, {
                    forward: {
                        key: quotedKey,
                        message: quotedMessage
                    }
                });
                successCount++;
                // Small delay to avoid rate limits
                await new Promise(r => setTimeout(r, 300));
            } catch (error) {
                failCount++;
                failedJids.push(targetJid);
                console.error(`Forward failed to ${targetJid}:`, error.message);
            }
        }

        // Send summary
        const summary = `╭═══〘 *FORWARD SUMMARY* 〙═══⊷❍
┃✯│ ✅ Success: ${successCount}
┃✯│ ❌ Failed: ${failCount}
${failedJids.length ? `┃✯│\n┃✯│ *Failed JIDs:*\n${failedJids.map(j => `┃✯│ • ${j}`).join('\n')}` : ''}
╰══════════════════⊷❍`;

        await extra.reply(summary);
        await extra.react(successCount > 0 ? '✅' : '❌');
    }
};
