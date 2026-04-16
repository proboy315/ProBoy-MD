const axios = require('axios');
const config = require('../../config');
const { uploadToCatbox } = require('../../utils/catbox');

module.exports = {
  name: 'vocalremover',
  aliases: ['removevocals', 'splitvocals', 'vrm'],
  category: 'ai',
  description: '🎙️ Separate vocals from a song (reply to audio or provide URL)',
  usage: '.vocalremover (reply to audio) or .vocalremover <audio URL>',

  async execute(sock, msg, args, extra) {
    const { from, reply, react, quoted } = extra;
    let audioUrl = args[0] || '';

    // If no URL in args, try to get from quoted audio
    if (!audioUrl.startsWith('http')) {
      if (!quoted || (quoted.type !== 'audioMessage' && quoted.type !== 'documentMessage')) {
        return reply('❌ Please reply to an audio message or provide an audio URL.');
      }
      const buffer = await quoted.download();
      audioUrl = await uploadToCatbox(buffer, 'audio.mp3');
      if (!audioUrl) return reply('❌ Failed to upload audio.');
    }

    try {
      await react('🎙️');
      const statusMsg = await sock.sendMessage(from, { text: '⏳ Separating vocals...' }, { quoted: msg });

      const baseUrl = config.apis?.giftedtech?.baseUrl || 'https://api.giftedtech.co.ke/api';
      const apikey = config.apis?.giftedtech?.apiKey || 'gifted';
      const apiUrl = `${baseUrl}/tools/vocalremover?apikey=${encodeURIComponent(apikey)}&url=${encodeURIComponent(audioUrl)}`;
      const res = await axios.get(apiUrl);
      const { title, vocals, instrumental } = res.data?.result || {};

      if (!vocals && !instrumental) throw new Error('API returned no tracks');

      await sock.sendMessage(from, { text: '✅ Separation complete!', edit: statusMsg.key });

      if (vocals) {
        await sock.sendMessage(from, { audio: { url: vocals }, mimetype: 'audio/mpeg' }, { quoted: msg });
        await sock.sendMessage(from, { text: `🎤 *Vocals* - ${title || ''}` });
      }
      if (instrumental) {
        await sock.sendMessage(from, { audio: { url: instrumental }, mimetype: 'audio/mpeg' }, { quoted: msg });
        await sock.sendMessage(from, { text: `🎵 *Instrumental* - ${title || ''}` });
      }

      await react('✅');
    } catch (e) {
      console.error(e);
      await reply(`❌ Error: ${e.message}`);
      await react('❌');
    }
  }
};
