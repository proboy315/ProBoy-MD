const axios = require('axios');
const { writeFile, unlink } = require('fs').promises;
const path = require('path');
const { tmpdir } = require('os');
const config = require('../../config');

module.exports = {
  name: 'caricature',
  aliases: [],
  category: 'ai',
  description: 'Generate AI image in caricature style',
  usage: '.caricature <prompt>',
  
  async execute(sock, msg, args, extra) {
    const { reply, react, from } = extra;
    try {
      if (!args.length) return reply(`❌ Please provide a prompt.\n\nExample: ${this.usage}`);
      await react('⏳');
      const prompt = args.join(' ');
      const style = 'caricature';
      const baseUrl = config.apis?.hidemeText2Img?.baseUrl || 'https://text2img.hideme.eu.org';
      const apiUrl = `${baseUrl}/image?prompt=${encodeURIComponent(prompt)}&model=flux&style=${style}`;
      const response = await axios({ method: 'get', url: apiUrl, responseType: 'arraybuffer' });
      const imageBuffer = Buffer.from(response.data);
      const tempFile = path.join(tmpdir(), `${config.botName}_${Date.now()}.png`);
      await writeFile(tempFile, imageBuffer);
      await sock.sendMessage(from, { image: { url: tempFile }, caption: `🎨 *Prompt:* ${prompt}\n✨ *Style:* Caricature\n🧠 *Powered by ${config.botName} AI*` }, { quoted: msg });
      await unlink(tempFile).catch(() => {});
      await react('✅');
    } catch (error) {
      await reply(`❌ Failed: ${error.message}`);
      await react('❌');
    }
  }
};
