/**
 * Pair Command for ProBoy‑MD
 * Generates a WhatsApp pairing code using an external API.
 * Includes a copy button for easy code copying.
 */

const axios = require('axios');
const { sendInteractiveMessage } = require('gifted-btns'); // Ensure gifted-btns is installed

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

      // React with hourglass and optionally send a "please wait" message
      await extra.react('⏳');
      // Optional: send a temporary info message (but we'll rely on reaction)
      // If you want a message, uncomment the next line
      // await extra.reply('⏳ Generating your pair code, please wait... (Render may take a few seconds to start)');

      // Build API URL
      const apiUrl = `https://proboy-pair.onrender.com/pair?number=${encodeURIComponent(cleaned)}`;

      // Make request with a longer timeout (Render free tier can be slow to start)
      const response = await axios.get(apiUrl, { timeout: 30000 }); // 30 seconds

      // Check response structure
      if (response.status !== 200 || !response.data || !response.data.code) {
        throw new Error('Invalid response from pairing server');
      }

      const pairCode = response.data.code; // e.g., "2T4T-DJ8N"

      // Prepare the interactive button for copying the code
      const buttons = [
        {
          name: 'cta_copy',
          buttonParamsJson: JSON.stringify({
            display_text: '📋 Copy Code',
            copy_code: pairCode
          })
        }
      ];

      // Send the message with the code and the copy button
      await sendInteractiveMessage(sock, extra.from, {
        text: `✅ *Pair Code Generated Successfully!*\n\nYour pair code is:\n\n\`${pairCode}\`\n\nTap the button below to copy it.`,
        footer: 'ProBoy‑MD',
        interactiveButtons: buttons
      }, { quoted: msg });

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
        errorMsg = '❌ No response from pairing server. It may be down or still starting up.';
      } else {
        errorMsg = `❌ ${error.message}`;
      }
      await extra.reply(errorMsg);
      await extra.react('❌');
    }
  }
};
