const axios = require('axios');
const { downloadMediaMessage } = require('prince-baileys');
const { uploadToCatbox } = require('../../lib/functions');

module.exports = {
  name: 'photoedit2',
  aliases: ['pedit2', 'editphoto2', 'gptphoto'],
  category: 'ai',
  description: '🖼️ Edit photo with GPT model (reply to image with prompt)',
  usage: '.photoedit2 <prompt> (reply to an image)',

  async execute(sock, msg, args, extra) {
    const { from, reply, react, quoted } = extra;
    const prompt = args.join(' ');
    if (!prompt) return reply('❌ Please provide a prompt.');

    if (!quoted || quoted.type !== 'imageMessage') {
      return reply('❌ Please reply to an image.');
    }

    try {
      await react('🖼️');
      const statusMsg = await sock.sendMessage(from, { text: '⏳ Editing with GPT model...' }, { quoted: msg });

      const buffer = await quoted.download();
      const imageUrl = await uploadToCatbox(buffer, 'image.jpg');
      if (!imageUrl) throw new Error('Upload failed');

      const apiUrl = `https://api.giftedtech.co.ke/api/tools/photoeditorv2?apikey=gifted&url=${encodeURIComponent(imageUrl)}&prompt=${encodeURIComponent(prompt)}&model=gpt-image-1`;
      const res = await axios.get(apiUrl, { responseType: 'arraybuffer', timeout: 90000 });
      const imgBuffer = Buffer.from(res.data);

      await sock.sendMessage(from, { text: '✅ Done!', edit: statusMsg.key });
      await sock.sendMessage(from, {
        image: imgBuffer,
        caption: `╭═══〘 *PHOTO EDIT V2* 〙═══⊷❍
┃✯│ 🖼️ *Prompt:* ${prompt}
┃✯│ 🤖 Model: GPT-image-1
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