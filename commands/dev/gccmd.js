/**
 * Group Command Lock/Auto Trigger
 * - Map one command per group
 * - Delete normal messages, then run mapped command
 * - Block all manual commands in that group
 */

const { loadCommands } = require('../../utils/commandLoader');

let groupCmdMappings = new Map();

async function loadMappings(db) {
  const saved = db.getGlobalSetting('groupCmdMappings');
  if (saved && typeof saved === 'object') {
    groupCmdMappings = new Map(Object.entries(saved));
  }
}

async function saveMappings(db) {
  db.setGlobalSetting('groupCmdMappings', Object.fromEntries(groupCmdMappings));
}

const extractText = (msg) => {
  const m = msg?.message || {};
  const e = m.ephemeralMessage?.message || m;
  if (e.conversation) return e.conversation;
  if (e.extendedTextMessage?.text) return e.extendedTextMessage.text;
  if (e.imageMessage?.caption) return e.imageMessage.caption;
  if (e.videoMessage?.caption) return e.videoMessage.caption;
  return '';
};

const resolveGroupJid = ({ from, isGroup }, args, startIndex = 1) => {
  const token = (args[startIndex] || '').trim();
  if (isGroup) {
    if (!token) return { groupJid: from, consumed: 0 };
    if (token.endsWith('@g.us')) return { groupJid: token, consumed: 1 };
    return { groupJid: from, consumed: 0 };
  }
  if (!token || !token.endsWith('@g.us')) return { groupJid: null, consumed: 0 };
  return { groupJid: token, consumed: 1 };
};

module.exports = {
  name: 'gccmd',
  aliases: ['groupcmd'],
  category: 'dev',
  description: 'Lock a group to one auto command',
  usage: '.gccmd <set/remove/list/mode/help>',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const { from, isGroup, reply, react, database } = extra;
    const sub = (args[0] || '').toLowerCase();
    await loadMappings(database);

    if (!sub || sub === 'help') {
      return reply(
        `*GCCMD*\n\n` +
        `1) .gccmd set <command> (inside group)\n` +
        `2) .gccmd set <group_jid> <command> (outside group)\n` +
        `3) .gccmd remove [group_jid]\n` +
        `4) .gccmd mode [group_jid] on/off\n` +
        `5) .gccmd list\n\n` +
        `Behavior: non-command messages are deleted and mapped command runs. Other commands are blocked.`
      );
    }

    if (sub === 'list') {
      if (!groupCmdMappings.size) return reply('📋 No gccmd mapping set.');
      let out = '*GCCMD Mappings*\n\n';
      for (const [jid, data] of groupCmdMappings) {
        out += `• ${jid}\n  cmd: .${data.command}\n  status: ${data.enabled ? 'on' : 'off'}\n`;
      }
      return reply(out.trim());
    }

    if (sub === 'set') {
      const { groupJid, consumed } = resolveGroupJid({ from, isGroup }, args, 1);
      if (!groupJid) return reply('❌ Outside group: .gccmd set <group_jid> <command>');
      const cmdName = (args[1 + consumed] || '').toLowerCase();
      if (!cmdName) return reply('❌ Missing command name.');

      const commands = loadCommands();
      const cmd = commands.get(cmdName);
      if (!cmd || !cmd.name) return reply(`❌ Command not found: ${cmdName}`);
      if (cmd.name === 'gccmd') return reply('❌ gccmd cannot map itself.');

      groupCmdMappings.set(groupJid, {
        command: cmd.name,
        enabled: true,
        deleteIncoming: true,
        lockCommands: true
      });
      await saveMappings(database);
      await react('✅');
      return reply(`✅ ${groupJid}\nAuto command: .${cmd.name}\nMode: locked`);
    }

    if (sub === 'remove') {
      const { groupJid } = resolveGroupJid({ from, isGroup }, args, 1);
      if (!groupJid) return reply('❌ Outside group: .gccmd remove <group_jid>');
      if (!groupCmdMappings.has(groupJid)) return reply('❌ Mapping not found.');
      groupCmdMappings.delete(groupJid);
      await saveMappings(database);
      await react('✅');
      return reply(`✅ Mapping removed: ${groupJid}`);
    }

    if (sub === 'mode') {
      const { groupJid, consumed } = resolveGroupJid({ from, isGroup }, args, 1);
      const mode = (args[1 + consumed] || '').toLowerCase();
      if (!groupJid) return reply('❌ Outside group: .gccmd mode <group_jid> on/off');
      if (!['on', 'off'].includes(mode)) return reply('❌ Usage: .gccmd mode [group_jid] on/off');
      const item = groupCmdMappings.get(groupJid);
      if (!item) return reply('❌ Mapping not found. Use .gccmd set first.');
      item.enabled = mode === 'on';
      groupCmdMappings.set(groupJid, item);
      await saveMappings(database);
      await react('✅');
      return reply(`✅ ${groupJid} mode: ${mode}`);
    }

    return reply(`❌ Invalid subcommand: ${sub}`);
  },

  async handleMessage(sock, msg, extra) {
    const { from, isGroup, config, database } = extra;
    if (!isGroup) return;
    if (msg?.key?.fromMe) return;

    await loadMappings(database);
    const map = groupCmdMappings.get(from);
    if (!map || !map.enabled) return;

    const text = String(extractText(msg) || '').trim();
    const prefix = String(config.prefix || '.');
    const isPrefixed = text.startsWith(prefix);

    // Lock all commands in mapped group
    if (isPrefixed && map.lockCommands) {
      msg.__blockCommandRouting = true;
      try { await sock.sendMessage(from, { delete: msg.key }); } catch {}
      return;
    }

    // For non-command messages: delete + run mapped command
    if (!isPrefixed) {
      msg.__blockCommandRouting = true;
      if (map.deleteIncoming) {
        try { await sock.sendMessage(from, { delete: msg.key }); } catch {}
      }
      const commands = loadCommands();
      const cmd = commands.get(map.command);
      if (!cmd || typeof cmd.execute !== 'function') return;
      const runArgs = text ? text.split(/\s+/).filter(Boolean) : [];
      try {
        await cmd.execute(sock, msg, runArgs, extra);
      } catch (err) {
        console.error(`gccmd auto-run error (${map.command}):`, err?.message || err);
      }
    }
  }
};

