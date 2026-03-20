/**
 * Flag Game – Start a multiplayer flag‑guessing game
 * Players guess the country name from a flag emoji.
 */

const axios = require('axios');

// Game state map
const flagGames = new Map();

// Flag data cache
let flagCache = null;
let lastFetch = 0;
const CACHE_TIME = 5 * 60 * 1000;

async function fetchFlags() {
  const now = Date.now();
  if (flagCache && now - lastFetch < CACHE_TIME) return flagCache;
  try {
    const res = await axios.get('https://raw.githubusercontent.com/Mayelprince/games/refs/heads/main/flaggame/flags.json', { timeout: 10000 });
    if (Array.isArray(res.data)) {
      flagCache = res.data;
      lastFetch = now;
      return flagCache;
    }
  } catch (e) {
    console.log('Failed to fetch flags:', e.message);
  }
  return [
    { flag: '🇺🇸', country: 'United States', capital: 'Washington D.C.', continent: 'North America', options: ['United States', 'Canada', 'Mexico', 'Brazil'] },
    { flag: '🇬🇧', country: 'United Kingdom', capital: 'London', continent: 'Europe', options: ['United Kingdom', 'France', 'Germany', 'Spain'] },
    { flag: '🇯🇵', country: 'Japan', capital: 'Tokyo', continent: 'Asia', options: ['Japan', 'China', 'South Korea', 'Thailand'] }
  ];
}

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function nextFlagTurn(game) {
  game.currentIndex++;
  if (game.currentIndex >= game.players.length) {
    game.currentIndex = 0;
    game.round++;
  }
}

async function startFlagRound(sock, from) {
  const game = flagGames.get(from);
  if (!game) return;
  if (game.round > game.maxRounds) {
    await endFlagGame(sock, from);
    return;
  }
  const flags = await fetchFlags();
  const unused = flags.filter(f => !game.used.includes(f.country));
  const flag = unused.length ? unused[Math.floor(Math.random() * unused.length)] : flags[Math.floor(Math.random() * flags.length)];
  const shuffledOptions = shuffleArray([...flag.options]);
  game.used.push(flag.country);
  game.currentFlag = { ...flag, shuffledOptions };
  const player = game.players[game.currentIndex];
  const optionsText = shuffledOptions.map((o, i) => `• ${i+1}. ${o}`).join('\n');
  await sock.sendMessage(from, {
    text: `╭━━━━━━━━━━━━━━━╮
│ 🎌 *FLAG GAME - Round ${game.round}/${game.maxRounds}*
├━━━━━━━━━━━━━━━┤
│ Flag: ${flag.flag}
│
${optionsText}
│
│ 🎮 @${player.id.split('@')[0]}'s turn
│ ⏱️ 30 seconds
╰━━━━━━━━━━━━━━━╯`,
    mentions: [player.id]
  });
  if (game.turnTimeout) clearTimeout(game.turnTimeout);
  game.turnTimeout = setTimeout(async () => {
    if (!flagGames.has(from)) return;
    await sock.sendMessage(from, {
      text: `⏰ @${player.id.split('@')[0]} ran out of time! The answer was *${flag.country}*`,
      mentions: [player.id]
    });
    nextFlagTurn(game);
    await startFlagRound(sock, from);
  }, 30000);
}

async function endFlagGame(sock, from) {
  const game = flagGames.get(from);
  if (!game) return;
  const scoresArray = Array.from(game.scores.entries()).sort((a, b) => b[1] - a[1]);
  let scoresText = '';
  const mentions = [];
  scoresArray.forEach(([id, score], i) => {
    mentions.push(id);
    scoresText += `${i+1}. @${id.split('@')[0]} → ${score} pts\n`;
  });
  await sock.sendMessage(from, {
    text: `╭━━━━━━━━━━━━━━━╮
│ 🎌 *FLAG GAME OVER*
├━━━━━━━━━━━━━━━┤
│ 📊 *Final Scores*
│
${scoresText}
╰━━━━━━━━━━━━━━━╯`,
    mentions
  });
  if (game.turnTimeout) clearTimeout(game.turnTimeout);
  flagGames.delete(from);
}

module.exports = {
  name: 'flaggame',
  aliases: ['flag'],
  category: 'games',
  description: '🎌 Multiplayer flag‑guessing game',
  usage: '.flaggame',

  async execute(sock, msg, args, extra) {
    const { from, sender, isGroup, reply } = extra;
    if (!isGroup) return reply('❌ This game can only be played in groups.');
    if (flagGames.has(from)) return reply('⚠️ A flag game is already running in this group.');

    const game = {
      host: sender,
      players: [{ id: sender }],
      scores: new Map([[sender, 0]]),
      round: 1,
      maxRounds: 5,
      currentIndex: 0,
      currentFlag: null,
      joinPhase: true,
      used: [],
      turnTimeout: null
    };
    flagGames.set(from, game);

    await sock.sendMessage(from, {
      text: `╭━━━━━━━━━━━━━━━╮
│ 🎌 *FLAG GAME STARTED*
├━━━━━━━━━━━━━━━┤
│ Host: @${sender.split('@')[0]}
│
│ 📜 *Rules:*
│ • Guess the country name
│ • You can type the name or the number (1‑4)
│ • 30 seconds per turn
│ • 5 rounds
│
│ ⏱️ 30 seconds to join
│ 👥 Type *join* to play!
╰━━━━━━━━━━━━━━━╯`,
      mentions: [sender]
    }, { quoted: msg });

    setTimeout(async () => {
      const g = flagGames.get(from);
      if (!g || !g.joinPhase) return;
      g.joinPhase = false;
      if (g.players.length < 2) {
        flagGames.delete(from);
        return await sock.sendMessage(from, { text: '❌ Game cancelled – need at least 2 players.' });
      }
      await startFlagRound(sock, from);
    }, 30000);
  }
};

// Export the map so stopflag can import it
module.exports.flagGames = flagGames;
