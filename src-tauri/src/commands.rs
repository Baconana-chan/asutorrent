use crate::torrent_mgr::{ManagerHandle, ScheduleRule, RssFeed, RssFilter};
use crate::config::{Category, Tag};
use crate::trackers;
use serde_json::Value;
use std::sync::Arc;
use tauri::State;

type Mgr = Arc<ManagerHandle>;

#[tauri::command]
pub async fn add_magnet(mgr: State<'_, Mgr>, url: String) -> Result<u32, String> {
    let tm = mgr.get().map_err(|e| e.to_string())?;
    tm.add_magnet(&url).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_torrent_file(mgr: State<'_, Mgr>, path: String) -> Result<u32, String> {
    let tm = mgr.get().map_err(|e| e.to_string())?;
    tm.add_torrent_file(&path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn pause_torrent(mgr: State<'_, Mgr>, id: u32) -> Result<(), String> {
    let tm = mgr.get().map_err(|e| e.to_string())?;
    tm.pause(id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn resume_torrent(mgr: State<'_, Mgr>, id: u32) -> Result<(), String> {
    let tm = mgr.get().map_err(|e| e.to_string())?;
    tm.resume(id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn force_resume_torrent(mgr: State<'_, Mgr>, id: u32) -> Result<(), String> {
    let tm = mgr.get().map_err(|e| e.to_string())?;
    tm.force_resume(id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_force_resume(mgr: State<'_, Mgr>, id: u32) -> Result<(), String> {
    let tm = mgr.get().map_err(|e| e.to_string())?;
    tm.remove_force(id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_torrent(mgr: State<'_, Mgr>, id: u32, delete_files: bool) -> Result<(), String> {
    let tm = mgr.get().map_err(|e| e.to_string())?;
    tm.delete(id, delete_files).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_stats(mgr: State<'_, Mgr>) -> Result<Value, String> {
    let tm = mgr.get().map_err(|e| e.to_string())?;
    Ok(crate::build_clean_payload(&tm.api, &tm.forced_snapshot(), Some(tm.session_start), &tm.sequential.lock().unwrap()))
}

#[tauri::command]
pub async fn get_torrent_files(mgr: State<'_, Mgr>, id: u32) -> Result<Value, String> {
    let tm = mgr.get().map_err(|e| e.to_string())?;
    let details = tm.get_torrent_details(id).map_err(|e| e.to_string())?;
    serde_json::to_value(&details).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_torrent_files(mgr: State<'_, Mgr>, id: u32, indices: Vec<usize>) -> Result<(), String> {
    let tm = mgr.get().map_err(|e| e.to_string())?;
    tm.update_only_files(id, indices).await.map_err(|e| e.to_string())
}

// ── Queue / Force Resume ────────────────────────────────────────

#[tauri::command]
pub async fn set_queue_config(mgr: State<'_, Mgr>, max_active_downloads: u32, max_active_seeds: u32) -> Result<(), String> {
    let tm = mgr.get().map_err(|e| e.to_string())?;
    tm.set_queue_config(max_active_downloads, max_active_seeds);
    tm.enforce_queue().await;
    Ok(())
}

#[tauri::command]
pub async fn get_queue_config(mgr: State<'_, Mgr>) -> Result<Value, String> {
    let tm = mgr.get().map_err(|e| e.to_string())?;
    let q = tm.get_queue_config();
    Ok(serde_json::json!({ "max_active_downloads": q.max_active_downloads, "max_active_seeds": q.max_active_seeds }))
}

// ── Speed limits ────────────────────────────────────────────────

#[tauri::command]
pub async fn set_normal_download_limit(mgr: State<'_, Mgr>, bps: Option<u32>) -> Result<(), String> {
    mgr.get().map_err(|e| e.to_string())?.set_normal_download_limit(bps); Ok(())
}
#[tauri::command]
pub async fn set_normal_upload_limit(mgr: State<'_, Mgr>, bps: Option<u32>) -> Result<(), String> {
    mgr.get().map_err(|e| e.to_string())?.set_normal_upload_limit(bps); Ok(())
}
#[tauri::command]
pub async fn set_turtle_download_limit(mgr: State<'_, Mgr>, bps: Option<u32>) -> Result<(), String> {
    mgr.get().map_err(|e| e.to_string())?.set_turtle_download_limit(bps); Ok(())
}
#[tauri::command]
pub async fn set_turtle_upload_limit(mgr: State<'_, Mgr>, bps: Option<u32>) -> Result<(), String> {
    mgr.get().map_err(|e| e.to_string())?.set_turtle_upload_limit(bps); Ok(())
}
#[tauri::command]
pub async fn set_turtle_mode(mgr: State<'_, Mgr>, enabled: bool) -> Result<(), String> {
    mgr.get().map_err(|e| e.to_string())?.set_turtle_mode(enabled); Ok(())
}

#[tauri::command]
pub async fn get_speed_limits(mgr: State<'_, Mgr>) -> Result<Value, String> {
    let tm = mgr.get().map_err(|e| e.to_string())?;
    let limits = tm.limits.lock().map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "normal_download": limits.normal_download,
        "normal_upload": limits.normal_upload,
        "turtle_download": limits.turtle_download,
        "turtle_upload": limits.turtle_upload,
        "turtle_mode": limits.turtle_mode,
        "schedule_enabled": limits.schedule_enabled,
        "schedule_active": limits.schedule_active,
    }))
}

// ── Speed schedule ──────────────────────────────────────────────

#[tauri::command]
pub async fn set_speed_schedule(mgr: State<'_, Mgr>, rules: Vec<ScheduleRule>, enabled: bool) -> Result<(), String> {
    mgr.get().map_err(|e| e.to_string())?.set_schedule_rules(rules, enabled); Ok(())
}

#[tauri::command]
pub async fn get_speed_schedule(mgr: State<'_, Mgr>) -> Result<Value, String> {
    let tm = mgr.get().map_err(|e| e.to_string())?;
    let (rules, enabled, active) = tm.get_schedule_rules();
    Ok(serde_json::json!({ "rules": rules, "enabled": enabled, "active": active }))
}

// ── RSS ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn add_rss_feed(mgr: State<'_, Mgr>, name: String, url: String) -> Result<RssFeed, String> {
    let tm = mgr.get().map_err(|e| e.to_string())?;
    Ok(tm.add_rss_feed(name, url))
}

#[tauri::command]
pub async fn remove_rss_feed(mgr: State<'_, Mgr>, id: u32) -> Result<(), String> {
    mgr.get().map_err(|e| e.to_string())?.remove_rss_feed(id); Ok(())
}

#[tauri::command]
pub async fn get_rss_feeds(mgr: State<'_, Mgr>) -> Result<Vec<RssFeed>, String> {
    Ok(mgr.get().map_err(|e| e.to_string())?.get_rss_feeds())
}

#[tauri::command]
pub async fn update_rss_feed(mgr: State<'_, Mgr>, id: u32, name: String, url: String, interval_secs: u64) -> Result<(), String> {
    mgr.get().map_err(|e| e.to_string())?.update_rss_feed(id, name, url, interval_secs); Ok(())
}

#[tauri::command]
pub async fn add_rss_filter(mgr: State<'_, Mgr>, feed_id: u32, name_regex: String, min_size: Option<u64>, max_size: Option<u64>, add_torrent: bool) -> Result<RssFilter, String> {
    mgr.get().map_err(|e| e.to_string())?.add_rss_filter(feed_id, name_regex, min_size, max_size, add_torrent)
        .ok_or_else(|| "Feed not found".to_string())
}

#[tauri::command]
pub async fn remove_rss_filter(mgr: State<'_, Mgr>, feed_id: u32, filter_id: u32) -> Result<(), String> {
    mgr.get().map_err(|e| e.to_string())?.remove_rss_filter(feed_id, filter_id); Ok(())
}

// ── Categories, Tags & Download Path ──────────────────────────

#[tauri::command]
pub async fn get_categories(mgr: State<'_, Mgr>) -> Result<Vec<Category>, String> {
    Ok(mgr.get().map_err(|e| e.to_string())?.get_categories())
}

#[tauri::command]
pub async fn add_category(mgr: State<'_, Mgr>, name: String, icon: String, save_path: Option<String>, auto_rule: Option<String>) -> Result<Category, String> {
    Ok(mgr.get().map_err(|e| e.to_string())?.add_category(name, icon, save_path, auto_rule))
}

#[tauri::command]
pub async fn remove_category(mgr: State<'_, Mgr>, id: u32) -> Result<(), String> {
    mgr.get().map_err(|e| e.to_string())?.remove_category(id); Ok(())
}

#[tauri::command]
pub async fn update_category(mgr: State<'_, Mgr>, id: u32, name: String, icon: String, save_path: Option<String>, auto_rule: Option<String>) -> Result<(), String> {
    mgr.get().map_err(|e| e.to_string())?.update_category(id, name, icon, save_path, auto_rule); Ok(())
}

#[tauri::command]
pub async fn get_tags(mgr: State<'_, Mgr>) -> Result<Vec<Tag>, String> {
    Ok(mgr.get().map_err(|e| e.to_string())?.get_tags())
}

#[tauri::command]
pub async fn add_tag(mgr: State<'_, Mgr>, name: String, color: String, auto_rule: Option<String>) -> Result<Tag, String> {
    Ok(mgr.get().map_err(|e| e.to_string())?.add_tag(name, color, auto_rule))
}

#[tauri::command]
pub async fn remove_tag(mgr: State<'_, Mgr>, id: u32) -> Result<(), String> {
    mgr.get().map_err(|e| e.to_string())?.remove_tag(id); Ok(())
}

#[tauri::command]
pub async fn get_global_download_path(mgr: State<'_, Mgr>) -> Result<Option<String>, String> {
    Ok(mgr.get().map_err(|e| e.to_string())?.get_global_download_path())
}

#[tauri::command]
pub async fn set_global_download_path(mgr: State<'_, Mgr>, path: Option<String>) -> Result<(), String> {
    mgr.get().map_err(|e| e.to_string())?.set_global_download_path(path); Ok(())
}

#[tauri::command]
pub async fn get_full_config(mgr: State<'_, Mgr>) -> Result<Value, String> {
    let cfg = mgr.get().map_err(|e| e.to_string())?.get_full_config();
    serde_json::to_value(&cfg).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_torrent_category(mgr: State<'_, Mgr>, torrent_id: u32, category_id: Option<u32>) -> Result<(), String> {
    mgr.get().map_err(|e| e.to_string())?.set_torrent_category(torrent_id, category_id); Ok(())
}

#[tauri::command]
pub async fn get_torrent_category(mgr: State<'_, Mgr>, torrent_id: u32) -> Result<Option<u32>, String> {
    Ok(mgr.get().map_err(|e| e.to_string())?.get_torrent_category(torrent_id))
}

#[tauri::command]
pub async fn set_torrent_tags(mgr: State<'_, Mgr>, torrent_id: u32, tag_ids: Vec<u32>) -> Result<(), String> {
    mgr.get().map_err(|e| e.to_string())?.set_torrent_tags(torrent_id, tag_ids); Ok(())
}

#[tauri::command]
pub async fn get_torrent_tags(mgr: State<'_, Mgr>, torrent_id: u32) -> Result<Vec<u32>, String> {
    Ok(mgr.get().map_err(|e| e.to_string())?.get_torrent_tags(torrent_id))
}

// ── Torrent History ──────────────────────────────────────────

#[tauri::command]
pub async fn get_history(mgr: State<'_, Mgr>) -> Result<Vec<crate::torrent_mgr::TorrentHistoryEntry>, String> {
    let tm = mgr.get().map_err(|e| e.to_string())?;
    Ok(tm.get_history())
}

// ── Sequential Download ──────────────────────────────────────

#[tauri::command]
pub async fn set_sequential_download(mgr: State<'_, Mgr>, id: u32, enabled: bool) -> Result<(), String> {
    let tm = mgr.get().map_err(|e| e.to_string())?;
    tm.set_sequential_download(id, enabled);
    Ok(())
}

// ── Auto-management ───────────────────────────────────────────

#[tauri::command]
pub async fn get_auto_management_config(mgr: State<'_, Mgr>) -> Result<crate::config::AutoManagementConfig, String> {
    Ok(mgr.get().map_err(|e| e.to_string())?.get_auto_management_config())
}

#[tauri::command]
pub async fn set_auto_management_config(mgr: State<'_, Mgr>, config: crate::config::AutoManagementConfig) -> Result<(), String> {
    mgr.get().map_err(|e| e.to_string())?.set_auto_management_config(config);
    Ok(())
}

#[tauri::command]
pub async fn re_check_torrent(mgr: State<'_, Mgr>, id: u32) -> Result<(), String> {
    mgr.get().map_err(|e| e.to_string())?.re_check(id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn poll_rss(mgr: State<'_, Mgr>) -> Result<Value, String> {
    let tm = mgr.get().map_err(|e| e.to_string())?;
    let results = tm.poll_rss_feeds().await;
    // Build a map: feed_id → [RssItem]
    let mut map = serde_json::Map::new();
    for (feed_id, items) in results {
        map.insert(feed_id.to_string(), serde_json::to_value(items).unwrap_or_default());
    }
    Ok(Value::Object(map))
}

// ── Network Bind Address ──────────────────────────────────────

#[tauri::command]
pub async fn get_bind_address(mgr: State<'_, Mgr>) -> Result<Option<String>, String> {
    Ok(mgr.get().map_err(|e| e.to_string())?.get_bind_address())
}

#[tauri::command]
pub async fn set_bind_address(mgr: State<'_, Mgr>, addr: Option<String>) -> Result<(), String> {
    mgr.get().map_err(|e| e.to_string())?.set_bind_address(addr);
    Ok(())
}

#[tauri::command]
pub async fn list_network_interfaces() -> Result<Vec<(String, String)>, String> {
    Ok(crate::torrent_mgr::TorrentManager::list_network_interfaces())
}

// ── DHT / PEX / LPD settings ──────────────────────────────────

#[tauri::command]
pub async fn get_global_disable_dht(mgr: State<'_, Mgr>) -> Result<bool, String> {
    Ok(mgr.get().map_err(|e| e.to_string())?.get_global_disable_dht())
}

#[tauri::command]
pub async fn set_global_disable_dht(mgr: State<'_, Mgr>, disabled: bool) -> Result<(), String> {
    mgr.get().map_err(|e| e.to_string())?.set_global_disable_dht(disabled);
    Ok(())
}

#[tauri::command]
pub async fn get_global_disable_pex(mgr: State<'_, Mgr>) -> Result<bool, String> {
    Ok(mgr.get().map_err(|e| e.to_string())?.get_global_disable_pex())
}

#[tauri::command]
pub async fn set_global_disable_pex(mgr: State<'_, Mgr>, disabled: bool) -> Result<(), String> {
    mgr.get().map_err(|e| e.to_string())?.set_global_disable_pex(disabled);
    Ok(())
}

#[tauri::command]
pub async fn get_global_disable_lpd(mgr: State<'_, Mgr>) -> Result<bool, String> {
    Ok(mgr.get().map_err(|e| e.to_string())?.get_global_disable_lpd())
}

#[tauri::command]
pub async fn set_global_disable_lpd(mgr: State<'_, Mgr>, disabled: bool) -> Result<(), String> {
    mgr.get().map_err(|e| e.to_string())?.set_global_disable_lpd(disabled);
    Ok(())
}

#[tauri::command]
pub async fn get_torrent_dht(mgr: State<'_, Mgr>, id: u32) -> Result<Option<bool>, String> {
    Ok(mgr.get().map_err(|e| e.to_string())?.get_torrent_dht(id))
}

#[tauri::command]
pub async fn set_torrent_dht(mgr: State<'_, Mgr>, id: u32, disabled: Option<bool>) -> Result<(), String> {
    mgr.get().map_err(|e| e.to_string())?.set_torrent_dht(id, disabled);
    Ok(())
}

#[tauri::command]
pub async fn get_torrent_pex(mgr: State<'_, Mgr>, id: u32) -> Result<Option<bool>, String> {
    Ok(mgr.get().map_err(|e| e.to_string())?.get_torrent_pex(id))
}

#[tauri::command]
pub async fn set_torrent_pex(mgr: State<'_, Mgr>, id: u32, disabled: Option<bool>) -> Result<(), String> {
    mgr.get().map_err(|e| e.to_string())?.set_torrent_pex(id, disabled);
    Ok(())
}

#[tauri::command]
pub async fn get_torrent_lpd(mgr: State<'_, Mgr>, id: u32) -> Result<Option<bool>, String> {
    Ok(mgr.get().map_err(|e| e.to_string())?.get_torrent_lpd(id))
}

#[tauri::command]
pub async fn set_torrent_lpd(mgr: State<'_, Mgr>, id: u32, disabled: Option<bool>) -> Result<(), String> {
    mgr.get().map_err(|e| e.to_string())?.set_torrent_lpd(id, disabled);
    Ok(())
}

// ── Create .torrent file ───────────────────────────────────────

/// Helper: manually build a bencode dictionary entry for a string.
fn bencode_str(s: &str) -> Vec<u8> {
    format!("{}:{}", s.len(), s).into_bytes()
}

/// Helper: manually build a bencode integer.
fn bencode_int(i: i64) -> Vec<u8> {
    format!("i{}e", i).into_bytes()
}

#[tauri::command]
pub async fn create_torrent_file(
    source_path: String,
    output_path: String,
    name: Option<String>,
    piece_length: Option<u32>,
    trackers: Option<Vec<String>>,
) -> Result<String, String> {
    let path = std::path::Path::new(&source_path);
    if !path.exists() {
        return Err(format!("Source path does not exist: {}", source_path));
    }

    let options = librqbit::CreateTorrentOptions {
        name: name.as_deref(),
        piece_length,
    };

    let result = librqbit::create_torrent(path, options)
        .await
        .map_err(|e| format!("Failed to create torrent: {}", e))?;

    // Get the info dictionary bytes
    let info_bytes = result.as_bytes()
        .map_err(|e| format!("Failed to serialize torrent info: {}", e))?;

    // Manually construct a valid .torrent bencode structure:
    // d8:announce<len>:<url>13:announce-listl...e4:info<info_bytes>ee
    let trackers = trackers.unwrap_or_default();
    let announce = trackers.first().map(|s| s.as_str()).unwrap_or("");

    let mut buf = Vec::new();
    buf.push(b'd'); // dictionary start

    // announce
    buf.extend_from_slice(b"8:announce");
    buf.extend_from_slice(&bencode_str(announce));

    // announce-list (if trackers provided)
    if !trackers.is_empty() {
        buf.extend_from_slice(b"13:announce-list");
        buf.push(b'l'); // outer list
        for url in &trackers {
            buf.push(b'l'); // inner list
            buf.extend_from_slice(&bencode_str(url));
            buf.push(b'e'); // end inner list
        }
        buf.push(b'e'); // end outer list
    }

    // creation date
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    buf.extend_from_slice(b"13:creation date");
    buf.extend_from_slice(&bencode_int(now));

    // created by
    let creator = "AsuTorrent 0.1";
    buf.extend_from_slice(b"10:created by");
    buf.extend_from_slice(&bencode_str(creator));

    // info dict
    buf.extend_from_slice(b"4:info");
    buf.extend_from_slice(&info_bytes);

    buf.push(b'e'); // dictionary end

    // Write the .torrent file to disk
    let output = std::path::Path::new(&output_path);
    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create output directory: {}", e))?;
    }

    std::fs::write(output, &buf)
        .map_err(|e| format!("Failed to write torrent file: {}", e))?;

    log::info!("Created .torrent file: {} ({} bytes, {} trackers)", output_path, buf.len(), trackers.len());

    Ok(output_path)
}

// ── Portfolios ────────────────────────────────────────────────

#[tauri::command]
pub async fn get_portfolios(mgr: State<'_, Mgr>) -> Result<Vec<crate::config::Portfolio>, String> {
    Ok(mgr.get().map_err(|e| e.to_string())?.get_portfolios())
}

#[tauri::command]
pub async fn add_portfolio(mgr: State<'_, Mgr>, name: String, icon: String, filter: String) -> Result<crate::config::Portfolio, String> {
    Ok(mgr.get().map_err(|e| e.to_string())?.add_portfolio(name, icon, filter))
}

#[tauri::command]
pub async fn update_portfolio(mgr: State<'_, Mgr>, id: u32, name: String, icon: String, filter: String) -> Result<(), String> {
    mgr.get().map_err(|e| e.to_string())?.update_portfolio(id, name, icon, filter);
    Ok(())
}

#[tauri::command]
pub async fn remove_portfolio(mgr: State<'_, Mgr>, id: u32) -> Result<(), String> {
    mgr.get().map_err(|e| e.to_string())?.remove_portfolio(id);
    Ok(())
}

// ── Encryption mode ───────────────────────────────────────────

#[tauri::command]
pub async fn get_encryption_mode(mgr: State<'_, Mgr>) -> Result<String, String> {
    Ok(mgr.get().map_err(|e| e.to_string())?.get_encryption_mode())
}

#[tauri::command]
pub async fn set_encryption_mode(mgr: State<'_, Mgr>, mode: String) -> Result<(), String> {
    mgr.get().map_err(|e| e.to_string())?.set_encryption_mode(mode);
    Ok(())
}

#[tauri::command]
pub async fn get_torrent_encryption(mgr: State<'_, Mgr>, id: u32) -> Result<Option<String>, String> {
    Ok(mgr.get().map_err(|e| e.to_string())?.get_torrent_encryption(id))
}

#[tauri::command]
pub async fn set_torrent_encryption(mgr: State<'_, Mgr>, id: u32, mode: Option<String>) -> Result<(), String> {
    mgr.get().map_err(|e| e.to_string())?.set_torrent_encryption(id, mode);
    Ok(())
}

// ── uTP settings ──────────────────────────────────────────────

#[tauri::command]
pub async fn get_global_utp_enabled(mgr: State<'_, Mgr>) -> Result<Option<bool>, String> {
    Ok(mgr.get().map_err(|e| e.to_string())?.get_global_utp_enabled())
}

#[tauri::command]
pub async fn set_global_utp_enabled(mgr: State<'_, Mgr>, enabled: Option<bool>) -> Result<(), String> {
    mgr.get().map_err(|e| e.to_string())?.set_global_utp_enabled(enabled);
    Ok(())
}

#[tauri::command]
pub async fn get_torrent_utp(mgr: State<'_, Mgr>, id: u32) -> Result<Option<bool>, String> {
    Ok(mgr.get().map_err(|e| e.to_string())?.get_torrent_utp(id))
}

#[tauri::command]
pub async fn set_torrent_utp(mgr: State<'_, Mgr>, id: u32, enabled: Option<bool>) -> Result<(), String> {
    mgr.get().map_err(|e| e.to_string())?.set_torrent_utp(id, enabled);
    Ok(())
}

// ── Blocklist ────────────────────────────────────────────────

#[tauri::command]
pub async fn get_blocklist_url(mgr: State<'_, Mgr>) -> Result<Option<String>, String> {
    Ok(mgr.get().map_err(|e| e.to_string())?.get_blocklist_url())
}

#[tauri::command]
pub async fn set_blocklist_url(mgr: State<'_, Mgr>, url: Option<String>) -> Result<(), String> {
    mgr.get().map_err(|e| e.to_string())?.set_blocklist_url(url);
    Ok(())
}

// ── SOCKS5 Proxy ──────────────────────────────────────────────

#[tauri::command]
pub async fn get_socks5_proxy(mgr: State<'_, Mgr>) -> Result<Option<String>, String> {
    Ok(mgr.get().map_err(|e| e.to_string())?.get_socks5_proxy())
}

#[tauri::command]
pub async fn set_socks5_proxy(mgr: State<'_, Mgr>, url: Option<String>) -> Result<(), String> {
    mgr.get().map_err(|e| e.to_string())?.set_socks5_proxy(url);
    Ok(())
}

#[tauri::command]
pub async fn test_socks5_proxy(_mgr: State<'_, Mgr>, url: String) -> Result<String, String> {
    crate::torrent_mgr::TorrentManager::test_socks5_proxy(&url).await
}

// ── Default Client ────────────────────────────────────────────

#[tauri::command]
pub async fn is_default_client_offered(mgr: State<'_, Mgr>) -> Result<bool, String> {
    Ok(mgr.get().map_err(|e| e.to_string())?.is_default_client_offered())
}

#[tauri::command]
pub async fn set_default_client_offered(mgr: State<'_, Mgr>) -> Result<(), String> {
    mgr.get().map_err(|e| e.to_string())?.set_default_client_offered();
    Ok(())
}

/// Register AsuTorrent as the default handler for magnet:// links and .torrent files.
#[cfg(windows)]
fn register_default_client_windows(exe_path: &str) -> Result<(), String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);

    // 1. Register the app protocol handler
    let (app_key, _) = hkcu.create_subkey("Software\\Classes\\asutorrent").map_err(|e| e.to_string())?;
    app_key.set_value("", &"AsuTorrent").map_err(|e| e.to_string())?;
    app_key.set_value("FriendlyTypeName", &"AsuTorrent").map_err(|e| e.to_string())?;
    let (cmd_key, _) = app_key.create_subkey("shell\\open\\command").map_err(|e| e.to_string())?;
    cmd_key.set_value("", &format!("\"{}\" \"%1\"", exe_path)).map_err(|e| e.to_string())?;

    // 2. Register magnet: protocol handler
    let (magnet_key, _) = hkcu.create_subkey("Software\\Classes\\magnet").map_err(|e| e.to_string())?;
    magnet_key.set_value("", &"URL:Magnet Link").map_err(|e| e.to_string())?;
    magnet_key.set_value("URL Protocol", &"").map_err(|e| e.to_string())?;
    let (magnet_cmd_key, _) = magnet_key.create_subkey("shell\\open\\command").map_err(|e| e.to_string())?;
    magnet_cmd_key.set_value("", &format!("\"{}\" \"%1\"", exe_path)).map_err(|e| e.to_string())?;

    // 3. Register .torrent file association
    let (torrent_key, _) = hkcu.create_subkey("Software\\Classes\\\\..torrent").map_err(|e| e.to_string())?;
    torrent_key.set_value("", &"asutorrent").map_err(|e| e.to_string())?;
    let (torrent_cmd_key, _) = hkcu.create_subkey("Software\\Classes\\asutorrent\\DefaultIcon")
        .map_err(|e| e.to_string())?;
    torrent_cmd_key.set_value("", &format!("\"{}\",1", exe_path)).map_err(|e| e.to_string())?;

    // 4. Register in User Choice for .torrent (Windows 10+)
    let (user_choice_key, _) = hkcu.create_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.torrent\\UserChoice")
        .map_err(|e| e.to_string())?;
    user_choice_key.set_value("ProgId", &"asutorrent").map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(not(windows))]
fn register_default_client_windows(_exe_path: &str) -> Result<(), String> {
    Err("This feature is only available on Windows.".to_string())
}

#[tauri::command]
pub async fn register_default_client(_app_handle: tauri::AppHandle) -> Result<(), String> {
    let exe_path = std::env::current_exe()
        .map_err(|e| format!("Failed to get executable path: {}", e))?;
    let exe_str = exe_path.to_str()
        .ok_or_else(|| "Executable path is not valid UTF-8".to_string())?;
    register_default_client_windows(exe_str)?;
    Ok(())
}

// ── Export / Import ────────────────────────────────────────────

#[tauri::command]
pub async fn export_torrents_to_file(mgr: State<'_, Mgr>, path: String, format: String) -> Result<u32, String> {
    let tm = mgr.get().map_err(|e| e.to_string())?;
    let payload = crate::build_clean_payload(
        &tm.api,
        &tm.forced_snapshot(),
        Some(tm.session_start),
        &tm.sequential_snapshot(),
    );
    let torrents = payload["torrents"]
        .as_array()
        .cloned()
        .unwrap_or_default();

    let count = torrents.len() as u32;

    match format.as_str() {
        "json" => {
            let export: Vec<serde_json::Value> = torrents
                .iter()
                .map(|t| {
                    serde_json::json!({
                        "name": t["name"],
                        "info_hash": t["info_hash"],
                        "size": t["stats"]["total_bytes"],
                        "downloaded": t["stats"]["progress_bytes"],
                        "uploaded": t["stats"]["uploaded_bytes"],
                        "progress": t["stats"]["total_bytes"].as_u64().map(|total| {
                            if total > 0 {
                                t["stats"]["progress_bytes"].as_u64().unwrap_or(0) as f64 / total as f64
                            } else { 0.0 }
                        }),
                        "state": t["stats"]["state"],
                        "finished": t["stats"]["finished"],
                        "forced": t["forced"],
                        "sequential": t["sequential"],
                    })
                })
                .collect();
            let content = serde_json::to_string_pretty(&export).map_err(|e| e.to_string())?;
            std::fs::write(&path, content).map_err(|e| format!("Failed to write file: {}", e))?;
        },
        "csv" => {
            let mut csv = String::from("name,info_hash,size,downloaded,uploaded,state,finished,forced,sequential\n");
            for t in &torrents {
                let name = t["name"].as_str().unwrap_or("").replace('"', "\"");
                let info_hash = t["info_hash"].as_str().unwrap_or("");
                let size = t["stats"]["total_bytes"].as_u64().unwrap_or(0);
                let downloaded = t["stats"]["progress_bytes"].as_u64().unwrap_or(0);
                let uploaded = t["stats"]["uploaded_bytes"].as_u64().unwrap_or(0);
                let state = t["stats"]["state"].as_str().unwrap_or("unknown");
                let finished = t["stats"]["finished"].as_bool().unwrap_or(false);
                let forced = t["forced"].as_bool().unwrap_or(false);
                let sequential = t["sequential"].as_bool().unwrap_or(false);
                csv.push_str(&format!(
                    "\"{}\",{},{},{},{},{},{},{},{}\n",
                    name, info_hash, size, downloaded, uploaded,
                    state, finished, forced, sequential
                ));
            }
            std::fs::write(&path, csv).map_err(|e| format!("Failed to write file: {}", e))?;
        },
        _ => return Err(format!("Unsupported export format: {}", format)),
    }

    Ok(count)
}

#[tauri::command]
pub async fn import_torrents_from_file(mgr: State<'_, Mgr>, path: String) -> Result<Vec<u32>, String> {
    let tm = mgr.get().map_err(|e| e.to_string())?;
    let content = std::fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))?;
    let trimmed = content.trim();

    // Detect format: if starts with '[' or '{', treat as JSON; otherwise treat as CSV
    if trimmed.starts_with('[') || trimmed.starts_with('{') {
        import_torrents_json_inner(tm, trimmed).await
    } else {
        import_torrents_csv_inner(tm, trimmed).await
    }
}

async fn import_torrents_json_inner(tm: &Arc<crate::torrent_mgr::TorrentManager>, json_data: &str) -> Result<Vec<u32>, String> {
    let entries: Vec<serde_json::Value> = serde_json::from_str(json_data).map_err(|e| format!("Invalid JSON: {}", e))?;
    let mut ids = Vec::new();
    for entry in &entries {
        let url = entry["url"].as_str()
            .or_else(|| entry["magnet"].as_str())
            .or_else(|| entry["link"].as_str());
        if let Some(u) = url {
            if u.starts_with("magnet:") || u.starts_with("http://") || u.starts_with("https://") || u.starts_with("ftp://") {
                match tm.add_magnet(u).await {
                    Ok(id) => ids.push(id),
                    Err(e) => log::warn!("Import: failed to add {}: {}", u, e),
                }
                continue;
            }
        }
        if let Some(ih) = entry["info_hash"].as_str() {
            if !ih.is_empty() {
                let magnet = format!("magnet:?xt=urn:btih:{}", ih);
                match tm.add_magnet(&magnet).await {
                    Ok(id) => ids.push(id),
                    Err(e) => log::warn!("Import: failed to add info_hash {}: {}", ih, e),
                }
            }
        }
    }
    Ok(ids)
}

fn parse_csv_line(line: &str) -> Vec<String> {
    let mut fields = Vec::new();
    let mut current = String::new();
    let mut chars = line.chars().peekable();
    let mut in_quotes = false;

    while let Some(c) = chars.next() {
        match c {
            '"' if in_quotes => {
                // Escaped quote "" inside a quoted field
                if chars.peek() == Some(&'"') {
                    current.push('"');
                    chars.next(); // consume the second '"'
                } else {
                    in_quotes = false;
                }
            },
            '"' => in_quotes = true,
            ',' if !in_quotes => {
                fields.push(current.trim().to_string());
                current = String::new();
            },
            _ => current.push(c),
        }
    }
    fields.push(current.trim().to_string());
    fields
}

async fn import_torrents_csv_inner(tm: &Arc<crate::torrent_mgr::TorrentManager>, csv_data: &str) -> Result<Vec<u32>, String> {
    let mut ids = Vec::new();
    for line in csv_data.lines().skip(1) {
        let trimmed = line.trim();
        if trimmed.is_empty() { continue; }
        let fields: Vec<String> = parse_csv_line(trimmed);
        if fields.is_empty() { continue; }
        let url_or_ih = fields.get(0).map(|s| s.as_str()).unwrap_or("");
        let info_hash = fields.get(1).map(|s| s.as_str()).unwrap_or("");
        let url = if url_or_ih.starts_with("magnet:") || url_or_ih.starts_with("http") || url_or_ih.starts_with("ftp") {
            Some(url_or_ih.to_string())
        } else if info_hash.starts_with("magnet:") || info_hash.starts_with("http") || info_hash.starts_with("ftp") {
            Some(info_hash.to_string())
        } else if !info_hash.is_empty() && info_hash != "info_hash" {
            Some(format!("magnet:?xt=urn:btih:{}", info_hash))
        } else if !url_or_ih.is_empty() && url_or_ih != "name" {
            Some(format!("magnet:?xt=urn:btih:{}", url_or_ih))
        } else {
            None
        };
        if let Some(u) = url {
            match tm.add_magnet(&u).await {
                Ok(id) => ids.push(id),
                Err(e) => log::warn!("Import CSV: failed to add {}: {}", u, e),
            }
        }
    }
    Ok(ids)
}

#[tauri::command]
pub async fn export_torrents_json(mgr: State<'_, Mgr>) -> Result<String, String> {
    let tm = mgr.get().map_err(|e| e.to_string())?;
    let payload = crate::build_clean_payload(
        &tm.api,
        &tm.forced_snapshot(),
        Some(tm.session_start),
        &tm.sequential_snapshot(),
    );
    let torrents = payload["torrents"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    let export: Vec<serde_json::Value> = torrents
        .iter()
        .map(|t| {
            serde_json::json!({
                "name": t["name"],
                "info_hash": t["info_hash"],
                "size": t["stats"]["total_bytes"],
                "downloaded": t["stats"]["progress_bytes"],
                "uploaded": t["stats"]["uploaded_bytes"],
                "progress": t["stats"]["total_bytes"].as_u64().map(|total| {
                    if total > 0 {
                        t["stats"]["progress_bytes"].as_u64().unwrap_or(0) as f64 / total as f64
                    } else { 0.0 }
                }),
                "state": t["stats"]["state"],
                "finished": t["stats"]["finished"],
                "forced": t["forced"],
                "sequential": t["sequential"],
            })
        })
        .collect();
    serde_json::to_string_pretty(&export).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_torrents_csv(mgr: State<'_, Mgr>) -> Result<String, String> {
    let tm = mgr.get().map_err(|e| e.to_string())?;
    let payload = crate::build_clean_payload(
        &tm.api,
        &tm.forced_snapshot(),
        Some(tm.session_start),
        &tm.sequential_snapshot(),
    );
    let torrents = payload["torrents"]
        .as_array()
        .cloned()
        .unwrap_or_default();

    let mut csv = String::from("name,info_hash,size,downloaded,uploaded,state,finished,forced,sequential\n");
    for t in &torrents {
        let name = t["name"].as_str().unwrap_or("").replace('"', "\"");
        let info_hash = t["info_hash"].as_str().unwrap_or("");
        let size = t["stats"]["total_bytes"].as_u64().unwrap_or(0);
        let downloaded = t["stats"]["progress_bytes"].as_u64().unwrap_or(0);
        let uploaded = t["stats"]["uploaded_bytes"].as_u64().unwrap_or(0);
        let state = t["stats"]["state"].as_str().unwrap_or("unknown");
        let finished = t["stats"]["finished"].as_bool().unwrap_or(false);
        let forced = t["forced"].as_bool().unwrap_or(false);
        let sequential = t["sequential"].as_bool().unwrap_or(false);
        csv.push_str(&format!(
            "\"{}\",{},{},{},{},{},{},{},{}\n",
            name, info_hash, size, downloaded, uploaded,
            state, finished, forced, sequential
        ));
    }
    Ok(csv)
}

#[tauri::command]
pub async fn import_torrents_json(mgr: State<'_, Mgr>, json_data: String) -> Result<Vec<u32>, String> {
    let tm = mgr.get().map_err(|e| e.to_string())?;
    let entries: Vec<serde_json::Value> = serde_json::from_str(&json_data).map_err(|e| format!("Invalid JSON: {}", e))?;
    let mut ids = Vec::new();
    for entry in &entries {
        // Try to find an import URL: "url", "magnet", "link", or info_hash
        let url = entry["url"].as_str()
            .or_else(|| entry["magnet"].as_str())
            .or_else(|| entry["link"].as_str());
        if let Some(u) = url {
            if u.starts_with("magnet:") || u.starts_with("http://") || u.starts_with("https://") || u.starts_with("ftp://") {
                match tm.add_magnet(u).await {
                    Ok(id) => ids.push(id),
                    Err(e) => log::warn!("Import: failed to add {}: {}", u, e),
                }
                continue;
            }
        }
        // Try info_hash field
        if let Some(ih) = entry["info_hash"].as_str() {
            if !ih.is_empty() {
                let magnet = format!("magnet:?xt=urn:btih:{}", ih);
                match tm.add_magnet(&magnet).await {
                    Ok(id) => ids.push(id),
                    Err(e) => log::warn!("Import: failed to add info_hash {}: {}", ih, e),
                }
            }
        }
    }
    Ok(ids)
}

#[tauri::command]
pub async fn import_torrents_csv(mgr: State<'_, Mgr>, csv_data: String) -> Result<Vec<u32>, String> {
    let tm = mgr.get().map_err(|e| e.to_string())?;
    let mut ids = Vec::new();
    for line in csv_data.lines().skip(1) {
        let trimmed = line.trim();
        if trimmed.is_empty() { continue; }
        // Try to find a URL or info_hash in any column
        let fields: Vec<&str> = trimmed.split(',').collect();
        if fields.is_empty() { continue; }
        // Check columns: first try the name column for magnet/http URL, or the info_hash column
        let url_or_ih = fields.get(0).copied().unwrap_or("");
        let info_hash = fields.get(1).copied().unwrap_or("");
        let url = if url_or_ih.starts_with("magnet:") || url_or_ih.starts_with("http") || url_or_ih.starts_with("ftp") {
            Some(url_or_ih.to_string())
        } else if info_hash.starts_with("magnet:") || info_hash.starts_with("http") || info_hash.starts_with("ftp") {
            Some(info_hash.to_string())
        } else if !info_hash.is_empty() && info_hash != "info_hash" {
            Some(format!("magnet:?xt=urn:btih:{}", info_hash))
        } else if !url_or_ih.is_empty() && url_or_ih != "name" {
            // Treat the name as an info_hash (best-effort)
            Some(format!("magnet:?xt=urn:btih:{}", url_or_ih))
        } else {
            None
        };
        if let Some(u) = url {
            match tm.add_magnet(&u).await {
                Ok(id) => ids.push(id),
                Err(e) => log::warn!("Import CSV: failed to add {}: {}", u, e),
            }
        }
    }
    Ok(ids)
}

// ── HTTP/FTP Direct Downloads ──────────────────────────────────

/// Start an HTTP/FTP direct download in the background.
pub async fn start_http_download(mgr: &Arc<crate::torrent_mgr::TorrentManager>, url: &str) -> Result<u32, String> {
    let download_dir = {
        let cfg = mgr.config.lock().map_err(|e| e.to_string())?;
        std::path::PathBuf::from(cfg.effective_path(None).unwrap_or_else(|| mgr.data_dir.to_string_lossy().to_string()))
    };

    let url_owned = url.to_string();
    let mgr_clone = mgr.clone();

    // Use the manager's add_http_download which handles URL parsing and file conflicts
    let id = mgr.add_http_download(url, &download_dir);

    // Get the actual save path from the download entry
    let save_path = {
        let downloads = mgr.http_downloads.lock().map_err(|e| e.to_string())?;
        downloads.get(&id).map(|dl| dl.save_path.clone()).unwrap_or_else(|| {
            download_dir.join("download").to_string_lossy().to_string()
        })
    };

    let handle = tauri::async_runtime::spawn(async move {
        let result = do_http_download_task(&mgr_clone, id, &url_owned, &save_path).await;
        // Clean up JoinHandle tracking before reporting completion/error
        mgr_clone.remove_http_task(id);
        if let Err(e) = result {
            log::error!("HTTP download {} failed: {}", id, e);
            mgr_clone.error_http_download(id, e.to_string());
        }
    });

    // Register the JoinHandle so cancel can abort the task
    mgr.register_http_task(id, handle);

    Ok(id)
}

async fn do_http_download_task(mgr: &Arc<crate::torrent_mgr::TorrentManager>, id: u32, url: &str, save_path: &str) -> anyhow::Result<()> {
    use futures_util::StreamExt;
    use tokio::io::AsyncWriteExt;

    let client = reqwest::Client::builder()
        .user_agent("AsuTorrent/0.1")
        .build()?;

    let resp = client.get(url).send().await?;
    if !resp.status().is_success() {
        anyhow::bail!("HTTP {}", resp.status());
    }

    let total = resp.content_length().unwrap_or(0);
    mgr.update_http_progress(id, 0, total, 0);

    let mut file = tokio::fs::File::create(save_path).await?;
    let mut stream = resp.bytes_stream();
    let mut downloaded: u64 = 0;
    let mut last_update = std::time::Instant::now();
    let mut last_bytes: u64 = 0;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        file.write_all(&chunk).await?;
        downloaded += chunk.len() as u64;

        let now = std::time::Instant::now();
        if now.duration_since(last_update).as_millis() >= 200 {
            let elapsed = now.duration_since(last_update).as_secs_f64();
            let speed = if elapsed > 0.0 { ((downloaded - last_bytes) as f64 / elapsed) as u64 } else { 0 };
            mgr.update_http_progress(id, downloaded, total.max(downloaded), speed);
            last_update = now;
            last_bytes = downloaded;
        }
    }

    mgr.complete_http_download(id, downloaded);
    log::info!("HTTP download {} completed: {} ({})", id, url, downloaded);
    Ok(())
}

#[tauri::command]
pub async fn add_http_download(mgr: State<'_, Mgr>, url: String) -> Result<u32, String> {
    let tm = mgr.get().map_err(|e| e.to_string())?.clone();
    start_http_download(&tm, &url).await
}

#[tauri::command]
pub async fn cancel_http_download(mgr: State<'_, Mgr>, id: u32) -> Result<(), String> {
    let tm = mgr.get().map_err(|e| e.to_string())?;
    tm.cancel_http_download(id);
    Ok(())
}

// ── Peer & Tracker data for Detail Panel ─────────────────────

#[tauri::command]
pub async fn get_torrent_peers(mgr: State<'_, Mgr>, id: u32) -> Result<Value, String> {
    let tm = mgr.get().map_err(|e| e.to_string())?;
    tm.get_torrent_peers(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_torrent_trackers(mgr: State<'_, Mgr>, id: u32) -> Result<Value, String> {
    let tm = mgr.get().map_err(|e| e.to_string())?;
    tm.get_torrent_trackers(id).map_err(|e| e.to_string())
}

// ── Tracker Search ────────────────────────────────────────────────

#[tauri::command]
pub async fn search_trackers(query: String, sources: Vec<String>) -> Result<Vec<trackers::SearchResult>, String> {
    let results = trackers::search_all(&query, &sources).await;
    Ok(results)
}

#[tauri::command]
pub async fn check_jackett_available() -> Result<bool, String> {
    Ok(trackers::check_jackett().await)
}

// ── Auto-update ────────────────────────────────────────────────────

#[tauri::command]
pub async fn check_for_updates(current_version: String) -> Result<Option<serde_json::Value>, String> {
    let url = "https://api.github.com/repos/Baconana-chan/asutorrent/releases/latest";
    let client = reqwest::Client::builder()
        .user_agent("AsuTorrent/0.1")
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    let resp = client
        .get(url)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch latest release: {}", e))?;

    if !resp.status().is_success() {
        return Ok(None); // Silently ignore if we can't reach GitHub
    }

    let release: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse release info: {}", e))?;

    let latest_tag = release["tag_name"]
        .as_str()
        .unwrap_or("")
        .trim_start_matches('v');

    if latest_tag.is_empty() {
        return Ok(None);
    }

    // Compare versions (semver part-by-part comparison)
    let current_parts: Vec<u32> = current_version
        .split('.')
        .filter_map(|p| p.parse().ok())
        .collect();
    let latest_parts: Vec<u32> = latest_tag
        .split('.')
        .filter_map(|p| p.parse().ok())
        .collect();

    // Compare overlapping parts sequentially
    let mut newer = false;
    for (l, c) in latest_parts.iter().zip(current_parts.iter()) {
        if l > c {
            newer = true;
            break;
        }
        if c > l {
            return Ok(None); // Current is newer
        }
    }
    // All overlapping parts are equal: latest is newer only if it has more components
    if !newer && latest_parts.len() <= current_parts.len() {
        return Ok(None);
    }

    let html_url = release["html_url"].as_str().unwrap_or("").to_string();
    let body = release["body"].as_str().unwrap_or("No release notes.").to_string();
    let name = release["name"].as_str().unwrap_or(latest_tag).to_string();

    Ok(Some(serde_json::json!({
        "version": latest_tag,
        "name": name,
        "url": html_url,
        "notes": body,
        "current_version": current_version,
    })))
}
