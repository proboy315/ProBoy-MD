const { exec } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const MAX_REDIRECTS = 5;

const run = (cmd) =>
  new Promise((resolve, reject) => {
    exec(cmd, { windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || stdout || err.message || '').toString()));
      resolve((stdout || '').toString());
    });
  });

const sha1File = (filePath) => {
  const hash = crypto.createHash('sha1');
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest('hex');
};

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const extractZip = async (zipPath, outDir) => {
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
  throw new Error('No unzip tool found (unzip/7z/busybox).');
};

const request = (url, method = 'GET', visited = new Set()) =>
  new Promise((resolve, reject) => {
    try {
      if (visited.has(url) || visited.size > MAX_REDIRECTS) {
        return reject(new Error('Too many redirects'));
      }
      visited.add(url);

      const client = url.startsWith('https://') ? https : http;
      const req = client.request(
        url,
        {
          method,
          headers: {
            'User-Agent': 'ProBoy-MD-Updater/1.0',
            'Accept': '*/*'
          }
        },
        (res) => {
          if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
            const location = res.headers.location;
            if (!location) return reject(new Error(`HTTP ${res.statusCode} without Location`));
            const nextUrl = new URL(location, url).toString();
            res.resume();
            return request(nextUrl, method, visited).then(resolve).catch(reject);
          }
          resolve(res);
        }
      );
      req.on('error', reject);
      req.end();
    } catch (e) {
      reject(e);
    }
  });

const downloadFile = async (url, dest) => {
  const res = await request(url, 'GET');
  if (res.statusCode !== 200) {
    res.resume();
    throw new Error(`HTTP ${res.statusCode}`);
  }
  await new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    res.pipe(file);
    file.on('finish', () => file.close(resolve));
    file.on('error', (err) => {
      try { file.close(() => {}); } catch {}
      fs.unlink(dest, () => reject(err));
    });
  });
};

const copyRecursiveSmart = (src, dest, ignore = [], relative = '', out) => {
  ensureDir(dest);
  for (const entry of fs.readdirSync(src)) {
    if (ignore.includes(entry)) continue;
    const s = path.join(src, entry);
    const d = path.join(dest, entry);
    const stat = fs.lstatSync(s);
    const rel = path.join(relative, entry).replace(/\\\\/g, '/');

    if (stat.isDirectory()) {
      copyRecursiveSmart(s, d, ignore, rel, out);
      continue;
    }

    const exists = fs.existsSync(d);
    let same = false;
    if (exists) {
      try {
        const dstStat = fs.statSync(d);
        if (dstStat.size === stat.size) {
          same = sha1File(s) === sha1File(d);
        }
      } catch {
        same = false;
      }
    }

    if (same) {
      out.skipped.push(rel);
      continue;
    }

    ensureDir(path.dirname(d));
    fs.copyFileSync(s, d);
    if (exists) out.updated.push(rel);
    else out.added.push(rel);
  }
};

const updateViaZip = async (zipUrl, opts = {}) => {
  const cwd = opts.cwd || process.cwd();
  const tmpDir = path.join(cwd, 'tmp');
  ensureDir(tmpDir);

  const zipPath = path.join(tmpDir, 'update.zip');
  const extractTo = path.join(tmpDir, 'update_extract');

  if (fs.existsSync(extractTo)) fs.rmSync(extractTo, { recursive: true, force: true });
  if (fs.existsSync(zipPath)) fs.rmSync(zipPath, { force: true });

  await downloadFile(zipUrl, zipPath);
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
    'database',
    'config.js'
  ];

  const out = { updated: [], added: [], skipped: [] };
  copyRecursiveSmart(srcRoot, cwd, ignore, '', out);

  try { fs.rmSync(extractTo, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(zipPath, { force: true }); } catch {}

  return out;
};

const getRemoteMeta = async (zipUrl) => {
  const res = await request(zipUrl, 'HEAD');
  const meta = {
    finalUrl: zipUrl,
    etag: res.headers.etag || '',
    lastModified: res.headers['last-modified'] || '',
    length: res.headers['content-length'] || '',
    checkedAt: Date.now()
  };
  res.resume();
  return meta;
};

module.exports = {
  updateViaZip,
  getRemoteMeta
};
