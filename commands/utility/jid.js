// commands/utility/jid_cmd.js
const { cmd } = require("../../command");
const config = require("../../config");
const { sendInteractiveMessage } = require("gifted-btns");

cmd({
    pattern: "jid",
    desc: "Get JID of current chat or replied user with copy button",
    category: "utility",
    react: "🔖",
    use: ".jid (reply to user)",
    filename: __filename
}, async (conn, mek, m, { from, reply, isGroup, sender, quoted, mentionedJid }) => {
    try {
        let targetJid;
        let label;

        // If user replied to a message
        if (quoted && quoted.sender) {
            targetJid = quoted.sender;
            label = "Quoted User JID";
        }
        // If user mentioned someone
        else if (mentionedJid && mentionedJid.length > 0) {
            targetJid = mentionedJid[0];
            label = "Mentioned User JID";
        }
        // Otherwise get chat JID
        else if (isGroup) {
            targetJid = from;
            label = "Group JID";
        } else {
            targetJid = from;
            label = "Chat JID";
        }

        // Ensure it's a valid JID format
        if (!targetJid || !targetJid.includes("@")) {
            return reply("❌ Could not retrieve JID.");
        }

        // Build the message text (box style)
        const resultText = `╭═══〘 *JID INFO* 〙═══⊷❍
┃✯│ 📌 ${label}
┃✯│ 🔗 \`${targetJid}\`
╰══════════════════⊷❍`;

        // Send interactive message with a copy button
        await sendInteractiveMessage(conn, from, {
            text: resultText,
            footer: config.FOOTER,
            interactiveButtons: [
                {
                    name: 'copy',
                    buttonParamsJson: JSON.stringify({
                        display_text: '📋 Copy JID',
                        id: targetJid
                    })
                }
            ]
        }, { quoted: mek });

        await conn.sendMessage(from, { react: { text: "✅", key: mek.key } });
    } catch (e) {
        console.error("JID command error:", e);
        await reply("❌ An error occurred. Please try again.");
    }
});
