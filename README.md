# AsuTorrent

[![CI](https://github.com/Baconana-chan/asutorrent/actions/workflows/ci.yml/badge.svg)](https://github.com/Baconana-chan/asutorrent/actions/workflows/ci.yml)
[![Build](https://github.com/Baconana-chan/asutorrent/actions/workflows/build.yml/badge.svg)](https://github.com/Baconana-chan/asutorrent/actions/workflows/build.yml)
[![Release](https://github.com/Baconana-chan/asutorrent/actions/workflows/release.yml/badge.svg)](https://github.com/Baconana-chan/asutorrent/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tauri](https://img.shields.io/badge/Tauri-2-purple)](https://v2.tauri.app)
[![Rust](https://img.shields.io/badge/Rust-1.80+-orange)](https://www.rust-lang.org)
[![Preact](https://img.shields.io/badge/Preact-10.26-673ab8)](https://preactjs.com)

A modern, open-source BitTorrent client built with **Tauri 2** + **librqbit** + **Preact**.  
~10 MB binary, native desktop experience, full BitTorrent protocol support.

---

## Features

### ✅ Core (v1.0)
- **Torrent management**: Add magnets, .torrent files, HTTP/FTP links; pause/resume/delete with file options
- **Queue management**: Active download/seed limits, force-resume exemption, auto-management
- **Speed control**: Global DL/UL limits, turtle mode, time-based speed schedule
- **Categories & Tags**: Group torrents, auto-assign by name regex, per-category save paths
- **RSS Reader**: Add feeds, regex filters, auto-download matching releases
- **File priorities**: Tree view with checkboxes to include/exclude files within a torrent
- **Context menu**: Right-click for pause, resume, re-check, sequential download, encryption, DHT/PEX/LPD toggles
- **Search**: Filter torrents by name, tag, or info-hash
- **Export/Import**: Save and restore torrent lists in JSON or CSV format

### ✨ Polish
- **25 languages**: EN, EN-GB, RU, DE, DA, FR, IT, ES, ID, PL, PT, PT-BR, SV, NL, UK, ZH, ZH-TW, JA, KO, Pirate ☠️, Anime ✿, UwU 🐾, Caveman 🦴, Old English 🏰, New York 🗽
- **Light/Dark theme**: Green-tinted light theme matching the dark aesthetic
- **Column customization**: Show/hide and drag-to-reorder columns
- **Video player**: Built-in streaming player with HTTP Range support (seek while downloading)
- **Sequential download**: Download pieces in order for instant streaming
- **Session statistics**: Total downloaded/uploaded, uptime, peer activity
- **Torrent history**: Record of completed and deleted torrents with dates
- **About dialog**: Version info, dependency list, license

### 🌐 Network & Security
- **SOCKS5 proxy**: Configure + test connection (librqbit applies per-session)
- **Network interface binding**: Store preference for VPN leak prevention
- **uTP**: Global and per-torrent uTP toggle
- **DHT / PEX / LPD**: Global and per-torrent enable/disable
- **Encryption**: Forced/Enabled/Disabled per-torrent (Azureus-style)
- **IP blocklist**: Block known bad peers via blocklist URL
- **SSRF protection**: URL validation prevents internal network attacks
- **Content Security Policy**: Explicit CSP in Tauri webview

### 📊 Monitoring
- **Web API**: qBittorrent-compatible REST API on `http://127.0.0.1:8080` (Sonarr/Radarr integration)
- **Web UI**: Built-in web interface at `http://localhost:8080`
- **Prometheus metrics**: `/metrics` endpoint for Grafana dashboards
- **Speed graphs**: Download/upload charts for hour/day/week
- **Peer map**: Geo-distribution of connected peers
- **Country traffic**: Per-country peer statistics

### 🛠 Infrastructure
- **Auto-update**: Checks GitHub releases for new versions
- **CI/CD**: GitHub Actions for PR checks, multi-platform builds, auto-releases
- **Docker**: Dockerfile for headless NAS/server deployment
- **72 unit tests**: 14 Rust + 58 frontend (vitest + testing-library)

---

## Quick Start

### Prerequisites

- **Rust** 1.80+ (`rustup install stable`)
- **Node.js** 18+ (LTS recommended)
- **Platform-specific**:
  - **Linux**: `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `libssl-dev`, `pkg-config`
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Windows**: No additional tools needed

### Development

```bash
cd asutorrent
npm install          # Install frontend dependencies
npm run tauri dev    # Run in dev mode (hot-reload UI + Tauri window)
```

### Build for Production

```bash
cd asutorrent
npm run tauri build  # Creates installer in src-tauri/target/release/bundle/
```

### Headless CLI Mode (Server/NAS)

Run without a GUI window — only the Web API (port 8080) + BitTorrent engine:

```bash
cd asutorrent/src-tauri
cargo run -- --headless
```

```bash
# Add torrents via CLI args:
cargo run -- --headless "magnet:?xt=urn:btih:..."
```

```bash
# Docker (requres X11 for GUI — headless mode WIP):
docker build -f docker/Dockerfile -t asutorrent:latest .
```

> **Note**: The `--headless` flag starts the engine and Web API server. For full headless deployment on NAS/seedbox, ensure the Web API (port 8080) and Bittorrent port (6881) are accessible.

---

## Usage

### Adding Torrents

1. **Magnet link**: Paste a magnet URL into the input field and press Enter
2. **Torrent file**: Click the folder icon to browse for `.torrent` files
3. **Drag & drop**: Drop `.torrent` files or magnet URLs directly onto the window
4. **Info-hash**: Paste a 40-char hex or 32-char base32 hash — auto-detected
5. **HTTP/FTP**: Direct download of files via URL (like Transmission)

### Windows/macOS Default Client

On first launch, AsuTorrent offers to register as the default handler for `magnet:` links and `.torrent` files. You can always re-register from the settings.

### Keyboard Shortcuts

- `Ctrl+A` — Select all torrents
- `Delete` — Delete selected torrent (asks for confirmation)
- `Ctrl+F` — Focus search bar

---

## Web API (qBittorrent Compatible)

AsuTorrent exposes a REST API on `http://127.0.0.1:8080` compatible with Sonarr/Radarr/Lidarr:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v2/auth/login` | POST | Authenticate (default: admin / adminadmin) |
| `/api/v2/torrents/info` | GET | List torrents (supports `filter`, `category`, `tag`) |
| `/api/v2/torrents/add` | POST | Add torrent by magnet URL or hash |
| `/api/v2/torrents/pause` | POST | Pause torrents |
| `/api/v2/torrents/resume` | POST | Resume torrents |
| `/api/v2/torrents/delete` | POST | Delete torrents (with or without files) |
| `/api/v2/torrents/files` | GET | List files in a torrent |
| `/api/v2/torrents/properties` | GET | Get torrent properties |
| `/api/v2/torrents/setCategory` | POST | Assign category to torrents |
| `/api/v2/app/getPreferences` | GET | Get app preferences |
| `/api/v2/app/setPreferences` | POST | Set app preferences |

### Sonarr/Radarr Integration

Configure your *arr application to use:
- **Host**: `http://127.0.0.1:8080`
- **Username**: `admin`
- **Password**: `adminadmin`
- **Category**: Your configured category name (maps to torrent tags)

---

## Docker

```bash
# Build
docker build -f docker/Dockerfile -t asutorrent:latest .

# Run (GUI mode — requires X11)
docker run --rm -it \
  -e DISPLAY=$DISPLAY \
  -v /tmp/.X11-unix:/tmp/.X11-unix \
  -v /path/to/data:/data \
  asutorrent:latest

# Ports
# 8080 — Web API
# 6881 — BitTorrent TCP
```

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│                 Preact UI (Signals)               │
├──────────────────────────────────────────────────┤
│              Tauri IPC (invoke / listen)          │
├──────────────────────────────────────────────────┤
│  commands.rs  ←  torrent_mgr.rs  ←  librqbit    │
│  (handlers)       (engine wrapper)   (session)   │
├──────────────────────────────────────────────────┤
│  web_api.rs — HTTP API (axum, port 8080)         │
│  Background loops: stats, schedule, RSS, auto-mgmt│
└──────────────────────────────────────────────────┘
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed documentation.

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Desktop Framework | [Tauri 2](https://v2.tauri.app) |
| Torrent Engine | [librqbit](https://github.com/ikatson/rqbit) |
| Frontend | [Preact](https://preactjs.com) + Signals + testing-library |
| HTTP API | [Axum](https://github.com/tokio-rs/axum) 0.7 |
| Async Runtime | [Tokio](https://tokio.rs) |
| CSS | Custom (dark + light themes) |
| Tests | Rust: cargo test — Frontend: vitest |
| CI/CD | GitHub Actions (4 platforms, auto-release) |

---

## Build Matrix

| Platform | Architecture | Format |
|----------|-------------|--------|
| Linux (x86_64) | `x86_64-unknown-linux-gnu` | .deb, .AppImage, .rpm |
| Linux (ARM64) | `aarch64-unknown-linux-gnu` | .deb, .AppImage |
| macOS (Intel) | `x86_64-apple-darwin` | .dmg |
| macOS (Apple Silicon) | `aarch64-apple-darwin` | .dmg |
| Windows | `x86_64-pc-windows-msvc` | .msi |

---

## License

MIT — see [LICENSE](./LICENSE) for details.

---

## Acknowledgments

- [ikatson/rqbit](https://github.com/ikatson/rqbit) — The excellent librqbit library
- [Tauri](https://v2.tauri.app) — Desktop framework that makes this possible
- [Preact](https://preactjs.com) — Lightweight React alternative
- All [contributors](https://github.com/Baconana-chan/asutorrent/graphs/contributors)
