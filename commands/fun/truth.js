/**
 * Truth - Get a random truth question from @bochilteam/scraper (translated to English)
 */

const { translate } = require('@vitalets/google-translate-api');

let truthFn = null;
const getTruthFn = () => {
  if (truthFn) return truthFn;
  // Lazy-load to avoid side effects during command discovery/startup.
  const mod = require('@bochilteam/scraper');
  truthFn = mod.truth;
  return truthFn;
};

module.exports = {
    name: 'truth',
    aliases: [],
    category: 'fun',
    desc: 'Get a random truth question',
    usage: 'truth',
    execute: async (sock, msg, args, extra) => {
      try {
        const truth = getTruthFn();
        const question = await truth();
        
        // Translate to English
        const res = await translate(question, { to: 'en' });
        
        await extra.reply(res.text);
        
      } catch (error) {
        console.error('Truth Error:', error);
        await extra.reply(`❌ Error: ${error.message}`);
      }
    }
  };
  
