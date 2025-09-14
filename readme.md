# ProBoy-MD

## Get Started

#### 1. Get Your Session String 

<p align="center">
  <a href="https://proboy.ct.ws/ProBoy-MD">
    <img src="https://i.ibb.co/fVWcycPc/get-session.png" alt="Get Session" width="200"/>
  </a>
</p>

#### 2. Copy Setup Script  


```bash
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SESSION = "RGNK~Vke2cQ9W";

function run(command, options = {}) {
  try {
    execSync(command, { stdio: 'inherit', ...options });
  } catch (error) {
    console.error('Error running command: ' + command);
    process.exit(1);
  }
}

if (!fs.existsSync('./ffmpeg')) {
  console.log("🔧 Downloading FFmpeg...");
  run('curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz -o ffmpeg.tar.xz');
  run('tar -xf ffmpeg.tar.xz');
  const ffmpegDir = fs.readdirSync('.').find(d => /^ffmpeg-.*-static$/.test(d));
  if (!ffmpegDir) {
    console.error('FFmpeg static directory not found after extraction.');
    process.exit(1);
  }
  fs.renameSync(path.join(ffmpegDir, 'ffmpeg'), './ffmpeg');
  run('chmod +x ./ffmpeg');
  run('rm -rf ffmpeg.tar.xz ' + ffmpegDir);
  console.log("✅ FFmpeg ready.");
} else {
  console.log("⚡ FFmpeg already exists.");
}

if (!fs.existsSync('./ProBoy-MD')) {
  console.log("📥 Cloning ProBoy-MD...");
  run('git clone https://github.com/proboy315/ProBoy-MD');
} else {
  console.log("🔄 ProBoy-MD  already cloned.");
}

try {
  process.chdir('./ProBoy-MD');
} catch {
  console.error('Failed to change directory to ProBoy-MD !');
  process.exit(1);
}

try {
  execSync('yarn --version', { stdio: 'ignore' });
} catch {
  console.log("📦 Installing yarn with Corepack...");
  run('corepack enable');
  run('echo y | corepack prepare yarn@1.22.22 --activate --yes');
}

console.log("📦 Installing dependencies with yarn...");
run('yarn install --ignore-engines');

console.log("🔐 Writing session...");
fs.writeFileSync('config.env', 'SESSION=' + SESSION + '\n');

console.log("🚀 Starting bot...");
run('yarn start');

````
#### 2. CreatE Start.js 
on Your panel server and start with node start.js 

## Features

* Lightweight and fast performance
* Single and multi-session capabilities
* Extensive plugin system
* Group management tools
* Media download functionality
* Excellent caching and session management

## Prerequisites

* Node.js (version 20 or higher)
* Git
* FFmpeg
* Yarn package manager
* PM2 (for process management)
* Database URL (postgreSQL - for cloud deployments)

## Installation

### Clone Repository

```bash
npm install -g yarn pm2
git clone https://github.com/proboy315/ProBoy-MD.git
cd raganork-md
````

### Install Dependencies

```bash
yarn install
```

### Configuration

Create a `.env` file in the root directory:

#### Session Configuration

Single session:

```
SESSION=RGNK~d7a5s66
```

Multi-session:

```
SESSION=RGNK~d7a5s66,RGNK~7ad8cW
```

#### Required Variables

```
# Database (Required for cloud platforms)
DATABASE_URL=your_database_url

# Localization
LANGUAGE=en
TZ=Asia/Kolkata
```

## Running the Bot

```bash
npm start
```

## Process Management

```bash
# Stop bot
pm2 stop ProBoy-MD

# Restart bot
pm2 restart ProBoy-MD
```

## Commands

Default prefix: `.`

* `.list` – Show available commands
* `.ping` – Check response time
* `.restart` – Restart bot (sudo only)
* `.shutdown` – Stop bot (sudo only)

## File Structure

```
ProBoy-MD/
├── plugins/     # Bot plugins
├── core/        # Core libraries
├── output/      # Operational outputs
├── temp/        # Temporary files
├── config.js    # Configuration handler
├── index.js     # Main entry point
└── package.json # Dependencies
```


## Legal Notice

⚠️ **Use at your own risk.** This bot uses unofficial WhatsApp Web API methods and may result in temporary or permanent account bans.

* This code is in no way affiliated, authorized, maintained, sponsored or endorsed by WhatsApp or any of its affiliates.
* WhatsApp is a trademark of WhatsApp Inc., registered in the U.S. and other countries.
* This software is provided for educational and research purposes only
* Powered by [Baileys](https://github.com/WhiskeySockets/Baileys)

## License

GPL License - See LICENSE file for details.

---

**Note:** Some files are obfuscated for security reasons and should not be modified.



