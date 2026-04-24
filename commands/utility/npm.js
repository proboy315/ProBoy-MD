/**
 * NPM Package Manager – Show info or install packages
 * .npm <package>          → show package details (anyone)
 * .npm install <package>  → install package (owner only)
 * .npm i <package>        → same
 */

const axios = require('axios');
const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'okhttp/4.9.3'
];

async function fetchWithRetry(url, maxRetries = 3, timeout = 10000) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const userAgent = USER_AGENTS[(attempt - 1) % USER_AGENTS.length];
      const response = await axios.get(url, {
        timeout,
        headers: { 'User-Agent': userAgent }
      });
      return response;
    } catch (err) {
      lastError = err;
      if (attempt === maxRetries) break;
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000));
    }
  }
  throw lastError;
}

module.exports = {
  name: 'npm',
  aliases: ['npmi'],
  category: 'utility',
  description: '📦 Show npm package info or install packages (install is owner-only)',
  usage: '.npm <package>\n.npm install <package>\n.npm i <package>',

  async execute(sock, msg, args, extra) {
    const { from, reply, react, config, isOwner } = extra;

    if (!args.length) {
      return reply(`❌ Please provide a package name or action.\n\n${this.usage}`);
    }

    const firstArg = args[0].toLowerCase();

    // --- INSTALL MODE (owner only) ---
    if (firstArg === 'install' || firstArg === 'i') {
      if (!isOwner) {
        return reply('❌ Only the bot owner can install packages.');
      }
      const pkgName = args.slice(1).join(' ');
      if (!pkgName) {
        return reply('❌ Please specify a package to install.\nExample: `.npm install axios`');
      }

      await react('⏳');
      const statusMsg = await sock.sendMessage(from, { text: `📦 Installing \`${pkgName}\`...` });
      const statusKey = statusMsg.key;

      try {
        const workDir = process.cwd();
        const { stdout, stderr } = await execPromise(`npm install --save ${pkgName}`, {
          cwd: workDir,
          timeout: 120000,
          env: process.env
        });
        const output = (stdout + stderr).trim();
        if (!stderr || !stderr.includes('ERR!')) {
          await sock.sendMessage(from, {
            text: `✅ Installed \`${pkgName}\`.\n\n\`\`\`\n${output.slice(0, 500)}\n\`\`\`\n_You may need to restart the bot._`,
            edit: statusKey
          });
          await react('✅');
        } else {
          throw new Error(output.slice(0, 300));
        }
      } catch (err) {
        await sock.sendMessage(from, {
          text: `❌ Failed: ${err.message}`,
          edit: statusKey
        });
        await react('❌');
      }
      return;
    }

    // --- INFO MODE (anyone) ---
    const pkgName = args.join(' ').trim().toLowerCase();
    try {
      await react('⏳');
      const url = `https://registry.npmjs.org/${encodeURIComponent(pkgName)}`;
      const response = await fetchWithRetry(url, 3, 10000);
      const data = response.data;

      if (data.error || !data.name) throw new Error('Package not found');

      const name = data.name;
      const description = data.description || 'No description';
      const version = data['dist-tags']?.latest || 'Unknown';
      const license = data.license || 'Unknown';
      const author = data.author?.name || (data.maintainers && data.maintainers[0]?.name) || 'Unknown';
      const keywords = data.keywords ? data.keywords.join(', ') : 'None';
      const deps = data.dependencies ? Object.keys(data.dependencies).length : 0;
      const devDeps = data.devDependencies ? Object.keys(data.devDependencies).length : 0;
      const homepage = data.homepage || data.repository?.url || 'None';
      const repo = data.repository?.url || 'None';
      const unpkg = `https://unpkg.com/${name}`;
      const npmUrl = `https://www.npmjs.com/package/${name}`;

      let result = `╭━❖ *NPM PACKAGE INFO* ❖━╮\n`;
      result += `┃ 📦 *Name:* ${name}\n`;
      result += `┃ 🏷️ *Version:* ${version}\n`;
      if (description.length <= 60) result += `┃ 📝 *Description:* ${description}\n`;
      else result += `┃ 📝 *Description:* ${description.substring(0, 57)}...\n`;
      result += `┃ 📄 *License:* ${license}\n`;
      result += `┃ 👤 *Author:* ${author}\n`;
      result += `┃ 🔑 *Keywords:* ${keywords}\n`;
      result += `┃ 📦 *Dependencies:* ${deps}\n`;
      result += `┃ 🛠️ *Dev Dependencies:* ${devDeps}\n`;
      result += `┃ 🌐 *Homepage:* ${homepage}\n`;
      result += `┃ 📁 *Repository:* ${repo}\n`;
      result += `┃ 🔗 *Unpkg CDN:* ${unpkg}\n`;
      result += `┃ 🔗 *npm URL:* ${npmUrl}\n`;
      result += `╰━━━━━━━━━━━━━━━━━━━━━╯`;

      await reply(result);
      await react('✅');
    } catch (error) {
      let errMsg = '❌ Failed to fetch package info.';
      if (error.message.includes('Package not found')) errMsg = `❌ Package "${pkgName}" not found.`;
      else if (error.code === 'ECONNABORTED') errMsg = '❌ Request timed out. Try again later.';
      else errMsg += ` ${error.message}`;
      await reply(errMsg);
      await react('❌');
    }
  }
};