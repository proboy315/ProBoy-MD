const apiKeys = require('./settings/api-keys');
const apis = require('./settings/apis');
const messages = require('./settings/messages');
const social = require('./settings/social');
const templates = require('./settings/templates');

module.exports = {
  ownerNumber: ["923261684315"],
  ownerName: ["SHahan"],
  ownerJids: [],
  sudoNumbers: [],
  sudoJids: [],

  botName: "ProBoy-MD",
  version: "3.0.42",
  prefix: ".",
  sessionName: "session",
  sessionID: process.env.SESSION_ID || '',
  newsletterJid: "120363422946163295@newsletter",
  cidJsonUrl: "https://proboy.vercel.app/bot/cid.json",
  updateZipUrl: "https://github.com/proboy315/ProBoy-MD/archive/refs/heads/main.zip",

  packname: "ProBoy-MD",
  author: "SHahan",

  selfMode: false,
  autoRead: false,
  autoTyping: true,
  autoBio: false,
  autoSticker: false,
  autoReact: false,
  autoReactMode: 'bot',
  autoDownload: false,

  defaultGroupSettings: {
    antilink: false,
    antilinkAction: 'delete',
    antilinkWhitelist: [],
    antitag: false,
    antitagAction: 'delete',
    antiall: false,
    antiviewonce: false,
    antibot: false,
    anticall: false,
    antigroupmention: false,
    antigroupmentionAction: 'delete',
    welcome: false,
    welcomeMessage: '╭╼━≪•𝙽𝙴𝚆 𝙼𝙴𝙼𝙱𝙴𝚁•≫━╾╮\n┃𝚆𝙴𝙻𝙲𝙾𝙼𝙴: @user 👋\n┃Member count: #memberCount\n┃𝚃𝙸𝙼𝙴: time⏰\n╰━━━━━━━━━━━━━━━╯\n\n*@user* Welcome to *@group*! 🎉\n*Group 𝙳𝙴𝚂𝙲𝚁𝙸𝙿𝚃𝙸𝙾𝙽*\ngroupDesc\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ botName*',
    goodbye: false,
    goodbyeMessage: 'Goodbye @user 👋 We will never miss you!',
    antiSpam: false,
    antiSpamAction: 'warn',
    antiSpamLimit: 6,
    antiSpamWindowSec: 8,
    antidelete: true,
    antifake: false,
    antifakeAllowedCodes: [],
    antibadword: false,
    antibadwordAction: 'warn',
    badwords: [],
    nsfw: false,
    detect: false,
    chatbot: false,
    autosticker: false
  },

  antideleteSettings: {
    enabled: true,
    dest: 'chat',
    statusDest: 'owner',
    bannerImageUrl: 'https://proboy.vercel.app/ForAntiDelete.JPG'
  },

  statusSettings: {
    autoView: false,
    autoLike: false,
    likeEmoji: '💚'
  },

  apiKeys,
  apis,
  templates,
  messages,
  social,

  timezone: 'Asia/Karachi',
  maxWarnings: 3
};
