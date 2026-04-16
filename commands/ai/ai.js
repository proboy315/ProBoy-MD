

const axios = require('axios');
const config = require('../../config');

module.exports = {
  name: 'ai',
  aliases: ['gpt', 'ask', 'chatgpt'],
  category: 'ai',
  description: 'Ask the AI anything',
  usage: '.ai <your question>',

  async execute(sock, msg, args, extra) {
    try {
      // No arguments? Show usage hint
      if (!args.length) {
        return extra.reply(`❌ Please provide a question.\nExample: ${this.usage}`);
      }

      const question = args.join(' ');
      
      // Send a "thinking" reaction (optional)
      await extra.react('⏳');

      // Build the API URL
      const baseUrl = config.apis?.giftedtech?.baseUrl || 'https://api.giftedtech.co.ke/api';
      const apiUrl = `${baseUrl}/ai/gpt4o`;
      const params = {
        apikey: config.apis?.giftedtech?.apiKey || 'gifted',
        q: question
      };

      // Make the request
      const response = await axios.get(apiUrl, { params, timeout: 30000 }); // 30s timeout

      // Check response structure
      if (response.data && response.data.success && response.data.result) {
        const answer = response.data.result;
        await extra.reply(answer);
      } else {
        // Unexpected response format
        console.error('Unexpected API response:', response.data);
        await extra.reply('❌ AI service returned an unexpected response.');
      }

      // Remove the thinking reaction (optional)
      await extra.react('✅');
      
    } catch (error) {
      console.error('AI command error:', error.message);
      
      // Handle specific error types
      if (error.code === 'ECONNABORTED') {
        await extra.reply('❌ Request timed out. Please try again later.');
      } else if (error.response) {
        // The API responded with an error status
        await extra.reply(`❌ API error: ${error.response.status} - ${error.response.statusText}`);
      } else if (error.request) {
        // No response received
        await extra.reply('❌ No response from AI service. Check your connection.');
      } else {
        await extra.reply('❌ Failed to get a response from AI. Please try again.');
      }
      
      // Ensure reaction is cleared on error too
      await extra.react('❌').catch(() => {});
    }
  }
};
