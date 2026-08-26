# Spotify Lyrics Overlay

A lightweight desktop widget that displays real-time lyrics for whatever's currently playing on Spotify, built with Tauri for a native, low-resource overlay experience on Windows.

This project was inspired by [nadialvy (Nadia Lovely)](https://github.com/nadialvy/spotify-lyrics-menubar).

## ✨ Features

- 🎵 Real-time lyrics synced to the currently playing Spotify track
- 🪟 Native Windows integration via System Media Transport Controls (SMTC)
- 🖥️ Lightweight overlay widget — built on Tauri, not Electron, for minimal resource usage
- [Add: draggable/always-on-top behavior, theming, etc. — whatever's actually implemented]

## 🛠️ Tech Stack

- **Frontend:** React 19, TypeScript, Vite
- **Desktop shell:** Tauri 2
- **Backend (Rust):** `reqwest` + `tokio` for async API calls, `serde`/`serde_json` for data handling
- **Windows integration:** `windows-rs` (Media Control / SMTC)

## 📦 Prerequisites

- [Node.js](https://nodejs.org/) (LTS recommended)
- [Rust](https://www.rust-lang.org/tools/install)
- [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS

## 🚀 Getting Started

```bash
# Clone the repo
git clone https://github.com/Yahyalt/spotify-widget-lyrics.git
cd spotify-widget-lyrics

# Install dependencies
npm install

# Run in development mode
npm run tauri dev
```

## 📦 Build

```bash
npm run tauri build
```

## ⚙️ Configuration

[Add: any required Spotify API credentials/env vars, e.g. Client ID/Secret setup steps, if the app needs them to fetch lyrics/track data]

## 📝 License

[Add your license, e.g. MIT]

## 🙏 Acknowledgments

- [nadialvy/spotify-lyrics-menubar](https://github.com/nadialvy/spotify-lyrics-menubar) — original inspiration for this project
> 🚧 **Work in Progress** — this project is still under active development. Features, structure, and setup steps may change. 
