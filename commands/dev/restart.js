/**
 * Restart Command - Restart bot (Owner Only)
 */

const { exec, spawn } = require('child_process');

function run(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve(stdout || stderr);
    });
  });
}

function restartWithCurrentRuntime() {
  const nodeBin = process.argv[0];
  const args = process.argv.slice(1);
  const child = spawn(nodeBin, args, {
    cwd: process.cwd(),
    detached: true,
    stdio: 'ignore',
    env: process.env
  });
  child.unref();
}

module.exports = {
  name: 'restart',
  aliases: ['reboot', 'reload'],
  category: 'dev',
  description: 'Restart the bot (Owner Only)',
  usage: '.restart',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      await extra.reply('🔁 Restarting bot...');

      try {
        if (process.env.pm_id !== undefined || process.env.PM2_HOME) {
          await run('pm2 restart all');
          return;
        }
        await run('pm2 ping');
        await run('pm2 restart all');
        return;
      } catch (e) {
        console.log('PM2 not available, relaunching with current Node runtime');
      }

      restartWithCurrentRuntime();
      setTimeout(() => {
        process.exit(0);
      }, 500);
    } catch (error) {
      console.error('Restart error:', error);
      await extra.reply(`❌ Error restarting bot: ${error.message}`);
    }
  },
};
