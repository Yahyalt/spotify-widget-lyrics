# Spotify Lyrics Overlay

A lightweight desktop widget that displays real-time lyrics for whatever's currently playing on Spotify, built with Tauri for a native, low-resource overlay experience on Windows.

## ✨ Features
- 🎵 Real-time lyrics synced to the currently playing Spotify track
- 🪟 Native Windows integration via System Media Transport Controls (SMTC) — no login, no OAuth, no API key required
- 🖥️ Lightweight overlay widget — built on Tauri, not Electron, for minimal resource usage (~3MB)
- [Add: draggable/always-on-top behavior

## 🛠️ Tech Stack
- **Frontend:** React 19, TypeScript, Vite
- **Desktop shell:** Tauri 2
- **Backend (Rust):** `reqwest` + `tokio` for async API calls, `serde`/`serde_json` for data handling
- **Windows integration:** `windows-rs` (Media Control / SMTC)

## 📥 Download (for users)
Pre-built releases are available on the [Releases page](https://github.com/Yahyalt/spotify-widget-lyrics/releases) — download the latest installer/binary and run it, no build steps required.

## 📦 Prerequisites
- [Node.js](https://nodejs.org/) (LTS recommended)
- [Rust](https://www.rust-lang.org/tools/install)
- [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS

## 🚀 Getting Started (for developers)
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

## 🐛 Known Issues
- **Lyric sync drifts over time.** Lyrics are fetched from [lrclib.net](https://lrclib.net) (same source the macOS version uses), but SMTC only exposes raw playback position with no lyric-timing awareness of its own, so the app has to sync LRC timestamps against SMTC's position independently. This can drift and occasionally cause a lyric to jump back to a previous line before correcting.
- Currently exploring ways to tighten the sync (e.g. adjusting polling interval, smoothing position reads) since the timing source itself (lrclib) isn't the bottleneck, the SMTC-to-lyric sync logic is.

## 📝 License
[Add your license, e.g. MIT]

## 🙏 Acknowledgments
- [nadialvy/spotify-lyrics-menubar](https://github.com/nadialvy/spotify-lyrics-menubar) — original inspiration for this project

> 🚧 **Work in Progress** — this project is still under active development. Features, structure, and setup steps may change.
