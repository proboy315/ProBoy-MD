const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

module.exports = {
  name: 'viewonce2',
  aliases: ['vv2', 'readvo2', 'readvv', 'vvprivate'],
  category: 'general',
  description: 'Reveal view‑once media and send it to your own self‑chat',
  usage: '.vv2 (reply to view‑once message)',

  async execute(sock, msg, args, extra) {
    try {
      const chatId = msg.key.remoteJid;                     // original chat (group/private)
      const selfJid = extra.sender;                         // YOUR own JID (resolved by handler)

      // ── 1. Extract quoted message ──
      const ctx = msg.message?.extendedTextMessage?.contextInfo
        || msg.message?.imageMessage?.contextInfo
        || msg.message?.videoMessage?.contextInfo
        || msg.message?.buttonsResponseMessage?.contextInfo
        || msg.message?.listResponseMessage?.contextInfo;

      if (!ctx?.quotedMessage || !ctx?.stanzaId) {
        return await sock.sendMessage(
          chatId,
          { text: '🗑️ Reply to a *view‑once* message to reveal it in your self‑chat.' },
          { quoted: msg }
        );
      }

      const quotedMsg = ctx.quotedMessage;
      const hasViewOnce =
        !!quotedMsg.viewOnceMessageV2 ||
        !!quotedMsg.viewOnceMessageV2Extension ||
        !!quotedMsg.viewOnceMessage ||
        !!quotedMsg.viewOnce ||
        !!quotedMsg?.imageMessage?.viewOnce ||
        !!quotedMsg?.videoMessage?.viewOnce ||
        !!quotedMsg?.audioMessage?.viewOnce;

      if (!hasViewOnce) {
        return await sock.sendMessage(
          chatId,
          { text: '❌ This is not a view‑once message!' },
          { quoted: msg }
        );
      }

      // ── 2. Unwrap the actual media message ──
      let actualMsg = null;
      let mtype = null;

      if (quotedMsg.viewOnceMessageV2Extension?.message) {
        actualMsg = quotedMsg.viewOnceMessageV2Extension.message;
        mtype = Object.keys(actualMsg)[0];
      } else if (quotedMsg.viewOnceMessageV2?.message) {
        actualMsg = quotedMsg.viewOnceMessageV2.message;
        mtype = Object.keys(actualMsg)[0];
      } else if (quotedMsg.viewOnceMessage?.message) {
        actualMsg = quotedMsg.viewOnceMessage.message;
        mtype = Object.keys(actualMsg)[0];
      } else if (quotedMsg.imageMessage?.viewOnce) {
        actualMsg = { imageMessage: quotedMsg.imageMessage };
        mtype = 'imageMessage';
      } else if (quotedMsg.videoMessage?.viewOnce) {
        actualMsg = { videoMessage: quotedMsg.videoMessage };
        mtype = 'videoMessage';
      } else if (quotedMsg.audioMessage?.viewOnce) {
        actualMsg = { audioMessage: quotedMsg.audioMessage };
        mtype = 'audioMessage';
      }

      if (!actualMsg || !mtype) {
        return await sock.sendMessage(
          chatId,
          { text: '❌ Unsupported view‑once message type.' },
          { quoted: msg }
        );
      }

      // ── 3. Download the media ──
      const downloadType = mtype === 'imageMessage' ? 'image'
                        : mtype === 'videoMessage' ? 'video'
                        : 'audio';

      const mediaStream = await downloadContentFromMessage(
        actualMsg[mtype],
        downloadType
      );

      let buffer = Buffer.from([]);
      for await (const chunk of mediaStream) {
        buffer = Buffer.concat([buffer, chunk]);
      }

      const caption = actualMsg[mtype]?.caption || '';

      // ── 4. Send directly to YOUR self‑chat ──
      if (mtype.includes('video')) {
        await sock.sendMessage(selfJid, {
          video: buffer,
          caption,
          mimetype: 'video/mp4'
        });
      } else if (mtype.includes('image')) {
        await sock.sendMessage(selfJid, {
          image: buffer,
          caption,
          mimetype: 'image/jpeg'
        });
      } else if (mtype.includes('audio')) {
        await sock.sendMessage(selfJid, {
          audio: buffer,
          ptt: true,
          mimetype: 'audio/ogg; codecs=opus'
        });
      }

      // ── 5. Confirm in the original chat ──
      await sock.sendMessage(
        chatId,
        { text: 'ㅤ' },
        { quoted: msg }
      );

    } catch (error) {
      console.error('[viewonce2]', error);
      await sock.sendMessage(
        msg.key.remoteJid,
        { text: '❌ Failed to process: ' + (error.message || 'Unknown error') },
        { quoted: msg }
      );
    }
  }
};