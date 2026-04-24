/**
 * Group Command Auto‑Trigger Plugin – Single Command with Subcommands
 * Usage: .gccmd <subcommand> [arguments]
 */

const { loadCommands } = require('../../utils/commandLoader');

// In‑memory cache (loaded from database)
let groupCmdMappings = new Map();

// Helper to load mappings from database
async function loadMappings(db) {
  const saved = await db.getGlobalSetting('groupCmdMappings');
  if (saved && typeof saved === 'object') {
    groupCmdMappings = new Map(Object.entries(saved));
  }
}

// Helper to save mappings to database
async function saveMappings(db) {
  const obj = Object.fromEntries(groupCmdMappings);
  await db.setGlobalSetting('groupCmdMappings', obj);
}

module.exports = {
  name: 'gccmd',
  aliases: ['groupcmd'],
  category: 'owner',
  description: 'Manage group command auto‑trigger (set, remove, list, mode)',
  usage: '.gccmd <subcommand> [arguments]',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const { from, reply, react, database, config } = extra;
    const subCmd = args[0]?.toLowerCase();

    // Load current mappings from DB
    await loadMappings(database);

    // ---------- HELP / NO ARGS ----------
    if (!subCmd) {
      const helpText = `╭━❖ *GROUP COMMAND AUTO‑TRIGGER* ❖━╮
┃
┃  📌 *Available Subcommands:*
┃
┃  🔹 *set*   – Map a command to a group
┃  ┃    Usage: .gccmd set <group_jid> <command>
┃  ┃    Example: .gccmd set 120363409634477982@g.us song
┃
┃  🔹 *remove* – Remove mapping from a group
┃  ┃    Usage: .gccmd remove <group_jid>
┃  ┃    Example: .gccmd remove 120363409634477982@g.us
┃
┃  🔹 *list*   – Show all active mappings
┃  ┃    Usage: .gccmd list
┃
┃  🔹 *mode*   – Enable/disable auto‑trigger for a group
┃  ┃    Usage: .gccmd mode <group_jid> on/off
┃  ┃    Example: .gccmd mode 120363409634477982@g.us off
┃
┃  🔹 *help*   – Show this help message
┃
╰━━━━━━━━━━━━━━━━━━━━━━━╯`;
      return reply(helpText);
    }

    // ---------- SET ----------
    if (subCmd === 'set') {
      const groupJid = args[1];
      const commandName = args[2];
      if (!groupJid || !commandName) {
        return reply(`❌ Usage: .gccmd set <group_jid> <command_name>`);
      }
      if (!groupJid.endsWith('@g.us')) {
        return reply(`❌ Invalid group JID. Must end with @g.us`);
      }
      const commands = loadCommands();
      let targetCmd = null;
      for (const [name, cmd] of commands) {
        if (name === commandName || (cmd.aliases && cmd.aliases.includes(commandName))) {
          targetCmd = { name, cmd };
          break;
        }
      }
      if (!targetCmd) {
        return reply(`❌ Command "${commandName}" not found.`);
      }
      groupCmdMappings.set(groupJid, { command: targetCmd.name, enabled: true });
      await saveMappings(database);
      await reply(`✅ Group ${groupJid} will now auto‑run \`${targetCmd.name}\` on any non‑command message.`);
      await react('✅');
    }

    // ---------- REMOVE ----------
    else if (subCmd === 'remove') {
      const groupJid = args[1];
      if (!groupJid) return reply(`❌ Usage: .gccmd remove <group_jid>`);
      if (!groupCmdMappings.has(groupJid)) {
        return reply(`❌ No mapping found for ${groupJid}`);
      }
      groupCmdMappings.delete(groupJid);
      await saveMappings(database);
      await reply(`✅ Removed mapping for ${groupJid}`);
      await react('✅');
    }

    // ---------- LIST ----------
    else if (subCmd === 'list') {
      if (groupCmdMappings.size === 0) {
        return reply(`📋 No group command mappings set.`);
      }
      let listMsg = `╭━❖ *GROUP COMMAND MAPPINGS* ❖━╮\n`;
      for (const [jid, data] of groupCmdMappings) {
        listMsg += `┃ 🏷️ *${jid}*\n`;
        listMsg += `┃    Command: .${data.command}\n`;
        listMsg += `┃    Status: ${data.enabled ? '✅ Enabled' : '❌ Disabled'}\n`;
        listMsg += `┃ ───────────────────────\n`;
      }
      listMsg += `╰━━━━━━━━━━━━━━━━━━━━━━━╯`;
      await reply(listMsg);
      await react('✅');
    }

    // ---------- MODE ----------
    else if (subCmd === 'mode') {
      const groupJid = args[1];
      const mode = args[2]?.toLowerCase();
      if (!groupJid || !mode || !['on', 'off'].includes(mode)) {
        return reply(`❌ Usage: .gccmd mode <group_jid> on/off`);
      }
      if (!groupCmdMappings.has(groupJid)) {
        return reply(`❌ No mapping found for ${groupJid}. Use .gccmd set first.`);
      }
      const data = groupCmdMappings.get(groupJid);
      data.enabled = mode === 'on';
      groupCmdMappings.set(groupJid, data);
      await saveMappings(database);
      await reply(`✅ Auto‑trigger ${mode === 'on' ? 'enabled' : 'disabled'} for ${groupJid}`);
      await react('✅');
    }

    // ---------- HELP ----------
    else if (subCmd === 'help') {
      const helpText = `╭━❖ *GROUP COMMAND AUTO‑TRIGGER* ❖━╮
┃
┃  📌 *Available Subcommands:*
┃
┃  🔹 *set*   – Map a command to a group
┃  ┃    Usage: .gccmd set <group_jid> <command>
┃  ┃    Example: .gccmd set 120363409634477982@g.us song
┃
┃  🔹 *remove* – Remove mapping from a group
┃  ┃    Usage: .gccmd remove <group_jid>
┃  ┃    Example: .gccmd remove 120363409634477982@g.us
┃
┃  🔹 *list*   – Show all active mappings
┃  ┃    Usage: .gccmd list
┃
┃  🔹 *mode*   – Enable/disable auto‑trigger for a group
┃  ┃    Usage: .gccmd mode <group_jid> on/off
┃  ┃    Example: .gccmd mode 120363409634477982@g.us off
┃
┃  🔹 *help*   – Show this help message
┃
╰━━━━━━━━━━━━━━━━━━━━━━━╯`;
      return reply(helpText);
    }

    // ---------- INVALID ----------
    else {
      return reply(`❌ Invalid subcommand: ${subCmd}\n\nUse .gccmd help for available commands.`);
    }
  },

  // Message handler to intercept messages in mapped groups
  async handleMessage(sock, msg, extra) {
    const { from, isGroup, config, database } = extra;
    if (!isGroup) return;

    await loadMappings(database);
    const mapping = groupCmdMappings.get(from);
    if (!mapping || !mapping.enabled) return;

    // Get message text
    let text = '';
    const msgType = Object.keys(msg.message || {})[0];
    if (msgType === 'conversation') {
      text = msg.message.conversation;
    } else if (msgType === 'extendedTextMessage') {
      text = msg.message.extendedTextMessage?.text || '';
    } else {
      return;
    }
    if (!text.trim()) return;

    // If message starts with bot prefix, treat as normal command
    const prefix = config.prefix;
    if (text.startsWith(prefix)) return;

    const commands = loadCommands();
    const commandName = mapping.command;
    const commandObj = commands.get(commandName);
    if (!commandObj || typeof commandObj.execute !== 'function') return;

    const args = text.trim().split(/\s+/);
    // Call the command's execute function with the original extra
    try {
      await commandObj.execute(sock, msg, args, extra);
    } catch (err) {
      console.error(`Auto‑command error for ${commandName}:`, err);
      await extra.reply(`❌ Auto‑command failed: ${err.message}`);
    }
  }
};