// commands/owner/fake.js
const fs = require('fs');
const path = require('path');
const config = require('../../config');

// Settings file
const DB_DIR = path.join(__dirname, '../../database');
const DB_FILE = path.join(DB_DIR, 'presence.json');

// Ensure database directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const DEFAULT_SETTINGS = {
  typingEnabled: false,
  recordingEnabled: false,
  durationSeconds: 60,
  alternateIntervalSeconds: 5
};

// Load settings
let SETTINGS = (() => {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2));
      return { ...DEFAULT_SETTINGS };
    }
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
})();

function saveSettings() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(SETTINGS, null, 2));
  } catch {}
}

// Active presence timers per chat
const activePresence = new Map();

async function startPresence(sock, jid) {
  if (!SETTINGS.typingEnabled && !SETTINGS.recordingEnabled) return;

  // Stop any existing presence for this chat
  if (activePresence.has(jid)) {
    const prev = activePresence.get(jid);
    clearTimeout(prev.stopTimer);
    clearInterval(prev.refreshTimer);
    clearInterval(prev.intervalTimer);
    activePresence.delete(jid);
    try { await sock.sendPresenceUpdate('paused', jid); } catch {}
  }

  const alternate = SETTINGS.typingEnabled && SETTINGS.recordingEnabled;

  if (!alternate) {
    // Only one mode
    const mode = SETTINGS.typingEnabled ? 'composing' : 'recording';

    // Refresh every 15 seconds to keep presence alive
    const refreshTimer = setInterval(async () => {
      try { await sock.sendPresenceUpdate(mode, jid); } catch {}
    }, 15000);

    // Initial presence
    try { await sock.sendPresenceUpdate(mode, jid); } catch {}

    // Stop after duration
    const stopTimer = setTimeout(async () => {
      clearInterval(refreshTimer);
      try { await sock.sendPresenceUpdate('paused', jid); } catch {}
      activePresence.delete(jid);
    }, SETTINGS.durationSeconds * 1000);

    activePresence.set(jid, { stopTimer, refreshTimer });
    return;
  }

  // Alternate between composing and recording
  let current = 'composing';
  try { await sock.sendPresenceUpdate(current, jid); } catch {}

  const refreshTimer = setInterval(async () => {
    try { await sock.sendPresenceUpdate(current, jid); } catch {}
  }, 15000);

  const intervalTimer = setInterval(async () => {
    current = current === 'composing' ? 'recording' : 'composing';
    try { await sock.sendPresenceUpdate(current, jid); } catch {}
  }, SETTINGS.alternateIntervalSeconds * 1000);

  const stopTimer = setTimeout(async () => {
    clearInterval(refreshTimer);
    clearInterval(intervalTimer);
    try { await sock.sendPresenceUpdate('paused', jid); } catch {}
    activePresence.delete(jid);
  }, SETTINGS.durationSeconds * 1000);

  activePresence.set(jid, { stopTimer, refreshTimer, intervalTimer });
}

async function stopPresence(sock, jid) {
  if (!activePresence.has(jid)) return;
  const entry = activePresence.get(jid);
  clearTimeout(entry.stopTimer);
  clearInterval(entry.refreshTimer);
  clearInterval(entry.intervalTimer);
  activePresence.delete(jid);
  try { await sock.sendPresenceUpdate('paused', jid); } catch {}
}

module.exports = {
  name: 'fake',
  aliases: ['fakepresence'],
  category: 'owner',
  description: 'Control fake typing/recording presence',
  usage: '.fake <typing|recording|stop|duration|interval|status> [on/off/seconds]',
  ownerOnly: true, // All subcommands require owner
  modOnly: false,
  groupOnly: false,
  privateOnly: false,
  adminOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    try {
      if (args.length === 0) {
        return extra.reply(
          `❌ *Usage:* ${this.usage}\n\n` +
          `*Subcommands:*\n` +
          `• .fake typing on/off\n` +
          `• .fake recording on/off\n` +
          `• .fake stop\n` +
          `• .fake duration <1-3600>\n` +
          `• .fake interval <1-300>\n` +
          `• .fake status`
        );
      }

      const sub = args[0].toLowerCase();
      const value = args.slice(1).join(' ').toLowerCase();

      switch (sub) {
        case 'typing':
          if (!value || (value !== 'on' && value !== 'off')) {
            return extra.reply('Usage: .fake typing on/off');
          }
          SETTINGS.typingEnabled = (value === 'on');
          saveSettings();
          await extra.reply(`✨ Fake typing ${value === 'on' ? 'ON' : 'OFF'}\n⏱ Duration: ${SETTINGS.durationSeconds}s`);
          break;

        case 'recording':
          if (!value || (value !== 'on' && value !== 'off')) {
            return extra.reply('Usage: .fake recording on/off');
          }
          SETTINGS.recordingEnabled = (value === 'on');
          saveSettings();
          await extra.reply(`🎙️ Fake recording ${value === 'on' ? 'ON' : 'OFF'}\n⏱ Duration: ${SETTINGS.durationSeconds}s`);
          break;

        case 'stop':
          // Stop for all chats where presence is active
          for (const [jid] of activePresence) {
            await stopPresence(sock, jid);
          }
          await extra.reply('⏹️ Stopped all fake presence.');
          break;

        case 'duration':
          const dur = parseInt(value);
          if (isNaN(dur) || dur < 1 || dur > 3600) {
            return extra.reply('Usage: .fake duration <1-3600>');
          }
          SETTINGS.durationSeconds = dur;
          saveSettings();
          await extra.reply(`⏱ Duration set to ${dur}s`);
          break;

        case 'interval':
          const int = parseInt(value);
          if (isNaN(int) || int < 1 || int > 300) {
            return extra.reply('Usage: .fake interval <1-300>');
          }
          SETTINGS.alternateIntervalSeconds = int;
          saveSettings();
          await extra.reply(`🔁 Interval set to ${int}s`);
          break;

        case 'status':
          const status = [
            '╭─「 *Fake Presence Settings* 」',
            `│ ✨ Typing: ${SETTINGS.typingEnabled ? '*ON*' : '*OFF*'}`,
            `│ 🎙️ Recording: ${SETTINGS.recordingEnabled ? '*ON*' : '*OFF*'}`,
            `│ ⏱ Duration: *${SETTINGS.durationSeconds}s*`,
            `│ 🔁 Interval: *${SETTINGS.alternateIntervalSeconds}s*`,
            '╰───────────────'
          ].join('\n');
          await extra.reply(status);
          break;

        default:
          await extra.reply(`❌ Unknown subcommand: ${sub}\nUse .fake for help.`);
      }

      await extra.react('✅');
    } catch (error) {
      console.error('Fake presence error:', error);
      await extra.reply('❌ An error occurred.');
      await extra.react('❌');
    }
  }
};
