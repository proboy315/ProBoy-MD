/**
 * .webui - owner-only test of the HTML payload (WebUI) message.
 *   .webui            -> small demo card
 *   .webui big        -> ~70 KB page (must be REFUSED by the 64 KB guard; fallback text sent)
 *   .webui raw <html> -> send your own HTML
 * EXPERIMENTAL - rendering is up to the recipient's WhatsApp client.
 */
const config = require('../../config');
const webui = require('../../utils/webui');

module.exports = {
  name: 'webui',
  aliases: ['htmlui'],
  category: 'dev',
  description: 'Test the HTML payload (WebUI) message (experimental)',
  usage: `${config.prefix}webui [big | raw <html>]`,
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const { reply, react } = extra;
    if (!extra.isOwner && !extra.isSudo) return reply('🔒 Owner only.');
    const from = msg.key.remoteJid;
    const mode = (args[0] || '').toLowerCase();
    let html;
    if (mode === 'big') html = webui.page(`<div class="card">${'x'.repeat(70 * 1024)}</div>`);
    else if (mode === 'raw' && args.length > 1) html = args.slice(1).join(' ');
    else {
      html = webui.page(`<div class="card"><h2>ProBoy-MD ✅</h2><p>WebUI test · ${webui.escapeHtml(new Date().toISOString())}</p><button onclick="this.textContent='Clicked!'">Tap me</button></div>`);
    }
    await react('⏳');
    const res = await webui.sendHtml(sock, from, html, {
      title: 'ProBoy-MD WebUI test',
      fallbackText: '⚠️ WebUI could not be sent (see next message). Text fallback only.'
    });
    if (res.ok) {
      await react('✅');
      return reply(`📤 Sent (${res.bytes} bytes, id ${res.id}).\nIf you see no card, your WhatsApp client does not render it (this is expected on some versions) - the relay itself succeeded.`);
    }
    await react('❌');
    return reply(`❌ Not sent: ${res.error}`);
  }
};
