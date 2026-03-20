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
  - JSON storage inside `./database/` (single session)
  - Multi-session: each connected number uses its own DB root under `./database/sessions/<phone>/`
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

## 2) Command Module Specification (Plugin Export)

Each plugin file exports **one object**:

### Required fields

- `name` *(string)*: main command name (example: `tiktok`)
- `category` *(string)*: folder/category label (example: `media`)
- `execute(sock, msg, args, extra)` *(async function)*: main command logic

### Optional fields (supported by this repo)

- `aliases` *(string[])*: alternative names
- `description` *(string)*: help/menu text
- `usage` *(string)*: usage example shown to user
- Permission flags *(booleans)*:
  - `ownerOnly`, `modOnly`, `groupOnly`, `privateOnly`, `adminOnly`, `botAdminNeeded`
- Background / event hooks *(async functions)*:
  - `init(sock)` → called once at boot (optional)
  - `handleMessage(sock, msg, extra)` → called on every incoming message (optional)
  - `handleDelete(sock, payload)` → called when a message is deleted/revoked (optional)
  - `handleButtonResponse(sock, msg, extra)` → called when a button is clicked (if your handler routes it)

---

## 3) `execute()` Signature (Repo‑Aligned `extra`)

```js
async execute(sock, msg, args, extra)
```

This repository passes these fields on `extra` (existing + extended):

```js
extra = {
  from, sender, isGroup, groupMetadata,
  isOwner, isAdmin, isBotAdmin, isMod,
  reply: (text) => {},
  react: (emoji) => {},

  // Added for plugin independence:
  config,            // config.js object
  database,          // per-session DB instance (multi-session safe)
  utils: {
    getMessageContent, normalizeJidWithLid, normalizeJid, buildComparableIds
  }
}
```

Notes:
- Permission flags are enforced by `handler.js`; do not re-check them inside your plugin unless you’re doing a special case.
- Always validate arguments (`args`) and show `usage` when missing/invalid.

---

## 4) Configuration (`config.js`)

Plugins can read:

- `config.prefix`, `config.botName`
- `config.ownerNumber`, `config.ownerName`
- `config.defaultGroupSettings` (used as defaults for chat/group settings)
- `config.messages.*` (standard message templates)
- `config.updateZipUrl` (used by update systems)
- `config.antideleteSettings` (global defaults used by features that support it)

Current `config.js` shape (as in this repo):

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

## 5) Buttons / Interactive UI (`gifted-btns`)

This repo includes `gifted-btns` for WhatsApp interactive messages.

Install:

```bash
npm i gifted-btns
```

Typical usage:

```js
const { sendInteractiveMessage } = require('gifted-btns');

await sendInteractiveMessage(sock, extra.from, {
  text: 'Choose an option:',
  footer: 'ProBoy‑MD',
  interactiveButtons: [
    { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'Option A', id: 'mycmd:a' }) },
    { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'Option B', id: 'mycmd:b' }) }
  ]
}, { quoted: msg });
```

Guidelines:
- Namespace your button IDs: `mycmd:<state>:<index>`
- Cache any state you need for button handlers (Map + TTL).
- Implement `handleButtonResponse(sock, msg, extra)` if your handler routes button clicks.

---

## 6) Media Downloading (`ab-downloader`)

Install:

```bash
npm i ab-downloader
```

Example pattern:

```js
const { ttdl } = require('ab-downloader');
const data = await ttdl(url);
if (!data.status) throw new Error(data.message);
// use data.result...
```

Supported downloaders in this repo’s dependency list:
- `fbdown`, `igdl`, `ttdl`, `twitter`, `youtube`, `mediafire`, `capcut`, `gdrive`, `pinterest`

---

## 7) Plugin Template (Skeleton Only)

Create file: `commands/<category>/<name>.js`

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

## 8) Real Examples (Already Working in This Repo)

These commands exist and are good references:
- TikTok downloader: `commands/media/tiktok.js`
- Facebook downloader: `commands/media/facebook.js`
- YouTube downloader: `commands/media/YouTube.js`
- MediaFire downloader: `commands/media/mediafire.js`
- CapCut downloader: `commands/media/capcut.js`
- Google Drive downloader: `commands/media/gdrive.js`
- Pinterest downloader: `commands/media/pinterest.js`

When building new plugins, follow the same patterns:
- validate args
- use `extra.react('⏳')` while processing
- `try/catch` with user-friendly errors
- keep button IDs namespaced

---

## 9) Setup & Dev Notes

- Start the bot: `npm start`
- Pairing/session:
  - Bot supports Session ID format `ProBoy-MD!<base64gzip>`
  - Bot also supports Pair Code flow (phone number → pairing code printed to terminal)
- Database files live in: `./database/`

---

## 10) AI Output Expectations (When Generating Plugins)

When an AI generates a plugin for this repo, it must:
- Choose correct folder/category under `commands/`
- Provide `name`, `category`, and `execute()`
- Include `usage` and enforce argument checks
- Use `gifted-btns` for buttons when needed
- Use `ab-downloader` for supported media sources when needed
- Be compatible with existing handler/database/config patterns
