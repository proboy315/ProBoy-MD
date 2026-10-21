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

/**
 * Is this process a child of the ProBoy supervisor (index.js)?
 * If yes, the supervisor restarts us when we exit - spawning ANOTHER copy here would run two bots on the same
 * sessions (WhatsApp then kicks both with 440 "conflict" in a loop and the sessions stay offline for hours).
 */
function isSupervised() {
  try {
    if (process.env.PROBOY_SUPERVISED === '1') return true;
    const cmd = require('fs').readFileSync(`/proc/${process.ppid}/cmdline`, 'utf8').split('\0').filter(Boolean);
    // supervisor = "node index.js" (or npm start / a process manager running index.js)
    return cmd.some((a) => /(^|\/)index\.js$/.test(a)) && !cmd.some((a) => /(^|\/)proboy\.js$/.test(a));
  } catch { return false; }
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

/** Close every WhatsApp socket cleanly (SIGTERM handler in proboy.js does that), then exit(0). Hard exit after 10 s. */
function gracefulExit() {
  const hard = setTimeout(() => process.exit(0), 10000);
  if (hard.unref) hard.unref();
  try { process.kill(process.pid, 'SIGTERM'); } catch { process.exit(0); }
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

      if (isSupervised()) {
        // the supervisor starts the new process after we exit - do NOT start a second one ourselves
        console.log('[RESTART] supervisor detected: exiting cleanly, it will start the new process');
        setTimeout(gracefulExit, 500);
        return;
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
