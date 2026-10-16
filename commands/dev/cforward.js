/**
 * .cforward - post one message to ALL channels this account owns/administers.
 *   Mode A: reply to a post with  .cforward
 *   Mode B: .cforward https://whatsapp.com/channel/<code>/<postId>
 *   ALL SESSIONS: .cforward -a -s   (reply to a post)   or   .cforward -a -s <channel post link>
 *     every connected session posts to the channels IT owns/administers (each channel once). Only the main
 *     owner number may use it. Runs in the background, 4-8 s random pause between posts. `.cforward stop` / `.cforward status`.
 * Flags: --force  resend even if the same content already went to a channel
 *        --sync   ignore the saved channel list and ask WhatsApp again
 *        --plain  post as a normal message (no "Forwarded" label)
 *        --fwd    add the "Forwarded" label even if the source is not a channel post
 *
 * Which channels? The session that received the command is looked up in the saved
 * list database/my_admin_channels.json (owner/admin channels of THAT session; refreshed
 * from WhatsApp when older than 1 h). Posting goes through hub.postToChannel (own
 * newsletter upload + send with WhatsApp's ack), because Baileys rc14's sendMessage
 * cannot send channel media. Every channel is handled separately; a summary is sent.
 */
const fs = require('fs');
const config = require('../../config');
const hub = require('../../utils/channelHub');

const MAX_SHOWN = 15;
const name = (rec) => rec.name || rec.jid;

let job = null; // the running all-sessions forward (only one at a time)
const fmtMin = (ms) => { const m = Math.round(ms / 60000); return m < 1 ? '<1 min' : `~${m} min`; };

module.exports = {
  name: 'cforward',
  aliases: ['chforward'],
  category: 'dev',
  description: 'Forward a replied post (or a channel post link) to every channel this session owns/admins; -a -s = all sessions (main owner only)',
  usage: `${config.prefix}cforward [-a -s] [<jid,jid,...>] [<channel post link>] [--force] [--sync] [--plain] [--fwd]   (reply to a post, or give a link)`,
  // anyone may call it, the body decides: bot owner / sudo / the session's own account. -a -s is further restricted to the main number.
  ownerOnly: false,

  async execute(sock, msg, args, extra) {
    const { reply, react } = extra;
    if (!extra.isOwner && !extra.isSudo && !msg?.key?.fromMe) return reply('🔒 Owner only.');
    let tmpFile = null, deferCleanup = false;
    try {
      hub.registerSock(sock);
      const has = (f) => args.some((a) => a.toLowerCase() === f);
      const force = has('--force'), forceSync = has('--sync'), plain = has('--plain'), forceFwd = has('--fwd');
      const low = args.map((a) => a.toLowerCase());
      const allSessions = low.some((a) => a === '--all-sessions' || a === '-as' || a === '-sa') || (low.includes('-a') && low.includes('-s'));
      const rest = args.filter((a) => !a.startsWith('-'));

      // ---- job control ----
      if (low[0] === 'stop' || low[0] === 'status') {
        if (low[0] === 'stop') { if (!job) return reply('ℹ️ No all-sessions forward is running.'); job.stop = true; return reply('🛑 Stopping after the post that is being sent right now...'); }
        if (!job) return reply('ℹ️ No all-sessions forward is running.');
        const left = Math.max(0, job.total - job.done);
        return reply(`📊 *All-sessions forward*\nProgress: ${job.done}/${job.total}  (✅ ${job.sent} • ❌ ${job.failed} • ⏭️ ${job.skipped})\nRunning for ${fmtMin(Date.now() - job.startedAt)} • about ${fmtMin(left * 6500)} left\nStop with ${config.prefix}cforward stop`);
      }

      // ---- all-sessions mode: restricted to the main owner number ----
      if (allSessions) {
        if (!hub.isAllSessionsUser(extra)) {
          return reply('⛔ *Restricted*\nThe all-sessions mode (-a -s) can only be used by the main owner number.\nNormal .cforward (this session\'s own channels) still works for you.');
        }
        if (job) return reply(`⏳ An all-sessions forward is already running (${job.done}/${job.total}). Wait for it, or send ${config.prefix}cforward stop`);
      }
      const linkArg = rest.find((a) => /whatsapp\.com\/channel\//i.test(a));
      // explicit targets:  .cforward 1203...@newsletter,1204...@newsletter   (bare numbers of 8+ digits get @newsletter)
      const targets = [...new Set(rest.filter((a) => !/whatsapp\.com\/channel\//i.test(a)).join(',').split(/[,\s]+/).map((t) => t.trim()).filter(Boolean)
        .map((t) => (/@newsletter$/i.test(t) ? t.toLowerCase() : (/^\d{8,}$/.test(t) ? `${t}@newsletter` : null))).filter(Boolean))];

      if (allSessions && targets.length) return reply('❌ -a -s cannot be combined with explicit target channels. Use one or the other.');
      let post = null, sourceJid = null, sourceLabel = '', fwdInfo = null;

      // -------- Mode B: link --------
      if (linkArg) {
        const parsed = hub.parseChannelLink(linkArg);
        if (!parsed) return reply('❌ That is not a valid channel link.');
        if (!parsed.postId) return reply('❌ The link has no post id. Use the link of a single post: https://whatsapp.com/channel/CODE/POST_ID');
        if (!/^\d+$/.test(parsed.postId)) return reply('❌ The post id in that link is not numeric, so it cannot be looked up.');
        await react('⏳');
        let src;
        try { src = await hub.resolveInvite(sock, parsed.code); }
        catch (e) { await react('❌'); return reply(`❌ Could not resolve the channel from the link: ${e.message}`); }
        sourceJid = src.rec.jid;
        let got;
        try { got = await hub.getPostById(sock, sourceJid, parsed.postId); }
        catch (e) {
          await react('❌');
          return reply(`❌ I could not retrieve that post from its link.\n\nReason: ${e.message}\n\nWhatsApp does not let a bot read a single post by link in every case. Nothing was forwarded.\n\n✅ Alternative: forward that post to this chat, reply to it and send ${config.prefix}cforward`);
        }
        // cached record (already has its media on disk) or a freshly fetched proto message
        if (got.source === 'cache') {
          post = { type: got.post.type, text: got.post.text, caption: got.post.caption, mime: got.post.mime, fileName: got.post.fileName, ptt: got.post.ptt, gif: got.post.gif, size: got.post.size };
          if (got.post.media?.path && fs.existsSync(got.post.media.path)) tmpFile = { keep: true, path: got.post.media.path };
          else if (['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'].includes(post.type)) { await react('❌'); return reply('❌ That post is cached but its media file is no longer stored. Nothing was forwarded.'); }
        } else {
          const d = hub.describeContent(got.post.message);
          if (!d || d.unsupported) { await react('❌'); return reply('❌ That post type cannot be forwarded (unsupported content).'); }
          post = d;
          if (['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'].includes(d.type)) {
            const saved = await hub.saveMedia(sock, { remoteJid: sourceJid, id: parsed.postId }, got.post.message, `fw${parsed.postId}`);
            if (!saved) { await react('❌'); return reply('❌ Could not download the media of that post (too large, low server memory, or WhatsApp refused). Nothing was forwarded.'); }
            tmpFile = { keep: false, path: saved.path };
          }
        }
        sourceLabel = `${src.rec.name || sourceJid} / post ${parsed.postId}`;
        fwdInfo = { jid: sourceJid, serverId: parsed.postId, name: src.rec.name || undefined };
      } else {
        // -------- Mode A: reply --------
        const content = extra.utils?.getMessageContent ? extra.utils.getMessageContent(msg) : msg.message;
        const ctx = content?.extendedTextMessage?.contextInfo || content?.conversation?.contextInfo || null;
        const quoted = ctx?.quotedMessage;
        if (!quoted) {
          return reply(`ℹ️ *How to use ${config.prefix}cforward*\n\n1) Reply to a post (text/image/video/document/audio/sticker) with ${config.prefix}cforward  → goes to ALL channels you admin\n1b) ${config.prefix}cforward 1203...@newsletter,1204...@newsletter  (reply) → ONLY to those channels\n2) or ${config.prefix}cforward https://whatsapp.com/channel/CODE/POST_ID\n\nFlags: --force resend • --sync re-check channels with WhatsApp • --plain no "Forwarded" label • --fwd force the label.\n\nAll sessions (main owner only): reply to a post with ${config.prefix}cforward -a -s   or   ${config.prefix}cforward -a -s <post link>`);
        }
        const q = hub.unwrap(quoted);
        const d = hub.describeContent(quoted);
        if (!d || d.unsupported) return reply('❌ That message type cannot be posted to a channel (supported: text, image, video, audio, document, sticker).');
        post = d;
        const qInner = q?.[d.type];
        sourceJid = qInner?.contextInfo?.forwardedNewsletterMessageInfo?.newsletterJid || (String(ctx?.remoteJid || '').endsWith('@newsletter') ? ctx.remoteJid : null);
        await react('⏳');
        if (['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'].includes(d.type)) {
          const saved = await hub.saveMedia(sock, { remoteJid: extra.from, id: ctx.stanzaId, participant: ctx.participant }, quoted, `fw${Date.now()}`);
          if (!saved) { await react('❌'); return reply('❌ Could not download the media of the replied post (too large, low server memory, or it has expired on WhatsApp). Nothing was forwarded.'); }
          tmpFile = { keep: false, path: saved.path };
        }
        sourceLabel = sourceJid ? `${hub.getChannel(sourceJid)?.name || sourceJid} (replied post)` : 'replied message';
        const fni = qInner?.contextInfo?.forwardedNewsletterMessageInfo;
        if (sourceJid) fwdInfo = { jid: sourceJid, serverId: fni?.serverMessageId || undefined, name: fni?.newsletterName || hub.getChannel(sourceJid)?.name || undefined };
      }

      const fwd = plain ? null : (fwdInfo || (forceFwd ? {} : null));

      // -------- ALL SESSIONS (background job) --------
      if (allSessions) {
        await reply('🧭 Checking which channels each connected session owns/administers...');
        const plan = await hub.planAllSessions(sock, { excludeJid: sourceJid, forceLive: forceSync });
        if (!plan.dests.length) {
          await react('❌');
          return reply(`❌ None of the ${plan.sessions.length} connected session(s) is owner/admin of a channel${sourceJid ? ' (other than the source channel)' : ''}.${plan.problems.length ? '\n⚠️ ' + plan.problems.slice(0, 5).map((p) => `+${p.account}: ${p.error}`).join('\n') : ''}`);
        }
        const used = new Set(plan.dests.map((d) => hub.accountOf(d._sock)));
        job = { startedAt: Date.now(), total: plan.dests.length, done: 0, sent: 0, failed: 0, skipped: 0, stop: false };
        deferCleanup = true;
        const S = { min: Number(process.env.CFORWARD_DELAY_MIN_MS) || 4000, max: Number(process.env.CFORWARD_DELAY_MAX_MS) || 8000 };
        await reply(`🚀 *All-sessions forward started*\nChannels: ${plan.dests.length} (via ${used.size} of ${plan.sessions.length} session(s))${plan.shared ? `\nShared channels (several sessions are admin): ${plan.shared} → posted once each` : ''}\nStyle: ${fwd ? (fwd.jid ? 'forwarded from channel' : 'forwarded') : 'normal post'}\nPause: random ${S.min / 1000}-${S.max / 1000} s between posts (+ a little more when the session changes)\nEstimated time: ${fmtMin(plan.dests.length * ((S.min + S.max) / 2 + 1500))}\nStop: ${config.prefix}cforward stop • Progress: ${config.prefix}cforward status`);
        const file = tmpFile?.path || null;
        console.log(`[CFORWARD] ALL-SESSIONS type=${post.type} size=${post.size || 0} media=${file ? 'yes' : 'no'} channels=${plan.dests.length} sessions=${used.size}`);
        (async () => {
          try {
            let lastNote = 0;
            const res = await hub.forwardToChannels(sock, post, file, plan.dests, {
              force, fwd, confirm: false,
              shouldStop: () => job.stop,
              onProgress: (r) => {
                job.done = r.sent.length + r.failed.length; job.sent = r.sent.length; job.failed = r.failed.length; job.skipped = r.skipped.length;
                if (job.done - lastNote >= 20) { lastNote = job.done; sock.sendMessage(extra.from, { text: `⏳ Forwarding... ${job.done}/${job.total} (✅ ${job.sent} • ❌ ${job.failed})` }).catch(() => {}); }
              }
            });
            if (res.busy) return reply('⏳ This exact post is already being forwarded right now. Not sending it twice.');
            const bySess = new Map();
            const row = (a) => { if (!bySess.has(a)) bySess.set(a, { ok: 0, bad: 0 }); return bySess.get(a); };
            for (const r of res.sent) row(r._acct).ok++;
            for (const f of res.failed) row(f.acct).bad++;
            const kb = post.size ? ` (${post.size > 1048576 ? (post.size / 1048576).toFixed(1) + ' MB' : Math.round(post.size / 1024) + ' KB'})` : '';
            let out = `*📢 ALL-SESSIONS FORWARD ${res.stopped ? '— STOPPED' : 'DONE'}*\nSource: ${sourceLabel}\nType: ${post.type.replace('Message', '')}${kb}${post.caption ? ' + caption' : ''}\nStyle: ${fwd ? (fwd.jid ? 'forwarded from channel' : 'forwarded') : 'normal post'}\nTook: ${fmtMin(Date.now() - job.startedAt)}\n\n✅ *Sent: ${res.sent.length}*  ❌ *Failed: ${res.failed.length}*  ⏭️ *Skipped: ${res.skipped.length}*${res.stopped ? `  🛑 *Not reached: ${plan.dests.length - res.sent.length - res.failed.length - res.skipped.length}*` : ''}\n\n*By session*`;
            for (const [a, v] of [...bySess.entries()].slice(0, 40)) out += `\n📱 +${a}: ✅ ${v.ok}${v.bad ? `  ❌ ${v.bad}` : ''}`;
            if (res.failed.length) out += `\n\n❌ *Failures*\n` + res.failed.slice(0, 15).map((f) => `• ${name(f.rec)} (+${f.acct}) — ${f.reason}`).join('\n') + (res.failed.length > 15 ? `\n…and ${res.failed.length - 15} more` : '');
            if (res.skipped.length) out += `\n\n⏭️ Skipped (already sent earlier): ${res.skipped.length} — use --force to resend`;
            if (plan.problems.length) out += `\n\n⚠️ Sessions not used:\n` + plan.problems.slice(0, 8).map((p) => `• +${p.account}: ${p.error}`).join('\n');
            await reply(out);
          } catch (e) {
            console.error('[cforward all-sessions]', e);
            try { await reply(`❌ All-sessions forward crashed: ${e.message}`); } catch { /* ignore */ }
          } finally {
            job = null;
            if (tmpFile && tmpFile.path && !tmpFile.keep) { try { fs.unlinkSync(tmpFile.path); } catch { /* ignore */ } }
          }
        })();
        return;
      }

      // -------- destinations --------
      let dests, rejected = [], listInfo = null;
      if (targets.length) {
        // explicit targets: you chose them, so they are NOT filtered by the admin check; WhatsApp is the judge
        dests = [];
        for (const jid of targets) if (jid !== sourceJid) dests.push(await hub.targetRecord(sock, jid));
        if (!dests.length) { await react('❌'); return reply('❌ The only target given is the source channel itself.'); }
        await reply(`🎯 Posting to ${dests.length} target channel(s)${force ? ' (--force)' : ''}...`);
      } else {
        const r = await hub.eligibleDestinations(sock, { excludeJid: sourceJid, forceLive: forceSync });
        listInfo = r;
        dests = r.eligible; rejected = r.rejected;
        if (!dests.length) {
          await react('❌');
          return reply(`❌ No eligible channels: this account is not verified as owner/admin of any tracked channel${sourceJid ? ' (the source channel is skipped)' : ''}.\n\nGive targets directly: ${config.prefix}cforward 1203...@newsletter,1204...@newsletter\nor use ${config.prefix}channels to see/add channels.${rejected.length ? '\n\n⚠️ ' + rejected.slice(0, 5).map((r2) => `${name(r2.rec)}: ${r2.reason}`).join('\n') : ''}`);
        }
        const ago = listInfo?.syncedAt ? Math.max(0, Math.round((Date.now() - listInfo.syncedAt) / 60000)) : null;
        const src2 = !listInfo?.source ? 'each tracked channel verified with WhatsApp' : listInfo.source === 'live' ? 'checked live with WhatsApp' : listInfo.source === 'saved' ? `saved list, synced ${ago} min ago` : `saved list (STALE ${ago} min; live check failed: ${listInfo?.liveError || '?'})`;
        await reply(`📢 Session +${listInfo?.account || '?'} is owner/admin of ${dests.length} channel(s) (${src2}).\nPosting to all of them${force ? ' (--force)' : ''}...`);
      }
      console.log(`[CFORWARD] session=${hub.accountOf(sock)} type=${post.type} size=${post.size || 0} media=${tmpFile?.path ? 'yes' : 'no'} dests=${dests.length} fwd=${fwd ? (fwd.jid ? 'channel' : 'generic') : 'no'}`);
      const res = await hub.forwardToChannels(sock, post, tmpFile?.path || null, dests, { force, fwd });
      if (res.busy) { await react('⏳'); return reply('⏳ This exact post is already being forwarded right now. Not sending it twice.'); }

      const list = (arr, f) => arr.slice(0, MAX_SHOWN).map(f).join('\n') + (arr.length > MAX_SHOWN ? `\n…and ${arr.length - MAX_SHOWN} more` : '');
      const kb = post.size ? ` (${post.size > 1048576 ? (post.size / 1048576).toFixed(1) + ' MB' : Math.round(post.size / 1024) + ' KB'})` : '';
      let out = `*📢 CFORWARD SUMMARY*\nSession: +${hub.accountOf(sock)}\nSource: ${sourceLabel}\nType: ${post.type.replace('Message', '')}${kb}${post.caption ? ' + caption' : ''}\nStyle: ${fwd ? (fwd.jid ? 'forwarded from channel' : 'forwarded') : 'normal post'}\n\n✅ *Sent: ${res.sent.length}*`;
      if (res.sent.length) out += `\n${list(res.sent, (r) => `${r._delivery === 'confirmed' ? '✅' : r._delivery === 'not-seen' ? '⚠️' : '📤'} ${name(r)}${r._delivery === 'confirmed' ? (r._serverId ? ` — accepted by WhatsApp (post #${r._serverId})` : ' — confirmed in channel') : r._delivery === 'not-seen' ? ' — handed over, but NOT visible in the channel feed (maybe rejected: are you admin there?)' : ' — handed over (WhatsApp sent no confirmation)'}${r._note && r._note !== 'forwarded label' ? `\n   ↳ ${r._note}` : ''}`)}`;
      if (res.skipped.length) out += `\n\n⏭️ *Skipped (duplicate): ${res.skipped.length}*\n${list(res.skipped, (s) => `• ${name(s.rec)}`)}\n_Use ${config.prefix}cforward --force to resend._`;
      if (res.failed.length) out += `\n\n❌ *Failed: ${res.failed.length}*\n${list(res.failed, (f) => `• ${name(f.rec)} — ${f.reason}`)}`;
      if (rejected.length) out += `\n\n⚠️ *Not usable (${rejected.length}):*\n${list(rejected, (r) => `• ${name(r.rec)} — ${r.reason}`)}`;
      await reply(out);
      await react(res.failed.length && !res.sent.length ? '❌' : '✅');
    } catch (e) {
      console.error('[cforward]', e);
      await reply(`❌ ${e.message}`);
      await react('❌');
    } finally {
      if (!deferCleanup && tmpFile && tmpFile.path && !tmpFile.keep) { try { fs.unlinkSync(tmpFile.path); } catch { /* ignore */ } }
    }
  }
};
