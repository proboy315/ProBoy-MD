const path = require("path");
const fs = require("fs");
if (fs.existsSync("./config.env")) {
  require("dotenv").config({ path: "./config.env" });
}

const { suppressLibsignalLogs } = require("./core/helpers");

suppressLibsignalLogs();

const { initializeDatabase } = require("./core/database");
const { BotManager } = require("./core/manager");
const config = require("./config");
const { SESSION, logger } = config;
const http = require("http");

async function main() {
  if (!fs.existsSync("./temp")) {
    fs.mkdirSync("./temp", { recursive: true });
    console.log("Created temporary directory at ./temp");
    logger.info("Created temporary directory at ./temp");
  }
  console.log(`ProBoy v${require("./package.json").version}`);
  console.log(`- Configured sessions: ${SESSION.join(", ")}`);
  logger.info(`Configured sessions: ${SESSION.join(", ")}`);
  if (SESSION.length === 0) {
    const warnMsg =
      "⚠️ No sessions configured. Please set SESSION environment variable.";
    console.warn(warnMsg);
    logger.warn(warnMsg);
    return;
  }

  try {
    await initializeDatabase();
    console.log("- Database initialized");
    logger.info("Database initialized successfully.");
  } catch (dbError) {
    console.error(
      "🚫 Failed to initialize database or load configuration. Bot cannot start.",
      dbError
    );
    logger.fatal(
      "🚫 Failed to initialize database or load configuration. Bot cannot start.",
      dbError
    );
    process.exit(1);
  }

  const botManager = new BotManager();

  const shutdownHandler = async (signal) => {
    console.log(`\nReceived ${signal}, shutting down...`);
    logger.info(`Received ${signal}, shutting down...`);
    await botManager.shutdown();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdownHandler("SIGINT"));
  process.on("SIGTERM", () => shutdownHandler("SIGTERM"));

  await botManager.initializeBots();
  console.log("- Bot initialization complete.");
  logger.info("Bot initialization complete");
  const PORT = process.env.PORT || 3000;

  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("OK");
    } else {
      // HTML response with embedded ProBoy Vercel app
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ProBoy Bot Dashboard</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            font-family: Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 10px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            overflow: hidden;
        }
        .header {
            background: #2c3e50;
            color: white;
            padding: 20px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 2.5em;
        }
        .header p {
            margin: 5px 0 0 0;
            opacity: 0.8;
        }
        .content {
            padding: 20px;
            text-align: center;
        }
        .iframe-container {
            border: 2px solid #ddd;
            border-radius: 8px;
            overflow: hidden;
            margin: 20px 0;
        }
        iframe {
            width: 100%;
            height: 600px;
            border: none;
        }
        .status {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 5px;
            margin: 20px 0;
        }
        .footer {
            text-align: center;
            padding: 20px;
            background: #ecf0f1;
            color: #7f8c8d;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 ProBoy Bot</h1>
            <p>Version ${require("./package.json").version} | Running on port ${PORT}</p>
        </div>
        <div class="content">
            <div class="status">
                <h3>✅ Bot Status: Running</h3>
                <p>Configured sessions: ${SESSION.join(", ")}</p>
            </div>
            
            <h3>ProBoy Web Dashboard</h3>
            <div class="iframe-container">
                <iframe 
                    src="https://proboy.vercel.app" 
                    title="ProBoy Dashboard"
                    allow="camera; microphone; fullscreen"
                    loading="lazy">
                </iframe>
            </div>
            
            <p>The ProBoy web dashboard is embedded above. If you cannot see the content, 
            <a href="https://proboy.vercel.app" target="_blank">click here to open it in a new tab</a>.</p>
        </div>
        <div class="footer">
            <p>ProBoy Bot &copy; ${new Date().getFullYear()} | All rights reserved</p>
        </div>
    </div>
</body>
</html>
      `);
    }
  });

  server.listen(PORT, () => {
    console.log(`🌐 Server running on http://localhost:${PORT}`);
    console.log(`📊 ProBoy Vercel app embedded at: https://proboy.vercel.app`);
    logger.info(`Web server listening on port ${PORT}`);
    logger.info(`ProBoy Vercel app embedded in the dashboard`);
  });
}

/**
 * Validates critical configuration values after loading from database
 */

if (require.main === module) {
  main().catch((error) => {
    console.error(`Fatal error in main execution: ${error.message}`, error);
    logger.fatal({ err: error }, `Fatal error in main execution`);
    process.exit(1);
  });
}