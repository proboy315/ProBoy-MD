/**
 * .antilink on|off
 * .antilink status
 * .antilink action <delete|kick|warn>
 * .antilink exclude add|remove|list <domain>
 * .antilink include add|remove|list <pattern>
 * .antilink warnlimit <number>
 * .antilink resetwarn @user
 *
 * Full control over the antilink system (utils/antiSystem.js).
 *
 * EXCLUDE  = domains that are always allowed through, even while antilink
 *            is on (e.g. `.antilink exclude add youtube.com`).
 * INCLUDE  = specific substrings/patterns that are ALWAYS blocked,
 *            regardless of whether antilink itself is on or off — for
 *            explicit "always nuke this" rules like a known phishing link
 *            (e.g. `.antilink include add proboy-md.gt.tc`).
 * ACTION   = what happens on a violation: delete the message, kick the
 *            sender, or warn (kicks automatically once the warn limit is
 *            reached).
 * WARNLIMIT = how many warnings before an automatic kick (per-group,
 *             falls back to the bot's global default if not set).
 */

const config = require('../../config');
const antiSystem = require('../../utils/antiSystem');

module.exports = {
  name: 'antilink',
  category: 'general',
  description: 'Configure anti-link: on/off, exclude/include lists, action, warning limit',
  usage: `${config.prefix}antilink on|off|status|action <delete|kick|warn>|exclude add|remove|list <domain>|include add|remove|list <pattern>|warnlimit <n>|resetwarn @user`,
  groupOnly: true,
  adminOnly: true,

  async execute(sock, msg, args, extra) {
    const { reply, react, from, database } = extra;
    try {
      const sub = (args[0] || '').toLowerCase();
      const settings = database.getGroupSettings(from);

      if (sub === 'on' || sub === 'off') {
        database.updateGroupSettings(from, { antilink: sub === 'on' });
        await react('✅');
        return reply(`🔗 Anti-link is now *${sub.toUpperCase()}* in this group.`);
      }

      if (sub === 'action') {
        const action = (args[1] || '').toLowerCase();
        if (!['delete', 'kick', 'warn'].includes(action)) {
          return reply(`❌ Action must be one of: delete, kick, warn\nUsage: ${config.prefix}antilink action <delete|kick|warn>`);
        }
        database.updateGroupSettings(from, { antilinkAction: action });
        await react('✅');
        return reply(`🔗 Anti-link action set to *${action}*.`);
      }

      if (sub === 'exclude' || sub === 'include') {
        const key = sub === 'exclude' ? 'antilinkWhitelist' : 'antilinkInclude';
        const label = sub === 'exclude' ? 'Exclude (always allowed)' : 'Include (always blocked)';
        const op = (args[1] || '').toLowerCase();
        const value = args.slice(2).join(' ').trim();
        const current = Array.isArray(settings[key]) ? settings[key].slice() : [];

        if (op === 'add') {
          if (!value) return reply(`❌ Usage: ${config.prefix}antilink ${sub} add <${sub === 'exclude' ? 'domain' : 'pattern'}>`);
          if (!current.includes(value)) current.push(value);
          database.updateGroupSettings(from, { [key]: current });
          await react('✅');
          return reply(`✅ Added to ${label} list: "${value}"`);
        }

        if (op === 'remove') {
          if (!value) return reply(`❌ Usage: ${config.prefix}antilink ${sub} remove <${sub === 'exclude' ? 'domain' : 'pattern'}>`);
          const updated = current.filter(v => v !== value);
          database.updateGroupSettings(from, { [key]: updated });
          await react('✅');
          return reply(`✅ Removed from ${label} list: "${value}"`);
        }

        if (op === 'list' || !op) {
          if (!current.length) return reply(`${label} list is empty.`);
          return reply(`${label} list:\n${current.map((v, i) => `${i + 1}. ${v}`).join('\n')}`);
        }

        return reply(`❌ Usage: ${config.prefix}antilink ${sub} add|remove|list <value>`);
      }

      if (sub === 'warnlimit') {
        const n = Number(args[1]);
        if (!Number.isFinite(n) || n <= 0) {
          const effective = antiSystem.getAntilinkWarnLimit(settings);
          return reply(`Current warning limit: ${effective}\nUsage: ${config.prefix}antilink warnlimit <number>`);
        }
        database.updateGroupSettings(from, { antilinkWarnLimit: n });
        await react('✅');
        return reply(`✅ Anti-link warning limit set to ${n}.`);
      }

      if (sub === 'resetwarn') {
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        const target = mentioned || (args[1] ? `${args[1].replace(/\D/g, '')}@s.whatsapp.net` : null);
        if (!target) return reply(`❌ Mention a user or give a number.\nUsage: ${config.prefix}antilink resetwarn @user`);
        database.clearWarnings(from, target);
        await react('✅');
        return sock.sendMessage(from, { text: `✅ Anti-link warnings reset for @${target.split('@')[0]}.`, mentions: [target] }, { quoted: msg });
      }

      // Default: show status
      const exclude = Array.isArray(settings.antilinkWhitelist) ? settings.antilinkWhitelist : [];
      const include = Array.isArray(settings.antilinkInclude) ? settings.antilinkInclude : [];
      const warnLimit = antiSystem.getAntilinkWarnLimit(settings);
      return reply(
        `🔗 *Anti-Link Status*\n\n` +
        `State: *${settings.antilink ? 'ON' : 'OFF'}*\n` +
        `Action: *${settings.antilinkAction || 'delete'}*\n` +
        `Warn limit: ${warnLimit}\n` +
        `Exclude list: ${exclude.length ? exclude.join(', ') : '(empty)'}\n` +
        `Include list: ${include.length ? include.join(', ') : '(empty)'}\n\n` +
        `Usage:\n${this.usage}`
      );
    } catch (error) {
      await reply(`❌ ${error.message}`);
      await react('❌');
    }
  }
};
