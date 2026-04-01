/**
 * Global Configuration for WhatsApp MD Bot
 */

module.exports = {
    // Bot Owner Configuration
    ownerNumber: ['923261684315'], // Add your number without + or spaces (e.g., 919876543210)
    ownerName: ['SHAHAN',], // Owner names corresponding to ownerNumber array
    
    // Bot Configuration
    botName: 'ProBoy-MD',
    version: '1.0.0',
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

    // External APIs / Endpoints (centralized)
    // Tip: override any key via ENV on hosting panels (Render/Pterodactyl).
    apis: {
      princetech: {
        baseUrl: process.env.PRINCETECH_BASE_URL || 'https://api.princetechn.com/api',
        apiKey: process.env.PRINCETECH_APIKEY || 'prince'
      },
      giftedtech: {
        baseUrl: process.env.GIFTEDTECH_BASE_URL || 'https://api.giftedtech.co.ke/api',
        apiKey: process.env.GIFTEDTECH_APIKEY || 'gifted'
      },
      shizo: {
        baseUrl: process.env.SHIZO_BASE_URL || 'https://api.shizo.top',
        apiKey: process.env.SHIZO_APIKEY || 'shizo'
      },
      siputzx: {
        baseUrl: process.env.SIPUTZX_BASE_URL || 'https://api.siputzx.my.id'
      },
      hidemeText2Img: {
        baseUrl: process.env.HIDEME_TEXT2IMG_BASE_URL || 'https://text2img.hideme.eu.org'
      },
      someRandomApi: {
        baseUrl: process.env.SOME_RANDOM_API_BASE_URL || 'https://api.some-random-api.com'
      },
      proboyPair: {
        baseUrl: process.env.PROBOY_PAIR_BASE_URL || 'https://proboy-pair.onrender.com'
      },
      emojiKitchen: {
        baseUrl: process.env.EMOJI_KITCHEN_BASE_URL || 'https://www.gstatic.com/android/keyboard/emojikitchen/20201001'
      },
      fileio: {
        uploadUrl: process.env.FILEIO_UPLOAD_URL || 'https://file.io'
      },
      catbox: {
        uploadUrl: process.env.CATBOX_UPLOAD_URL || 'https://catbox.moe/user/api.php'
      },
      wikipedia: {
        summaryBaseUrl: process.env.WIKI_SUMMARY_BASE_URL || 'https://en.wikipedia.org/api/rest_v1/page/summary'
      },
      tinyurl: {
        apiUrl: process.env.TINYURL_API_URL || 'https://tinyurl.com/api-create.php'
      },
      memeApi: {
        apiUrl: process.env.MEME_API_URL || 'https://meme-api.com/gimme'
      },
      quotable: {
        apiUrl: process.env.QUOTABLE_API_URL || 'https://api.quotable.io/random'
      },
      jokeApi: {
        apiUrl: process.env.JOKE_API_URL || 'https://official-joke-api.appspot.com/random_joke'
      },
      ytdlFallbacks: {
        izumiBaseUrl: process.env.IZUMI_BASE_URL || 'https://izumiiiiiiii.dpdns.org',
        yupraBaseUrl: process.env.YUPRA_BASE_URL || 'https://api.yupra.my.id',
        okatsuBaseUrl: process.env.OKATSU_BASE_URL || 'https://okatsu-rolezapiiz.vercel.app',
        eliteprotechBaseUrl: process.env.ELITEPROTECH_BASE_URL || 'https://eliteprotech-apis.zone.id'
      },
      catApi: {
        baseUrl: process.env.CAT_API_BASE_URL || 'https://api.thecatapi.com'
      },
      dogApi: {
        baseUrl: process.env.DOG_API_BASE_URL || 'https://dog.ceo'
      },
      uselessFacts: {
        apiUrl: process.env.USELESS_FACTS_API_URL || 'https://uselessfacts.jsph.pl/random.json'
      },
      simDb: {
        baseUrl: process.env.SIM_DB_BASE_URL || 'https://ammar-sim-database-api-786.vercel.app'
      },
      geminiProxy: {
        baseUrl: process.env.GEMINI_PROXY_BASE_URL || 'https://ymd-ai.onrender.com'
      },
      github: {
        baseUrl: process.env.GITHUB_API_BASE_URL || 'https://api.github.com'
      },
      ephoto360: {
        baseUrl: process.env.EPHOTO360_BASE_URL || 'https://en.ephoto360.com'
      },
      dreaded: {
        baseUrl: process.env.DREADED_BASE_URL || 'https://api.dreaded.site/api'
      },
      ttsNova: {
        baseUrl: process.env.TTS_NOVA_BASE_URL || 'https://www.laurine.site'
      },
      ttsmp3: {
        baseUrl: process.env.TTSMP3_BASE_URL || 'https://ttsmp3.com'
      },
      defaultAssets: {
        fallbackProfilePicUrl: process.env.FALLBACK_PROFILE_PIC_URL || 'https://img.pyrocdn.com/dbKUgahg.png',
        fallbackGroupPpUrl: process.env.FALLBACK_GROUP_PIC_URL || 'https://telegra.ph/file/265c672094dfa87caea19.jpg'
      }
    },

    // Textmaker templates (keep URLs centralized)
    templates: {
      ephoto360: {
        neon: 'https://en.ephoto360.com/create-colorful-neon-light-text-effects-online-797.html',
        blackpink: 'https://en.ephoto360.com/create-a-blackpink-style-logo-with-members-signatures-810.html',
        matrix: 'https://en.ephoto360.com/matrix-text-effect-154.html',
        impressive: 'https://en.ephoto360.com/create-3d-colorful-paint-text-effect-online-801.html',
        glitch: 'https://en.ephoto360.com/create-digital-glitch-text-effects-online-767.html',
        devil: 'https://en.ephoto360.com/neon-devil-wings-text-effect-online-683.html',
        purple: 'https://en.ephoto360.com/purple-text-effect-online-100.html',
        _1917: 'https://en.ephoto360.com/1917-style-text-effect-523.html',
        fire: 'https://en.ephoto360.com/flame-lettering-effect-372.html',
        ice: 'https://en.ephoto360.com/ice-text-effect-online-101.html',
        thunder: 'https://en.ephoto360.com/thunder-text-effect-online-97.html',
        sand: 'https://en.ephoto360.com/write-names-and-messages-on-the-sand-online-582.html',
        leaves: 'https://en.ephoto360.com/green-brush-text-effect-typography-maker-online-153.html',
        hacker: 'https://en.ephoto360.com/create-anonymous-hacker-avatars-cyan-neon-677.html',
        arena: 'https://en.ephoto360.com/create-cover-arena-of-valor-by-mastering-360.html',
        light: 'https://en.ephoto360.com/light-text-effect-futuristic-technology-style-648.html',
        snow: 'https://en.ephoto360.com/create-a-snow-3d-text-effect-free-online-621.html',
        metallic: 'https://en.ephoto360.com/impressive-decorative-3d-metal-text-effect-798.html',
        birthday: 'https://en.ephoto360.com/write-name-on-red-rose-birthday-cake-images-462.html'
      }
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
  
