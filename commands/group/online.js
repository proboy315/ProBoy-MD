module.exports = {
  name: 'online',
  aliases: ['listonline', 'whosonline'],
  category: 'group',
  description: '🟢 List members currently online in the group',
  usage: '.online',
  groupOnly: true,

  async execute(sock, msg, args, extra) {
    const { from, reply, react, participants } = extra;
    if (!participants) return reply('❌ Cannot fetch participants.');

    try {
      await react('🟢');
      await reply('🔍 Checking online members...');

      const presenceData = new Map();

      const presenceHandler = (update) => {
        if (update.presences) {
          for (const [jid, presence] of Object.entries(update.presences)) {
            presenceData.set(jid, presence);
          }
        }
      };
      sock.ev.on('presence.update', presenceHandler);

      // Subscribe to all participants
      for (const p of participants) {
        const jid = p.id || p.jid;
        try { await sock.presenceSubscribe(jid); } catch {}
        await new Promise(r => setTimeout(r, 100));
      }
      await new Promise(r => setTimeout(r, 2000)); // wait for presence updates

      sock.ev.off('presence.update', presenceHandler);

      const online = [];
      for (const p of participants) {
        const jid = p.id || p.jid;
        const pres = presenceData.get(jid);
        if (pres?.lastKnownPresence === 'available' || pres?.lastKnownPresence === 'composing') {
          online.push(jid);
        }
      }

      if (online.length === 0) {
        return reply(`╭═══〘 *ONLINE MEMBERS* 〙═══⊷❍
┃✯│ 😴 No members currently online
╰══════════════════⊷❍`);
      }

      const mentions = online;
      const list = online.map((jid, i) => `┃✯│ ${i+1}. @${jid.split('@')[0]}`).join('\n');
      await sock.sendMessage(from, {
        text: `╭═══〘 *ONLINE MEMBERS* 〙═══⊷❍
┃✯│ 🟢 ${online.length} of ${participants.length} online
${list}
╰══════════════════⊷❍`,
        mentions
      }, { quoted: msg });

      await react('✅');
    } catch (e) {
      console.error(e);
      await reply(`❌ Error: ${e.message}`);
      await react('❌');
    }
  }
};