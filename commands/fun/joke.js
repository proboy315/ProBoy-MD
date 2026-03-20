

const axios = require('axios');

module.exports = {

  name: 'joke',

  aliases: ['jokes', 'dadjoke'],

  category: 'fun',

  description: 'Get a random joke to brighten your day',

  usage: '.joke',

  async execute(sock, msg, args, extra) {

    try {

      // If user adds extra arguments, kindly ignore or show usage

      if (args.length > 0) {

        return extra.reply('❌ This command doesn\'t need any arguments. Just type `.joke`');

      }

      // React to show we're fetching

      await extra.react('😄');

      // Call the API

      const apiUrl = 'https://api.giftedtech.co.ke/api/fun/jokes';

      const response = await axios.get(apiUrl, {

        params: { apikey: 'gifted' },

        timeout: 10000 // 10 seconds

      });

      // Validate response

      if (!response.data || !response.data.success || !response.data.result) {

        console.error('Invalid joke API response:', response.data);

        return extra.reply('❌ Failed to fetch a joke. The service returned an unexpected response.');

      }

      const joke = response.data.result;

      const setup = joke.setup || 'No setup';

      const punchline = joke.punchline || 'No punchline';

      // Format the joke nicely

      const jokeText = `😂 *Random Joke*\n\n❓ *${setup}*\n\n💥 *${punchline}*`;

      await extra.reply(jokeText);

      await extra.react('😂');

    } catch (error) {

      console.error('Joke command error:', error.message);

      // Handle specific errors

      if (error.code === 'ECONNABORTED') {

        await extra.reply('❌ Request timed out. Please try again later.');

      } else if (error.response) {

        await extra.reply(`❌ API error: ${error.response.status} - ${error.response.statusText}`);

      } else if (error.request) {

        await extra.reply('❌ No response from joke service.');

      } else {

        await extra.reply('❌ Failed to fetch a joke. Please try again.');

      }

      await extra.react('❌').catch(() => {});

    }

  }

};