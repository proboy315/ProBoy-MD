module.exports = {
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
  proboyAi: {
    baseUrl: process.env.PROBOY_AI_BASE_URL || 'https://proboy-ai.vercel.app/'
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
};
