const axios = require('axios');
const { writeFile, unlink } = require('fs').promises;
const path = require('path');
const { tmpdir } = require('os');

module.exports = {
  name: 'sumiesymbolic',
  aliases: ['sumi_e_symbolic'],
  category: 'ai',
  description: 'Generate AI image in sumi-e symbolic style',
  usage: '.sumiesymbolic <prompt>',
  
  async execute(sock, msg, args, extra) {
    const { reply, react, from } = extra;
    try {
      if (!args.length) return reply(`❌ Please provide a prompt.\n\nExample: ${this.usage}`);
      await react('⏳');
      const prompt = args.join(' ');
      const style = 'sumi_e_symbolic';
      const apiUrl = `https://text2img.hideme.eu.org/image?prompt=${encodeURIComponent(prompt)}&model=flux&style=${style}`;
      const response = await axios({ method: 'get', url: apiUrl, responseType: 'arraybuffer' });
      const imageBuffer = Buffer.from(response.data);
      const tempFile = path.join(tmpdir(), `proboy_ai_${Date.now()}.png`);
      await writeFile(tempFile, imageBuffer);
      await sock.sendMessage(from, { image: { url: tempFile }, caption: `🎨 *Prompt:* ${prompt}\n✨ *Style:* Sumi-e Symbolic\n🧠 *Powered by ProBoy AI*` }, { quoted: msg });
      await unlink(tempFile).catch(() => {});
      await react('✅');
    } catch (error) {
      await reply(`❌ Failed: ${error.message}`);
      await react('❌');
    }
  }
};
