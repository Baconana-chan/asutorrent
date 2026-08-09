mod commands;
mod config;
mod state_machine;
mod torrent_mgr;
mod trackers;
mod types;
mod web_api;

use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager, WindowEvent};

use tauri_plugin_notification::NotificationExt;

use serde_json::Value;
use torrent_mgr::{ManagerHandle, TorrentManager};

use librqbit::api::ApiTorrentListOpts;

/// Type alias for the JoinHandle returned by tauri::async_runtime::spawn.
pub(crate) type JoinHandle = tauri::async_runtime::JoinHandle<()>;

/// Tray menu plus handles to its two dynamic status lines.
type TrayMenuParts = (
    tauri::menu::Menu<tauri::Wry>,
    tauri::menu::MenuItem<tauri::Wry>,
    tauri::menu::MenuItem<tauri::Wry>,
);

const ICON_32_PNG: &[u8] = include_bytes!("../icons/32x32.png");
const ICON_128_PNG: &[u8] = include_bytes!("../icons/128x128.png");

pub(crate) fn build_clean_payload(mgr: &TorrentManager) -> Value {
    let list = mgr.api.api_torrent_list_ext(ApiTorrentListOpts { with_stats: true });
    let session_stats = mgr.api.api_session_stats();
    let list_val = serde_json::to_value(&list).unwrap_or_default();
    let stats_val = serde_json::to_value(&session_stats).unwrap_or_default();
    let raw_torrents: Vec<Value> = list_val["torrents"].as_array().cloned().unwrap_or_default();

    // Make sure every torrent has an "added at" timestamp recorded before we
    // build the health payload. Idempotent and batched (config mutex taken
    // once); also covers torrents restored from persistence.
    let hashes: Vec<&str> = raw_torrents
        .iter()
        .map(|t| t["info_hash"].as_str().unwrap_or(""))
        .collect();
    mgr.ensure_added_at_batch(&hashes);
    let added_at = mgr.added_at_map();
    let seed_sources = mgr.seed_sources_snapshot();
    let flags = TorrentFlags {
        forced: mgr.forced_snapshot(),
        sequential: mgr.sequential_snapshot(),
        super_seed: mgr.super_seed_snapshot(),
    };

    let mut active_downloads: u64 = 0;
    let mut active_seeds: u64 = 0;
    let mut total_downloaded: u64 = 0;
    let mut total_uploaded: u64 = 0;
    let mut total_peers: u64 = 0;
    let torrents: Vec<Value> = raw_torrents
        .iter()
        .map(|t| {
            let mapped = map_torrent(
                t,
                &flags,
                &added_at,
                &seed_sources,
                &mut active_downloads,
                &mut active_seeds,
            );
            // Accumulate session totals
            if let Some(stats) = t.get("stats") {
                total_downloaded += stats["progress_bytes"].as_u64().unwrap_or(0);
                total_uploaded += stats["uploaded_bytes"].as_u64().unwrap_or(0);
            }
            let live = t.get("stats").and_then(|s| s.get("live"));
            if let Some(l) = live {
                if let Some(snap) = l
                    .get("snapshot")
                    .and_then(|s| s.get("peer_stats"))
                    .and_then(|p| p.get("live"))
                {
                    total_peers += snap.as_u64().unwrap_or(0);
                }
            }
            mapped
        })
        .collect();
    let dl_speed_bytes = stats_val["download_speed"]["mbps"]
        .as_f64()
        .map(|mbps| (mbps * 1_048_576.0) as u64)
        .unwrap_or(0);
    let ul_speed_bytes = stats_val["upload_speed"]["mbps"]
        .as_f64()
        .map(|mbps| (mbps * 1_048_576.0) as u64)
        .unwrap_or(0);

    // Compute uptime in seconds
    let uptime_secs = std::time::SystemTime::now()
        .duration_since(mgr.session_start)
        .ok()
        .map(|d| d.as_secs())
        .unwrap_or(0);

    serde_json::json!({
        "torrents": torrents,
        "stats": {
            "active_downloads": active_downloads,
            "active_seeds": active_seeds,
            "download_speed": dl_speed_bytes,
            "upload_speed": ul_speed_bytes,
            "total_downloaded": total_downloaded,
            "total_uploaded": total_uploaded,
            "uptime_secs": uptime_secs,
            "total_peers": total_peers,
        }
    })
}

/// Rough health estimate for a torrent based on the swarm signals we have:
/// estimated seed sources, live peers, whether we already hold the data, and
/// the torrent's age. librqbit does not expose per-peer piece completion, so
/// `seeds` is a lower bound (peers who demonstrably fed us data) and
/// `availability` is a soft estimate in 0..1.
fn compute_health(seeds: u64, peers: u64, finished: bool, age_secs: u64) -> Value {
    let (score, label): (u64, &str) = if finished {
        // We hold the full data; health reflects reseed value of the swarm.
        if seeds >= 3 {
            (85, "excellent")
        } else if seeds >= 1 {
            (70, "good")
        } else if peers >= 1 {
            (55, "medium")
        } else {
            (40, "low")
        }
    } else if seeds >= 10 {
        (95, "excellent")
    } else if seeds >= 5 {
        (85, "excellent")
    } else if seeds >= 2 {
        (70, "good")
    } else if seeds == 1 {
        (55, "medium")
    } else if peers >= 5 {
        (50, "medium")
    } else if peers >= 1 {
        (35, "low")
    } else {
        // No sources at all — a very old torrent here is likely dead.
        if age_secs > 86400 * 30 {
            (5, "dead")
        } else {
            (15, "dead")
        }
    };
    let availability = if finished {
        1.0
    } else {
        (seeds as f64 / 5.0).min(1.0)
    };
    serde_json::json!({
        "score": score,
        "label": label,
        "seeds": seeds,
        "peers": peers,
        "age_secs": age_secs,
        "availability": availability,
    })
}

/// Per-torrent flag sets (forced / sequential / super-seed) looked up by id.
struct TorrentFlags {
    forced: HashSet<u32>,
    sequential: HashSet<u32>,
    super_seed: HashSet<u32>,
}

fn map_torrent(
    t: &Value,
    flags: &TorrentFlags,
    added_at: &HashMap<String, u64>,
    seed_sources: &HashMap<u32, u32>,
    active_downloads: &mut u64,
    active_seeds: &mut u64,
) -> Value {
    let stats = t.get("stats");
    let raw_state = stats.and_then(|s| s["state"].as_str()).unwrap_or("unknown");
    let finished = stats.and_then(|s| s["finished"].as_bool()).unwrap_or(false);
    let state = match raw_state {
        "live" if finished => "seeding",
        "live" => "downloading",
        "paused" => "paused",
        "error" => "error",
        _ => "metadata",
    };
    match state {
        "downloading" => *active_downloads += 1,
        "seeding" => *active_seeds += 1,
        _ => {}
    }
    let live_val = stats.and_then(|s| s.get("live"));
    let dl_speed: u64 = live_val
        .and_then(|l| l["download_speed"]["mbps"].as_f64())
        .map(|mbps| (mbps * 1_048_576.0) as u64)
        .unwrap_or(0);
    let ul_speed: u64 = live_val
        .and_then(|l| l["upload_speed"]["mbps"].as_f64())
        .map(|mbps| (mbps * 1_048_576.0) as u64)
        .unwrap_or(0);
    let time_remaining = live_val.and_then(|l| l["time_remaining"]["duration"].as_object().map(|dur| serde_json::json!({"secs": dur["secs"].as_u64().unwrap_or(0), "nanos": dur["nanos"].as_u64().unwrap_or(0)})));
    let peers: u64 = live_val
        .and_then(|l| l["snapshot"]["peer_stats"]["live"].as_u64())
        .unwrap_or(0);
    let id = t["id"].as_u64().unwrap_or(0) as u32;
    let forced = flags.forced.contains(&id);
    let sequential = flags.sequential.contains(&id);
    let super_seed = flags.super_seed.contains(&id);
    let info_hash = t["info_hash"].as_str().unwrap_or("");
    let added_ts = added_at.get(info_hash).copied().unwrap_or(0);
    let seeds = seed_sources.get(&id).copied().unwrap_or(0) as u64;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let age_secs = if added_ts > 0 { now.saturating_sub(added_ts) } else { 0 };
    let health = compute_health(seeds, peers, finished, age_secs);
    serde_json::json!({
        "id": t["id"], "name": t["name"], "info_hash": t["info_hash"], "forced": forced, "sequential": sequential, "super_seed": super_seed,
        "health": health,
        "stats": {
            "state": state,
            "total_bytes": stats.and_then(|s| s["total_bytes"].as_u64()).unwrap_or(0),
            "progress_bytes": stats.and_then(|s| s["progress_bytes"].as_u64()).unwrap_or(0),
            "uploaded_bytes": stats.and_then(|s| s["uploaded_bytes"].as_u64()).unwrap_or(0),
            "finished": finished,
            "error": stats.and_then(|s| s["error"].as_str().map(String::from)),
            "peers": peers, "seeds": seeds,
            "live": if live_val.is_some() { Some(serde_json::json!({"download_speed": dl_speed, "upload_speed": ul_speed, "time_remaining": time_remaining})) } else { None },
        }
    })
}

type NotificationTracker = Arc<std::sync::Mutex<HashMap<u32, (bool, bool)>>>;

fn send_notification(app: &tauri::AppHandle, title: &str, body: &str) {
    if let Err(e) = app.notification().builder().title(title).body(body).show() {
        log::warn!("Failed to send notification: {}", e);
    }
}

/// Load and cache tray icon images once by decoding PNG → RGBA → Tauri Image
fn load_tray_images() -> (tauri::image::Image<'static>, tauri::image::Image<'static>) {
    let decode = |bytes: &[u8]| -> tauri::image::Image<'static> {
        let img = image::load_from_memory(bytes).expect("Failed to decode tray icon PNG");
        let rgba = img.into_rgba8();
        let (w, h) = rgba.dimensions();
        let raw: &'static [u8] = Box::leak(rgba.into_raw().into_boxed_slice());
        tauri::image::Image::new(raw, w, h)
    };
    (decode(ICON_32_PNG), decode(ICON_128_PNG))
}

async fn stats_emitter_loop(
    app_handle: tauri::AppHandle,
    mgr: Arc<TorrentManager>,
    tracker: NotificationTracker,
    idle_icon: tauri::image::Image<'static>,
    active_icon: tauri::image::Image<'static>,
    status_line: tauri::menu::MenuItem<tauri::Wry>,
    speed_line: tauri::menu::MenuItem<tauri::Wry>,
) {
    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(1));
    let mut first_tick = true;
    let mut last_status_text = String::new();
    let mut last_speed_text = String::new();
    loop {
        interval.tick().await;
        let mut payload = build_clean_payload(&mgr);

        // Inject HTTP/FTP downloads as synthetic torrent entries
        let http_torrents = mgr.http_downloads_as_torrents();
        if !http_torrents.is_empty() {
            if let Some(torrents) = payload["torrents"].as_array_mut() {
                for t in http_torrents {
                    torrents.push(t);
                }
            }
        }

        // Check for completion/error transitions for notifications
        if let Some(torrents) = payload["torrents"].as_array() {
            let mut tracker_lock = tracker.lock().unwrap();
            for t in torrents {
                let id = t["id"].as_u64().unwrap_or(0) as u32;
                let name = t["name"].as_str().unwrap_or("Unknown");
                let error = t["stats"]["error"].as_str();
                let finished = t["stats"]["finished"].as_bool().unwrap_or(false);

                let (prev_finished, prev_error) =
                    tracker_lock.get(&id).copied().unwrap_or((false, false));

                if !first_tick {
                    // Transition: just completed downloading
                    if finished && !prev_finished {
                        send_notification(
                            &app_handle,
                            "Download Complete",
                            &format!("{} has finished downloading.", name),
                        );
                        // Record in history
                        let total = t["stats"]["total_bytes"].as_u64().unwrap_or(0);
                        let uploaded = t["stats"]["uploaded_bytes"].as_u64().unwrap_or(0);
                        let completed_at = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .map(|d| d.as_secs())
                            .unwrap_or(0);
                        mgr.record_completed(
                            name,
                            t["info_hash"].as_str().unwrap_or(""),
                            total,
                            uploaded,
                            None,
                            completed_at,
                        );
                    }
                    // Transition: newly in error state
                    if let Some(err) = error {
                        if !prev_error {
                            send_notification(
                                &app_handle,
                                "Download Error",
                                &format!("{} encountered an error: {}", name, err),
                            );
                        }
                    }
                }

                tracker_lock.insert(id, (finished, error.is_some()));
            }
        }
        first_tick = false;

        // Update torrent state machine for all active torrents
        if let Some(torrents) = payload["torrents"].as_array() {
            for t in torrents {
                let id = t["id"].as_u64().unwrap_or(0) as u32;
                let raw_state = t["stats"]["state"].as_str().unwrap_or("unknown");
                let finished = t["stats"]["finished"].as_bool().unwrap_or(false);
                let new_state =
                    crate::state_machine::TorrentState::from_librqbit(raw_state, finished);
                mgr.set_torrent_state(id, new_state).ok();
            }
        }

        // Record speed sample for history graphs
        let dl = payload["stats"]["download_speed"].as_u64().unwrap_or(0);
        let ul = payload["stats"]["upload_speed"].as_u64().unwrap_or(0);
        let active_dl = payload["stats"]["active_downloads"].as_u64().unwrap_or(0);
        let active_seed = payload["stats"]["active_seeds"].as_u64().unwrap_or(0);
        mgr.speed_history.lock().unwrap().record(dl, ul);
        let fmt_dl = if dl > 1_000_000 {
            format!("{:.1} MB/s", dl as f64 / 1_048_576.0)
        } else if dl > 1_000 {
            format!("{:.0} KB/s", dl as f64 / 1024.0)
        } else {
            format!("{} B/s", dl)
        };
        let fmt_ul = if ul > 1_000_000 {
            format!("{:.1} MB/s", ul as f64 / 1_048_576.0)
        } else if ul > 1_000 {
            format!("{:.0} KB/s", ul as f64 / 1024.0)
        } else {
            format!("{} B/s", ul)
        };
        if let Some(tray) = app_handle.tray_by_id("main") {
            // ── Tooltip with summary ──────────────────────────────
            let tooltip = format!(
                "AsuTorrent\n⬇ {}  {}  |  ⬆ {}  {}",
                active_dl, fmt_dl, active_seed, fmt_ul
            );
            let _ = tray.set_tooltip(Some(&tooltip));

            // Update tray icon based on activity
            let _ = tray.set_icon(if active_dl > 0 {
                Some(active_icon.clone())
            } else {
                Some(idle_icon.clone())
            });

            // ── Update tray menu status lines in place ─────────────
            let torrents = payload["torrents"].as_array().cloned().unwrap_or_default();

            // Count torrent states for summary
            let mut dl_count = 0u64;
            let mut seed_count = 0u64;
            for t in &torrents {
                match t["stats"]["state"].as_str().unwrap_or("") {
                    "downloading" => dl_count += 1,
                    "seeding" => seed_count += 1,
                    _ => {}
                }
            }

            // Update the status lines of the (fixed) tray menu. The menu is
            // never rebuilt here: repeatedly calling `set_menu` on Windows
            // churns HMENUs/subclasses and breaks the right-click menu.
            // `set_text` updates the existing items in place (SetMenuItemInfoW).
            let status_text = if dl_count + seed_count > 0 {
                format!("⬇ {} downloading  |  ⬆ {} seeding", dl_count, seed_count)
            } else {
                "No active torrents".to_string()
            };
            let speed_text = format!("DL {}  /  UL {}", fmt_dl, fmt_ul);
            // Only touch the items when the text actually changed, to avoid
            // dispatching a main-thread update (SetMenuItemInfoW) every tick.
            if status_text != last_status_text {
                let _ = status_line.set_text(status_text.clone());
                last_status_text = status_text;
            }
            if speed_text != last_speed_text {
                let _ = speed_line.set_text(speed_text.clone());
                last_speed_text = speed_text;
            }
        }

        let _ = app_handle.emit("torrent-stats", &payload);
    }
}

async fn schedule_check_loop(_app_handle: tauri::AppHandle, mgr: Arc<TorrentManager>) {
    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(60));
    loop {
        interval.tick().await;
        mgr.check_schedule();
        let limits = mgr.limits.lock().unwrap();
        let payload = serde_json::json!({
            "schedule_active": limits.schedule_active, "schedule_enabled": limits.schedule_enabled,
            "normal_download": limits.normal_download, "normal_upload": limits.normal_upload,
            "turtle_mode": limits.turtle_mode, "turtle_download": limits.turtle_download, "turtle_upload": limits.turtle_upload,
        });
        let _ = _app_handle.emit("speed-limits-updated", &payload);
    }
}

async fn auto_management_loop(mgr: Arc<TorrentManager>) {
    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(30));
    loop {
        interval.tick().await;
        mgr.auto_manage().await;
    }
}

/// Periodically refresh the per-torrent seed-source estimate used by the
/// health indicator. Iterates the (cheap, cached) peer stats snapshots.
async fn seed_source_loop(mgr: Arc<TorrentManager>) {
    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(30));
    loop {
        interval.tick().await;
        mgr.update_seed_sources();
    }
}

async fn watch_folder_loop(mgr: Arc<TorrentManager>) {
    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(5));
    loop {
        interval.tick().await;
        let added = mgr.scan_watch_folder().await;
        if added > 0 {
            log::info!("Watch folder: added {} torrent(s)", added);
        }
    }
}

/// Extract the first magnet link from arbitrary clipboard text. A trailing
/// period (sentence punctuation) is trimmed — display name only, never used
/// to build the add request.
fn extract_magnet(text: &str) -> Option<String> {
    let re = regex::Regex::new(r#"(?i)\bmagnet:[^\s<>"']+"#).ok()?;
    re.find(text)
        .map(|m| m.as_str().trim_end_matches('.').to_string())
}

/// Pull a human-readable display name from the magnet's `dn=` parameter.
fn magnet_display_name(url: &str) -> Option<String> {
    let body = url.strip_prefix("magnet:?").unwrap_or(url);
    let dn = body.split('&').find_map(|p| p.strip_prefix("dn="))?;
    // `+` encodes a space in query strings; `%XX` handled by urlencoding.
    let dn = dn.replace('+', " ");
    let decoded = urlencoding::decode(&dn).ok()?.into_owned();
    let cleaned: String = decoded.chars().filter(|c| !c.is_control()).take(200).collect();
    Some(cleaned)
}

/// Poll the clipboard for magnet links and notify the UI when a new one
/// appears. A prompt is emitted only when the clipboard *text* changes,
/// so the same link sitting in the clipboard is never re-offered.
async fn clipboard_monitor_loop(app_handle: tauri::AppHandle, mgr: Arc<TorrentManager>) {
    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(2));
    let mut last_text: Option<String> = None;
    loop {
        interval.tick().await;
        if !mgr.get_clipboard_monitor() {
            continue;
        }
        // arboard is blocking and not Send; read it on a blocking thread.
        let clip = tokio::task::spawn_blocking(|| {
            arboard::Clipboard::new()
                .ok()
                .and_then(|mut c| c.get_text().ok())
        })
        .await
        .unwrap_or(None);
        let Some(text) = clip else { continue };
        if last_text.as_deref() == Some(text.as_str()) {
            continue;
        }
        let Some(url) = extract_magnet(&text) else {
            last_text = Some(text);
            continue;
        };
        last_text = Some(text);
        let name = magnet_display_name(&url);
        log::info!("Clipboard magnet detected: {}", &url[..60.min(url.len())]);
        let _ = app_handle.emit(
            "clipboard-magnet",
            &serde_json::json!({ "url": url, "name": name }),
        );
    }
}

async fn rss_poll_loop(app_handle: tauri::AppHandle, mgr: Arc<TorrentManager>) {
    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(120));
    loop {
        interval.tick().await;
        let results = mgr.poll_rss_feeds().await;
        if !results.is_empty() {
            let mut map = serde_json::Map::new();
            for (feed_id, items) in results {
                map.insert(
                    feed_id.to_string(),
                    serde_json::to_value(items).unwrap_or_default(),
                );
            }
            let _ = app_handle.emit("rss-new-items", &Value::Object(map));
        }
    }
}

/// Build the tray menu with torrent activity status and quick actions.
///
/// The menu has a fixed structure and is built **once** at startup. The two
/// status lines are updated in place afterwards (see `stats_emitter_loop`);
/// rebuilding the menu repeatedly via `set_menu` churns HMENUs/subclasses on
/// Windows and makes the tray's right-click menu stop working.
///
/// Returns the menu plus handles to the two dynamic status lines.
fn build_tray_menu(
    app: &tauri::AppHandle,
    dl_count: u64,
    seed_count: u64,
    total_active: u64,
    fmt_dl: &str,
    fmt_ul: &str,
) -> Result<TrayMenuParts, tauri::Error> {
    use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem};

    let status_text = if total_active > 0 {
        format!("⬇ {} downloading  |  ⬆ {} seeding", dl_count, seed_count)
    } else {
        "No active torrents".to_string()
    };
    let status_line = MenuItemBuilder::with_id("status_line", status_text)
        .enabled(false)
        .build(app)?;
    let speed_line =
        MenuItemBuilder::with_id("speed_line", format!("DL {}  /  UL {}", fmt_dl, fmt_ul))
            .enabled(false)
            .build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&MenuItemBuilder::with_id("show_hide", "Show/Hide Window").build(app)?)
        .item(&PredefinedMenuItem::separator(app)?)
        .item(&status_line)
        .item(&speed_line)
        .item(&PredefinedMenuItem::separator(app)?)
        .item(&MenuItemBuilder::with_id("pause_all", "Pause All").build(app)?)
        .item(&MenuItemBuilder::with_id("resume_all", "Resume All").build(app)?)
        .item(&PredefinedMenuItem::separator(app)?)
        .item(&MenuItemBuilder::with_id("quit", "Quit").build(app)?)
        .build()?;

    Ok((menu, status_line, speed_line))
}

/// Run in headless mode (no Tauri window, only web API + scheduler loops).
pub fn run_headless() {
    env_logger::init();
    let rt = tokio::runtime::Runtime::new().expect("Failed to create Tokio runtime");

    rt.block_on(async {
        // ── Handle CLI args (magnet URLs / .torrent paths) ─────
        let cli_urls: Vec<String> = std::env::args()
            .skip(1)
            .filter(|a| {
                let lower = a.to_lowercase();
                // Skip the --headless flag itself
                !a.starts_with("-") && (a.starts_with("magnet:") || lower.ends_with(".torrent"))
            })
            .collect();

        match TorrentManager::new().await {
            Ok(mgr) => {
                let mgr = Arc::new(mgr);
                log::info!("AsuTorrent headless mode initialized");

                // Spawn background loops
                let m1 = mgr.clone();
                tokio::spawn(async move {
                    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(1));
                    let mut first_tick = true;
                    loop {
                        interval.tick().await;
                        let payload = build_clean_payload(&m1);
                        let dl = payload["stats"]["download_speed"].as_u64().unwrap_or(0);
                        let ul = payload["stats"]["upload_speed"].as_u64().unwrap_or(0);

                        // Record speed sample
                        m1.speed_history.lock().unwrap().record(dl, ul);

                        // Update torrent state machine for all active torrents
                        if let Some(torrents) = payload["torrents"].as_array() {
                            for t in torrents {
                                let id = t["id"].as_u64().unwrap_or(0) as u32;
                                let raw_state = t["stats"]["state"].as_str().unwrap_or("unknown");
                                let finished = t["stats"]["finished"].as_bool().unwrap_or(false);
                                let new_state = crate::state_machine::TorrentState::from_librqbit(
                                    raw_state, finished,
                                );
                                m1.set_torrent_state(id, new_state).ok();
                            }
                        }

                        // Track torrent completion on first observation after finished
                        if !first_tick {
                            if let Some(torrents) = payload["torrents"].as_array() {
                                for t in torrents {
                                    let name = t["name"].as_str().unwrap_or("Unknown");
                                    let finished =
                                        t["stats"]["finished"].as_bool().unwrap_or(false);
                                    if finished {
                                        let total = t["stats"]["total_bytes"].as_u64().unwrap_or(0);
                                        let uploaded =
                                            t["stats"]["uploaded_bytes"].as_u64().unwrap_or(0);
                                        let completed_at = std::time::SystemTime::now()
                                            .duration_since(std::time::UNIX_EPOCH)
                                            .map(|d| d.as_secs())
                                            .unwrap_or(0);
                                        m1.record_completed(
                                            name,
                                            t["info_hash"].as_str().unwrap_or(""),
                                            total,
                                            uploaded,
                                            None,
                                            completed_at,
                                        );
                                    }
                                }
                            }
                        }
                        first_tick = false;
                    }
                });

                let m2 = mgr.clone();
                tokio::spawn(async move {
                    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(60));
                    loop {
                        interval.tick().await;
                        m2.check_schedule();
                    }
                });

                let m3 = mgr.clone();
                tokio::spawn(async move {
                    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(120));
                    loop {
                        interval.tick().await;
                        m3.poll_rss_feeds().await;
                    }
                });

                let m4 = mgr.clone();
                tokio::spawn(async move {
                    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(30));
                    loop {
                        interval.tick().await;
                        m4.auto_manage().await;
                    }
                });

                let m5 = mgr.clone();
                tokio::spawn(async move {
                    watch_folder_loop(m5).await;
                });

                let m6 = mgr.clone();
                tokio::spawn(async move {
                    seed_source_loop(m6).await;
                });

                // Start Web API + UI server (same as GUI mode)
                web_api::start_server(mgr.clone());

                // Process any magnet URLs / .torrent files from CLI args
                if !cli_urls.is_empty() {
                    for url in cli_urls {
                        if url.starts_with("magnet:") {
                            match mgr.add_magnet(&url).await {
                                Ok(id) => log::info!(
                                    "Added magnet from CLI: {} (id={})",
                                    &url[..60.min(url.len())],
                                    id
                                ),
                                Err(e) => log::warn!(
                                    "Failed CLI magnet {}: {}",
                                    &url[..60.min(url.len())],
                                    e
                                ),
                            }
                        } else if std::path::Path::new(&url).exists() {
                            match mgr.add_torrent_file(&url).await {
                                Ok(id) => {
                                    log::info!("Added .torrent from CLI: {} (id={})", url, id)
                                }
                                Err(e) => log::warn!("Failed CLI torrent {}: {}", url, e),
                            }
                        }
                    }
                }

                // Keep the process alive indefinitely
                log::info!("AsuTorrent headless running. Press Ctrl+C to stop.");
                tokio::signal::ctrl_c()
                    .await
                    .expect("Failed to listen for Ctrl+C");
                log::info!("Shutting down...");
            }
            Err(e) => {
                let error_msg = format!("{:#}", e);
                log::error!(
                    "Failed to initialize TorrentManager in headless mode: {}",
                    error_msg
                );
                eprintln!("Error: {}", error_msg);
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // ── Load tray images once ────────────────────────────
            let (idle_icon, active_icon) = load_tray_images();

            // ── System tray with right-click menu ────────────────
            // Build the menu once at startup. It must not be rebuilt later
            // (set_menu churn breaks the Windows right-click menu); the status
            // lines are updated in place from the stats loop instead.
            let (tray_menu, status_line, speed_line) =
                build_tray_menu(app.handle(), 0, 0, 0, "0 B/s", "0 B/s")
                    .expect("Failed to build tray menu");

            let _tray = TrayIconBuilder::new()
                .icon(idle_icon.clone())
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .tooltip("AsuTorrent — starting…")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show_hide" => {
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                    "pause_all" => {
                        let handle = app.state::<Arc<ManagerHandle>>();
                        if let Ok(tm) = handle.get() {
                            let tm = tm.clone();
                            tauri::async_runtime::spawn(async move {
                                let _ = tm.pause_all().await;
                            });
                        }
                    }
                    "resume_all" => {
                        let handle = app.state::<Arc<ManagerHandle>>();
                        if let Ok(tm) = handle.get() {
                            let tm = tm.clone();
                            tauri::async_runtime::spawn(async move {
                                let _ = tm.resume_all().await;
                            });
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(true) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)
                .expect("Failed to build tray icon");

            // ── Intercept window close → hide to tray ─────────────
            if let Some(window) = app.get_webview_window("main") {
                let window_clone = window.clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        let _ = window_clone.hide();
                        api.prevent_close();
                    }
                });
            }

            // ── Handle CLI args (magnet URLs / .torrent paths) ─────
            let cli_urls: Vec<String> = std::env::args()
                .skip(1)
                .filter(|a| {
                    let lower = a.to_lowercase();
                    a.starts_with("magnet:") || lower.ends_with(".torrent")
                })
                .collect();

            // ── Torrent engine init ────────────────────────────────
            let app_handle = app.handle().clone();
            let handle = Arc::new(ManagerHandle::new());
            let handle_init = handle.clone();
            tauri::async_runtime::spawn(async move {
                match TorrentManager::new().await {
                    Ok(mgr) => {
                        let mgr_arc = {
                            handle_init.set_ready(mgr);
                            handle_init.get().unwrap().clone()
                        };
                        let m1 = mgr_arc.clone();
                        let m2 = mgr_arc.clone();
                        let m3 = mgr_arc.clone();
                        let m4 = mgr_arc.clone();
                        let m5 = mgr_arc.clone();
                        let m6 = mgr_arc.clone();
                        let m7 = mgr_arc.clone();
                        let m8 = mgr_arc.clone();
                        let ah = app_handle.clone();
                        let tracker: NotificationTracker =
                            Arc::new(std::sync::Mutex::new(HashMap::new()));
                        let idle = idle_icon.clone();
                        let active = active_icon.clone();
                        let status = status_line.clone();
                        let speed = speed_line.clone();
                        tauri::async_runtime::spawn(async move {
                            stats_emitter_loop(ah, m1, tracker, idle, active, status, speed).await;
                        });
                        let ah2 = app_handle.clone();
                        tauri::async_runtime::spawn(async move {
                            schedule_check_loop(ah2, m2).await;
                        });
                        let ah3 = app_handle.clone();
                        tauri::async_runtime::spawn(async move {
                            rss_poll_loop(app_handle, m3).await;
                        });
                        tauri::async_runtime::spawn(async move {
                            auto_management_loop(m4).await;
                        });
                        tauri::async_runtime::spawn(async move {
                            watch_folder_loop(m6).await;
                        });
                        tauri::async_runtime::spawn(async move {
                            clipboard_monitor_loop(ah3, m7).await;
                        });
                        tauri::async_runtime::spawn(async move {
                            seed_source_loop(m8).await;
                        });
                        // Start Web API + UI server
                        web_api::start_server(m5);

                        // Process any magnet URLs / .torrent files from CLI args
                        if !cli_urls.is_empty() {
                            let cli_mgr = mgr_arc.clone();
                            tauri::async_runtime::spawn(async move {
                                for url in cli_urls {
                                    if url.starts_with("magnet:") {
                                        match cli_mgr.add_magnet(&url).await {
                                            Ok(id) => log::info!(
                                                "Added magnet from CLI: {} (id={})",
                                                &url[..60],
                                                id
                                            ),
                                            Err(e) => log::warn!(
                                                "Failed CLI magnet {}: {}",
                                                &url[..60],
                                                e
                                            ),
                                        }
                                    } else if url.ends_with(".torrent")
                                        && std::path::Path::new(&url).exists()
                                    {
                                        match cli_mgr.add_torrent_file(&url).await {
                                            Ok(id) => log::info!(
                                                "Added .torrent from CLI: {} (id={})",
                                                url,
                                                id
                                            ),
                                            Err(e) => {
                                                log::warn!("Failed CLI torrent {}: {}", url, e)
                                            }
                                        }
                                    }
                                }
                            });
                        }
                    }
                    Err(e) => {
                        let error_msg = format!("{:#}", e);
                        handle_init.set_error(error_msg.clone());
                        log::error!("TorrentManager init error: {}", error_msg);
                        let _ = app_handle
                            .emit("engine-error", &serde_json::json!({"error": error_msg}));
                    }
                }
            });
            app.manage(handle);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::add_magnet,
            commands::add_torrent_file,
            commands::add_torrent_file_selected,
            commands::preview_torrent_file,
            commands::pause_torrent,
            commands::resume_torrent,
            commands::force_resume_torrent,
            commands::remove_force_resume,
            commands::delete_torrent,
            commands::get_stats,
            commands::get_torrent_files,
            commands::update_torrent_files,
            commands::set_queue_config,
            commands::get_queue_config,
            commands::set_normal_download_limit,
            commands::set_normal_upload_limit,
            commands::set_turtle_download_limit,
            commands::set_turtle_upload_limit,
            commands::set_turtle_mode,
            commands::get_speed_limits,
            commands::set_speed_schedule,
            commands::get_speed_schedule,
            commands::add_rss_feed,
            commands::remove_rss_feed,
            commands::get_rss_feeds,
            commands::update_rss_feed,
            commands::add_rss_filter,
            commands::remove_rss_filter,
            commands::poll_rss,
            commands::get_auto_management_config,
            commands::set_auto_management_config,
            commands::re_check_torrent,
            commands::set_sequential_download,
            commands::get_history,
            commands::add_http_download,
            commands::cancel_http_download,
            commands::get_categories,
            commands::add_category,
            commands::remove_category,
            commands::update_category,
            commands::get_tags,
            commands::add_tag,
            commands::remove_tag,
            commands::update_tag,
            commands::get_global_download_path,
            commands::set_global_download_path,
            commands::get_watch_folder,
            commands::set_watch_folder,
            commands::get_clipboard_monitor,
            commands::set_clipboard_monitor,
            commands::get_full_config,
            commands::set_torrent_category,
            commands::get_torrent_category,
            commands::set_torrent_tags,
            commands::get_torrent_tags,
            commands::export_torrents_to_file,
            commands::import_torrents_from_file,
            commands::export_torrents_json,
            commands::export_torrents_csv,
            commands::import_torrents_json,
            commands::import_torrents_csv,
            commands::get_bind_address,
            commands::set_bind_address,
            commands::list_network_interfaces,
            commands::get_socks5_proxy,
            commands::set_socks5_proxy,
            commands::test_socks5_proxy,
            commands::get_blocklist_url,
            commands::set_blocklist_url,
            commands::get_global_utp_enabled,
            commands::set_global_utp_enabled,
            commands::get_torrent_utp,
            commands::set_torrent_utp,
            commands::get_torrent_super_seed,
            commands::set_torrent_super_seed,
            commands::get_global_disable_dht,
            commands::set_global_disable_dht,
            commands::get_global_disable_pex,
            commands::set_global_disable_pex,
            commands::get_global_disable_lpd,
            commands::set_global_disable_lpd,
            commands::get_torrent_dht,
            commands::set_torrent_dht,
            commands::get_torrent_pex,
            commands::set_torrent_pex,
            commands::get_torrent_lpd,
            commands::set_torrent_lpd,
            commands::get_encryption_mode,
            commands::set_encryption_mode,
            commands::get_torrent_encryption,
            commands::set_torrent_encryption,
            commands::get_portfolios,
            commands::add_portfolio,
            commands::update_portfolio,
            commands::remove_portfolio,
            commands::is_default_client_offered,
            commands::set_default_client_offered,
            commands::register_default_client,
            commands::create_torrent_file,
            commands::check_for_updates,
            commands::search_trackers,
            commands::check_jackett_available,
            commands::get_torrent_peers,
            commands::get_torrent_trackers,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
