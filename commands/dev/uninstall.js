const config = require('../../config');
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'uninstall',
  aliases: ['removeplugin', 'delplugin', 'unload'],
  category: 'dev',
  description: 'Uninstall a plugin by name (deletes its file)',
  usage: `${config.prefix}uninstall <plugin_name>`,
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      if (!args.length) {
        return extra.reply(`❌ Please provide a plugin name.\nUsage: ${this.usage}`);
      }

      const targetName = args[0].toLowerCase();
      const commandsDir = path.join(__dirname, '..', '..', 'commands'); // commands/ folder

      let foundPath = null;
      let foundCategory = null;

      // Scan all category folders
      const categories = fs.readdirSync(commandsDir).filter(dir => {
        const dirPath = path.join(commandsDir, dir);
        return fs.statSync(dirPath).isDirectory();
      });

      for (const cat of categories) {
        const catPath = path.join(commandsDir, cat);
        const files = fs.readdirSync(catPath).filter(f => f.endsWith('.js'));

        for (const file of files) {
          const filePath = path.join(catPath, file);
          try {
            // Load the module to read its name & aliases
            const mod = require(filePath);
            if (mod && mod.name) {
              const names = [mod.name, ...(mod.aliases || [])].map(n => n.toLowerCase());
              if (names.includes(targetName)) {
                foundPath = filePath;
                foundCategory = cat;
                break;
              }
            }
          } catch (_) {
            // skip broken modules
            continue;
          }
        }
        if (foundPath) break;
      }

      if (!foundPath) {
        return extra.reply(`❌ Plugin *${targetName}* not found.`);
      }

      // Delete the file
      fs.unlinkSync(foundPath);

      // Remove from require cache so next reload doesn’t pick it up
      delete require.cache[require.resolve(foundPath)];

      await extra.reply(
        `✅ Plugin *${targetName}* (${foundCategory}/${path.basename(foundPath)}) uninstalled.\n` +
        `⚠️ Please restart the bot to fully remove it from the command list.`
      );
    } catch (error) {
      console.error('[uninstall]', error);
      await extra.reply(`❌ ${error.message}`);
    }
  }
};