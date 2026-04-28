const fs = require('fs');
const path = require('path');
const { tmpdir } = require('os');

module.exports = {
  name: 'vcf',
  aliases: ['savecontact', 'scontact', 'savecontacts'],
  category: 'group',
  description: '📇 Save all group members as vCard file',
  usage: '.vcf',
  ownerOnly: true, // as per original

  async execute(sock, msg, args, extra) {
    const { from, isGroup, reply, react, groupMetadata } = extra;
    if (!isGroup) return reply('❌ This command works only in groups.');
    if (!groupMetadata) return reply('❌ Could not fetch group metadata.');

    try {
      await react('📇');
      const participants = groupMetadata.participants || [];
      if (!participants.length) return reply('❌ No participants found.');

      let vcard = '';
      let savedCount = 0;
      participants.forEach((member, index) => {
        let jid = member.id || member.jid;
        if (!jid) return;
        let number = jid.split('@')[0];
        if (!/^\d+$/.test(number)) return;
        const name = member.notify || member.name || `+${number}`;
        vcard += `BEGIN:VCARD\nVERSION:3.0\nFN:[${index+1}] ${name}\nTEL;type=CELL;waid=${number}:+${number}\nEND:VCARD\n`;
        savedCount++;
      });

      if (savedCount === 0) return reply('❌ No valid phone numbers found.');

      const filePath = path.join(tmpdir(), `group_contacts_${Date.now()}.vcf`);
      fs.writeFileSync(filePath, vcard);

      await sock.sendMessage(from, {
        document: fs.readFileSync(filePath),
        mimetype: 'text/vcard',
        fileName: `GroupContacts.vcf`,
        caption: `╭═══〘 *VCARD EXPORT* 〙═══⊷❍
┃✯│ 📁 *Group:* ${groupMetadata.subject}
┃✯│ 📇 *Contacts:* ${savedCount}/${participants.length}
╰══════════════════⊷❍`
      }, { quoted: msg });

      fs.unlinkSync(filePath);
      await react('✅');
    } catch (err) {
      console.error(err);
      await reply(`❌ Error: ${err.message}`);
      await react('❌');
    }
  }
};