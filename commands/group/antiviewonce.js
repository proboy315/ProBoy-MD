const database = require('../../database');
const config = require('../../config');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

const getBotJid = (sock) => {
  const id = sock.user?.id ? sock.user.id.split(':')[0] : null;
  return id ? `${id}@s.whatsapp.net` : null;
};

module.exports = {
  name: 'antiviewonce',
  aliases: ['avo', 'viewonce'],
  category: 'group',
  description: 'Save view-once media by forwarding to the bot number',
  usage: '.antiviewonce <on/off/status>',

  async execute(sock, msg, args, extra) {
    try {
      const { from, reply, react } = extra;
      const sub = (args[0] || '').toLowerCase();
      const s = database.getChatSettings(from);

      if (!sub || sub === 'help') {
        return reply(`*AntiViewOnce*\n\n.antiviewonce on/off\n.antiviewonce status`);
      }

      await react('⏳');

      if (sub === 'on') {
        database.updateChatSettings(from, { antiviewonce: true });
        await reply('✅ AntiViewOnce enabled for this chat.');
      } else if (sub === 'off') {
        database.updateChatSettings(from, { antiviewonce: false });
        await reply('❌ AntiViewOnce disabled for this chat.');
      } else if (sub === 'status') {
        await reply(`AntiViewOnce: ${s.antiviewonce ? '✅ ON' : '❌ OFF'}`);
      } else {
        await reply('❌ Unknown option. Type: .antiviewonce help');
      }

      await react('✅');
    } catch (e) {
      await extra.reply(`❌ ${e.message}`);
      await extra.react('❌');
    }
  },

  async handleMessage(sock, msg, extra) {
    try {
      const from = extra.from;
      const s = database.getChatSettings(from);
      if (!s.antiviewonce) return;

      const isVO = !!(msg.message?.viewOnceMessageV2 || msg.message?.viewOnceMessage);
      if (!isVO) return;

      const content = extra.utils?.getMessageContent ? extra.utils.getMessageContent(msg) : null;
      if (!content) return;

      const type = Object.keys(content)[0];
      const inner = content[type];
      if (!inner) return;

      const botJid = getBotJid(sock);
      if (!botJid) return;

      const caption = inner.caption || '';
      const header =
        `*AntiViewOnce*\n` +
        `From: ${from}\n` +
        `Sender: ${extra.sender?.split('@')[0] || 'unknown'}\n\n` +
        (caption ? `Caption:\n${caption}` : '');

      const msgForDl = { ...msg, message: content };
      const buffer = await downloadMediaMessage(msgForDl, 'buffer', {});

      if (type === 'imageMessage') {
        await sock.sendMessage(botJid, { image: buffer, caption: header.trim() });
      } else if (type === 'videoMessage') {
        await sock.sendMessage(botJid, { video: buffer, caption: header.trim() });
      } else if (type === 'audioMessage') {
        await sock.sendMessage(botJid, { text: header.trim() });
        await sock.sendMessage(botJid, { audio: buffer, mimetype: inner.mimetype || 'audio/mpeg', ptt: !!inner.ptt });
      } else if (type === 'documentMessage') {
        await sock.sendMessage(botJid, {
          document: buffer,
          mimetype: inner.mimetype,
          fileName: inner.fileName || 'file',
          caption: header.trim()
        });
      }
    } catch {
      // ignore
    }
  }
};

