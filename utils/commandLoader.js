/**
 * Command Loader - Separate module to avoid circular dependencies
 */

const fs = require('fs');
const path = require('path');

const getCommandsRoot = () => path.join(__dirname, '..', 'commands');

const clearCommandsRequireCache = () => {
  const root = path.resolve(getCommandsRoot()) + path.sep;
  for (const id of Object.keys(require.cache)) {
    try {
      const resolved = path.resolve(id);
      if (resolved.startsWith(root)) delete require.cache[id];
    } catch {
      // ignore
    }
  }
};

const shouldOverrideCommand = (existingMeta, nextMeta) => {
  // Allow explicit override if needed
  if (String(process.env.ALLOW_COMMAND_OVERRIDE || '').trim().toLowerCase() === 'true') return true;

  // Prefer download over media when there is a duplicate command name
  if (existingMeta?.category === 'download' && nextMeta?.category === 'media') return false;
  if (existingMeta?.category === 'media' && nextMeta?.category === 'download') return true;

  // Default: first loaded wins
  return false;
};

// Load all commands
const loadCommands = (opts = {}) => {
  const { fresh = false } = opts;
  if (fresh) clearCommandsRequireCache();

  const commands = new Map();
  const commandMeta = new Map(); // name -> { category, file }
  const commandsPath = getCommandsRoot();

  if (!fs.existsSync(commandsPath)) {
    console.log('Commands directory not found');
    return commands;
  }

  // Deterministic order, but keep filesystem folders too
  const categories = fs.readdirSync(commandsPath).sort((a, b) => a.localeCompare(b));

  for (const category of categories) {
    const categoryPath = path.join(commandsPath, category);
    if (!fs.statSync(categoryPath).isDirectory()) continue;

    const files = fs.readdirSync(categoryPath).filter(f => f.endsWith('.js')).sort((a, b) => a.localeCompare(b));

    for (const file of files) {
      const fullPath = path.join(categoryPath, file);
      const rel = path.join(category, file).replace(/\\/g, '/');

      try {
        const command = require(fullPath);
        if (!command?.name) continue;

        const nextMeta = { category: command.category || category, file: rel };
        const existingMeta = commandMeta.get(command.name);

        if (existingMeta && !shouldOverrideCommand(existingMeta, nextMeta)) {
          continue;
        }

        commands.set(command.name, command);
        commandMeta.set(command.name, nextMeta);

        if (Array.isArray(command.aliases)) {
          for (const alias of command.aliases) {
            // Avoid overwriting an existing alias mapping unless overriding is allowed
            if (commands.has(alias) && String(process.env.ALLOW_COMMAND_OVERRIDE || '').trim().toLowerCase() !== 'true') {
              continue;
            }
            commands.set(alias, command);
          }
        }
      } catch (error) {
        console.error(`Error loading command ${rel}:`, error?.stack || error?.message || String(error));
      }
    }
  }

  return commands;
};

module.exports = { loadCommands, clearCommandsRequireCache };

