// Import all modules
const dbOperations = require("./db/functions");
const mediaProcessing = require("./mediaProcessors");
const utils = require("./misc");
const language = require("./manglish");

// Grouped database operations
const {
  getWarn,
  setWarn,
  resetWarn,
  decrementWarn,
  getWarnCount,
  getAllWarns,
  antilinkConfig,
  antiword,
  antifake,
  antipromote,
  antidemote,
  antispam,
  antibot,
  pdm,
  welcome,
  goodbye,
  filter,
} = dbOperations;

// Media processing functions
const {
  addExif,
  bass,
  circle,
  blur,
  attp,
  aadhar,
  sticker,
  rotate,
  avMix,
  webp2mp4,
  addID3
} = mediaProcessing;

// Utility functions
const {
  parseUptime,
  isNumeric,
  isAdmin,
  mentionjid,
  getJson,
  bytesToSize,
  isFake,
  processOnwa,
  findMusic,
  searchYT,
  downloadGram,
  pin,
  fb,
  igStalk,
  tiktok,
  story,
  getThumb,
  gtts,
  getBuffer,
  lyrics
} = utils;

// Language functions
const { malayalamToManglish, manglishToMalayalam } = language;

const aiTTS = require("./ai-tts");

const { gis, pinSearch } = require("./gis");

const { uploadToImgbb, uploadToCatbox } = require("./upload");

const linkDetector = require("./link-detector");
 
const fancy = require("./fancy");

module.exports = {
  // Database Operations
  getWarn,
  setWarn,
  fancy,
  resetWarn,
  decrementWarn,
  getWarnCount,
  getAllWarns,
  antilinkConfig,
  antiword,
  antifake,
  antipromote,
  antidemote,
  antispam,
  antibot,
  pdm,
  welcome,
  goodbye,
  filter,

  // Media Processing
  addExif,
  bass,
  circle,
  blur,
  attp,
  aadhar,
  sticker,
  rotate,
  avMix,
  webp2mp4,
  addID3,

  // Utilities
  parseUptime,
  isNumeric,
  isAdmin,
  mentionjid,
  getJson,
  bytesToSize,
  isFake,
  aiTTS,
  processOnwa,
  findMusic,
  searchYT,
  downloadGram,
  pin,
  fb,
  igStalk,
  tiktok,
  story,
  getThumb,
  gtts,
  getBuffer,

  // Language
  malayalamToManglish,
  manglishToMalayalam,

  // GIS
  gis,
  pinSearch,

  // File Upload
  uploadToImgbb,
  uploadToCatbox,

  // Link Detection
  linkDetector,
  lyrics,
};
