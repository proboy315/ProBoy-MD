# ProBoy-MD Development Prompt (Production-Aligned)

Use this as the primary prompt/spec for anyone (human or AI) building or modifying features in this repository.
This document is aligned with current project behavior in `index.js`, `handler.js`, `config.js`, `database.js`, `commands/*`, and `utils/*`.

---

## 1) System Overview

- Runtime: Node.js (CommonJS)
- Entry point: `index.js`
- Message router: `handler.js`
- Command loader: `utils/commandLoader.js`
- Storage: `database.js` + JSON files under `database/`
- Command modules: `commands/<category>/<command>.js`
- Button system: `utils/gifted-btns.js` (core) + `utils/button.js` (compat layer + click routing)
- Primary config surface: `config.js`
- Config submodules: `settings/api-keys.js`, `settings/apis.js`, `settings/messages.js`, `settings/social.js`, `settings/templates.js`

Core flow:
1. Baileys socket connects in `index.js`.
2. Incoming messages are passed to `handler.js`.
3. `handler.js` resolves text command OR button interaction.
4. Matching command module `execute()` runs with `extra` helpers.
5. Settings/state read-write via per-session DB instance (`extra.database`).

Runtime notes:
- Bot supports local auth and pure remote-session mode.
- In pure remote mode, `key.txt` enables remote polling without local session creds.
- Remote sessions count as connected only after real WhatsApp `connection=open`.
- Each session gets its own DB under its auth directory.

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
- Owner/sudo checks must use normalized IDs.
- Incoming `@lid` senders may need resolution from `session/` and `sessions/auth-*`.

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
- `utils/gifted-btns.js` (actual send/render — talks to the `gifted-btns` npm package)
- `utils/button.js` (thin compat wrapper + inbound click routing)
- `handler.js`

Delivery notes:
- `commands/general/menu.js` and `commands/general/list.js` must avoid oversized image captions.
- If output is too long, send text chunks instead of one big caption.
- Keep button IDs backward-compatible.

---

## 5) Button System — `gifted-btns` (Full Reference)

**This section is the authoritative source for how to send buttons in this repo.**
Any AI/agent generating code that sends WhatsApp buttons MUST follow this section exactly.
Deviating from these shapes (wrong `name`, wrong `buttonParamsJson` keys, un-stringified JSON, etc.) is the #1 cause of buttons silently failing or falling back to plain numbered text.

### 5.1 Two files, two jobs

| File | Job |
|---|---|
| `utils/gifted-btns.js` | **Sending.** Real wrapper around the `gifted-btns` npm package. Injects the binary nodes (`biz`, `interactive`, `native_flow`, `bot`) WhatsApp needs to actually render buttons. Has a safe plain-text fallback if the package is ever missing/broken — it will never throw and crash a command. |
| `utils/button.js` | **Receiving + convenience.** Extracts the clicked button `id` from an incoming message (`extractButtonIdFromMessage`), routes `cmd_*` button clicks to the matching command (`handleButtonResponse`), and re-exports `sendButtons` / `sendInteractiveMessage` (which internally just call `utils/gifted-btns.js`). Most commands only need to import from `utils/button.js`; import `utils/gifted-btns.js` directly only when you need the full catalog builders (`buttons.singleSelect`, `buttons.reviewAndPay`, etc.) or `normalizeLegacyButton`. |

```js
// Simple / common case — either import works, both hit the same sender under the hood
const { sendButtons, sendInteractiveMessage } = require('../../utils/button');
// or, equivalently, for direct access + full builder helpers:
const { sendButtons, sendInteractiveMessage, buttons } = require('../../utils/gifted-btns');
```

### 5.2 Quick start — one CTA copy button (most common pattern, e.g. `.pair`)

```js
const { sendInteractiveMessage } = require('../../utils/gifted-btns');

await sendInteractiveMessage(sock, from, {
  text: `✅ Your code is:\n\n\`${code}\``,
  footer: 'ProBoy-MD',
  interactiveButtons: [
    {
      name: 'cta_copy',
      buttonParamsJson: JSON.stringify({
        display_text: '📋 Copy Code',
        copy_code: code
      })
    }
  ]
}, { quoted: msg });
```

### 5.3 Quick start — a few quick-reply buttons (legacy simple shape via `sendButtons`)

```js
const { sendButtons } = require('../../utils/button');

await sendButtons(sock, from, {
  text: 'Choose an option:',
  footer: 'ProBoy-MD',
  buttons: [
    { type: 'quick_reply', displayText: 'Alive', id: 'cmd_.alive' },
    { type: 'url', displayText: 'Website', url: 'https://proboy.vercel.app' },
    { type: 'copy', displayText: 'Copy Code', copyCode: '123456' }
  ]
});
```
`sendButtons` accepts the simple `{ type, displayText, ... }` shape and normalizes it internally — use this for the common cases. For anything beyond `quick_reply` / `url` / `copy` / `call` / `catalog` / `select` / `location`, or to mix several kinds in one message, use `sendInteractiveMessage` with the raw `interactiveButtons` array (see catalog below).

### 5.4 Full Button Catalog (`native_flow` names)

Every entry needs `{ name, buttonParamsJson }` where `buttonParamsJson` is **always `JSON.stringify(...)`** — never a raw object.

| `name` | Purpose | Required `buttonParamsJson` keys | Builder helper (`utils/gifted-btns.js` → `buttons.*`) |
|---|---|---|---|
| `quick_reply` | Sends its `id` back as a message | `{ display_text, id }` | `buttons.quickReply(displayText, id)` |
| `cta_url` | Opens a URL | `{ display_text, url, merchant_url? }` | `buttons.ctaUrl(displayText, url, merchantUrl?)` |
| `cta_copy` | Copies text to clipboard | `{ display_text, copy_code }` | `buttons.ctaCopy(displayText, copyCode)` |
| `cta_call` | Tap-to-dial | `{ display_text, phone_number }` | `buttons.ctaCall(displayText, phoneNumber)` |
| `cta_catalog` | Opens business catalog | `{ display_text? }` | `buttons.ctaCatalog(displayText?)` |
| `single_select` | In-message picker list | `{ title, sections:[{ title?, rows:[{ id, title, description?, header? }] }] }` | `buttons.singleSelect(title, sections)` |
| `send_location` | Requests user location | `{ display_text? }` | `buttons.sendLocation(displayText?)` |
| `review_and_pay` | Order/payment summary (special) | Server-validated payment payload | `buttons.reviewAndPay(payload)` |
| `payment_info` | Payment info flow (special) | Payment payload | `buttons.paymentInfo(payload)` |
| `mpm` | Multi-product message (catalog) | Vendor structure | `buttons.mpm(payload)` |
| `wa_payment_transaction_details` | Show transaction | Transaction reference keys | `buttons.waPaymentTransactionDetails(payload)` |
| `automated_greeting_message_view_catalog` | Greeting → catalog | Minimal/internal | `buttons.automatedGreetingMessageViewCatalog(payload)` |

**Core stable ones for normal bot commands:** `quick_reply`, `cta_url`, `cta_copy`, `cta_call`, `single_select`. The special payment/catalog ones are official-business-client-only — don't rely on them rendering for a personal number.

### 5.5 Mixing several button kinds in one message

```js
const { sendInteractiveMessage, buttons } = require('../../utils/gifted-btns');

await sendInteractiveMessage(sock, from, {
  text: 'Pick or explore',
  footer: 'ProBoy-MD',
  interactiveButtons: [
    buttons.quickReply('Hi', 'hi'),
    buttons.ctaUrl('Docs', 'https://example.com'),
    buttons.singleSelect('Menu', [
      { title: 'Options', rows: [
        { id: 'a', title: 'Alpha', description: 'First item' },
        { id: 'b', title: 'Beta', description: 'Second item' }
      ]}
    ])
  ]
}, { quoted: msg });
```

### 5.6 Image header + AI mode (private-chat conversational rendering)

```js
await sendInteractiveMessage(sock, from, {
  title: 'Header Title',
  text: 'Body text',
  footer: 'ProBoy-MD',
  image: { url: 'https://example.com/image.jpg' }, // or { buffer } or a local path
  aimode: true, // only affects private (1:1) chats
  interactiveButtons: [ buttons.ctaUrl('Open Site', 'https://example.com') ]
}, { quoted: msg });
```

### 5.7 Error handling — already built in, don't reimplement it

`sendButtons` / `sendInteractiveMessage` in `utils/gifted-btns.js` already:
- wrap the real `gifted-btns` package call in try/catch,
- fall back to a readable numbered plain-text message if the package errors or isn't installed,
- never throw for a missing package (they log `[GIFTED-BTNS] ...` and degrade gracefully).

**Do not** wrap these calls in your own duplicate try/catch that swallows the error silently — let your command's own top-level try/catch (per the command template) report failures via `extra.reply`.

### 5.8 Common mistakes (avoid these — they are the reasons buttons silently break)

- ❌ Passing a raw object instead of a JSON string for `buttonParamsJson` (`buttonParamsJson: {...}` instead of `buttonParamsJson: JSON.stringify({...})`).
- ❌ Re-implementing WhatsApp's old legacy `buttons:[...]` / `headerType` format directly with `sock.sendMessage(...)`. That format is deprecated and no longer renders — **always** go through `utils/gifted-btns.js`.
- ❌ Sending more than 3 `quick_reply` buttons in a single message and expecting reliable rendering — chunk into multiple messages instead (see `sendCommandMenu` in `utils/button.js` for the pattern).
- ❌ Forgetting `footer` — pass one explicitly or rely on the `config.botName` default.
- ❌ Expecting `review_and_pay` / `payment_info` / `mpm` / catalog buttons to render on a non-business personal WhatsApp — WhatsApp silently ignores unsupported special flows on those accounts.
- ❌ Adding your own `bot` node manually — `gifted-btns` auto-injects it for private chats when needed.
- ❌ Importing button IDs with spaces — keep IDs short, deterministic, `cmd_`-prefixed for command-driven buttons (see Section 6).

### 5.9 Button IDs & best practices (repo-specific)

- Keep button IDs short and deterministic.
- For category/state flows, prefer no spaces in IDs.
- If a button should run a command when clicked, its `id` **must** start with `cmd_` (e.g. `cmd_.alive`) — `utils/button.js`'s `handleButtonResponse` only routes IDs with that prefix (plus the reserved `cmd_menu_home` / `cmd_menu_cat_<category>`).
- Never break an existing button ID that's already deployed/cached in users' chats.

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
- `cidJsonUrl`
- `updateZipUrl`
- `statusSettings.*`
- `antideleteSettings.*`
- `social.*`
- `messages.*`

Config structure rules:
- Keep `config.js` lean and focused on core/runtime-editable values.
- Keep large API maps and template/social/message blocks in `settings/*.js`.
- Command-local defaults can live inside the command if they are not global bot identity/runtime settings.

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
node -e "require('./utils/gifted-btns'); console.log('gifted-btns wrapper ok')"
```

3. Manual WhatsApp smoke:
- `.menu`
- click `DEV`
- click `BACK`
- verify `View Channel` button opens
- send a command that uses `cta_copy` (e.g. `.pair`) and confirm a **real tappable button** appears, not numbered plain text

4. Permission smoke:
- one `ownerOnly` command as owner
- same command from non-owner (must deny)
5. Remote smoke if pure remote mode is enabled:
- wait for `[READY]` before command testing
- verify one owner-only command
- verify one sudo path if configured

---

## 9) Production Rollout Checklist

1. Ensure `config.js` owner + bot values are correct.
2. Ensure `newsletterJid` valid.
3. Set channel URL (`config.social.channel` recommended).
4. Confirm `menuButtonsEnabled` desired default in DB.
5. Run `npm install` so the `gifted-btns` package is present (buttons silently degrade to text without it — check logs for `[GIFTED-BTNS] Package "gifted-btns" is not installed/loadable`).
6. Restart bot cleanly.
7. Run smoke tests in private and group chat.
8. Monitor first 10 minutes logs for button/command errors.
9. If using remote sessions, watch for `401` / `logged_out` and remove stale sessions.

---

## 10) Debugging Playbook

If buttons appear but do nothing:
1. Check `utils/button.js` ID extraction path (`extractButtonIdFromMessage`).
2. Confirm `handler.js` passes `commands` in `extra` to button handler.
3. Confirm clicked ID starts with expected prefixes (`cmd_`, `cmd_menu_cat_`).
4. Check command exists in `loadCommands()` map.
5. Check console for `Button command error` lines.

If buttons render as plain numbered text instead of real tappable buttons:
1. Check console for `[GIFTED-BTNS] Package "gifted-btns" is not installed/loadable` — run `npm install`.
2. Check console for `[GIFTED-BTNS] sendInteractiveMessage failed` / `sendButtons failed` — read the underlying error message logged right after.
3. Confirm no code path is calling `sock.sendMessage(jid, { buttons: [...], headerType: 1 })` directly anywhere (that's the deprecated legacy format — grep for `headerType` across `commands/` and `utils/`).
4. Confirm `buttonParamsJson` values are `JSON.stringify(...)` strings, not raw objects.

If menu output mixed/simple unexpectedly:
1. Verify `menuButtonsEnabled` current value.
2. Verify `.menu <category>` path only used after category selection.
3. Confirm latest `commands/general/menu.js` is deployed.

If commands execute in logs but do not reply in chat:
1. Check whether the command is sending an oversized image caption.
2. Confirm long output falls back to plain text chunks.
3. Check if the socket disconnected after command log but before send.

If owner-only commands reject valid owner/sudo users:
1. Check `config.ownerNumber` and `config.sudoNumbers`.
2. Check normalized sender resolution in `handler.js`.
3. Check LID mapping files under `session/` and `sessions/auth-*`.

If remote sessions disconnect or stall:
1. Check for `408`, `401`, `EAI_AGAIN`, or fetch timeout logs.
2. Treat `401 / logged_out` as invalid session data, not a command bug.
3. Confirm reconnect attempts are queued and Baileys version fetch is cached.

---

## 11) Remote Session + Newsletter Rules

- `index.js` may poll remote session JSON and connect multiple sessions concurrently.
- Polling should be useful but not noisy.
- Cache Baileys version fetches during reconnect loops.
- Managed newsletter IDs come from:
  1. `config.newsletterJid`
  2. `config.cidJsonUrl`
- Bot should auto-follow managed newsletters when supported.
- New posts in managed newsletters should get an automatic random reaction.

---

## 12) Current Built-in Feature Notes

- `commands/general/antidelete.js`
  - Supports `on`, `off`, `status`, `chat`, `bot`, `jid`, and direct JID input.
  - Custom target example: `.antidelete jid 22222@lid`
  - Deleted statuses and messages can be redirected to the same target JID.
  - Media cache should stay temporary and aggressively cleaned.

- `commands/dev/autostatus.js`
  - Owner-only status automation command.
  - Supports `.autostatus on`, `.autostatus off`, `.autostatus view on`, `.autostatus like on`, `.autostatus emoji 💚`

- `commands/general/bugmenu.js`
  - Shows installed `bug` category commands.
  - Must remain safe/admin-oriented only.

- `commands/utility/obfuscate.js`
  - Missing `javascript-obfuscator` must not break startup.
  - Failure should happen only when the command is actually used.

- `commands/utility/pair.js`
  - Generates a WhatsApp pairing code via the external pairing API.
  - Result is delivered via a real `cta_copy` button (`utils/gifted-btns.js`) — never plain text.

- `commands/utility/readmore.js`
  - Sends progressive "read more" chunks, each with a `cta_copy` button to copy the full text so far.

---

## 13) Logging Rules

- Console logs should stay concise, readable, and production-friendly.
- Current style uses labels like `[BOOT]`, `[INFO]`, `[REMOTE]`, `[CONNECT]`, `[READY]`, `[CMD]`, `[WARN]`, `[CLEAN]`, `[GIFTED-BTNS]`.
- Prefer resolved phone numbers in command logs instead of raw `@lid`.
- Throttle repeated network/fetch warnings.

---

## 14) AI Generation Constraints

When AI generates new code for this repo, it must:
- Follow current command contract and folder structure.
- Keep behavior deterministic and backward-compatible.
- Avoid breaking button IDs already in use.
- Send any button using `utils/button.js` or `utils/gifted-btns.js` exactly as documented in **Section 5** — never hand-roll `sock.sendMessage(..., { buttons: [...], headerType: 1 })` or any other ad-hoc button format.
- Always `JSON.stringify()` a button's `buttonParamsJson`.
- Use `try/catch` in command execute methods.
- Return user-friendly errors via `extra.reply`.
- Avoid silent failures in interactive flows.

---

## 15) Minimal Command Template

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

## 16) Minimal Button Command Template

```js
const config = require('../../config');
const { sendInteractiveMessage, buttons } = require('../../utils/gifted-btns');

module.exports = {
  name: 'examplebtn',
  category: 'general',
  description: 'Example command that replies with a button',
  usage: `${config.prefix}examplebtn <code>`,

  async execute(sock, msg, args, extra) {
    const { reply, react, from } = extra;
    try {
      if (!args.length) return reply(`Usage: ${this.usage}`);
      await react('⏳');

      await sendInteractiveMessage(sock, from, {
        text: `Here is your code:\n\n\`${args[0]}\``,
        footer: config.botName,
        interactiveButtons: [
          buttons.ctaCopy('📋 Copy Code', args[0])
        ]
      }, { quoted: msg });

      await react('✅');
    } catch (error) {
      await reply(`❌ ${error.message}`);
      await react('❌');
    }
  }
};
```
