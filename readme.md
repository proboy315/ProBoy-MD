# ProBoy-MD

## Get Started

#### 1. Get Your Session String 

<p align="center">
  <a href="https://proboy.ct.ws/ProBoy-MD">
    <img src="https://i.ibb.co/fVWcycPc/get-session.png" alt="Get Session" width="200"/>
  </a>
</p>

#### 2. Copy Setup Script  




## Features

* Lightweight and fast performance
* Single and multi-session capabilities
* Extensive plugin system
* Group management tools
* Media download functionality
* Excellent caching and session management

## Prerequisites

* Node.js (version 20 or higher)
* Git
* FFmpeg
* Yarn package manager
* PM2 (for process management)
* Database URL (postgreSQL - for cloud deployments)

## Installation

### Clone Repository

```bash
npm install -g yarn pm2
git clone https://github.com/proboy315/ProBoy-MD.git
cd raganork-md
````

### Install Dependencies

```bash
yarn install
```

### Configuration

Create a `.env` file in the root directory:

#### Session Configuration

Single session:

```
SESSION=RGNK~d7a5s66
```

Multi-session:

```
SESSION=RGNK~d7a5s66,RGNK~7ad8cW
```

#### Required Variables

```
# Database (Required for cloud platforms)
DATABASE_URL=your_database_url

# Localization
LANGUAGE=en
TZ=Asia/Kolkata
```

## Running the Bot

```bash
npm start
```

## Process Management

```bash
# Stop bot
pm2 stop ProBoy-MD

# Restart bot
pm2 restart ProBoy-MD
```

## Commands

Default prefix: `.`

* `.list` – Show available commands
* `.ping` – Check response time
* `.restart` – Restart bot (sudo only)
* `.shutdown` – Stop bot (sudo only)

## File Structure

```
ProBoy-MD/
├── plugins/     # Bot plugins
├── core/        # Core libraries
├── output/      # Operational outputs
├── temp/        # Temporary files
├── config.js    # Configuration handler
├── index.js     # Main entry point
└── package.json # Dependencies
```


## Legal Notice

⚠️ **Use at your own risk.** This bot uses unofficial WhatsApp Web API methods and may result in temporary or permanent account bans.

* This code is in no way affiliated, authorized, maintained, sponsored or endorsed by WhatsApp or any of its affiliates.
* WhatsApp is a trademark of WhatsApp Inc., registered in the U.S. and other countries.
* This software is provided for educational and research purposes only
* Powered by [Baileys](https://github.com/WhiskeySockets/Baileys)

## License

GPL License - See LICENSE file for details.

---

**Note:** Some files are obfuscated for security reasons and should not be modified.


