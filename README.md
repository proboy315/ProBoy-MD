<div align="center">

ProBoy-MD

https://img.shields.io/badge/Made%20with-Baileys-00bcd4?style=for-the-badge
https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white
https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge

<img src="utils/bot_image.jpg" alt="ProBoy-MD" width="260">

</div>

ProBoy-MD is a WhatsApp MD bot built on top of the Baileys library.
It’s designed to be fast, lightweight, and easy to customize without touching the core code.
This project is fully open source — you can modify it, rebrand it, and make your own bot from this codebase free of cost, without needing any permission.
All commands and the overall structure are written to make customization (bot image, prefix, name, features, etc.) as easy as possible.

---

✨ Features

· Fully Open Source – Entire codebase is editable; host it anywhere (panel, VPS, Heroku, etc.).
· Easy Customization via Commands – Change bot image, prefix, channel/newsletter, bot name, etc. with simple commands.
· Modular Command System – Commands are organized in the commands folder for easy editing.
· Optimized for Stability – RAM‑optimized media handling (streaming, temp cleanup), better session handling via sessionID in config.js.
· Auto‑Update on Boot – Checks for updates from the configured ZIP URL and applies them automatically.
· Pairing Code & Session ID Support – No QR needed; connect using your phone number or a session string.
· Owner Utilities – Restart, update from ZIP, and more owner‑only tools.
· Built‑in Anti‑Delete – Capture deleted messages (configurable).

---

🚀 Deployment

1. Fork the Repository

<div align="center">
  <a href="https://github.com/proboy315/ProBoy-MD/fork" target="_blank">
    <img src="https://img.shields.io/badge/Fork%20Repository-GitHub-181717?style=for-the-badge&logo=github&logoColor=white" alt="Fork on GitHub">
  </a>
</div>

This creates your own copy of ProBoy-MD under your GitHub account.

2. Get Your Session or Pairing Code

The bot supports two ways to connect: Session ID or Pairing Code.

· Session ID (recommended for panels):
    Use the Pair Code Generator to scan a QR and obtain a session string starting with ProBoy-MD!....
    Copy that full string.
· Pairing Code (for first-time setup):
    When you run the bot without a session, it will ask for your phone number (with country code, e.g., 923001234567).
    It will then display a pairing code that you enter in WhatsApp Linked Devices.

3. Deploy on a Panel (e.g., Katabump)

<div align="center">
  <a href="https://dashboard.katabump.com/auth/login#d6b7d6" target="_blank">
    <img src="https://img.shields.io/badge/Deploy%20on-Katabump-orange?style=for-the-badge" alt="Deploy on Katabump">
  </a>
</div>

For a full step‑by‑step deployment tutorial (panels / VPS / Heroku), add or update your YouTube guide here.

---

🛠 Local Setup

1️⃣ Clone the repository

```bash
git clone https://github.com/proboy315/ProBoy-MD.git
cd ProBoy-MD
```

2️⃣ Install dependencies

```bash
npm install
```

3️⃣ Configure session

Edit config.js (or set environment variables):

· Option A: Use session string
    Paste your session ID (starting with ProBoy-MD!...) into sessionID.
· Option B: Use pairing code
    Leave sessionID empty. The bot will prompt for your phone number when started.

4️⃣ Run the bot

```bash
npm start
```

If you chose pairing code, enter your phone number when prompted.
The bot will then display a code – open WhatsApp > Linked Devices > Link a Device and enter the code.

---

🌐 Community

<div align="center">
  <a href="https://t.me/+3QhFUZHx-nhhZmY1" target="_blank">
    <img src="https://img.shields.io/badge/Join-Telegram-0088cc?style=for-the-badge&logo=telegram&logoColor=white" alt="Join Telegram">
  </a>
  <a href="https://whatsapp.com/channel/0029Va90zAnIHphOuO8Msp3A" target="_blank">
    <img src="https://img.shields.io/badge/Join-WhatsApp-25D366?style=for-the-badge&logo=whatsapp&logoColor=white" alt="Join WhatsApp Channel">
  </a>
</div>

---

🤖 Plugin Development

To create new commands (plugins) for ProBoy-MD, copy the entire prompt below and send it to an AI (like ChatGPT) – it will generate production‑ready plugins aligned with the repository's architecture.

<details>
<summary>📋 Click to copy the Plugin Development Master Prompt</summary>

```text
# ProBoy‑MD Plugin Development Master Prompt (Repo‑Aligned)

Use this document as a **single, all‑in‑one training prompt** for an AI (or a developer) to build **production‑ready ProBoy‑MD plugins** for this repository.

This guide is aligned with the current codebase (`index.js`, `handler.js`, `database.js`, `config.js`, `commands/*`, `utils/*`).

---

## 1) Project Architecture (How ProBoy‑MD Works)

- Entry point: `index.js`
  - Connects to WhatsApp via Baileys
  - Handles pairing/session bootstrapping
  - Dispatches message events into `handler.js`
  - Dispatches delete/revoke events into plugins that implement `handleDelete`
  - Calls optional plugin `init(sock)` once per boot
- Command handler: `handler.js`
  - Dynamically loads plugins from `commands/**`
  - Parses prefix commands (default `.` from `config.js`)
  - Enforces permission flags (`ownerOnly`, `adminOnly`, etc.)
  - Provides `extra` helpers (`reply`, `react`, etc.)
  - Calls optional plugin `handleMessage(sock, msg, extra)` on every message (for background features)
- Persistence: `database.js`
  - JSON storage inside `./database/`
  - Chat settings: `getChatSettings(jid)` / `updateChatSettings(jid, patch)`
  - Group settings: `getGroupSettings(id)` / `updateGroupSettings(id, patch)`
  - Global settings: `getGlobalSetting(key)` / `setGlobalSetting(key, value)`
- Commands layout:

```txt
commands/
  general/
  media/
  owner/
  utility/
  ... (other categories may exist)
```

---

2) Command Module Specification (Plugin Export)

Each plugin file exports one object:

Required fields

· name (string): main command name (example: tiktok)
· category (string): folder/category label (example: media)
· execute(sock, msg, args, extra) (async function): main command logic

Optional fields (supported by this repo)

· aliases (string[]): alternative names
· description (string): help/menu text
· usage (string): usage example shown to user
· Permission flags (booleans):
  · ownerOnly, modOnly, groupOnly, privateOnly, adminOnly, botAdminNeeded
· Background / event hooks (async functions):
  · init(sock) → called once at boot (optional)
  · handleMessage(sock, msg, extra) → called on every incoming message (optional)
  · handleDelete(sock, payload) → called when a message is deleted/revoked (optional)
  · handleButtonResponse(sock, msg, extra) → called when a button is clicked (if your handler routes it)

---

3) execute() Signature (Repo‑Aligned extra)

```js
async execute(sock, msg, args, extra)
```

This repository passes these fields on extra (existing + extended):

```js
extra = {
  from, sender, isGroup, groupMetadata,
  isOwner, isAdmin, isBotAdmin, isMod,
  reply: (text) => {},
  react: (emoji) => {},

  // Added for plugin independence:
  config,            // config.js object
  database,          // database.js module
  utils: {
    getMessageContent, normalizeJidWithLid, normalizeJid, buildComparableIds
  }
}
```

Notes:

· Permission flags are enforced by handler.js; do not re-check them inside your plugin unless you’re doing a special case.
· Always validate arguments (args) and show usage when missing/invalid.

---

4) Configuration (config.js)

Plugins can read:

· config.prefix, config.botName
· config.ownerNumber, config.ownerName
· config.defaultGroupSettings (used as defaults for chat/group settings)
· config.messages.* (standard message templates)
· config.updateZipUrl (used by update systems)
· config.antideleteSettings (global defaults used by features that support it)

Current config.js shape (as in this repo):

```js
module.exports = {
  ownerNumber: ['923261684315'],
  ownerName: ['SHAHAN'],
  botName: 'ProBoy-MD',
  prefix: '.',
  sessionName: 'session',
  sessionID: process.env.SESSION_ID || '',
  newsletterJid: '120363422946163295@newsletter',
  updateZipUrl: 'https://github.com/proboy315/ProBoy-MD/archive/refs/heads/main.zip',
  packname: 'ProBoy-MD',
  selfMode: false,
  autoRead: false,
  autoTyping: true,
  autoBio: false,
  autoSticker: false,
  autoReact: false,
  autoReactMode: 'bot',
  autoDownload: false,

  defaultGroupSettings: {
    antilink: false,
    antilinkAction: 'delete',
    antilinkWhitelist: [],
    antitag: false,
    antitagAction: 'delete',
    antiall: false,
    antiviewonce: false,
    antibot: false,
    anticall: false,
    antigroupmention: false,
    antigroupmentionAction: 'delete',
    welcome: false,
    welcomeMessage: '...',
    goodbye: false,
    goodbyeMessage: '...',
    antiSpam: false,
    antiSpamAction: 'warn',
    antiSpamLimit: 6,
    antiSpamWindowSec: 8,
    antidelete: true,
    antifake: false,
    antifakeAllowedCodes: [],
    antibadword: false,
    antibadwordAction: 'warn',
    badwords: [],
    nsfw: false,
    detect: false,
    chatbot: false,
    autosticker: false
  },

  antideleteSettings: {
    enabled: true,
    dest: 'chat',
    statusDest: 'owner',
    bannerImageUrl: ''
  },

  apiKeys: { openai: '', deepai: '', remove_bg: '', audd: '' },
  messages: {
    wait: '⏳ Please wait...',
    success: '✅ Success!',
    error: '❌ Error occurred!',
    ownerOnly: '👑 This command is only for bot owner!',
    adminOnly: '🛡️ This command is only for group admins!',
    groupOnly: '👥 This command can only be used in groups!',
    privateOnly: '💬 This command can only be used in private chat!',
    botAdminNeeded: '🤖 Bot needs to be admin to execute this command!',
    invalidCommand: '❓ Invalid command! Type .menu for help'
  },
  timezone: 'Asia/Karachi',
  maxWarnings: 3,
  social: {
    github: 'https://github.com/proboy315',
    instagram: 'https://instagram.com/itx___proboy',
    Tiktok: 'https://tiktok.com/@itx_ProBoy'
  }
};
```

---

5) Plugin Template (Skeleton Only)

Create file: commands/<category>/<name>.js

```js
module.exports = {
  name: 'example',
  aliases: ['ex'],
  category: 'general',
  description: 'Short description',
  usage: '.example <arg>',

  // ownerOnly: true,
  // modOnly: true,
  // groupOnly: true,
  // privateOnly: true,
  // adminOnly: true,
  // botAdminNeeded: true,

  async execute(sock, msg, args, extra) {
    try {
      if (!args.length) return extra.reply(`❌ Usage: ${this.usage}`);
      await extra.react('⏳');

      // ... your logic

      await extra.reply('✅ Done');
      await extra.react('✅');
    } catch (e) {
      await extra.reply(`❌ ${e.message}`);
      await extra.react('❌');
    }
  }
};
```

---

6) Real Examples (Already Working in This Repo)

These commands exist and are good references:

· TikTok downloader: commands/media/tiktok.js
· Facebook downloader: commands/media/facebook.js
· YouTube downloader: commands/media/YouTube.js
· MediaFire downloader: commands/media/mediafire.js
· CapCut downloader: commands/media/capcut.js
· Google Drive downloader: commands/media/gdrive.js
· Pinterest downloader: commands/media/pinterest.js

When building new plugins, follow the same patterns:

· validate args
· use extra.react('⏳') while processing
· try/catch with user-friendly errors
· keep button IDs namespaced (if you implement buttons)

---

7) Setup & Dev Notes

· Start the bot: npm start
· Pairing/session:
  · Bot supports Session ID format ProBoy-MD!<base64gzip>
  · Bot also supports Pair Code flow (phone number → pairing code printed to terminal)
· Database files live in: ./database/

---

8) AI Output Expectations (When Generating Plugins)

When an AI generates a plugin for this repo, it must:

· Choose correct folder/category under commands/
· Provide name, category, and execute()
· Include usage and enforce argument checks
· Use gifted-btns for buttons when needed (refer to repo's existing button examples)
· Use ab-downloader for supported media sources when needed (refer to repo's existing downloader examples)
· Be compatible with existing handler/database/config patterns

```
</details>

Copy the entire prompt above and send it to an AI to generate new plugins for ProBoy‑MD. The AI will understand the architecture and produce ready‑to‑use command files.

---

## 🙏 Credits

- **Mr Unique Hacker** – Main developer & maintainer
- **Baileys** – WhatsApp Web API library (`@whiskeysockets/baileys`)
- Other open‑source libraries listed in `package.json`

---

## ☕ Support Me

<div align="center">
  <a href="https://buymeacoffee.com/mruniquehacker" target="_blank">
    <img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-Support%20Developer-FF813F?style=for-the-badge&logo=buy-me-a-coffee&logoColor=white" alt="Buy Me a Coffee">
  </a>
</div>

If you find this project helpful and want to support the developer, consider buying me a coffee! Your support helps maintain and improve this open-source project.

<div align="center">
  <img src="utils/bmc_qr.png" alt="Buy Me a Coffee QR Code" width="200">
</div>

---

## ⚠️ Important Warning

- This bot is created **for educational purposes only**.
- This is **NOT** an official WhatsApp bot.
- Using third‑party bots **may violate WhatsApp’s Terms of Service** and can lead to your account being **banned**.

> You use this bot **at your own risk**.  
> The developers are **not responsible** for any bans, issues, or damages resulting from its use.

---

## 📝 Legal

- This project is **not affiliated with, authorized, maintained, sponsored, or endorsed** by WhatsApp Inc. or any of its affiliates or subsidiaries.
- This is **independent and unofficial software**.
- **Do not spam** people using this bot.
- **Do not** use this bot for bulk messaging, harassment, or any **illegal activities**.
- The developers assume **no liability** and are **not responsible** for any misuse or damage caused by this program.

---

## 📄 License (MIT)

This project is licensed under the **MIT License**.

You must:

- Use this software in compliance with **all applicable laws and regulations**.
- Keep the **original license and copyright** notices.
- **Credit the original authors**.
- **Not** use this for spam, abuse, or malicious purposes.

---

## 📜 Copyright Notice

Copyright (c) **2026 Professor**.  
All rights reserved.

This project contains code from various open‑source projects and AI tools, including but not limited to:

- **Baileys** – MIT License
- Other libraries as listed in `package.json`
```
