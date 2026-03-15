const database = require('../../database');
const config = require('../../config');

module.exports = {
  name: 'welcome',
  aliases: ['goodbye', 'setwelcome', 'setgoodbye'],
  category: 'group',
  description: 'Configure welcome/goodbye messages',
  usage: '.welcome on/off | .setwelcome <text> | .goodbye on/off | .setgoodbye <text>',
  groupOnly: true,
  adminOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const { from, reply, react } = extra;
      const invoked = (extra.commandName || '').toLowerCase();
      const s = database.getGroupSettings(from);

      await react('⏳');

      if (invoked === 'welcome' || invoked === 'goodbye') {
        const sub = (args[0] || '').toLowerCase();
        if (!sub || sub === 'status') {
          return reply(
            `*Greeting Status*\n\n` +
            `Welcome: ${s.welcome ? '✅' : '❌'}\n` +
            `Goodbye: ${s.goodbye ? '✅' : '❌'}`
          );
        }
        if (!['on', 'off'].includes(sub)) {
          return reply(`❌ Usage: .${invoked} on/off`);
        }
        const key = invoked === 'welcome' ? 'welcome' : 'goodbye';
        database.updateGroupSettings(from, { [key]: sub === 'on' });
        await reply(`✅ ${invoked} ${sub === 'on' ? 'enabled' : 'disabled'}.`);
        return react('✅');
      }

      if (invoked === 'setwelcome' || invoked === 'setgoodbye') {
        const text = args.join(' ').trim();
        if (!text) {
          return reply(
            `❌ Usage: .${invoked} <text>\n\n` +
            `Variables:\n` +
            `@user, @group`
          );
        }
        const key = invoked === 'setwelcome' ? 'welcomeMessage' : 'goodbyeMessage';
        database.updateGroupSettings(from, { [key]: text });
        await reply('✅ Message updated.');
        return react('✅');
      }

      await reply('❌ Unknown greeting command.');
      await react('❌');
    } catch (e) {
      await extra.reply(`❌ ${e.message}`);
      await extra.react('❌');
    }
  }
};
