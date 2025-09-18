//pattern: "autoinsta",
const { Module } = require("../main");
const {
  pinSearch,
  getBuffer,
  downloadGram,
  pin,
  igStalk,
  fb,
} = require("./utils");
const fileType = require("file-type");
const botConfig = require("../config");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

// Set bot mode
const isPrivateBot = botConfig.MODE !== "public";

// Compatibility wrapper for file-type detection
const getFileType = async (buffer) => {
  try {
    if (fileType.fileTypeFromBuffer) {
      return await fileType.fileTypeFromBuffer(buffer);
    }
    if (fileType.fromBuffer) {
      return await fileType.fromBuffer(buffer);
    }
    return await fileType(buffer);
  } catch (error) {
    console.log("File-type detection failed:", error);
    return null;
  }
};

// Enhanced reaction helper with error handling
async function addReaction(message, emoji) {
  try {
    const reactionMessage = {
      react: {
        text: emoji,
        key: message.data.key || message.key,
      },
    };
    await message.client.sendMessage(message.jid, reactionMessage);
    console.log(`✓ Reaction added: ${emoji}`);
  } catch (err) {
    console.error("❌ Reaction error:", err.message);
  }
}

// Check redirects
async function checkRedirect(url) {
  try {
    if (url.includes("/share/")) {
      // Convert share URLs to standard format
      if (url.includes("/share/reel/")) {
        const match = url.match(/\/share\/reel\/([^/?]+)/);
        if (match && match[1]) {
          return `https://www.instagram.com/reel/${match[1]}/`;
        }
      }
      if (url.includes("/share/p/")) {
        const match = url.match(/\/share\/p\/([^/?]+)/);
        if (match && match[1]) {
          return `https://www.instagram.com/p/${match[1]}/`;
        }
      }
      
      // Try redirect for other share URLs
      const response = await axios.get(url, {
        maxRedirects: 0,
        validateStatus: null,
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (response.status === 302 && response.headers.location) {
        return response.headers.location;
      }
      
      if (response.request && response.request.res && response.request.res.responseUrl) {
        return response.request.res.responseUrl;
      }
    }
    return url;
  } catch (error) {
    console.error("Redirect check error:", error.message);
    return url;
  }
}

// Send media using streams
async function sendMediaWithStream(message, mediaUrl, quotedMessage = null) {
  try {
    const mediaBuffer = await getBuffer(mediaUrl);
    
    if (!mediaBuffer || mediaBuffer.length === 0) {
      throw new Error("Empty media buffer");
    }
    
    // Detect file type
    const fileTypeResult = await getFileType(mediaBuffer.slice(0, 4096));
    const mime = fileTypeResult?.mime || "application/octet-stream";
    
    // Create temp directory
    const tempDir = path.join(__dirname, "../temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Create temp file
    const extension = fileTypeResult?.ext || "bin";
    const filename = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${extension}`;
    const filePath = path.join(tempDir, filename);
    
    // Write buffer to temp file
    fs.writeFileSync(filePath, mediaBuffer);
    
    // Create stream
    const stream = fs.createReadStream(filePath);
    
    // Send based on type
    if (mime.includes("video")) {
      await message.client.sendMessage(message.jid, {
        video: { stream },
        mimetype: mime,
        quoted: quotedMessage
      });
    } else if (mime.includes("image")) {
      await message.client.sendMessage(message.jid, {
        image: { stream },
        mimetype: mime,
        quoted: quotedMessage
      });
    } else {
      await message.client.sendMessage(message.jid, {
        document: { stream },
        fileName: `media.${extension}`,
        mimetype: mime,
        quoted: quotedMessage
      });
    }
    
    // Cleanup after 5 seconds
    setTimeout(() => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        console.error("Cleanup error:", err);
      }
    }, 5000);
    
    return true;
    
  } catch (error) {
    console.error("Send media error:", error);
    throw error;
  }
}

// Instagram downloader
async function downloadInstagram(message, url) {
  try {
    url = await checkRedirect(url);
    console.log("Processing Instagram URL:", url);
    
    if (url.includes("stories")) {
      console.log("Detected Instagram story, skipping auto download");
      return false;
    }
    
    const downloadResult = await downloadGram(url);
    
    if (!downloadResult || !Array.isArray(downloadResult) || downloadResult.length === 0) {
      return false;
    }
    
    const quotedMessage = message.reply_message ? message.quoted : message.data;
    
    for (const mediaUrl of downloadResult) {
      if (mediaUrl && typeof mediaUrl === 'string') {
        await sendMediaWithStream(message, mediaUrl, quotedMessage);
      }
    }
    
    return true;
  } catch (error) {
    console.error("Instagram download error:", error);
    return false;
  }
}

// Facebook downloader
async function downloadFacebook(message, url) {
  try {
    console.log("Processing Facebook URL:", url);
    
    const downloadResult = await fb(url);
    
    if (!downloadResult || !downloadResult.url) {
      return false;
    }
    
    const quotedMessage = message.reply_message ? message.quoted : message.data;
    await sendMediaWithStream(message, downloadResult.url, quotedMessage);
    
    return true;
  } catch (error) {
    console.error("Facebook download error:", error);
    return false;
  }
}

// Pinterest downloader
async function downloadPinterest(message, url) {
  try {
    console.log("Processing Pinterest URL:", url);
    
    const downloadResult = await pin(url);
    
    if (!downloadResult) {
      return false;
    }
    
    const quotedMessage = message.reply_message ? message.quoted : message.data;
    await sendMediaWithStream(message, downloadResult, quotedMessage);
    
    return true;
  } catch (error) {
    console.error("Pinterest download error:", error);
    return false;
  }
}

// Main auto downloader module with enhanced reactions
Module({
  on: "text",
  fromMe: isPrivateBot
}, async (message) => {
  try {
    const text = message.message;
    
    // Skip if contains ignore keywords
    if (text.toLowerCase().includes("sta h") || 
        text.toLowerCase().includes("staht") ||
        text.includes("gist") ||
        text.includes("youtu") ||
        text.startsWith("ll")) {
      return;
    }
    
    // URL patterns - Removed TikTok regex
    const instagramRegex = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:p|reel|share\/(?:p|reel)|tv)\/[^?\s]+(?:\?[^\s]*)?/gi;
    const facebookRegex = /(?:https?:\/\/)?(?:www\.)?(?:facebook\.com|fb\.watch)\/[^\s]+/gi;
    const pinterestRegex = /(?:https?:\/\/)?(?:(?:www\.)?pinterest\.com\/pin\/|pin\.it\/)[^\s]+/gi;
    
    const instagramMatches = [...text.matchAll(instagramRegex)];
    const facebookMatches = [...text.matchAll(facebookRegex)];
    const pinterestMatches = [...text.matchAll(pinterestRegex)];
    
    // Get unique URLs only
    const instagramUrls = [...new Set(instagramMatches.map(match => match[0]))];
    const facebookUrls = [...new Set(facebookMatches.map(match => match[0]))];
    const pinterestUrls = [...new Set(pinterestMatches.map(match => match[0]))];
    
    const totalUrls = instagramUrls.length + facebookUrls.length + pinterestUrls.length;
    
    if (totalUrls === 0) {
      return;
    }
    
    console.log("=== AUTO DOWNLOADER TRIGGERED ===");
    console.log(`Found URLs - Instagram: ${instagramUrls.length}, Facebook: ${facebookUrls.length}, Pinterest: ${pinterestUrls.length}`);
    
    // Add processing reaction ⌛
    await addReaction(message, "⌛");
    
    let downloadSuccess = false;
    let errorMessages = [];
    
    try {
      // Process Instagram URLs
      for (const url of instagramUrls) {
        console.log(`Processing Instagram URL: ${url}`);
        const success = await downloadInstagram(message, url);
        if (success) {
          downloadSuccess = true;
        } else {
          errorMessages.push(`Instagram download failed for: ${url}`);
        }
      }
      
      // Process Facebook URLs
      for (const url of facebookUrls) {
        console.log(`Processing Facebook URL: ${url}`);
        const success = await downloadFacebook(message, url);
        if (success) {
          downloadSuccess = true;
        } else {
          errorMessages.push(`Facebook download failed for: ${url}`);
        }
      }
      
      // Process Pinterest URLs
      for (const url of pinterestUrls) {
        console.log(`Processing Pinterest URL: ${url}`);
        const success = await downloadPinterest(message, url);
        if (success) {
          downloadSuccess = true;
        } else {
          errorMessages.push(`Pinterest download failed for: ${url}`);
        }
      }
      
      // Set final reaction based on success/failure
      if (downloadSuccess) {
        await addReaction(message, "✅");
        console.log("=== AUTO DOWNLOADER SUCCESS ===");
      } else {
        await addReaction(message, "❌");
        console.log("=== AUTO DOWNLOADER FAILED ===");
        console.log("Error messages:", errorMessages);
      }
      
    } catch (error) {
      console.error("Auto download main error:", error);
      await addReaction(message, "❌");
    }
    
  } catch (error) {
    console.error("Auto downloader main error:", error);
    // Add error reaction if something goes wrong at the top level
    setTimeout(async () => {
      await addReaction(message, "❌");
    }, 1000);
  }
});