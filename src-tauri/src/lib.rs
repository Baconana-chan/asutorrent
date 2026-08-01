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

use librqbit::api::{Api, ApiTorrentListOpts};

/// Type alias for the JoinHandle returned by tauri::async_runtime::spawn.
pub(crate) type JoinHandle = tauri::async_runtime::JoinHandle<()>;

const ICON_32_PNG: &[u8] = include_bytes!("../icons/32x32.png");
const ICON_128_PNG: &[u8] = include_bytes!("../icons/128x128.png");

pub(crate) fn build_clean_payload(
    api: &Api,
    forced_ids: &HashSet<u32>,
    session_start: Option<std::time::SystemTime>,
    sequential_ids: &HashSet<u32>,
) -> Value {
    let list = api.api_torrent_list_ext(ApiTorrentListOpts { with_stats: true });
    let session_stats = api.api_session_stats();
    let list_val = serde_json::to_value(&list).unwrap_or_default();
    let stats_val = serde_json::to_value(&session_stats).unwrap_or_default();
    let raw_torrents: Vec<Value> = list_val["torrents"].as_array().cloned().unwrap_or_default();
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
                forced_ids,
                sequential_ids,
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
    let uptime_secs = session_start
        .and_then(|start| {
            std::time::SystemTime::now()
                .duration_since(start)
                .ok()
                .map(|d| d.as_secs())
        })
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

fn map_torrent(
    t: &Value,
    forced_ids: &HashSet<u32>,
    sequential_ids: &HashSet<u32>,
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
    let forced = forced_ids.contains(&id);
    let sequential = sequential_ids.contains(&id);
    serde_json::json!({
        "id": t["id"], "name": t["name"], "info_hash": t["info_hash"], "forced": forced, "sequential": sequential,
        "stats": {
            "state": state,
            "total_bytes": stats.and_then(|s| s["total_bytes"].as_u64()).unwrap_or(0),
            "progress_bytes": stats.and_then(|s| s["progress_bytes"].as_u64()).unwrap_or(0),
            "uploaded_bytes": stats.and_then(|s| s["uploaded_bytes"].as_u64()).unwrap_or(0),
            "finished": finished,
            "error": stats.and_then(|s| s["error"].as_str().map(String::from)),
            "peers": peers, "seeds": 0u64,
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
) {
    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(1));
    let mut first_tick = true;
    let mut menu_tick = 0u64;
    loop {
        interval.tick().await;
        menu_tick += 1;
        let forced = mgr.forced_snapshot();
        let sequential = mgr.sequential_snapshot();
        let mut payload =
            build_clean_payload(&mgr.api, &forced, Some(mgr.session_start), &sequential);

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

            // ── Dynamic right-click menu (every 2s) ────────────────
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

            // Build menu (every 3 seconds to reduce churn)
            if menu_tick.is_multiple_of(3) {
                let total_active = dl_count + seed_count;
                if let Ok(menu) = build_tray_menu(
                    &app_handle,
                    dl_count,
                    seed_count,
                    total_active,
                    &fmt_dl,
                    &fmt_ul,
                ) {
                    let _ = tray.set_menu(Some(menu));
                }
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

/// Build a dynamic tray menu with torrent activity status and quick actions.
fn build_tray_menu(
    app: &tauri::AppHandle,
    dl_count: u64,
    seed_count: u64,
    total_active: u64,
    fmt_dl: &str,
    fmt_ul: &str,
) -> Result<tauri::menu::Menu<tauri::Wry>, tauri::Error> {
    use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem};

    let mut builder = MenuBuilder::new(app)
        .item(&MenuItemBuilder::with_id("show_hide", "Show/Hide Window").build(app)?)
        .item(&PredefinedMenuItem::separator(app)?);

    if total_active > 0 {
        let status = format!("⬇ {} downloading  |  ⬆ {} seeding", dl_count, seed_count);
        builder = builder
            .item(
                &MenuItemBuilder::with_id("status_line", &status)
                    .enabled(false)
                    .build(app)?,
            )
            .item(
                &MenuItemBuilder::with_id("speed_line", format!("DL {}  /  UL {}", fmt_dl, fmt_ul))
                    .enabled(false)
                    .build(app)?,
            );
    } else {
        builder = builder.item(
            &MenuItemBuilder::with_id("idle_line", "No active torrents")
                .enabled(false)
                .build(app)?,
        );
    }

    builder = builder
        .item(&PredefinedMenuItem::separator(app)?)
        .item(&MenuItemBuilder::with_id("pause_all", "Pause All").build(app)?)
        .item(&MenuItemBuilder::with_id("resume_all", "Resume All").build(app)?)
        .item(&PredefinedMenuItem::separator(app)?)
        .item(&MenuItemBuilder::with_id("quit", "Quit").build(app)?);

    builder.build()
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
                        let payload = build_clean_payload(
                            &m1.api,
                            &m1.forced_snapshot(),
                            Some(m1.session_start),
                            &m1.sequential_snapshot(),
                        );
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
            let _tray = TrayIconBuilder::new()
                .icon(idle_icon.clone())
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
                        let ah = app_handle.clone();
                        let tracker: NotificationTracker =
                            Arc::new(std::sync::Mutex::new(HashMap::new()));
                        let idle = idle_icon.clone();
                        let active = active_icon.clone();
                        tauri::async_runtime::spawn(async move {
                            stats_emitter_loop(ah, m1, tracker, idle, active).await;
                        });
                        let ah2 = app_handle.clone();
                        tauri::async_runtime::spawn(async move {
                            schedule_check_loop(ah2, m2).await;
                        });
                        tauri::async_runtime::spawn(async move {
                            rss_poll_loop(app_handle, m3).await;
                        });
                        tauri::async_runtime::spawn(async move {
                            auto_management_loop(m4).await;
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
            commands::get_global_download_path,
            commands::set_global_download_path,
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
