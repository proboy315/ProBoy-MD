const axios = require('axios');
const config = require('../../config');
const { uploadToCatbox } = require('../../utils/catbox');

module.exports = {
  name: 'vocalremover2',
  aliases: ['removevocals2', 'splitvocals2', 'vrm2'],
  category: 'ai',
  description: '🎚️ Vocal remover v2 (original + vocals + instrumental)',
  usage: '.vocalremover2 (reply to audio) or .vocalremover2 <audio URL>',

  async execute(sock, msg, args, extra) {
    const { from, reply, react, quoted } = extra;
    let audioUrl = args[0] || '';

    if (!audioUrl.startsWith('http')) {
      if (!quoted || (quoted.type !== 'audioMessage' && quoted.type !== 'documentMessage')) {
        return reply('❌ Please reply to an audio message or provide an audio URL.');
      }
      const buffer = await quoted.download();
      audioUrl = await uploadToCatbox(buffer, 'audio.mp3');
      if (!audioUrl) return reply('❌ Failed to upload audio.');
    }

    try {
      await react('🎚️');
      const statusMsg = await sock.sendMessage(from, { text: '⏳ Separating tracks (v2)...' }, { quoted: msg });

      const baseUrl = config.apis?.giftedtech?.baseUrl || 'https://api.giftedtech.co.ke/api';
      const apikey = config.apis?.giftedtech?.apiKey || 'gifted';
      const apiUrl = `${baseUrl}/tools/vocalremoverv2?apikey=${encodeURIComponent(apikey)}&url=${encodeURIComponent(audioUrl)}`;
      const res = await axios.get(apiUrl);
      const { title, original, vocals, instrumental } = res.data?.result || {};

      if (!original && !vocals && !instrumental) throw new Error('API returned no tracks');

      await sock.sendMessage(from, { text: '✅ Separation complete!', edit: statusMsg.key });

      const tracks = [
        { url: original, label: '🔊 Original' },
        { url: vocals, label: '🎤 Vocals' },
        { url: instrumental, label: '🎵 Instrumental' }
      ];

      for (const track of tracks) {
        if (track.url) {
          await sock.sendMessage(from, { audio: { url: track.url }, mimetype: 'audio/mpeg' }, { quoted: msg });
          await sock.sendMessage(from, { text: `${track.label} - ${title || ''}` });
        }
      }

      await react('✅');
    } catch (e) {
      console.error(e);
      await reply(`❌ Error: ${e.message}`);
      await react('❌');
    }
  }
};
