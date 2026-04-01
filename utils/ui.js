const config = require('../config');

const safe = (v) => String(v ?? '').trim();

const headerLine = (title) => {
  const bot = safe(config.botName) || 'Bot';
  const ver = safe(config.version) || '1.0.0';
  const t = safe(title) || bot;
  return `╭──〔 *${t}* 〕──╮\n│ 🤖 ${bot} v${ver}\n╰──────────────╯`;
};

const box = (title, lines = [], footer = null) => {
  const body = (Array.isArray(lines) ? lines : [lines])
    .map(x => safe(x))
    .filter(Boolean)
    .join('\n');

  const foot = safe(footer);
  return [
    headerLine(title),
    body ? `\n${body}` : '',
    foot ? `\n\n${foot}` : ''
  ].join('');
};

module.exports = { box, headerLine };

