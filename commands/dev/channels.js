/**
 * .channels - list / manage the WhatsApp Channels the bot account owns or administers.
 *
 * Baileys has no "list my channels" call, so candidates come from: the remote
 * ids.json (channelManager), channels the bot has seen posts from, and
 * `.channels add <jid|link>`. Each candidate is VERIFIED with WhatsApp
 * (newsletterMetadata -> viewer role); only OWNER/ADMIN channels are listed.
 */
const config = require('../../config');
const hub = require('../../utils/channelHub');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmtDate = (s) => { try { return new Date(s * 1000).toISOString().slice(0, 10); } catch { return '?'; } };

const chunkText = (lines, max = 3500) => {
  const out = []; let cur = '';
  for (const l of lines) { if ((cur + '\n' + l).length > max && cur) { out.push(cur); cur = l; } else cur = cur ? `${cur}\n${l}` : l; }
  if (cur) out.push(cur);
  return out;
};

const describe = (rec, sock, i) => {
  const role = hub.roleFor(rec, sock);
  const badge = hub.isAdminFor(rec, sock) ? (role === 'OWNER' ? '👑 OWNER' : '🛡️ ADMIN') : (role ? `👤 ${role}` : '❔ role unknown');
  const lines = [`*${i}. ${rec.name || 'Unnamed channel'}*  ${badge}`, `🆔 \`${rec.jid}\``];
  const link = hub.channelLink(rec);
  lines.push(link ? `🔗 ${link}` : '🔗 (no invite link available)');
  const extra = [];
  if (rec.subscribers != null) extra.push(`👥 ${rec.subscribers.toLocaleString('en-US')} followers`);
  if (rec.verification && String(rec.verification).toUpperCase() === 'VERIFIED') extra.push('✔️ verified');
  if (rec.creationTime) extra.push(`📅 created ${fmtDate(rec.creationTime)}`);
  if (extra.length) lines.push(extra.join(' • '));
  return lines.join('\n');
};

module.exports = {
  name: 'channels',
  aliases: ['mychannels', 'chlist'],
  category: 'dev',
  description: 'List WhatsApp Channels you own/admin (verified with WhatsApp) and manage the channel list',
  usage: `${config.prefix}channels [all | add <jid|link> | remove <jid> | refresh | log | logdest <bot|jid|default> | status]`,
  ownerOnly: true,

  // called once per connected session by handler.initializePlugins(): starts the deletion watcher
  async init(sock) { try { hub.ensurePoller(sock); } catch { /* never block startup */ } },

  async execute(sock, msg, args, extra) {
    const { reply, react } = extra;
    if (!extra.isOwner && !extra.isSudo) return reply('🔒 Owner only.');
    const sub = (args[0] || '').toLowerCase();
    try {
      hub.registerSock(sock);

      if (sub === 'add') {
        const input = args[1];
        if (!input) return reply(`❌ Usage: ${config.prefix}channels add <channel link | 1203...@newsletter>`);
        await react('⏳');
        let jid;
        const link = hub.parseChannelLink(input);
        if (link) jid = (await hub.resolveInvite(sock, link.code)).rec.jid;
        else jid = /@newsletter$/.test(input) ? input : (/^\d{10,}$/.test(input) ? `${input}@newsletter` : null);
        if (!jid) return reply('❌ Give a channel link (https://whatsapp.com/channel/...) or a JID ending in @newsletter.');
        const v = await hub.verifyChannel(sock, jid, { force: true });
        if (!v.ok) { await react('❌'); return reply(`❌ Added to the list but WhatsApp could not verify it: ${v.error}`); }
        await react('✅');
        return reply(`✅ Tracked.\n\n${describe(v.rec, sock, 1)}\n\n${hub.isAdminFor(v.rec, sock) ? 'You are admin here: .cforward will post to it and deleted posts will be logged.' : '⚠️ This account is NOT admin/owner of this channel, so it will not be used for posting or deletion logs.'}`);
      }

      if (sub === 'remove' || sub === 'rm' || sub === 'del') {
        const jid = args[1];
        if (!jid) return reply(`❌ Usage: ${config.prefix}channels remove <jid>`);
        const ok = hub.removeChannel(/@/.test(jid) ? jid : `${jid}@newsletter`);
        return reply(ok ? '✅ Removed from the tracked list (cached posts deleted). It may be re-added automatically if it is in the remote ids.json.' : '⚠️ That channel was not in the tracked list.');
      }

      if (sub === 'logdest') {
        const v = (args[1] || '').toLowerCase();
        const db = extra.database || sock.sessionDb || require('../../database');
        if (!v) { return reply(`Current channel log destination: ${db.getGlobalSetting('channelLogDest') || '(default: same as antidelete / this bot chat)'}\nUsage: ${config.prefix}channels logdest <bot|jid|default>`); }
        if (v === 'default') { db.setGlobalSetting('channelLogDest', null); return reply('✅ Channel deletion logs now follow your antidelete destination (private chat if it is set to "chat").'); }
        const dest = v === 'bot' ? 'bot' : (args[1].includes('@') ? args[1] : `${args[1].replace(/\D/g, '')}@s.whatsapp.net`);
        db.setGlobalSetting('channelLogDest', dest);
        return reply(`✅ Channel deletion logs will be sent to: ${dest}`);
      }

      if (sub === 'log') {
        const st = hub.status();
        if (!st.deleteLog.length) return reply('📭 No channel post deletions have been logged yet.');
        return reply('*🗑️ Recent channel deletions*\n\n' + st.deleteLog.slice().reverse().map((d, i) => `${i + 1}. ${d.name || d.jid} • post ${d.serverId}${d.cached ? '' : ' (not cached)'}\n   ${new Date(d.at).toISOString().replace('T', ' ').slice(0, 16)} UTC${d.snippet ? `\n   “${d.snippet}”` : ''}`).join('\n'));
      }

      if (sub === 'status') {
        const st = hub.status();
        return reply(`*📡 Channel system*\nTracked channels: ${st.channels} (admin/owner: ${st.admin})\nCached posts: ${st.cachedPosts}\nDeletion watcher: ${st.polling ? `on (every ${Math.round(st.pollMs / 60000)} min)` : 'off'}\nLast check: ${st.lastPoll.at ? new Date(st.lastPoll.at).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : 'never'} (${st.lastPoll.channels} channels, ${st.lastPoll.newPosts} new posts, ${st.lastPoll.deletions} deletions)`);
      }

      // ---- list (default / all / refresh) ----
      const showAll = sub === 'all';
      const force = sub === 'refresh';
      await react('⏳');
      try { for (const e of require('../../utils/channelManager').getNewsletters()) hub.ensureChannel(e.id, 'managed'); } catch { /* optional */ }
      const all = hub.listChannels();
      if (!all.length) {
        await react('❌');
        return reply('📭 No channels known yet.\n\nBaileys cannot list your channels by itself. Add one with:\n' + `${config.prefix}channels add <channel link or 1203...@newsletter>\n\n(The bot also picks up channels it receives posts from, and the ones in your remote ids.json.)`);
      }
      if (all.length > 3) await reply(`🔎 Verifying ${all.length} channel(s) with WhatsApp...`);
      const failed = [];
      for (const rec of all.slice(0, 60)) {
        const v = await hub.verifyChannel(sock, rec.jid, { force });
        if (!v.ok) failed.push(`• ${rec.name || rec.jid}: ${v.error}`);
        if (!v.cached) await sleep(350);
      }
      const rows = all.filter((r) => showAll || hub.isAdminFor(r, sock));
      if (!rows.length) {
        await react('❌');
        return reply(`📭 None of the ${all.length} known channel(s) is owned/administered by this account.\nUse ${config.prefix}channels all to see them anyway.${failed.length ? `\n\n⚠️ Could not verify:\n${failed.join('\n')}` : ''}`);
      }
      rows.sort((a, b) => (hub.isAdminFor(b, sock) - hub.isAdminFor(a, sock)) || String(a.name).localeCompare(String(b.name)));
      const header = `*📢 ${showAll ? 'Known channels' : 'My channels (owner/admin)'}* — ${rows.length}`;
      const blocks = rows.map((r, i) => describe(r, sock, i + 1));
      const parts = chunkText([header, '', ...blocks.flatMap((b) => [b, ''])]);
      if (failed.length) parts.push(`⚠️ *Could not verify (${failed.length}):*\n${failed.slice(0, 10).join('\n')}`);
      for (const p of parts) await reply(p);
      await react('✅');
    } catch (e) {
      console.error('[channels]', e);
      await reply(`❌ ${e.message}`);
      await react('❌');
    }
  }
};
