# Changelog

All notable changes to AsuTorrent are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] — 2026-08-09

### Added
- **10 new languages** with complete UI translations (388 strings each):
- **Watch Folder** — auto-add `.torrent` files dropped into a monitored folder (like qBittorrent)
- **Super-seeding** — initial-seed mode that sends each piece to a single peer for maximum distribution of the first copy
- **Old English** (`en-old`) and **New York** (`en-nyc`) fan locales — more pure English: Shakespearean "thou speak" and a Brooklyn accent, full 388-key translations
  - Italian (`it`)
  - Portuguese (`pt`)
  - Portuguese, Brazil (`pt-br`)
  - Indonesian (`id`)
  - Danish (`da`)
  - Swedish (`sv`)
  - Dutch (`nl`)
- The app now ships **25 locale files** — 19 real languages (incl. British English `en-gb`) plus the Pirate ☠️, Anime ✿, UwU 🐾, Caveman 🦴, Old English 🏰 and New York 🗽 fan locales
- **Localization tracker** (`TODO_LOCALES.md`): coverage of all **184 ISO 639-1 codes** + 3 locale variants (`en-gb`, `pt-br`, `zh-tw`), each with speaker estimates (L1+L2), priority tiers (🔥 ≥100M · ⭐ 10–99M · ○ <10M) and layout-difficulty groups (🟢 Simple LTR · 🟡 CJK/glyphs · 🟠 complex scripts · 🔴 RTL)

#### Changed
- Torrent health, `.torrent` preview dialog, clipboard monitor and torrent-table column headers/pickers fully routed through the `t()` i18n system in every language (68 new keys → **388 keys per locale**)
- Key parity between all locale files is enforced by an automated check

#### Notes
- RTL languages (Arabic, Hebrew, Yiddish, Persian, Urdu, Pashto, Sindhi, Uyghur, Kashmiri, Divehi) are tracked but require `dir="rtl"` mirroring of the UI before they can be enabled

## [1.0.0] — 2026-08-02

First public release — a modern, open-source BitTorrent client built with **Tauri 2** + **librqbit** + **Preact** (~10 MB binary, native desktop experience, full BitTorrent protocol support).

### Added

#### Torrent management
- Add torrents via magnet links, info-hash (40-hex / 32-base32 auto-detect), `.torrent` files and HTTP/FTP URLs
- Drag & drop `.torrent` / magnet links onto the window (with visual overlay)
- Context menu: pause, resume, delete, force re-check
- File priorities inside a torrent (tree view with checkboxes)
- Multi-select (Ctrl+click toggle, Shift+click range) and batch operations
- Delete confirmation — torrent only or with files
- Sequential download for instant streaming
- Force Resume / Force Start (exempt from queue limits)
- Global DL/UL speed limits with Normal and Turtle modes
- Re-check for integrity verification

#### Queue & scheduling
- Download queue (`max_active_downloads`, `max_active_seeds`)
- Time-based speed scheduler (days, hours, limits)
- Auto-management: ratio / seed-time limits, move completed torrents

#### Categories, tags & search
- Categories and tags with auto-assignment by name
- Global + per-category download paths
- Global search across names, tags, info-hash and trackers
- Portfolios — filterable saved views

#### RSS
- RSS reader: add feeds, browse releases
- RSS auto-download: regex filters, quality/size limits, category mapping

#### Integrations
- Web API — qBittorrent-compatible REST API (axum, `127.0.0.1:8080`) for Sonarr/Radarr/Lidarr
- Built-in Web UI at `http://localhost:8080`
- Torrent search: Nyaa.si, ThePirateBay, EZTV, YTS, LinuxTracker + Jackett
- System tray icon with activity indicator
- OS notifications (download complete, errors)
- Session persistence via librqbit — torrents restored on restart

#### Networking & security
- SOCKS5 proxy with connection test
- Network interface binding (VPN leak protection)
- uTP toggle (global and per-torrent)
- DHT / PEX / LPD per-torrent configuration
- Encryption modes: Forced / Enabled / Disabled
- IP blocklist via `blocklist_url`
- SSRF protection for magnet/URL handling
- Content Security Policy in Tauri

#### UI / UX
- Sortable columns: Name, Size, Progress, Speed, Peers, ETA
- Column customization: show/hide, drag to reorder
- Light and dark themes with green-tinted light variant
- Animations and micro-interactions
- Session statistics: totals, uptime, peer activity
- About dialog: version, dependencies, license
- Torrent history (downloaded/deleted with dates)
- Export/import of torrent lists (JSON/CSV)
- Create `.torrent` files from local folders/files
- Auto-update via GitHub releases
- Built-in streaming video player (HTTP Range requests — seek while downloading)
- Register AsuTorrent as default magnet handler

#### Dashboards & monitoring
- Peer map (geo distribution)
- Speed graphs (hour/day/week)
- Per-country P2P traffic
- Prometheus metrics (`/metrics`)

#### Infrastructure
- GitHub CI: `cargo check`, `tsc --noEmit`, linters
- Multi-platform builds: `.msi`, `.dmg`, `.deb`/`.rpm`/AppImage
- Code signing (macOS + Windows), auto-releases by tag
- Docker image for headless server/NAS deployment
- Unit tests: Rust + Preact (72 tests)
- Torrent state machine + ErrorBoundary + error logging
- Runtime JSON field validation (`build_clean_payload`)
