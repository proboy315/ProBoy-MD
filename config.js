/**
 * Global Configuration for WhatsApp MD Bot
 */

module.exports = {
    // Bot Owner Configuration
    ownerNumber: ['923261684315'], // Add your number without + or spaces (e.g., 919876543210)
    ownerName: ['SHAHAN',], // Owner names corresponding to ownerNumber array
    
    // Bot Configuration
    botName: 'ProBoy-MD',
    prefix: '.',
    sessionName: 'session',
    sessionID: process.env.SESSION_ID || '',
    newsletterJid: '120363422946163295@newsletter', // Newsletter JID for menu forwarding
    updateZipUrl: 'https://github.com/proboy315/ProBoy-MD/archive/refs/heads/main.zip', // URL to latest code zip for .update command

    
    // Sticker Configuration
    packname: 'ProBoy-MD',
    
    // Bot Behavior
    selfMode: false, // Private mode - only owner can use commands
    autoRead: false,
    autoTyping: true,
    autoBio: false,
    autoSticker: false,
    autoReact: false,
    autoReactMode: 'bot', // set bot or all via cmd
    autoDownload: false,
    
    // Group Settings Defaults
    defaultGroupSettings: {
      antilink: false,
      antilinkAction: 'delete', // 'delete', 'kick', 'warn'
      antilinkWhitelist: [], // domains allowed (strings)
      antitag: false,
      antitagAction: 'delete',
      antiall: false, // Owner only - blocks all messages from non-admins
      antiviewonce: false,
      antibot: false,
      anticall: false, // Anti-call feature
      antigroupmention: false, // Anti-group mention feature
      antigroupmentionAction: 'delete', // 'delete', 'kick'
      welcome: false,
      welcomeMessage: '╭╼━≪•𝙽𝙴𝚆 𝙼𝙴𝙼𝙱𝙴𝚁•≫━╾╮\n┃𝚆𝙴𝙻𝙲𝙾𝙼𝙴: @user 👋\n┃Member count: #memberCount\n┃𝚃𝙸𝙼𝙴: time⏰\n╰━━━━━━━━━━━━━━━╯\n\n*@user* Welcome to *@group*! 🎉\n*Group 𝙳𝙴𝚂𝙲𝚁𝙸𝙿𝚃𝙸𝙾𝙽*\ngroupDesc\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ botName*',
      goodbye: false,
      goodbyeMessage: 'Goodbye @user 👋 We will never miss you!',
      antiSpam: false,
      antiSpamAction: 'warn', // 'warn' | 'delete'
      antiSpamLimit: 6, // msgs
      antiSpamWindowSec: 8, // seconds
      antidelete: true,
      antifake: false,
      antifakeAllowedCodes: [], // e.g. ['92','1']
      antibadword: false,
      antibadwordAction: 'warn', // 'warn' | 'delete'
      badwords: [], // custom badword list (lowercase)
      nsfw: false,
      detect: false,
      chatbot: false,
      autosticker: false // Auto-convert images/videos to stickers
    },

    // AntiDelete Defaults (global)
    // Note: Commands can update these values in config.js (best-effort) and always update database/global.json.
    antideleteSettings: {
      enabled: true,
      dest: 'chat', // 'chat' | 'owner' | '<jid>'
      statusDest: 'owner', // 'owner' | '<jid>'
      bannerImageUrl: 'https://proboy.vercel.app/ForAntiDelete.JPG' // optional thumbnail URL for recovery banner
    },
    
    // API Keys (add your own)
    apiKeys: {
      // Add API keys here if needed
      openai: '',
      deepai: '',
      remove_bg: '',
      audd: '' // optional: for .find (music recognition)
    },
    
    // Message Configuration
    messages: {
      wait: '⏳ Please wait...',
      success: '✅ Success!',
      error: '❌ Error occurred!',
      ownerOnly: '👑 This command is only for bot owner!',
      adminOnly: '🛡️ This command is only for group admins!',
      groupOnly: '👥 This command can only be used in groups!',
      privateOnly: '💬 This command can only be used in private chat!',
      botAdminNeeded: '🤖 Bot needs to be admin to execute this command!',
      invalidCommand: '❓ Invalid command! Type .menu for help'
    },
    
    // Timezone
    timezone: 'Asia/Karachi',
    
    // Limits
    maxWarnings: 3,
    
    // Social Links (optional)
    social: {
      website: 'https://proboy.vercel.app',
      github: 'https://github.com/proboy315',
      instagram: 'https://instagram.com/itx___proboy',
      Tiktok: 'https://tiktok.com/@itx_ProBoy'
    }
};
  
