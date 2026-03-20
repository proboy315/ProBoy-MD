module.exports = {
  name: 'taggroups',
  aliases: ['sendtag', 'taggrp'],
  category: 'owner',
  description: '📢 Send a message to multiple groups (separate JIDs with commas, then ±)',
  usage: '.taggroups <jid1,jid2,...> ± <message>',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const { reply, react, from } = extra;
    const q = args.join(' ');

    if (!q.includes('±') && !msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
      return reply(`╭═══〘 *USAGE* 〙═══⊷❍
┃✯│ .taggroups jid1,jid2,... ± message
┃✯│ or reply to a message with .taggroups jids...
╰══════════════════⊷❍`);
    }

    let jidsInput, messageText;
    if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
      jidsInput = q;
      messageText = msg.message.extendedTextMessage.contextInfo.quotedMessage.conversation ||
                    msg.message.extendedTextMessage.contextInfo.quotedMessage.extendedTextMessage?.text;
    } else {
      const [e, f] = q.split('±').map(s => s.trim());
      jidsInput = e;
      messageText = f;
    }

    const jids = jidsInput.split(',').map(j => j.trim());
    let sent = 0;

    await react('📢');
    for (const groupId of jids) {
      if (!groupId.endsWith('@g.us')) {
        await reply(`❌ Invalid JID: ${groupId}`);
        continue;
      }
      try {
        const groupInfo = await sock.groupMetadata(groupId).catch(() => null);
        if (!groupInfo) {
          await reply(`❌ Cannot fetch group: ${groupId}`);
          continue;
        }
        const participants = groupInfo.participants.map(p => p.id);
        await sock.sendMessage(groupId, { text: messageText, mentions: participants });
        sent++;
      } catch (e) {
        await reply(`❌ Failed to send to ${groupId}: ${e.message}`);
      }
      await new Promise(r => setTimeout(r, 500));
    }

    await reply(`╭═══〘 *BROADCAST RESULT* 〙═══⊷❍
┃✯│ ✅ Sent to ${sent}/${jids.length} groups
╰══════════════════⊷❍`);
    await react('✅');
  }
};