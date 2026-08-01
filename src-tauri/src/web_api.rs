use crate::build_clean_payload;
use axum::{
    body::{Body, Bytes},
    extract::{Path, Query, Request, State as AxumState},
    http::StatusCode,
    middleware::{self, Next},
    response::{IntoResponse, Json, Response},
    routing::{get, post},
    Router,
};
use serde::Deserialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::net::IpAddr;
use std::sync::{Arc, Mutex};
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;

const WEB_USERNAME: &str = "admin";
const WEB_PASSWORD: &str = "adminadmin";
const SID_COOKIE_NAME: &str = "SID";

#[derive(Clone)]
pub struct AppState {
    pub tm: Arc<crate::torrent_mgr::TorrentManager>,
    pub sessions: Arc<Mutex<HashSet<String>>>,
    pub geo_db: Arc<Option<maxminddb::Reader<Vec<u8>>>>,
}

/// Attempt to open the MaxMind GeoLite2 City database for IP geolocation (called once).
fn open_geo_db(data_dir: &std::path::Path) -> Option<maxminddb::Reader<Vec<u8>>> {
    let path = data_dir.join("GeoLite2-City.mmdb");
    if path.exists() {
        match maxminddb::Reader::open_readfile(&path) {
            Ok(reader) => {
                log::info!("GeoIP database loaded from {:?}", path);
                Some(reader)
            }
            Err(e) => {
                log::warn!("Failed to open GeoIP database at {:?}: {}", path, e);
                None
            }
        }
    } else {
        log::info!(
            "No GeoIP database at {:?}. Countries labeled 'Unknown'.",
            path
        );
        None
    }
}

/// Resolve an IP address to country code using MaxMind DB.
fn ip_to_country(reader: &maxminddb::Reader<Vec<u8>>, ip: IpAddr) -> Option<String> {
    use maxminddb::geoip2;
    let result = reader.lookup(ip).ok()?;
    let city: Option<geoip2::City> = result.decode().ok()?;
    let country = city?.country;
    let iso_code = country.iso_code?;
    Some(iso_code.to_string())
}

/// Check if IP is a global (non-private) IP.
fn is_global_ip(addr: IpAddr) -> Option<IpAddr> {
    if addr.is_loopback() || addr.is_unspecified() {
        return None;
    }
    match addr {
        IpAddr::V4(v4) => {
            let octets = v4.octets();
            let is_private = octets[0] == 10
                || octets[0] == 127
                || (octets[0] == 172 && (16..=31).contains(&octets[1]))
                || (octets[0] == 192 && octets[1] == 168)
                || (octets[0] == 169 && octets[1] == 254)
                || (octets[0] >= 224 && octets[0] <= 239);
            if is_private {
                None
            } else {
                Some(addr)
            }
        }
        IpAddr::V6(_) => Some(addr),
    }
}

/// Spawn the web API server on port 8080.
pub fn start_server(tm: Arc<crate::torrent_mgr::TorrentManager>) {
    let geo_db = open_geo_db(&tm.data_dir);
    let state = AppState {
        tm,
        sessions: Arc::new(Mutex::new(HashSet::new())),
        geo_db: Arc::new(geo_db),
    };

    let app = Router::new()
        // Static files — serve built frontend
        .nest_service(
            "/",
            ServeDir::new("../dist").append_index_html_on_directories(true),
        )
        // Public endpoints (no auth)
        .route("/api/v2/auth/login", post(login))
        .route("/api/v2/app/version", get(app_version))
        .route("/api/v2/app/webapiVersion", get(web_api_version))
        // Prometheus metrics — public, no auth
        .route("/metrics", get(metrics_handler))
        // Protected endpoints
        .route("/api/v2/torrents/info", get(torrents_info))
        .route("/api/v2/torrents/add", post(torrents_add))
        .route("/api/v2/torrents/pause", post(torrents_pause))
        .route("/api/v2/torrents/resume", post(torrents_resume))
        .route("/api/v2/torrents/delete", post(torrents_delete))
        .route("/api/v2/torrents/files", get(torrents_files))
        .route("/api/v2/torrents/properties", get(torrents_properties))
        .route("/api/v2/torrents/setCategory", post(torrents_set_category))
        .route("/api/v2/app/getPreferences", get(get_preferences))
        .route("/api/v2/app/setPreferences", post(set_preferences))
        // AsuTorrent-specific endpoints
        .route(
            "/api/v2/torrents/stream/:torrent_id/:file_idx",
            get(stream_file),
        )
        .route("/api/v2/peers/geo", get(peers_geo))
        .route("/api/v2/stats/speed", get(speed_history_handler))
        .route("/api/v2/peers/countries", get(peers_countries))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth_middleware,
        ))
        .layer(CorsLayer::permissive())
        .with_state(state);

    tauri::async_runtime::spawn(async move {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:8080").await;
        match listener {
            Ok(listener) => {
                log::info!("Web API + Web UI listening on http://127.0.0.1:8080");
                axum::serve(listener, app).await.unwrap_or_else(|e| {
                    log::error!("Web API server error: {}", e);
                });
            }
            Err(e) => {
                log::error!("Failed to bind Web API to port 8080: {}", e);
                log::info!("Web UI will not be available. Port 8080 may be in use.");
            }
        }
    });
}

// ── Auth middleware ─────────────────────────────────────────────

async fn auth_middleware(
    AxumState(state): AxumState<AppState>,
    req: Request,
    next: Next,
) -> Response {
    let headers = req.headers();
    let authenticated = if let Some(cookie) = headers.get("cookie").and_then(|v| v.to_str().ok()) {
        let sessions = state.sessions.lock().unwrap();
        cookie.split(';').any(|part| {
            let part = part.trim();
            if let Some(sid) = part.strip_prefix(&format!("{}=", SID_COOKIE_NAME)) {
                sessions.contains(sid)
            } else {
                false
            }
        })
    } else {
        false
    };

    if authenticated {
        next.run(req).await
    } else {
        (StatusCode::FORBIDDEN, "Forbidden").into_response()
    }
}

fn generate_sid() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("asutorrent_{}", nanos)
}

fn parse_form(body: &Bytes) -> HashMap<String, String> {
    let body_str = String::from_utf8_lossy(body);
    body_str
        .split('&')
        .filter_map(|pair| {
            let mut parts = pair.splitn(2, '=');
            Some((
                url_decode(parts.next()?.trim()),
                url_decode(parts.next().unwrap_or("").trim()),
            ))
        })
        .collect()
}

fn url_decode(s: &str) -> String {
    let mut result = String::new();
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        match c {
            '+' => result.push(' '),
            '%' => {
                let hex: String = chars.by_ref().take(2).collect();
                if let Ok(byte) = u8::from_str_radix(&hex, 16) {
                    result.push(byte as char);
                }
            }
            _ => result.push(c),
        }
    }
    result
}

// ── Public endpoints ─────────────────────────────────────────────

async fn login(AxumState(state): AxumState<AppState>, body: Bytes) -> impl IntoResponse {
    let params = parse_form(&body);
    let username = params.get("username").map(|s| s.as_str()).unwrap_or("");
    let password = params.get("password").map(|s| s.as_str()).unwrap_or("");

    if username == WEB_USERNAME && password == WEB_PASSWORD {
        let sid = generate_sid();
        state.sessions.lock().unwrap().insert(sid.clone());
        let cookie = format!("{}={}; Path=/; HttpOnly", SID_COOKIE_NAME, sid);
        (
            StatusCode::OK,
            [(axum::http::header::SET_COOKIE, cookie)],
            "Ok.",
        )
    } else {
        (
            StatusCode::UNAUTHORIZED,
            [(axum::http::header::SET_COOKIE, String::new())],
            "Unauthorized",
        )
    }
}

async fn app_version() -> impl IntoResponse {
    Json(serde_json::json!({"version": "1.0.0"}))
}

async fn web_api_version() -> impl IntoResponse {
    Json(serde_json::json!({"version": "2.8.2"}))
}

// ── Protected endpoints ──────────────────────────────────────────

#[derive(Deserialize)]
struct TorrentInfoQuery {
    filter: Option<String>,
    category: Option<String>,
    tag: Option<String>,
    #[serde(rename = "sort")]
    _sort: Option<String>,
    #[serde(rename = "reverse")]
    _reverse: Option<bool>,
    #[serde(rename = "limit")]
    _limit: Option<u32>,
    #[serde(rename = "offset")]
    _offset: Option<u32>,
    #[serde(rename = "hashes")]
    _hashes: Option<String>,
}

async fn torrents_info(
    AxumState(state): AxumState<AppState>,
    Query(query): Query<TorrentInfoQuery>,
) -> impl IntoResponse {
    /* unchanged — existing handler */
    let payload = build_clean_payload(
        &state.tm.api,
        &state.tm.forced_snapshot(),
        Some(state.tm.session_start),
        &state.tm.sequential_snapshot(),
    );
    let mut torrents: Vec<Value> = payload["torrents"].as_array().cloned().unwrap_or_default();

    if let Some(ref filter) = query.filter {
        if filter != "all" {
            torrents.retain(|t| {
                let st = t["stats"]["state"].as_str().unwrap_or("");
                match filter.as_str() {
                    "downloading" => st == "downloading",
                    "seeding" | "uploading" => st == "seeding",
                    "completed" => st == "seeding",
                    "paused" | "pausedDL" => st == "paused",
                    "active" => st == "downloading" || st == "seeding",
                    "inactive" => st == "paused",
                    "errored" | "error" => st == "error",
                    "resumed" => st == "downloading",
                    _ => true,
                }
            });
        }
    }

    if let Some(ref cat_name) = query.category {
        if !cat_name.is_empty() {
            let categories = state.tm.get_categories();
            torrents.retain(|t| {
                let tid = t["id"].as_u64().unwrap_or(0) as u32;
                state
                    .tm
                    .get_torrent_category(tid)
                    .and_then(|cid| {
                        categories
                            .iter()
                            .find(|c| c.id == cid)
                            .map(|c| c.name.eq_ignore_ascii_case(cat_name))
                    })
                    .unwrap_or(false)
            });
        }
    }

    if let Some(ref tag_name) = query.tag {
        if !tag_name.is_empty() {
            let tags = state.tm.get_tags();
            torrents.retain(|t| {
                let tid = t["id"].as_u64().unwrap_or(0) as u32;
                let torrent_tag_ids = state.tm.get_torrent_tags(tid);
                tag_name.split(',').any(|tn| {
                    let tn = tn.trim();
                    tags.iter()
                        .any(|tag| tn == tag.name && torrent_tag_ids.contains(&tag.id))
                })
            });
        }
    }
    let payload = build_clean_payload(
        &state.tm.api,
        &state.tm.forced_snapshot(),
        Some(state.tm.session_start),
        &state.tm.sequential_snapshot(),
    );
    let torrents = payload["torrents"].as_array().cloned().unwrap_or_default();

    let qbt_torrents: Vec<Value> = torrents
        .iter()
        .map(|t| {
            let hash = t["info_hash"].as_str().unwrap_or("");
            let name = t["name"].as_str().unwrap_or("Unknown");
            let total = t["stats"]["total_bytes"].as_u64().unwrap_or(0);
            let downloaded = t["stats"]["progress_bytes"].as_u64().unwrap_or(0);
            let uploaded = t["stats"]["uploaded_bytes"].as_u64().unwrap_or(0);
            let st = t["stats"]["state"].as_str().unwrap_or("unknown");
            let dl_speed = t["stats"]["live"]["download_speed"].as_u64().unwrap_or(0);
            let ul_speed = t["stats"]["live"]["upload_speed"].as_u64().unwrap_or(0);
            let eta = t["stats"]["live"]["time_remaining"]["secs"]
                .as_i64()
                .unwrap_or(-1);
            let peers = t["stats"]["peers"].as_u64().unwrap_or(0);
            let seeds = t["stats"]["seeds"].as_u64().unwrap_or(0);
            let progress = if total > 0 {
                downloaded as f64 / total as f64
            } else {
                0.0
            };
            let ratio = if total > 0 {
                uploaded as f64 / total as f64
            } else {
                0.0
            };
            let ratio_val = (ratio * 1000.0).round() / 1000.0;

            let qbt_state = match st {
                "downloading" => "downloading",
                "seeding" => "uploading",
                "paused" => "pausedDL",
                "error" => "error",
                "metadata" => "metaDL",
                _ => "unknown",
            };

            serde_json::json!({
                "hash": hash, "name": name, "size": total,
                "completed": downloaded, "uploaded": uploaded,
                "dl_speed": dl_speed, "up_speed": ul_speed,
                "progress": (progress * 1000.0).round() as u64,
                "amount_left": total.saturating_sub(downloaded),
                "state": qbt_state, "eta": eta,
                "num_leechs": peers, "num_seeds": seeds,
                "ratio": ratio_val,
                "priority": 0, "added_on": 0, "completion_on": 0,
                "save_path": "", "category": "", "tags": "", "download_path": "",
                "inactive_seeding_time_limit": 0, "seed_num": 0,
                "f_l_piece_prio": false,
                "force_start": t["forced"].as_bool().unwrap_or(false),
                "up_limit": -1, "dl_limit": -1,
                "max_ratio": -1, "max_seeding_time": -1, "max_inactive_seeding_time": -1,
            })
        })
        .collect();

    Json(qbt_torrents).into_response()
}

async fn torrents_add(AxumState(state): AxumState<AppState>, body: Bytes) -> impl IntoResponse {
    let params = parse_form(&body);
    let urls = params.get("urls").map(|s| s.as_str()).unwrap_or("");
    let category_name = params.get("category").map(|s| s.as_str()).unwrap_or("");

    let cat_id = if !category_name.is_empty() {
        state
            .tm
            .get_categories()
            .iter()
            .find(|c| c.name.eq_ignore_ascii_case(category_name))
            .map(|c| c.id)
    } else {
        None
    };

    for url in urls.split('\n') {
        let url = url.trim();
        if url.is_empty() {
            continue;
        }
        if url.starts_with("magnet:") || url.starts_with("http://") || url.starts_with("https://") {
            match state.tm.add_magnet(url).await {
                Ok(id) => {
                    log::info!("Web API: added torrent (id {})", id);
                    if let Some(cid) = cat_id {
                        state.tm.set_torrent_category(id, Some(cid));
                    }
                }
                Err(e) => log::warn!("Web API: failed to add torrent: {}", e),
            }
        }
    }

    (StatusCode::OK, "Ok.").into_response()
}

async fn torrents_pause(AxumState(state): AxumState<AppState>, body: Bytes) -> impl IntoResponse {
    let params = parse_form(&body);
    let hashes = params.get("hashes").map(|s| s.as_str()).unwrap_or("all");
    let ids = resolve_hashes(&state, hashes);
    for id in ids {
        let _ = state.tm.pause(id).await;
    }
    (StatusCode::OK, "Ok.").into_response()
}

async fn torrents_resume(AxumState(state): AxumState<AppState>, body: Bytes) -> impl IntoResponse {
    let params = parse_form(&body);
    let hashes = params.get("hashes").map(|s| s.as_str()).unwrap_or("all");
    let ids = resolve_hashes(&state, hashes);
    for id in ids {
        let _ = state.tm.resume(id).await;
    }
    (StatusCode::OK, "Ok.").into_response()
}

async fn torrents_delete(AxumState(state): AxumState<AppState>, body: Bytes) -> impl IntoResponse {
    let params = parse_form(&body);
    let hashes = params.get("hashes").map(|s| s.as_str()).unwrap_or("");
    let delete_files = params
        .get("deleteFiles")
        .map(|s| s == "true")
        .unwrap_or(false);
    let ids = resolve_hashes(&state, hashes);
    for id in ids {
        let _ = state.tm.delete(id, delete_files).await;
    }
    (StatusCode::OK, "Ok.").into_response()
}

#[derive(Deserialize)]
struct TorrentFileQuery {
    hash: String,
}

async fn torrents_set_category(
    AxumState(state): AxumState<AppState>,
    body: Bytes,
) -> impl IntoResponse {
    let params = parse_form(&body);
    let hashes = params.get("hashes").map(|s| s.as_str()).unwrap_or("");
    let category = params.get("category").map(|s| s.as_str()).unwrap_or("");

    let cat_id = if category.is_empty() {
        None
    } else {
        state
            .tm
            .get_categories()
            .iter()
            .find(|c| c.name.eq_ignore_ascii_case(category))
            .map(|c| c.id)
    };

    let ids = resolve_hashes(&state, hashes);
    for id in ids {
        state.tm.set_torrent_category(id, cat_id);
    }
    (StatusCode::OK, "Ok.").into_response()
}

async fn torrents_files(
    AxumState(state): AxumState<AppState>,
    Query(query): Query<TorrentFileQuery>,
) -> impl IntoResponse {
    let ids = resolve_hashes(&state, &query.hash);
    if ids.is_empty() {
        return Json(serde_json::json!([])).into_response();
    }

    match state.tm.get_torrent_details(ids[0]) {
        Ok(details) => {
            let val = serde_json::to_value(&details).unwrap_or_default();
            let files = val["files"].as_array().cloned().unwrap_or_default();
            let qbt_files: Vec<Value> = files
                .iter()
                .map(|f| {
                    serde_json::json!({
                        "index": f["index"], "name": f["name"],
                        "size": f["length"], "progress": 1.0,
                        "priority": 0, "is_seed": false,
                        "piece_range": [], "availability": 1.0,
                    })
                })
                .collect();
            Json(qbt_files).into_response()
        }
        Err(_) => Json(serde_json::json!([])).into_response(),
    }
}

#[derive(Deserialize)]
struct TorrentPropsQuery {
    hash: String,
}

async fn torrents_properties(
    AxumState(state): AxumState<AppState>,
    Query(query): Query<TorrentPropsQuery>,
) -> impl IntoResponse {
    let payload = build_clean_payload(
        &state.tm.api,
        &state.tm.forced_snapshot(),
        Some(state.tm.session_start),
        &state.tm.sequential_snapshot(),
    );
    let torrents = payload["torrents"].as_array().cloned().unwrap_or_default();
    let t = torrents.iter().find(|t| {
        t["info_hash"]
            .as_str()
            .map(|h| h == query.hash)
            .unwrap_or(false)
            || t["id"]
                .as_u64()
                .map(|id| id.to_string() == query.hash)
                .unwrap_or(false)
    });

    match t {
        Some(t) => {
            let total = t["stats"]["total_bytes"].as_u64().unwrap_or(0);
            let downloaded = t["stats"]["progress_bytes"].as_u64().unwrap_or(0);
            let uploaded = t["stats"]["uploaded_bytes"].as_u64().unwrap_or(0);
            let dl_speed = t["stats"]["live"]["download_speed"].as_u64().unwrap_or(0);
            let ul_speed = t["stats"]["live"]["upload_speed"].as_u64().unwrap_or(0);
            let peers = t["stats"]["peers"].as_u64().unwrap_or(0);
            let seeds = t["stats"]["seeds"].as_u64().unwrap_or(0);
            let eta = t["stats"]["live"]["time_remaining"]["secs"]
                .as_i64()
                .unwrap_or(-1);
            let ratio = if total > 0 {
                uploaded as f64 / total as f64
            } else {
                0.0
            };
            let progress = if total > 0 {
                downloaded as f64 / total as f64
            } else {
                0.0
            };
            let share_ratio = (ratio * 1000.0).round() / 1000.0;

            Json(serde_json::json!({
                "save_path": "", "creation_date": 0, "piece_size": 0,
                "comment": "", "total_wasted": 0,
                "total_uploaded": uploaded, "total_uploaded_session": uploaded,
                "total_downloaded": downloaded, "total_downloaded_session": downloaded,
                "up_limit": -1, "dl_limit": -1,
                "time_elapsed": 0, "seeding_time": 0,
                "nb_connections": peers + seeds, "nb_connections_limit": -1,
                "share_ratio": share_ratio,
                "download_speed": dl_speed, "upload_speed": ul_speed,
                "eta": eta, "completed": (progress * 100.0).round() as u64,
                "max_ratio": -1, "max_seeding_time": -1,
                "max_inactive_seeding_time": -1, "seen_complete": 0,
            }))
            .into_response()
        }
        None => Json(serde_json::json!({})).into_response(),
    }
}

async fn get_preferences(AxumState(state): AxumState<AppState>) -> impl IntoResponse {
    let limits = state.tm.limits.lock().unwrap();
    let dl_path = state
        .tm
        .config
        .lock()
        .unwrap()
        .global_download_path
        .clone()
        .unwrap_or_default();
    let queue = state.tm.queue.lock().unwrap().clone();
    Json(serde_json::json!({
        "save_path": dl_path,
        "max_active_downloads": queue.max_active_downloads,
        "max_active_uploads": queue.max_active_seeds,
        "download_speed_limit": limits.normal_download.unwrap_or(0) / 1024,
        "upload_speed_limit": limits.normal_upload.unwrap_or(0) / 1024,
        "locale": "en", "queueing_enabled": true,
        "dht": true, "pex": true, "lsd": true,
        "encryption": 1, "bittorrent_protocol": 0,
    }))
}

async fn set_preferences(
    AxumState(_state): AxumState<AppState>,
    _body: Bytes,
) -> impl IntoResponse {
    (StatusCode::OK, "Ok.").into_response()
}

// ── Prometheus Metrics ───────────────────────────────────────────

async fn metrics_handler(AxumState(state): AxumState<AppState>) -> impl IntoResponse {
    use core::fmt::Write;
    let mut output = String::new();
    let forced = state.tm.forced_snapshot();

    // Get the payload that the frontend already uses — this gives us all stats
    let payload = build_clean_payload(
        &state.tm.api,
        &forced,
        Some(state.tm.session_start),
        &state.tm.sequential_snapshot(),
    );
    let torrents = payload["torrents"].as_array().cloned().unwrap_or_default();
    let stats = &payload["stats"];

    // ── Global session-type metrics ───────────────────────────────
    let dl = stats["download_speed"].as_u64().unwrap_or(0);
    let ul = stats["upload_speed"].as_u64().unwrap_or(0);
    let active_dl = stats["active_downloads"].as_u64().unwrap_or(0);
    let active_seed = stats["active_seeds"].as_u64().unwrap_or(0);
    let total_torrents = torrents.len();

    let _ = writeln!(
        &mut output,
        "# HELP asutorrent_download_speed_bytes Download speed in bytes/sec\n\
         # TYPE asutorrent_download_speed_bytes gauge\n\
         asutorrent_download_speed_bytes {dl}\n\
         # HELP asutorrent_upload_speed_bytes Upload speed in bytes/sec\n\
         # TYPE asutorrent_upload_speed_bytes gauge\n\
         asutorrent_upload_speed_bytes {ul}\n\
         # HELP asutorrent_active_torrents Active torrents\n\
         # TYPE asutorrent_active_torrents gauge\n\
         asutorrent_active_torrents{{status=\"downloading\"}} {active_dl}\n\
         asutorrent_active_torrents{{status=\"seeding\"}} {active_seed}\n\
         asutorrent_active_torrents{{status=\"total\"}} {total_torrents}"
    );

    // ── Per-torrent metrics ───────────────────────────────────────
    for t in &torrents {
        let id = t["id"].as_u64().unwrap_or(0);
        let name = t["name"].as_str().unwrap_or("unknown").replace('"', "\\\"");
        let hash = t["info_hash"].as_str().unwrap_or("");
        let peers = t["stats"]["peers"].as_u64().unwrap_or(0);
        let td = t["stats"]["live"]["download_speed"].as_u64().unwrap_or(0);
        let tu = t["stats"]["live"]["upload_speed"].as_u64().unwrap_or(0);
        let progress = t["stats"]["progress_bytes"].as_u64().unwrap_or(0) as f64
            / t["stats"]["total_bytes"].as_u64().unwrap_or(1).max(1) as f64;
        let total = t["stats"]["total_bytes"].as_u64().unwrap_or(0);
        let state = t["stats"]["state"].as_str().unwrap_or("unknown");

        let _ = writeln!(&mut output,
            "# HELP asutorrent_torrent_info Torrent metadata\n\
             # TYPE asutorrent_torrent_info gauge\n\
             asutorrent_torrent_info{{id=\"{id}\",name=\"{name}\",info_hash=\"{hash}\",state=\"{state}\"}} 1\n\
             # HELP asutorrent_torrent_peers Current peer count\n\
             # TYPE asutorrent_torrent_peers gauge\n\
             asutorrent_torrent_peers{{name=\"{name}\"}} {peers}\n\
             # HELP asutorrent_torrent_download_speed_bytes Per-torrent download speed\n\
             # TYPE asutorrent_torrent_download_speed_bytes gauge\n\
             asutorrent_torrent_download_speed_bytes{{name=\"{name}\"}} {td}\n\
             # HELP asutorrent_torrent_upload_speed_bytes Per-torrent upload speed\n\
             # TYPE asutorrent_torrent_upload_speed_bytes gauge\n\
             asutorrent_torrent_upload_speed_bytes{{name=\"{name}\"}} {tu}\n\
             # HELP asutorrent_torrent_progress Download progress (0-1)\n\
             # TYPE asutorrent_torrent_progress gauge\n\
             asutorrent_torrent_progress{{name=\"{name}\"}} {progress:.4}\n\
             # HELP asutorrent_torrent_size_bytes Total torrent size\n\
             # TYPE asutorrent_torrent_size_bytes gauge\n\
             asutorrent_torrent_size_bytes{{name=\"{name}\"}} {total}"
        );
    }

    // ── Try to get DHT info ───────────────────────────────────────
    if let Ok(dht_stats) = state.tm.api.api_dht_stats() {
        let dht_val = serde_json::to_value(&dht_stats).unwrap_or_default();
        let _ = writeln!(
            &mut output,
            "# HELP asutorrent_dht_active DHT active\n\
             # TYPE asutorrent_dht_active gauge\n\
             asutorrent_dht_active {dht_val}"
        );
    }

    (
        StatusCode::OK,
        [(
            axum::http::header::CONTENT_TYPE,
            "text/plain; version=0.0.4; charset=utf-8",
        )],
        output,
    )
}

// ── Stream Video/Audio Files (Range requests) ────────────────────

/// Content-Type lookup by file extension (no external crate needed).
fn mime_for_ext(path: &str) -> &'static str {
    let ext = std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();
    match ext.as_str() {
        // Video
        "mp4" => "video/mp4",
        "mkv" => "video/x-matroska",
        "webm" => "video/webm",
        "avi" => "video/x-msvideo",
        "mov" => "video/quicktime",
        "wmv" => "video/x-ms-wmv",
        "flv" => "video/x-flv",
        "m4v" => "video/x-m4v",
        "3gp" => "video/3gpp",
        "mpg" | "mpeg" | "mpe" => "video/mpeg",
        "ts" => "video/mp2t",
        // Audio
        "mp3" => "audio/mpeg",
        "flac" => "audio/flac",
        "ogg" | "oga" => "audio/ogg",
        "opus" => "audio/opus",
        "wav" => "audio/wav",
        "aac" => "audio/aac",
        "m4a" => "audio/mp4",
        "wma" => "audio/x-ms-wma",
        _ => "application/octet-stream",
    }
}

/// Stream a torrent file with HTTP Range support (for in-app video/audio playback).
async fn stream_file(
    AxumState(state): AxumState<AppState>,
    Path((torrent_id, file_idx)): Path<(u32, u32)>,
    headers: axum::http::HeaderMap,
) -> Response {
    // 1. Resolve torrent name + download directory
    let torrent_list = state
        .tm
        .api
        .api_torrent_list_ext(librqbit::api::ApiTorrentListOpts { with_stats: true });
    let list_val = serde_json::to_value(&torrent_list).unwrap_or_default();
    let torrent = list_val["torrents"]
        .as_array()
        .and_then(|arr| {
            arr.iter()
                .find(|t| t["id"].as_u64() == Some(torrent_id as u64))
        })
        .cloned();

    let (torrent_name, info_hash) = match torrent {
        Some(ref t) => (
            t["name"].as_str().unwrap_or("unknown").to_string(),
            t["info_hash"].as_str().unwrap_or("").to_string(),
        ),
        None => {
            return (StatusCode::NOT_FOUND, "Torrent not found").into_response();
        }
    };

    // Skip synthetic HTTP download entries
    if info_hash.starts_with("http_") {
        return (
            StatusCode::BAD_REQUEST,
            "Cannot stream HTTP download entries",
        )
            .into_response();
    }

    // 2. Get file details from API
    let details = match state.tm.get_torrent_details(torrent_id) {
        Ok(d) => d,
        Err(_) => return (StatusCode::NOT_FOUND, "Torrent details not available").into_response(),
    };
    let details_val = serde_json::to_value(&details).unwrap_or_default();
    let files = details_val["files"].as_array().cloned().unwrap_or_default();

    let file_info = match files.get(file_idx as usize) {
        Some(f) => f.clone(),
        None => return (StatusCode::NOT_FOUND, "File index out of range").into_response(),
    };

    let file_relative_path = file_info["name"].as_str().unwrap_or("");
    if file_relative_path.is_empty() {
        return (StatusCode::NOT_FOUND, "File name not available").into_response();
    }

    // 3. Build the full file path
    let download_dir = {
        let cfg = state.tm.config.lock().unwrap();
        std::path::PathBuf::from(
            cfg.effective_path(None)
                .unwrap_or_else(|| state.tm.data_dir.to_string_lossy().to_string()),
        )
    };

    let full_path = download_dir.join(&torrent_name).join(file_relative_path);

    // Try alternative: flat path (no torrent-name subdir)
    let full_path = if full_path.exists() {
        full_path
    } else {
        let flat = download_dir.join(file_relative_path);
        if flat.exists() {
            flat
        } else {
            return (StatusCode::NOT_FOUND, "File not found on disk".to_string()).into_response();
        }
    };

    // 4. Get file size
    let metadata = match tokio::fs::metadata(&full_path).await {
        Ok(m) => m,
        Err(_) => return (StatusCode::NOT_FOUND, "Cannot read file metadata").into_response(),
    };
    let file_size = metadata.len();
    if file_size == 0 {
        return (StatusCode::OK, "").into_response();
    }

    // 5. Determine content type
    let content_type = mime_for_ext(file_relative_path);

    // 6. Parse Range header for seeking support
    let range_header = headers
        .get("range")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("bytes="));

    let (status, start, end) = if let Some(range_val) = range_header {
        let parts: Vec<&str> = range_val.splitn(2, '-').collect();
        let req_start = parts[0].parse::<u64>().ok().unwrap_or(0);
        let req_end = if parts.len() > 1 && !parts[1].is_empty() {
            parts[1].parse::<u64>().ok().unwrap_or(file_size - 1)
        } else {
            // No end specified: serve from start to end of file
            file_size - 1
        };
        let start = req_start.min(file_size.saturating_sub(1));
        let end = req_end.min(file_size.saturating_sub(1)).max(start);
        (StatusCode::PARTIAL_CONTENT, start, end)
    } else {
        // No Range header: serve the full file
        (StatusCode::OK, 0, file_size.saturating_sub(1))
    };

    let content_length = end - start + 1;

    // 7. Open file and create streaming body
    let file = match tokio::fs::File::open(&full_path).await {
        Ok(f) => f,
        Err(_) => {
            return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to open file").into_response()
        }
    };

    // Seek to the start position
    let mut file = file;
    if tokio::io::AsyncSeekExt::seek(&mut file, std::io::SeekFrom::Start(start))
        .await
        .is_err()
    {
        return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to seek in file").into_response();
    }

    // Read and stream the file
    let stream = tokio_util::io::ReaderStream::with_capacity(file, 64 * 1024);
    let body = Body::from_stream(stream);

    // 8. Build response headers
    let mut response_headers = axum::http::HeaderMap::new();
    response_headers.insert(
        axum::http::header::CONTENT_TYPE,
        content_type.parse().unwrap(),
    );
    response_headers.insert(axum::http::header::ACCEPT_RANGES, "bytes".parse().unwrap());
    response_headers.insert(
        "Content-Length",
        content_length.to_string().parse().unwrap(),
    );

    if status == StatusCode::PARTIAL_CONTENT {
        response_headers.insert(
            "Content-Range",
            format!("bytes {}-{}/{}", start, end, file_size)
                .parse()
                .unwrap(),
        );
    }

    (status, response_headers, body).into_response()
}

// ── Speed History ──────────────────────────────────────────────────

#[derive(Deserialize)]
struct SpeedQuery {
    period: Option<String>, // "hour" (default), "day", "week"
}

/// Return speed history data points for charting.
async fn speed_history_handler(
    AxumState(state): AxumState<AppState>,
    Query(query): Query<SpeedQuery>,
) -> impl IntoResponse {
    let period_secs = match query.period.as_deref() {
        Some("week") => 604800,
        Some("day") => 86400,
        _ => 3600, // hour (default)
    };

    let samples = state
        .tm
        .speed_history
        .lock()
        .unwrap()
        .get_samples(period_secs);
    Json(serde_json::json!({
        "period": query.period.as_deref().unwrap_or("hour"),
        "period_secs": period_secs,
        "samples": samples,
    }))
}

// ── Country Traffic Stats ──────────────────────────────────────────

/// Return per-country peer & traffic statistics.
/// Uses MaxMind GeoLite2 DB if available (cached in AppState), otherwise "Unknown".
async fn peers_countries(AxumState(state): AxumState<AppState>) -> impl IntoResponse {
    use crate::torrent_mgr::CountryTraffic;

    let geo_db = &*state.geo_db;
    let mut country_data: HashMap<String, CountryTraffic> = HashMap::new();
    let mut total_peers_found: u64 = 0;

    let list = state
        .tm
        .api
        .api_torrent_list_ext(librqbit::api::ApiTorrentListOpts { with_stats: true });
    for t in &list.torrents {
        let Some(ref id) = t.id else { continue };
        let idx = librqbit::api::TorrentIdOrHash::Id(*id);
        if let Ok(snapshot) = state.tm.api.api_peer_stats(idx, Default::default()) {
            if let Ok(val) = serde_json::to_value(&snapshot) {
                let peers_map = val.get("peers").and_then(|p| p.as_object());
                if let Some(peers) = peers_map {
                    for (key, _) in peers.iter() {
                        total_peers_found += 1;
                        let ip_str = key.split(':').next().unwrap_or(key);
                        let ip: Option<IpAddr> = ip_str.parse().ok();
                        let global_ip = ip.and_then(is_global_ip);

                        let country = if let (Some(ref reader), Some(ref ip)) = (geo_db, global_ip)
                        {
                            ip_to_country(reader, *ip).unwrap_or_else(|| "Unknown".to_string())
                        } else {
                            "Unknown".to_string()
                        };

                        let entry = country_data
                            .entry(country.clone())
                            .or_insert(CountryTraffic {
                                country_code: country,
                                peer_count: 0,
                                download_bytes: 0,
                                upload_bytes: 0,
                                last_seen: 0,
                            });
                        entry.peer_count += 1;
                    }
                }
            }
        }
    }

    let mut countries: Vec<CountryTraffic> = country_data.into_values().collect();
    countries.sort_by_key(|b| std::cmp::Reverse(b.peer_count));

    Json(serde_json::json!({
        "total_peers": total_peers_found,
        "countries": countries,
    }))
}

// ── Peer Geo-distribution ──────────────────────────────────────────

/// Return geo-distribution of all peers across all torrents.
/// This uses the peer counts we already track in the stats payload.
async fn peers_geo(AxumState(state): AxumState<AppState>) -> impl IntoResponse {
    let forced = state.tm.forced_snapshot();
    let payload = build_clean_payload(
        &state.tm.api,
        &forced,
        Some(state.tm.session_start),
        &state.tm.sequential_snapshot(),
    );
    let torrents = payload["torrents"].as_array().cloned().unwrap_or_default();

    // Build per-torrent peer list (total counts, not per-IP since we use the JSON payload)
    let mut per_torrent = Vec::new();
    let mut total_peers: u64 = 0;

    for t in &torrents {
        let id = t["id"].as_u64().unwrap_or(0);
        let name = t["name"].as_str().unwrap_or("Unknown").to_string();
        let peers = t["stats"]["peers"].as_u64().unwrap_or(0);
        let state = t["stats"]["state"].as_str().unwrap_or("").to_string();

        total_peers += peers;
        per_torrent.push(serde_json::json!({
            "id": id,
            "name": name,
            "peer_count": peers,
            "state": state,
        }));
    }

    Json(serde_json::json!({
        "total_peers": total_peers,
        "total_torrents": torrents.len(),
        "torrents": per_torrent,
    }))
}

// ── Helper: resolve hashes ───────────────────────────────────────

fn resolve_hashes(state: &AppState, hashes: &str) -> Vec<u32> {
    let payload = build_clean_payload(
        &state.tm.api,
        &state.tm.forced_snapshot(),
        Some(state.tm.session_start),
        &state.tm.sequential_snapshot(),
    );
    let torrents = payload["torrents"].as_array().cloned().unwrap_or_default();

    if hashes == "all" {
        return torrents
            .iter()
            .filter_map(|t| t["id"].as_u64().map(|id| id as u32))
            .collect();
    }

    let hash_list: Vec<&str> = hashes
        .split('|')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect();
    torrents
        .iter()
        .filter_map(|t| {
            let id = t["id"].as_u64()? as u32;
            let info_hash = t["info_hash"].as_str().unwrap_or("");
            let id_str = id.to_string();
            if hash_list.contains(&"all")
                || hash_list.contains(&info_hash)
                || hash_list.contains(&id_str.as_str())
            {
                Some(id)
            } else {
                None
            }
        })
        .collect()
}
