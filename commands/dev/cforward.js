/**
 * .cforward - post one message to ALL channels this account owns/administers.
 *   Mode A: reply to a post with  .cforward
 *   Mode B: .cforward https://whatsapp.com/channel/<code>/<postId>
 * Flags: --force  (resend even if the same content already went to a channel)
 *
 * Sending uses sock.sendMessage('<id>@newsletter', ...), the only posting API
 * Baileys has. Only channels where WhatsApp says this account is OWNER/ADMIN
 * are targeted. Every channel is handled separately; a final summary is sent.
 */
const fs = require('fs');
const config = require('../../config');
const hub = require('../../utils/channelHub');

const MAX_SHOWN = 15;
const name = (rec) => rec.name || rec.jid;

module.exports = {
  name: 'cforward',
  aliases: ['chforward'],
  category: 'dev',
  description: 'Forward a replied post (or a channel post link) to every channel you own/admin',
  usage: `${config.prefix}cforward [<jid,jid,...>] [<channel post link>] [--force]   (reply to a post, or give a link)`,
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const { reply, react } = extra;
    if (!extra.isOwner && !extra.isSudo) return reply('🔒 Owner only.');
    let tmpFile = null;
    try {
      hub.registerSock(sock);
      const force = args.some((a) => a.toLowerCase() === '--force');
      const rest = args.filter((a) => !a.startsWith('--'));
      const linkArg = rest.find((a) => /whatsapp\.com\/channel\//i.test(a));
      // explicit targets:  .cforward 1203...@newsletter,1204...@newsletter   (bare numbers of 8+ digits get @newsletter)
      const targets = [...new Set(rest.filter((a) => !/whatsapp\.com\/channel\//i.test(a)).join(',').split(/[,\s]+/).map((t) => t.trim()).filter(Boolean)
        .map((t) => (/@newsletter$/i.test(t) ? t.toLowerCase() : (/^\d{8,}$/.test(t) ? `${t}@newsletter` : null))).filter(Boolean))];

      let post = null, sourceJid = null, sourceLabel = '';

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
      } else {
        // -------- Mode A: reply --------
        const content = extra.utils?.getMessageContent ? extra.utils.getMessageContent(msg) : msg.message;
        const ctx = content?.extendedTextMessage?.contextInfo || content?.conversation?.contextInfo || null;
        const quoted = ctx?.quotedMessage;
        if (!quoted) {
          return reply(`ℹ️ *How to use ${config.prefix}cforward*\n\n1) Reply to a post (text/image/video/document/audio/sticker) with ${config.prefix}cforward  → goes to ALL channels you admin\n1b) ${config.prefix}cforward 1203...@newsletter,1204...@newsletter  (reply) → ONLY to those channels\n2) or ${config.prefix}cforward https://whatsapp.com/channel/CODE/POST_ID\n\nAdd --force to resend content that was already sent to a channel.`);
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
      }

      // -------- destinations --------
      let dests, rejected = [];
      if (targets.length) {
        // explicit targets: you chose them, so they are NOT filtered by the admin check; WhatsApp is the judge
        dests = [];
        for (const jid of targets) if (jid !== sourceJid) dests.push(await hub.targetRecord(sock, jid));
        if (!dests.length) { await react('❌'); return reply('❌ The only target given is the source channel itself.'); }
        await reply(`🎯 Posting to ${dests.length} target channel(s)${force ? ' (--force)' : ''}...`);
      } else {
        await reply('🔎 Checking which channels you can post to...');
        const r = await hub.eligibleDestinations(sock, { excludeJid: sourceJid });
        dests = r.eligible; rejected = r.rejected;
        if (!dests.length) {
          await react('❌');
          return reply(`❌ No eligible channels: this account is not verified as owner/admin of any tracked channel${sourceJid ? ' (the source channel is skipped)' : ''}.\n\nGive targets directly: ${config.prefix}cforward 1203...@newsletter,1204...@newsletter\nor use ${config.prefix}channels to see/add channels.${rejected.length ? '\n\n⚠️ ' + rejected.slice(0, 5).map((r2) => `${name(r2.rec)}: ${r2.reason}`).join('\n') : ''}`);
        }
        await reply(`📢 Posting to ${dests.length} channel(s)${force ? ' (--force)' : ''}...`);
      }
      const res = await hub.forwardToChannels(sock, post, tmpFile?.path || null, dests, { force });
      if (res.busy) { await react('⏳'); return reply('⏳ This exact post is already being forwarded right now. Not sending it twice.'); }

      const list = (arr, f) => arr.slice(0, MAX_SHOWN).map(f).join('\n') + (arr.length > MAX_SHOWN ? `\n…and ${arr.length - MAX_SHOWN} more` : '');
      let out = `*📢 CFORWARD SUMMARY*\nSource: ${sourceLabel}\nType: ${post.type.replace('Message', '')}\n\n✅ *Sent: ${res.sent.length}*`;
      if (res.sent.length) out += `\n${list(res.sent, (r) => `${r._delivery === 'confirmed' ? '✅' : r._delivery === 'not-seen' ? '⚠️' : '📤'} ${name(r)}${r._delivery === 'confirmed' ? ' — confirmed in channel' : r._delivery === 'not-seen' ? ' — sent, but NOT visible in the channel feed yet (maybe rejected: are you admin there?)' : ' — sent (could not confirm)'}`)}`;
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
      if (tmpFile && tmpFile.path && !tmpFile.keep) { try { fs.unlinkSync(tmpFile.path); } catch { /* ignore */ } }
    }
  }
};
