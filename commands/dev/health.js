/**
 * .health - owner-only runtime snapshot for stability testing.
 * Reads only; changes nothing.
 */
const config = require('../../config');

const tryRun = (fn, d = null) => { try { return fn(); } catch { return d; } };

module.exports = {
  name: 'health',
  aliases: ['hlth'],
  category: 'dev',
  description: 'Memory, sessions, caches and channel-system status (owner only)',
  usage: `${config.prefix}health`,
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const { reply } = extra;
    if (!extra.isOwner && !extra.isSudo) return reply('🔒 Owner only.');
    const lines = ['🩺 *ProBoy-MD Health*'];

    const mg = tryRun(() => require('../../utils/memoryGuard').snapshot());
    if (mg) lines.push(`\n🧠 *Memory* (${mg.level})\n• used ${mg.usedMB}/${mg.limitMB} MB (${mg.limitSource})\n• rss ${mg.rssMB} · heap ${mg.heapUsedMB} · ext ${mg.externalMB} MB`);

    const sm = globalThis.ProBoySessionManager;
    if (sm) {
      const connected = tryRun(() => sm.getActiveSocks().length, '?');
      const labels = tryRun(() => sm.labels().length, '?');
      lines.push(`\n📡 *Sessions*\n• connected ${connected} / registered ${labels}`);
    }

    const cs = tryRun(() => require('../../handler').getCacheStats());
    if (cs) lines.push(`\n🗂️ *Handler caches*\n• groupMeta ${cs.groupMetadata} · lid ${cs.lidMapping} · inflight ${cs.inflightMetadata}`);

    const ch = tryRun(() => require('../../utils/channelHub').status());
    if (ch) lines.push(`\n📣 *Channels*\n• ${ch.channels} known (${ch.admin} admin) · ${ch.cachedPosts} cached posts\n• poller ${ch.polling ? 'on' : 'off'} · deletions logged ${ch.deleteLog.length}`);

    const up = process.uptime();
    lines.push(`\n⏱️ uptime ${Math.floor(up / 3600)}h ${Math.floor((up % 3600) / 60)}m · node ${process.version}`);
    return reply(lines.join('\n'));
  }
};
