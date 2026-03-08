/**
 * Movie Info Plugin for ProBoy‑MD
 * Fetches detailed information about a movie using IMDb data.
 * Original by MAFIA ADEEL – converted to ProBoy‑MD.
 */

const axios = require('axios');

module.exports = {
  name: 'movie',
  aliases: ['imdb', 'film'],
  category: 'utility',
  description: 'Fetch detailed information about a movie',
  usage: '.movie <movie name>',

  async execute(sock, msg, args, extra) {
    const { from, reply, react, sender } = extra;

    try {
      // Get movie name from arguments
      const movieName = args.join(' ').trim();
      if (!movieName) {
        return reply('📽️ Please provide the name of the movie.\nExample: .movie Iron Man');
      }

      await react('🎬'); // processing reaction

      // API endpoint
      const apiUrl = `https://apis.davidcyriltech.my.id/imdb?query=${encodeURIComponent(movieName)}`;
      const response = await axios.get(apiUrl);

      // Check response
      if (!response.data.status || !response.data.movie) {
        await react('❌');
        return reply('🚫 Movie not found. Please check the name and try again.');
      }

      const movie = response.data.movie;

      // Format the caption (using original style)
      const caption = `
🎬 *${movie.title}* (${movie.year}) ${movie.rated || ''}

⭐ *IMDb:* ${movie.imdbRating || 'N/A'} | 🍅 *Rotten Tomatoes:* ${movie.ratings?.find(r => r.source === 'Rotten Tomatoes')?.value || 'N/A'} | 💰 *Box Office:* ${movie.boxoffice || 'N/A'}

📅 *Released:* ${new Date(movie.released).toLocaleDateString()}
⏳ *Runtime:* ${movie.runtime}
🎭 *Genre:* ${movie.genres}

📝 *Plot:* ${movie.plot}

🎥 *Director:* ${movie.director}
✍️ *Writer:* ${movie.writer}
🌟 *Actors:* ${movie.actors}

🌍 *Country:* ${movie.country}
🗣️ *Language:* ${movie.languages}
🏆 *Awards:* ${movie.awards || 'None'}

[View on IMDb](${movie.imdbUrl})
      `.trim();

      // Determine poster URL (fallback if N/A)
      const posterUrl = movie.poster && movie.poster !== 'N/A'
        ? movie.poster
        : 'https://i.postimg.cc/6qsWSKXV/Screenshot-20250505-154041-1-1.jpg';

      // Send image with caption and context info (including newsletter forward)
      await sock.sendMessage(
        from,
        {
          image: { url: posterUrl },
          caption: caption,
          contextInfo: {
            mentionedJid: [sender],
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
              newsletterJid: '120363422946163295@newsletter',
              newsletterName: 'ProBoy-MD',
              serverMessageId: 143
            }
          }
        },
        { quoted: msg }
      );

      await react('✅'); // success reaction
    } catch (error) {
      console.error('Movie command error:', error);
      await reply(`❌ Error: ${error.message}`);
      await react('❌');
    }
  }
};
