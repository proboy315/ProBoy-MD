// commands/utility/pair.js
const axios = require('axios');

module.exports = {
  name: 'pair',
  aliases: ['getpair'],
  category: 'utility',
  description: 'Generate a WhatsApp pairing code for a given phone number',
  usage: '.pair <phone_number>',
  ownerOnly: false, // Everyone can use this 

  async execute(sock, msg, args, extra) {
    try {
      // Check if number is provided
      const number = args[0];
      if (!number) {
        return extra.reply(`❌ Please provide a phone number.\n*Usage:* ${this.usage}`);
      }

      // Basic validation – ensure it's numeric (allow + or just digits)
      const cleaned = number.replace(/[^0-9]/g, '');
      if (cleaned.length < 10) {
        return extra.reply('❌ Invalid phone number. Please provide a valid number with country code (e.g., 923001234567).');
      }

      await extra.react('⏳'); // Processing reaction

      // Build API URL
      const apiUrl = `https://proboy-pair.onrender.com/pair?number=${encodeURIComponent(cleaned)}`;

      // Make request
      const response = await axios.get(apiUrl, { timeout: 10000 });

      // Check response structure
      if (response.status !== 200 || !response.data || !response.data.code) {
        throw new Error('Invalid response from pairing server');
      }

      const pairCode = response.data.code; // e.g., "2T4T-DJ8N"

      // Send only the code in a new message
      await sock.sendMessage(extra.from, { text: `Your Pair Code Is 👇\n\n${pairCode}` }, { quoted: msg });

      await extra.react('✅'); // Success reaction
    } catch (error) {
      console.error('Pair command error:', error);
      let errorMsg = '❌ Failed to generate pair code.';
      if (error.response) {
        // API responded with error
        if (error.response.status === 400) {
          errorMsg = '❌ Invalid number format or API error.';
        } else {
          errorMsg = `❌ Server error: ${error.response.status}`;
        }
      } else if (error.request) {
        errorMsg = '❌ No response from pairing server. It may be down.';
      } else {
        errorMsg = `❌ ${error.message}`;
      }
      await extra.reply(errorMsg);
      await extra.react('❌');
    }
  }
};
