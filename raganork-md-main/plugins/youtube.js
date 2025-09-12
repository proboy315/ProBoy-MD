const { Module } = require("../main");
const {
  extractVideoId,
  getYoutubeTitle,
  setClientInstance,
  initializeYouTubeUtils,
  createQualityPrompt,
  handleQualitySelection,
  createAudioQualityPrompt,
  handleAudioQualitySelection,
  createSongSearchPrompt,
  handleSongSelection,
  downloadSong,
  downloadVideo,
} = require("./utils/yt");
const { setVar } = require("./manage");
const fs = require("fs");
const path = require("path");
const botConfig = require("../config");
const isFromMe = botConfig.MODE === "public" ? false : true;
initializeYouTubeUtils();

// Helper function to extract the first URL from a string
function extractFirstUrl(text) {
  if (!text) return null;
  const urlRegex =
    /(https?:\/\/[\w\-._~:/?#[\]@!$&'()*+,;=%]+)|(www\.[\w\-._~:/?#[\]@!$&'()*+,;=%]+)/i;
  const match = text.match(urlRegex);
  return match ? match[0] : null;
}

Module(
  {
    pattern: "ytv ?(.*)",
    fromMe: isFromMe,
    desc: "YouTube video with quality selector",
    type: "downloader",
  },
  async (message, match) => {
    let url = extractFirstUrl(match[1]?.trim());
    if (!url) {
      url = extractFirstUrl(message.reply_message?.text);
    }
    if (!url) {
      await message.sendReply(
        '_Downloading video matching "' + (match[1]?.trim() || "") + '"_'
      );
      try {
        return await message.sendReply(
          await downloadVideo(match[1]?.trim()),
          "video"
        );
      } catch (e) {
        if (e.message.includes("403"))
          await message.sendReply(
            "_Your server IP has no search access to YouTube._"
          );
        return await message.sendReply("_No matching results found!_");
      }
    }
    setClientInstance(message.client);
    const videoIdOnly = extractVideoId(url);
    if (!videoIdOnly) {
      return await message.sendReply(
        "❌ _Invalid YouTube URL or video ID not found._"
      );
    }
    try {
      const title = await getYoutubeTitle(url);
      await createQualityPrompt(url, title, message, message.data);
    } catch (error) {
      console.error("Error creating quality prompt:", error);
      return await message.sendReply(`❌ _${error.message}_`);
    }
  }
);

Module(
  {
    pattern: "yta ?(.*)",
    fromMe: isFromMe,
    desc: "YouTube audio with quality selector",
    type: "downloader",
  },
  async (message, match) => {
    setClientInstance(message.client);
    let url = extractFirstUrl(match[1]?.trim());
    if (!url) {
      url = extractFirstUrl(message.reply_message?.text);
    }
    if (!url) {
      return await message.sendReply(
        "❌ _Provide a valid YouTube URL!_\n\nExample: `.yta <url>`"
      );
    }
    const videoIdOnly = extractVideoId(url);
    if (!videoIdOnly) {
      return await message.sendReply(
        "❌ _Invalid YouTube URL or video ID not found._"
      );
    }
    try {
      const title = await getYoutubeTitle(url);
      await createAudioQualityPrompt(url, title, message, message.data);
    } catch (error) {
      console.error("Error creating audio quality prompt:", error);
      return await message.sendReply(`❌ _${error.message}_`);
    }
  }
);

Module(
  {
    pattern: "song ?(.*)",
    fromMe: isFromMe,
    desc: "Search and download songs from YouTube",
    type: "downloader",
  },
  async (message, match) => {
    setClientInstance(message.client);

    const query = match[1]?.trim();

    if (!query) {
      return await message.sendReply(
        "❌ _Provide a search query!_\n\nExample: `.song Timeless`"
      );
    }

    try {
      await createSongSearchPrompt(query, message, message.data);
    } catch (error) {
      console.error("Error creating song search prompt:", error);
      return await message.sendReply(`❌ _${error.message}_`);
    }
  }
);

Module(
  {
    pattern: "play ?(.*)",
    fromMe: isFromMe,
    desc: "Directly plays songs from YouTube",
    type: "downloader",
  },
  async (message, match) => {
    setClientInstance(message.client);

    const query = match[1]?.trim();

    if (!query) {
      return await message.sendReply(
        "_*Provide a search query!*_\n\nExample: `.play Timeless`"
      );
    }

    try {
      await message.sendReply(`_Playing song matching "${query}"_`);
      let stream = await downloadSong(query);
      if (!stream)
        return await message.sendReply(
          "_Sorry, there was a trouble processing your request._"
        );
      await message.sendMessage({ stream }, "audio", {
        mimetype: "audio/mp4",
        quoted: message.data,
      });
    } catch (error) {
      console.error("Error creating song search prompt:", error);
      return await message.sendReply(`❌ _${error.message}_`);
    }
  }
);

Module(
  {
    on: "text",
    fromMe: isFromMe,
  },
  async (message) => {
    try {
      setClientInstance(message.client);

      if (
        !message.reply_message ||
        message.reply_message.data.key.remoteJid !== message.jid
      ) {
        return;
      }

      const jid = message.jid;
      const text = message.message.trim();

      if (!/^(?:[1-9]|10)$/.test(text)) {
        return;
      }
      const repliedId = message.reply_message.id;

      let success = await handleSongSelection(
        message,
        text,
        repliedId,
        message.quoted
      );

      if (!success && /^[1-8]$/.test(text)) {
        success = await handleQualitySelection(
          message,
          text,
          repliedId,
          message.quoted
        );
      }

      if (!success && /^[1-4]$/.test(text)) {
        success = await handleAudioQualitySelection(
          message,
          text,
          repliedId,
          message.quoted
        );
      }
    } catch (error) {
      console.error("Error handling selection:", error);
    }
  }
);

Module(
  {
    pattern: "video ?(.*)",
    fromMe: isFromMe,
    desc: "Directly downloads a YouTube video (auto quality)",
    type: "downloader",
  },
  async (message, match) => {
    setClientInstance(message.client);
    let query = extractFirstUrl(match[1]?.trim());
    if (!query) {
      query = extractFirstUrl(message.reply_message?.text);
    }
    if (!query) {
      return await message.sendReply(
        "❌ _Provide a YouTube URL or search query!_\n\nExample: `.video https://youtu.be/xyz` or `.video Timeless`"
      );
    }
    if (/instagram\.com\//i.test(query)) {
      return await message.sendReply(
        "❌ _Instagram links are not supported here. Use the `.insta` command instead!_"
      );
    }
    try {
      await message.sendReply(`_Downloading video matching "${query}"_`);
      const videoStream = await downloadVideo(query);
      if (!videoStream) {
        return await message.sendReply(
          "❌ _Failed to download video. No results or error occurred._"
        );
      }
      await message.sendMessage({ stream: videoStream }, "video", {
        quoted: message.data,
      });
    } catch (error) {
      console.error("Error in .video command:", error);
      return await message.sendReply(`❌ _${error.message || error}_`);
    }
  }
);
