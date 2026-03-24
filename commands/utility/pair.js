/**
 * Pair Command for ProBoy‑MD
 * Generates a WhatsApp pairing code using an external API.
 * Includes wait message, retry logic, and a copy button.
 */

const axios = require('axios');
const { sendInteractiveMessage } = require('gifted-btns');

module.exports = {
  name: 'pair',
  aliases: ['getpair'],
  category: 'utility',
  description: 'Generate a WhatsApp pairing code for a given phone number',
  usage: '.pair <phone_number>',
  ownerOnly: false,

  async execute(sock, msg, args, extra) {
    const { reply, react, from } = extra;

    try {
      // Validate input
      const number = args[0];
      if (!number) {
        return reply(`❌ Please provide a phone number.\n*Usage:* ${this.usage}`);
      }

      const cleaned = number.replace(/[^0-9]/g, '');
      if (cleaned.length < 10) {
        return reply('❌ Invalid phone number. Please provide a valid number with country code (e.g., 923001234567).');
      }

      await react('⏳');

      // Send a temporary "waiting" message that we'll edit later
      const waitMsg = await sock.sendMessage(from, {
        text: '⏳ Generating your pair code...\n_This may take up to 30 seconds (free Render server startup)._'
      }, { quoted: msg });
      const waitKey = waitMsg.key;

      // Build API URL
      const apiUrl = `https://proboy-pair.onrender.com/pair?number=${encodeURIComponent(cleaned)}`;

      // Attempt the request with retry (2 attempts, longer timeout)
      let pairCode = null;
      let lastError = null;

      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const response = await axios.get(apiUrl, { timeout: 45000 }); // 45 seconds
          if (response.status === 200 && response.data && response.data.code) {
            pairCode = response.data.code;
            break;
          }
          throw new Error('Invalid API response');
        } catch (err) {
          lastError = err;
          if (attempt === 2) break;
          // Wait 3 seconds before retry
          await new Promise(r => setTimeout(r, 3000));
          await sock.sendMessage(from, { text: '🔄 Retrying...', edit: waitKey });
        }
      }

      if (!pairCode) {
        throw new Error(lastError?.message || 'No valid code received');
      }

      // Edit the waiting message to show success
      await sock.sendMessage(from, {
        text: '✅ Code generated successfully!',
        edit: waitKey
      });

      // Send interactive message with copy button
      await sendInteractiveMessage(sock, from, {
        text: `✅ *Pair Code Generated Successfully!*\n\nYour pair code is:\n\n\`${pairCode}\`\n\nTap the button below to copy it.`,
        footer: 'ProBoy‑MD',
        interactiveButtons: [
          {
            name: 'cta_copy',
            buttonParamsJson: JSON.stringify({
              display_text: '📋 Copy Code',
              copy_code: pairCode
            })
          }
        ]
      }, { quoted: msg });

      await react('✅');
    } catch (error) {
      console.error('Pair command error:', error);
      let errorMsg = '❌ Failed to generate pair code.';
      if (error.code === 'ECONNABORTED') {
        errorMsg = '❌ Request timed out. The server may be starting up – please try again in a minute.';
      } else if (error.response) {
        errorMsg = `❌ Server error: ${error.response.status}`;
      } else if (error.message) {
        errorMsg = `❌ ${error.message}`;
      }
      await reply(errorMsg);
      await react('❌');
    }
  }
};
