# ProBoy-MD Development Prompt (Production-Aligned)

Use this as the primary prompt/spec for anyone building or modifying features in this repository.
This document is aligned with current project behavior in `index.js`, `handler.js`, `config.js`, `database.js`, `commands/*`, and `utils/*`.

---

## 1) System Overview

- Runtime: Node.js (CommonJS)
- Entry point: `index.js`
- Message router: `handler.js`
- Command loader: `utils/commandLoader.js`
- Storage: `database.js` + JSON files under `database/`
- Command modules: `commands/<category>/<command>.js`

Core flow:
1. Baileys socket connects in `index.js`.
2. Incoming messages are passed to `handler.js`.
3. `handler.js` resolves text command OR button interaction.
4. Matching command module `execute()` runs with `extra` helpers.
5. Settings/state read-write via per-session DB instance (`extra.database`).

---

## 2) Command Contract (Required)

Each command exports a single object:

```js
module.exports = {
  name: 'commandName',
  category: 'general',
  description: '...',
  usage: '.commandName',
  aliases: [],

  // optional guards
  ownerOnly: false,
  modOnly: false,
  groupOnly: false,
  privateOnly: false,
  adminOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {}
};
```

Optional hooks supported by router:
- `init(sock)`
- `handleMessage(sock, msg, extra)`
- `onMessage(sock, msg, extra)`
- `autoRun(sock, msg, extra)`
- `handleDelete(sock, payload)`
- `handleButtonResponse(sock, msg, extra)`
- `handleGroupUpdate(sock, update, extra)`

---

## 3) `extra` Object (Available in Execute/Hooks)

```js
{
  from,
  sender,
  isGroup,
  groupMetadata,
  isOwner,
  isSudo,
  isAdmin,
  isBotAdmin,
  isMod,
  config,
  commands,
  database,
  utils: {
    getMessageContent,
    normalizeJidWithLid,
    normalizeJid,
    buildComparableIds
  },
  reply: (text) => Promise,
  react: (emoji) => Promise
}
```

Rules:
- Do not hardcode brand/owner/prefix.
- Use `extra.config` or `require('../../config')`.
- Validate args and return usage when missing.

---

## 4) Menu + Button Mode (Current Behavior)

### Trigger
- `.menu`

### Button mode source
- `database/global.json` key: `menuButtonsEnabled`

### Behavior when button mode = `true`
- Home menu sends:
  - Header block with owner/user/prefix/cmd count
  - Category list text (`general`, `ai`, `group`, `dev`, ...)
  - Category quick-reply buttons
  - Final URL button: `View Channel`
- On category button click:
  - Sends category-only command list (e.g. DEV COMMANDS)
  - Sends actions row with `BACK` + `View Channel`

### Button IDs (must stay stable)
- `cmd_menu_home`
- `cmd_menu_cat_<category>`
- Generic command pattern: `cmd_<command payload>`

### Files controlling this
- `commands/general/menu.js`
- `utils/button.js`
- `handler.js`

---

## 5) Button Utility Standard

Use:

```js
const { sendButtons } = require('../../utils/button');
```

Supported button types:
- `quick_reply` (id based)
- `url` (cta link)
- `copy` (copy code)

Best practices:
- Keep button IDs short and deterministic.
- For category/state flows, prefer no spaces in IDs.
- If flow is command-driven, start IDs with `cmd_`.

---

## 6) Sorting & Determinism Rules

- Command loading is deterministic in `utils/commandLoader.js`:
  - categories sorted alphabetically
  - files sorted alphabetically
- Menu render should remain deterministic:
  - category order fixed in code
  - command names sorted alphabetically before output
- Never rely on filesystem listing order.

---

## 7) Config Rules (No Hardcoded Values)

Use values from `config.js`:
- `prefix`
- `botName`
- `ownerName`
- `ownerNumber`
- `newsletterJid`
- `social.*`
- `messages.*`

Channel URL resolution fallback order for menus:
1. `config.social.channel`
2. `config.social.whatsappChannel`
3. `process.env.WHATSAPP_CHANNEL_URL`
4. `config.social.website`

---

## 8) Development Checklist (Before Commit)

1. Syntax check all project JS files:

```bash
while IFS= read -r f; do node -c "$f" || break; done < <(rg --files -g '*.js' -g '!node_modules/**' -g '!.git/**' -g '!session/**' -g '!sessions/**' -g '!temp/**')
```

2. Load critical modules:

```bash
node -e "require('./handler'); console.log('handler ok')"
node -e "const {loadCommands}=require('./utils/commandLoader'); console.log(loadCommands().size)"
```

3. Manual WhatsApp smoke:
- `.menu`
- click `DEV`
- click `BACK`
- verify `View Channel` button opens

4. Permission smoke:
- one `ownerOnly` command as owner
- same command from non-owner (must deny)

---

## 9) Production Rollout Checklist

1. Ensure `config.js` owner + bot values are correct.
2. Ensure `newsletterJid` valid.
3. Set channel URL (`config.social.channel` recommended).
4. Confirm `menuButtonsEnabled` desired default in DB.
5. Restart bot cleanly.
6. Run smoke tests in private and group chat.
7. Monitor first 10 minutes logs for button/command errors.

---

## 10) Debugging Playbook

If buttons appear but do nothing:
1. Check `utils/button.js` ID extraction path.
2. Confirm `handler.js` passes `commands` in `extra` to button handler.
3. Confirm clicked ID starts with expected prefixes (`cmd_`, `cmd_menu_cat_`).
4. Check command exists in `loadCommands()` map.
5. Check console for `Button command error` lines.

If menu output mixed/simple unexpectedly:
1. Verify `menuButtonsEnabled` current value.
2. Verify `.menu <category>` path only used after category selection.
3. Confirm latest `commands/general/menu.js` is deployed.

---

## 11) AI Generation Constraints

When AI generates new code for this repo, it must:
- Follow current command contract and folder structure.
- Keep behavior deterministic and backward-compatible.
- Avoid breaking button IDs already in use.
- Use `try/catch` in command execute methods.
- Return user-friendly errors via `extra.reply`.
- Avoid silent failures in interactive flows.

---

## 12) Minimal Command Template

```js
const config = require('../../config');

module.exports = {
  name: 'example',
  aliases: ['ex'],
  category: 'general',
  description: 'Example command',
  usage: `${config.prefix}example <text>`,

  async execute(sock, msg, args, extra) {
    try {
      if (!args.length) return extra.reply(`Usage: ${this.usage}`);
      await extra.react('⏳');
      await extra.reply(`Done: ${args.join(' ')}`);
      await extra.react('✅');
    } catch (error) {
      await extra.reply(`❌ ${error.message}`);
    }
  }
};
```
