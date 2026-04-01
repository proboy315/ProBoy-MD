const axios = require('axios');
const config = require('../../config');
const { uploadToCatbox } = require('../../utils/catbox');

module.exports = {
  name: 'photoedit',
  aliases: ['pedit', 'editphoto'],
  category: 'ai',
  description: '🎨 Edit a photo with AI (reply to image with prompt)',
  usage: '.photoedit <prompt> (reply to an image)',

  async execute(sock, msg, args, extra) {
    const { from, reply, react, quoted } = extra;
    const prompt = args.join(' ');
    if (!prompt) return reply('❌ Please provide a prompt.\nExample: .photoedit make it look like a painting');

    if (!quoted || quoted.type !== 'imageMessage') {
      return reply('❌ Please reply to an image.');
    }

    try {
      await react('🎨');
      const statusMsg = await sock.sendMessage(from, { text: '⏳ Editing photo...' }, { quoted: msg });

      // Download image
      const buffer = await quoted.download();
      const imageUrl = await uploadToCatbox(buffer, 'image.jpg');
      if (!imageUrl) throw new Error('Upload failed');

      // Call API
      const baseUrl = config.apis?.giftedtech?.baseUrl || 'https://api.giftedtech.co.ke/api';
      const apikey = config.apis?.giftedtech?.apiKey || 'gifted';
      const apiUrl = `${baseUrl}/tools/photoeditor?apikey=${encodeURIComponent(apikey)}&url=${encodeURIComponent(imageUrl)}&prompt=${encodeURIComponent(prompt)}`;
      const res = await axios.get(apiUrl);
      const resultUrl = res.data?.result;

      if (!resultUrl) throw new Error('API returned no result');

      await sock.sendMessage(from, { text: '✅ Done!', edit: statusMsg.key });
      await sock.sendMessage(from, {
        image: { url: resultUrl },
        caption: `╭═══〘 *PHOTO EDIT* 〙═══⊷❍
┃✯│ 🎨 *Prompt:* ${prompt}
╰══════════════════⊷❍`
      }, { quoted: msg });

      await react('✅');
    } catch (e) {
      console.error(e);
      await reply(`❌ Error: ${e.message}`);
      await react('❌');
    }
  }
};
