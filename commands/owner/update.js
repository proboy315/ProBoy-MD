
// commands/owner/update.js
/**
 * Update Command - Auto-updates when new commit is detected
 * Checks for updates every X minutes if autoupdate is enabled
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const config = require('../../config');

const MAX_REDIRECTS = 5;
const VERSION_FILE = path.join(__dirname, '../../database/version.json');

// Store the check interval
let checkInterval = null;

function run(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || stdout || err.message || '').toString()));
      resolve((stdout || '').toString());
    });
  });
}

async function extractZip(zipPath, outDir) {
  if (process.platform === 'win32') {
    const cmd = `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${outDir.replace(/\\\\/g, '/')}' -Force"`;
    await run(cmd);
    return;
  }
  try {
    await run('command -v unzip');
    await run(`unzip -o '${zipPath}' -d '${outDir}'`);
    return;
  } catch {}
  try {
    await run('command -v 7z');
    await run(`7z x -y '${zipPath}' -o'${outDir}'`);
    return;
  } catch {}
  try {
    await run('busybox unzip -h');
    await run(`busybox unzip -o '${zipPath}' -d '${outDir}'`);
    return;
  } catch {}
  throw new Error('No unzip tool found (unzip/7z/busybox). Please install one or use a panel with unzip support.');
}

function downloadFile(url, dest, visited = new Set()) {
  return new Promise((resolve, reject) => {
    try {
      if (visited.has(url) || visited.size > MAX_REDIRECTS) {
        return reject(new Error('Too many redirects'));
      }
      visited.add(url);

      const client = url.startsWith('https://') ? https : http;
      const req = client.get(url, {
        headers: {
          'User-Agent': 'ProBoy-MD-Updater/1.0',
          'Accept': '*/*'
        }
      }, res => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          const location = res.headers.location;
          if (!location) return reject(new Error(`HTTP ${res.statusCode} without Location`));
          const nextUrl = new URL(location, url).toString();
          res.resume();
          return downloadFile(nextUrl, dest, visited).then(resolve).catch(reject);
        }

        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }

        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
        file.on('error', err => {
          try { file.close(() => {}); } catch {}
          fs.unlink(dest, () => reject(err));
        });
      });
      req.on('error', err => {
        fs.unlink(dest, () => reject(err));
      });
    } catch (e) {
      reject(e);
    }
  });
}

function copyRecursive(src, dest, ignore = [], relative = '', outList = []) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    if (ignore.includes(entry)) continue;
    const s = path.join(src, entry);
    const d = path.join(dest, entry);
    const stat = fs.lstatSync(s);
    if (stat.isDirectory()) {
      copyRecursive(s, d, ignore, path.join(relative, entry), outList);
    } else {
      fs.copyFileSync(s, d);
      if (outList) outList.push(path.join(relative, entry).replace(/\\\\/g, '/'));
    }
  }
}

async function updateViaZip(zipUrl) {
  const tmpDir = path.join(process.cwd(), 'tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const zipPath = path.join(tmpDir, 'update.zip');
  const extractTo = path.join(tmpDir, 'update_extract');

  await downloadFile(zipUrl, zipPath);

  if (fs.existsSync(extractTo)) fs.rmSync(extractTo, { recursive: true, force: true });
  await extractZip(zipPath, extractTo);

  const entries = fs.readdirSync(extractTo);
  const rootCandidate = entries.length === 1 ? path.join(extractTo, entries[0]) : extractTo;
  const srcRoot = fs.existsSync(rootCandidate) && fs.lstatSync(rootCandidate).isDirectory() ? rootCandidate : extractTo;

  const ignore = [
    'node_modules',
    '.git',
    'session',
    'tmp',
    'temp',
    'database'
  ];
  const copied = [];
  copyRecursive(srcRoot, process.cwd(), ignore, '', copied);

  try { fs.rmSync(extractTo, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(zipPath, { force: true }); } catch {}

  return { copiedFiles: copied };
}

function parseGitHubUrl(zipUrl) {
  const match = zipUrl.match(/github\.com\/([^\/]+)\/([^\/]+)\/archive\/refs\/heads\/(.+)\.zip/);
  if (match) {
    return { owner: match[1], repo: match[2], branch: match[3] };
  }
  return null;
}

async function getLatestCommit(owner, repo, branch = 'main') {
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/commits/${branch}`;
  return new Promise((resolve, reject) => {
    https.get(apiUrl, {
      headers: {
        'User-Agent': 'ProBoy-MD-Updater/1.0',
        'Accept': 'application/vnd.github.v3+json'
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`GitHub API returned ${res.statusCode}`));
        }
        try {
          const json = JSON.parse(data);
          const commit = json.commit || {};
          resolve({
            sha: json.sha,
            message: commit.message || 'No commit message',
            date: commit.committer?.date || new Date().toISOString(),
            url: json.html_url
          });
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function getStoredVersion() {
  try {
    if (fs.existsSync(VERSION_FILE)) {
      return JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8'));
    }
  } catch {}
  return { sha: null, lastChecked: null };
}

function saveVersion(info) {
  try {
    const dir = path.dirname(VERSION_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(VERSION_FILE, JSON.stringify(info, null, 2));
  } catch {}
}

// Auto-check function
async function checkForUpdates(sock, notifyOnNoUpdate = false) {
  try {
    const zipUrl = (config.updateZipUrl || process.env.UPDATE_ZIP_URL || '').trim();
    if (!zipUrl) return;

    const repoInfo = parseGitHubUrl(zipUrl);
    if (!repoInfo) return;

    const latest = await getLatestCommit(repoInfo.owner, repoInfo.repo, repoInfo.branch);
    const stored = getStoredVersion();

    if (stored.sha !== latest.sha) {
      // New update found!
      const commitMsg = latest.message.split('\n')[0];
      const changes = `🤖 *Auto-Update Available!*\n\n📝 *UPDATES* ${commitMsg}\n🔗 ${latest.url}\n🕒 ${new Date(latest.date).toLocaleString()}\n\n🔄 Auto-updating now…\n Made With 💖 By @ProBoy315 #Shahan315`;

      // Notify all owners
      const owners = config.ownerNumber.map(num => num.includes('@') ? num : `${num}@s.whatsapp.net`);
      for (const owner of owners) {
        try {
          await sock.sendMessage(owner, { text: changes });
        } catch {}
      }

      // Perform update
      const { copiedFiles } = await updateViaZip(zipUrl);

      // Save new version
      saveVersion({
        sha: latest.sha,
        lastChecked: new Date().toISOString(),
        lastMessage: latest.message,
        lastAutoUpdate: new Date().toISOString()
      });

      // Notify completion
      const summary = copiedFiles.length
        ? `✅ Auto-update complete. Files updated: ${copiedFiles.length}\nRestarting…`
        : '✅ Auto-update complete. No changes needed.\nRestarting…';

      for (const owner of owners) {
        try {
          await sock.sendMessage(owner, { text: summary });
        } catch {}
      }

      // Restart
      restart();
    } else if (notifyOnNoUpdate) {
      // No update available (only notify if explicitly requested)
      const owners = config.ownerNumber.map(num => num.includes('@') ? num : `${num}@s.whatsapp.net`);
      for (const owner of owners) {
        try {
          await sock.sendMessage(owner, { text: '✅ Bot is up to date.' });
        } catch {}
      }
    }
  } catch (error) {
    console.error('Auto-check error:', error);
  }
}

// Start auto-check if enabled
function startAutoCheck(sock) {
  if (!config.autoupdate) return;
  if (checkInterval) clearInterval(checkInterval);

  const intervalMinutes = config.autoupdateInterval || 60;
  const intervalMs = intervalMinutes * 60 * 1000;

  // Check immediately on start
  setTimeout(() => checkForUpdates(sock), 5000);

  // Then every interval
  checkInterval = setInterval(() => checkForUpdates(sock), intervalMs);
}

// Stop auto-check
function stopAutoCheck() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
}

function restart() {
  exec('pm2 restart all', (err) => {
    if (err) {
      setTimeout(() => process.exit(0), 500);
    }
  });
}

module.exports = {
  name: 'update',
  aliases: ['upgrade', 'autoupdate'],
  category: 'owner',
  description: 'Update bot (auto or manual)',
  usage: '.update [manual|status|on|off]',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const sub = args[0] ? args[0].toLowerCase() : '';

      // Handle subcommands
      if (sub === 'on') {
        config.autoupdate = true;
        startAutoCheck(sock);
        return extra.reply('✅ Auto-update enabled.');
      }

      if (sub === 'off') {
        config.autoupdate = false;
        stopAutoCheck();
        return extra.reply('❌ Auto-update disabled.');
      }

      if (sub === 'status') {
        const stored = getStoredVersion();
        const status = [
          '╭─「 *Update Status* 」',
          `│ Auto-update: ${config.autoupdate ? '✅ ON' : '❌ OFF'}`,
          `│ Interval: ${config.autoupdateInterval || 60} minutes`,
          `│ Last Commit: ${stored.lastMessage ? stored.lastMessage.substring(0, 50) + '…' : 'Never'}`,
          `│ Last Check: ${stored.lastChecked ? new Date(stored.lastChecked).toLocaleString() : 'Never'}`,
          `│ Last Auto-Update: ${stored.lastAutoUpdate ? new Date(stored.lastAutoUpdate).toLocaleString() : 'Never'}`,
          '╰───────────────'
        ].join('\n');
        return extra.reply(status);
      }

      if (sub === 'manual' || args.length === 0) {
        // Manual update with optional URL
        if (args[0] && args[0] !== 'manual') {
          // Custom URL provided
          const zipUrl = args[0];
          await extra.reply('🔄 Manual update from URL…');
          const { copiedFiles } = await updateViaZip(zipUrl);
          const summary = copiedFiles.length
            ? `✅ Manual update complete. Files updated: ${copiedFiles.length}`
            : '✅ Manual update complete. No files changed.';
          await extra.reply(`${summary}\nRestarting…`);
          restart();
        } else {
          // Check GitHub for updates now
          await extra.reply('🔍 Checking for updates…');
          await checkForUpdates(sock, true); // true = notify even if no update
        }
        return;
      }

      // If we get here, unknown subcommand
      return extra.reply(
        `❌ *Usage:*\n` +
        `• .update manual [url] - Manual update\n` +
        `• .update on - Enable auto-update\n` +
        `• .update off - Disable auto-update\n` +
        `• .update status - Show update status`
      );
    } catch (error) {
      console.error('Update command error:', error);
      await extra.reply(`❌ Error: ${error.message}`);
    }
  }
};

// Export functions for main handler to use
module.exports.startAutoCheck = startAutoCheck;
module.exports.stopAutoCheck = stopAutoCheck;
