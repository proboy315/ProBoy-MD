const axios = require('axios');
const { downloadMediaMessage } = require('prince-baileys');
const { uploadToCatbox } = require('../../lib/functions');

const MODELS = ['ezremove_4.0', 'ezremove_4.0_pro', 'ezremove_3.0', 'ezremove_3.0_pro', 'nano_banana', 'nano_banana_pro', 'seedream_4', 'seedream_45'];
const RESOLUTIONS = ['1K', '2K', '4K'];

module.exports = {
  name: 'photoedit3',
  aliases: ['pedit3', 'editphoto3', 'aiphoto'],
  category: 'ai',
  description: '✨ Edit photo with advanced models (reply to image)',
  usage: '.photoedit3 <prompt> | <model> | <resolution>',

  async execute(sock, msg, args, extra) {
    const { from, reply, react, quoted } = extra;
    const q = args.join(' ');
    if (!q) {
      return reply(`╭═══〘 *USAGE* 〙═══⊷❍
┃✯│ .photoedit3 prompt | model | resolution
┃✯│ Models: ${MODELS.join(', ')}
┃✯│ Resolutions: ${RESOLUTIONS.join(', ')}
╰══════════════════⊷❍`);
    }

    const parts = q.split('|').map(s => s.trim());
    const prompt = parts[0];
    const model = parts[1] || 'ezremove_4.0';
    const resolution = parts[2] || '1K';

    if (!prompt) return reply('❌ Please provide a prompt.');
    if (!MODELS.includes(model)) return reply(`❌ Invalid model. Use one of: ${MODELS.join(', ')}`);
    if (!RESOLUTIONS.includes(resolution)) return reply(`❌ Invalid resolution. Use: ${RESOLUTIONS.join(', ')}`);

    if (!quoted || quoted.type !== 'imageMessage') {
      return reply('❌ Please reply to an image.');
    }

    try {
      await react('✨');
      const statusMsg = await sock.sendMessage(from, { text: `⏳ Editing with ${model} at ${resolution}...` }, { quoted: msg });

      const buffer = await quoted.download();
      const imageUrl = await uploadToCatbox(buffer, 'image.jpg');
      if (!imageUrl) throw new Error('Upload failed');

      const apiUrl = `https://api.giftedtech.co.ke/api/tools/photoeditorv3?apikey=gifted&url=${encodeURIComponent(imageUrl)}&prompt=${encodeURIComponent(prompt)}&model=${encodeURIComponent(model)}&resolution=${encodeURIComponent(resolution)}`;
      const res = await axios.get(apiUrl);
      const resultUrl = res.data?.result?.output;

      if (!resultUrl) throw new Error('API returned no result');

      await sock.sendMessage(from, { text: '✅ Done!', edit: statusMsg.key });
      await sock.sendMessage(from, {
        image: { url: resultUrl },
        caption: `╭═══〘 *PHOTO EDIT V3* 〙═══⊷❍
┃✯│ ✨ *Prompt:* ${prompt}
┃✯│ 🤖 *Model:* ${model}
┃✯│ 🖥️ *Resolution:* ${resolution}
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