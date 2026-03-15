const database = require('../../database');

module.exports = {
  name: 'antilink',
  aliases: ['al'],
  category: 'group',
  description: 'Toggle anti-link and manage whitelist',
  usage: '.antilink <on/off/status/action/whitelist> ...',
  groupOnly: true,
  adminOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const { from, reply, react } = extra;
      const sub = (args[0] || '').toLowerCase();
      const settings = database.getGroupSettings(from);

      if (!sub || sub === 'help') {
        return reply(
          `*AntiLink*\n\n` +
          `.antilink on/off\n` +
          `.antilink status\n` +
          `.antilink action delete|kick|warn\n` +
          `.antilink whitelist add <domain>\n` +
          `.antilink whitelist del <domain>\n` +
          `.antilink whitelist list\n` +
          `.antilink whitelist clear`
        );
      }

      await react('⏳');

      if (sub === 'on' || sub === 'enable') {
        database.updateGroupSettings(from, { antilink: true });
        await reply('✅ AntiLink enabled.');
      } else if (sub === 'off' || sub === 'disable') {
        database.updateGroupSettings(from, { antilink: false });
        await reply('❌ AntiLink disabled.');
      } else if (sub === 'status') {
        const wl = Array.isArray(settings.antilinkWhitelist) ? settings.antilinkWhitelist : [];
        await reply(
          `*AntiLink Status*\n\n` +
          `Enabled: ${settings.antilink ? '✅' : '❌'}\n` +
          `Action: ${(settings.antilinkAction || 'delete')}\n` +
          `Whitelist: ${wl.length ? wl.join(', ') : 'none'}`
        );
      } else if (sub === 'action') {
        const action = (args[1] || '').toLowerCase();
        if (!['delete', 'kick', 'warn'].includes(action)) {
          return reply('❌ Usage: .antilink action delete|kick|warn');
        }
        database.updateGroupSettings(from, { antilinkAction: action });
        await reply(`✅ AntiLink action set to: ${action}`);
      } else if (sub === 'whitelist') {
        const op = (args[1] || '').toLowerCase();
        const current = Array.isArray(settings.antilinkWhitelist) ? settings.antilinkWhitelist : [];

        if (op === 'list') {
          return reply(current.length ? `✅ Whitelist:\n- ${current.join('\n- ')}` : 'ℹ️ Whitelist is empty.');
        }
        if (op === 'clear') {
          database.updateGroupSettings(from, { antilinkWhitelist: [] });
          return reply('✅ Whitelist cleared.');
        }

        const domain = (args[2] || '').trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
        if (!domain || !domain.includes('.')) {
          return reply('❌ Usage: .antilink whitelist add <domain>\nExample: .antilink whitelist add youtube.com');
        }

        if (op === 'add') {
          const next = Array.from(new Set([...current, domain]));
          database.updateGroupSettings(from, { antilinkWhitelist: next });
          return reply(`✅ Added to whitelist: ${domain}`);
        }
        if (op === 'del' || op === 'remove') {
          const next = current.filter(d => String(d).toLowerCase() !== domain);
          database.updateGroupSettings(from, { antilinkWhitelist: next });
          return reply(`✅ Removed from whitelist: ${domain}`);
        }

        return reply('❌ Usage: .antilink whitelist add|del|list|clear');
      } else {
        await reply('❌ Unknown option. Type: .antilink help');
      }

      await react('✅');
    } catch (e) {
      await extra.reply(`❌ ${e.message}`);
      await extra.react('❌');
    }
  }
};

