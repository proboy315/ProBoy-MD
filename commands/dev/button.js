const config = require('../../config');

module.exports = {
  name: 'button',
  aliases: ['menubutton', 'buttons'],
  category: 'dev',
  description: 'Enable or disable button menu mode',
  usage: '.button <on/off/status>',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const { database, reply, react } = extra;
    const sub = String(args[0] || 'status').toLowerCase();
    const key = 'menuButtonsEnabled';
    const current = !!database.getGlobalSetting(key);

    if (sub === 'status') {
      return reply(`🔘 Menu button mode: ${current ? 'ON' : 'OFF'}`);
    }

    if (sub !== 'on' && sub !== 'off') {
      return reply(`❌ Usage: ${this.usage}`);
    }

    const next = sub === 'on';
    database.setGlobalSetting(key, next);
    await react(next ? '✅' : '⚙️');
    return reply(`✅ ${config.botName} menu button mode ${next ? 'enabled' : 'disabled'}.`);
  }
};

