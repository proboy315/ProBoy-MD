/**
 * Owner-only multi-session controller for ProBoy-MD
 *
 * Commands:
 * - .connect <ProBoy-MD!...>                 -> start a new WhatsApp session (or comma-separated multiple)
 * - .connect status                          -> show active + saved sessions (includes JSON output)
 * - .connect del <number>                    -> disconnect a session by phone number (removes saved auth)
 */

module.exports = {
  name: 'connect',
  aliases: ['con'],
  category: 'owner',
  description: 'Manage multi-session WhatsApp connections',
  usage: '.connect <session_id>\n.connect status\n.connect del <number>',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    // Only the primary owner should control connect/disconnect
    const senderNum = String(extra.sender || '').split('@')[0].replace(/[^0-9]/g, '');
    const PRIMARY_OWNER = '923261684315';
    if (senderNum !== PRIMARY_OWNER) {
      return extra.reply('❌ Only primary owner can use `.connect` on this deployment.');
    }

    const manager = globalThis.ProBoySessionManager;
    if (!manager) return extra.reply('❌ Session manager not available. Restart bot.');

    const sub = (args[0] || '').toLowerCase();

    if (sub === 'status') {
      const st = manager.status();
      const activeNumbers = (st.active || [])
        .map(s => String(s.phone || '').trim())
        .filter(Boolean);
      const uniqActive = [...new Set(activeNumbers)];

      const savedNumbers = (st.saved || [])
        .map(s => String(s.phone || '').trim())
        .filter(Boolean);
      const uniqSaved = [...new Set(savedNumbers)];

      const remoteJson = {
        _comment: 'Upload this JSON on https://proboy.vercel.app/connect/ (or your CONNECT_JSON_URL). Placeholders: {{botName}} {{prefix}} {{botNumber}} {{sessionLabel}} {{time}} {{date}}',
        By: 'SHAHAN',
        messages: 'hello Everyone! Bot {{botNumber}} is online. Type {{prefix}}update',
        send: 'false',
        to: 'self',
        join: 'https://chat.whatsapp.com/INVITE_CODE_HERE,120363422946163295@newsletter',
        command: '',
        commandOnce: 'true',
        token: 'SET_CONNECT_JSON_TOKEN_ENV_AND_PASTE_SAME_HERE',
        numbers: uniqActive
      };

      const text =
        `*Connected Numbers (${uniqActive.length}):*\n` +
        (uniqActive.length ? uniqActive.map(n => `• ${n}`).join('\n') : '—') +
        `\n\n*Saved Numbers (${uniqSaved.length}):*\n` +
        (uniqSaved.length ? uniqSaved.map(n => `• ${n}`).join('\n') : '—') +
        `\n\n*Remote JSON (upload):*\n` +
        '```json\n' + JSON.stringify(remoteJson, null, 2) + '\n```';

      return extra.reply(text);
    }

    if (sub === 'del' || sub === 'delete' || sub === 'remove') {
      const number = (args[1] || '').replace(/[^0-9]/g, '');
      if (!number) return extra.reply(`❌ Number missing.\n*Usage:* ${this.usage}`);
      if (number === PRIMARY_OWNER) return extra.reply('❌ Primary bot number cannot be removed.');
      const out = await manager.disconnect(number);
      if (!out.ok) return extra.reply(`❌ ${out.error || 'Failed'}`);
      return extra.reply(`✅ Disconnected: ${out.phone || number} (${out.label})`);
    }

    const sessionId = args.join(' ').trim();
    if (!sessionId) return extra.reply(`❌ Session ID missing.\n*Usage:* ${this.usage}`);

    if (!sessionId.startsWith('ProBoy-MD!')) {
      return extra.reply("❌ Invalid session format. Expected `ProBoy-MD!.....`");
    }

    const out = await manager.connect(sessionId);
    if (!out.ok) return extra.reply(`❌ ${out.error || 'Failed'}`);
    const started = (out.started || []).map(s => `✅ Started: ${s.label}`).join('\n') || '✅ Started';
    return extra.reply(`${started}\n\nUse \`.connect status\` to check numbers when they come online.`);
  }
};
