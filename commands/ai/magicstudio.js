

const axios = require('axios');

module.exports = {
  name: 'imagine',
  aliases: ['magic', 'imagine', 'genimg'],
  category: 'ai',
  description: 'Generate an image from a text prompt',
  usage: '.imagine <your prompt>',

  async execute(sock, msg, args, extra) {
    try {
      // No arguments? Show usage hint
      if (!args.length) {
        return extra.reply(`❌ Please provide a prompt.\nExample: ${this.usage}`);
      }

      const prompt = args.join(' ');

      // Show "generating" reaction
      await extra.react('🎨');

      // Call the Magic Studio API
      const apiUrl = 'https://api.giftedtech.co.ke/api/ai/magicstudio';
      const response = await axios.get(apiUrl, {
        params: {
          apikey: 'gifted',
          prompt: prompt
        },
        timeout: 60000 // 60 seconds – image generation may take a while
      });

      // Validate API response
      if (!response.data || !response.data.success || !response.data.result?.imageUrl) {
        console.error('Invalid API response:', response.data);
        return extra.reply('❌ Failed to generate image. The service returned an unexpected response.');
      }

      const imageUrl = response.data.result.imageUrl;

      // Download the generated image
      const imageResponse = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 30000
      });

      const imageBuffer = Buffer.from(imageResponse.data);

      // Send the image as a WhatsApp photo
      await sock.sendMessage(extra.from, {
        image: imageBuffer,
        caption: `🎨 *Generated for:* ${prompt}`
      }, { quoted: msg });

      // Success reaction
      await extra.react('✅');

    } catch (error) {
      console.error('Magic Studio error:', error.message);

      // Handle specific errors
      if (error.code === 'ECONNABORTED') {
        await extra.reply('❌ Request timed out. The image generation took too long.');
      } else if (error.response) {
        // API responded with error status
        await extra.reply(`❌ API error: ${error.response.status} - ${error.response.statusText}`);
      } else if (error.request) {
        await extra.reply('❌ No response from the image generation service.');
      } else {
        await extra.reply('❌ Failed to generate image. Please try again later.');
      }

      // Clear reaction on error
      await extra.react('❌').catch(() => {});
    }
  }
};