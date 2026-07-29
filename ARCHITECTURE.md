# AsuTorrent Architecture

## Overview

```
┌──────────────────────────────────────────────────┐
│                  Preact UI                        │
│  (TorrentList, TorrentItem, AddTorrent, StatusBar)│
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │         @tauri-apps/api (IPC Layer)          │  │
│  │   invoke() → commands  |  listen() ← events  │  │
│  └──────────────┬───────────────────────────────┘  │
└─────────────────┬──────────────────────────────────┘
                  │ Tauri IPC (JSON)
┌─────────────────▼──────────────────────────────────┐
│              Rust Backend (Tauri)                   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │           commands.rs (IPC Handlers)        │   │
│  │  add_magnet | pause | resume | delete | stats │   │
│  └──────────────────────┬──────────────────────┘   │
│                         │                           │
│  ┌──────────────────────▼──────────────────────┐   │
│  │          torrent_mgr.rs (Engine Wrapper)    │   │
│  │                                              │   │
│  │  ┌──────────────────────────────────────┐   │   │
│  │  │       librqbit::Session              │   │   │
│  │  │  (DHT, PEX, uTP, UPnP, IPv6, etc.)  │   │   │
│  │  └──────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │      Background: stats_emitter_loop         │   │
│  │   → emits "torrent-stats" event every 1s   │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

## Key Design Decisions

### 1. Tauri Commands (Request/Response)
For user actions that need a result:
- `add_magnet(url)` → returns torrent ID
- `pause_torrent(id)` → pauses download
- `resume_torrent(id)` → resumes download
- `delete_torrent(id, delete_files)` → removes torrent
- `get_stats()` → returns full snapshot

### 2. Tauri Events (Real-time push)
For continuous state updates:
- `torrent-stats` event fires every 1 second
- Contains: per-torrent progress/speed + global stats
- Frontend subscribes with `listen("torrent-stats", ...)`
- No polling overhead, no request latency

### 3. State Management (Rust side)
- `TorrentManager` wraps `Arc<Session>` in `Arc<Mutex<T>>`
- Shared safely across all Tauri command handlers
- Background emitter loop reads stats without blocking commands

### 4. State Management (Frontend)
- Preact Signals for reactive state
- `useTorrents()` hook subscribes to events on mount
- Components consume `stats.value` — automatically re-render

## Data Flow

```
User pastes magnet → UI calls invoke("add_magnet", { url })
                  → Rust adds to librqbit session
                  → Returns torrent ID to UI
                  
librqbit downloads → Background emitter polls stats
                  → Emits "torrent-stats" every 1s
                  → Preact updates all components reactively
```

## File Structure

```
src-tauri/src/
├── main.rs           # Windows subsystem + entry point
├── lib.rs            # Tauri setup, command registration, event loop
├── commands.rs       # IPC command handlers
├── torrent_mgr.rs    # librqbit session wrapper
└── types.rs          # Serializable types (TorrentInfo, SessionStats)

src/
├── main.tsx          # Preact bootstrap
├── app.tsx           # Root component
├── styles.css        # All styling (dark theme)
├── hooks/
│   └── useTorrents.ts    # Event subscription + signal
└── components/
    ├── TorrentList.tsx   # Filterable list with tabs + search
    ├── TorrentItem.tsx   # Single torrent row with progress
    ├── AddTorrent.tsx    # Magnet input + file picker
    └── StatusBar.tsx     # Global speed + count display
```

## Roadmap

See the full project roadmap in [TODO.md](./TODO.md), which tracks:

- 🚨 **MVP Critical** — bugs to fix before anything else
- 🎯 **Must-Have v1.0** — parity with qBitTorrent/Transmission
- ✨ **Nice-to-Have** — polish and quality-of-life
- 💎 **Killer Features** — differentiators from every other client
- 🛠 **Technical Debt & Infrastructure** — CI/CD, tests, security
