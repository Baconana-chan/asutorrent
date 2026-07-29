use anyhow::{Context, Result};
use librqbit::api::{Api, ApiTorrentListOpts, TorrentIdOrHash, TorrentDetailsResponse};
use librqbit::limits::LimitsConfig;
use librqbit::{AddTorrent, AddTorrentOptions, ManagedTorrent, Session, SessionOptions};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::num::NonZeroU32;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};
use chrono::{Local, Timelike};
use crate::state_machine::TorrentState;

// ── Speed History ────────────────────────────────────────────────

/// A single speed sample with timestamp.
#[derive(Debug, Clone, Serialize)]
pub struct SpeedSample {
    pub timestamp: u64, // unix seconds
    pub dl_bytes: u64,
    pub ul_bytes: u64,
}

/// Ring buffer for speed history.
/// Stores raw second-by-second samples and provides aggregated views.
pub struct SpeedHistory {
    /// Raw second-by-second samples for the last hour (max 3600)
    raw_samples: std::collections::VecDeque<SpeedSample>,
}

impl SpeedHistory {
    const MAX_RAW_SAMPLES: usize = 3600; // 1 hour at 1 sample/sec

    pub fn new() -> Self {
        Self {
            raw_samples: std::collections::VecDeque::with_capacity(Self::MAX_RAW_SAMPLES),
        }
    }

    /// Record a new speed sample (called every ~1 second).
    pub fn record(&mut self, dl_bytes: u64, ul_bytes: u64) {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let sample = SpeedSample { timestamp, dl_bytes, ul_bytes };
        if self.raw_samples.len() >= Self::MAX_RAW_SAMPLES {
            self.raw_samples.pop_front();
        }
        self.raw_samples.push_back(sample);
    }

    /// Get speed samples for a given period.
    /// `period_secs` = 3600 (hour), 86400 (day), 604800 (week)
    /// For long periods, samples are aggregated into ~200 data points max.
    pub fn get_samples(&self, period_secs: u64) -> Vec<SpeedSample> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let cutoff = now.saturating_sub(period_secs);

        // Collect relevant samples
        let relevant: Vec<&SpeedSample> = self.raw_samples.iter().filter(|s| s.timestamp >= cutoff).collect();
        if relevant.is_empty() {
            return vec![];
        }

        // For periods longer than 1 hour, aggregate into buckets
        if period_secs <= 3600 {
            // Return raw samples directly (max 3600 for hour)
            return relevant.iter().map(|s| (*s).clone()).collect();
        }

        // Aggregate: target ~200 data points
        let bucket_size = (period_secs / 200).max(1);
        let mut buckets: Vec<(u64, Vec<&SpeedSample>)> = Vec::new();

        for sample in &relevant {
            let bucket_idx = (sample.timestamp - cutoff) / bucket_size;
            while buckets.len() <= bucket_idx as usize {
                buckets.push((0, vec![]));
            }
            buckets[bucket_idx as usize].1.push(sample);
        }

        buckets
            .iter()
            .filter(|(_, samples)| !samples.is_empty())
            .map(|(_, samples)| {
                let mid_ts = samples.iter().map(|s| s.timestamp).sum::<u64>() / samples.len() as u64;
                let avg_dl = samples.iter().map(|s| s.dl_bytes).sum::<u64>() / samples.len() as u64;
                let avg_ul = samples.iter().map(|s| s.ul_bytes).sum::<u64>() / samples.len() as u64;
                SpeedSample { timestamp: mid_ts, dl_bytes: avg_dl, ul_bytes: avg_ul }
            })
            .collect()
    }
}


/// Queue configuration — limits on concurrent downloads/seeds.
#[derive(Debug, Clone)]
pub struct QueueConfig {
    pub max_active_downloads: u32,
    pub max_active_seeds: u32,
}

impl Default for QueueConfig {
    fn default() -> Self { Self { max_active_downloads: 5, max_active_seeds: 3 } }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleRule {
    pub days: Vec<u8>,
    pub start_hour: u8, pub start_minute: u8,
    pub end_hour: u8, pub end_minute: u8,
    pub download_limit: Option<u32>, pub upload_limit: Option<u32>,
}

impl ScheduleRule {
    fn matches(&self, weekday: u8, hour: u8, minute: u8) -> bool {
        if !self.days.is_empty() && !self.days.contains(&weekday) { return false; }
        let now = hour as u32 * 60 + minute as u32;
        let s = self.start_hour as u32 * 60 + self.start_minute as u32;
        let e = self.end_hour as u32 * 60 + self.end_minute as u32;
        if e > s { now >= s && now < e } else { now >= s || now < e }
    }
}

pub struct SpeedLimits {
    pub normal_download: Option<u32>, pub normal_upload: Option<u32>,
    pub saved_normal_download: Option<u32>, pub saved_normal_upload: Option<u32>,
    pub turtle_download: Option<u32>, pub turtle_upload: Option<u32>,
    pub turtle_mode: bool,
    pub schedule_enabled: bool, pub schedule_rules: Vec<ScheduleRule>, pub schedule_active: bool,
}

impl SpeedLimits {
    pub fn new() -> Self {
        Self {
            normal_download: None, normal_upload: None,
            saved_normal_download: None, saved_normal_upload: None,
            turtle_download: Some(1024 * 1024), turtle_upload: Some(512 * 1024),
            turtle_mode: false,
            schedule_enabled: false, schedule_rules: vec![], schedule_active: false,
        }
    }
}

// ── RSS types ────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RssFeed {
    pub id: u32, pub name: String, pub url: String,
    pub interval_secs: u64, pub filters: Vec<RssFilter>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RssFilter {
    pub id: u32, pub name_regex: String,
    pub min_size: Option<u64>, pub max_size: Option<u64>,
    pub add_torrent: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RssItem {
    pub title: String, pub link: String,
    pub size: Option<u64>, pub pub_date: Option<String>,
}

pub struct RssState {
    pub feeds: Vec<RssFeed>,
    pub seen_links: HashSet<String>,
    pub next_feed_id: u32, pub next_filter_id: u32,
}

impl RssState {
    fn new() -> Self {
        Self { feeds: vec![], seen_links: HashSet::new(), next_feed_id: 1, next_filter_id: 1 }
    }
}

// Reusable HTTP client for RSS fetching
fn rss_http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .user_agent("AsuTorrent/0.1")
            .build()
            .unwrap_or_default()
    })
}

/// A record of a torrent that was completed or deleted.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TorrentHistoryEntry {
    pub name: String,
    pub info_hash: String,
    pub total_bytes: u64,
    pub uploaded_bytes: u64,
    pub event: String, // "completed" or "deleted"
    pub timestamp: u64, // Unix seconds
    pub category_name: Option<String>,
    pub completed_at: Option<u64>, // When the download first completed
}

pub struct TorrentManager {
    pub session: Arc<Session>,
    pub api: Api,
    pub limits: Mutex<SpeedLimits>,
    pub queue: Mutex<QueueConfig>,
    pub forced: Mutex<HashSet<u32>>,
    pub sequential: Mutex<HashSet<u32>>,
    pub rss: Mutex<RssState>,
    pub config: Mutex<crate::config::AppConfig>,
    /// Tracks when each torrent started seeding (Unix seconds).
    pub seed_start_times: Mutex<HashMap<u32, u64>>,
    pub data_dir: PathBuf,
    /// Speed history for graphs.
    pub speed_history: Mutex<SpeedHistory>,
    /// Per-country peer & traffic stats.
    #[allow(dead_code)]
    pub country_stats: Mutex<HashMap<String, CountryTraffic>>,
    /// Session start time (Unix seconds) for uptime calculation.
    pub session_start: std::time::SystemTime,
    /// Torrent history — records of completed/deleted torrents.
    pub history: Mutex<Vec<TorrentHistoryEntry>>,

    /// Active HTTP/FTP direct downloads.
    pub http_downloads: Mutex<HashMap<u32, HttpDownload>>,
    /// Join handles for active HTTP download tasks (so cancel can abort).
    http_download_tasks: Mutex<HashMap<u32, crate::JoinHandle>>,
    next_http_id: Mutex<u32>,
    /// Per-torrent state machine tracking (id → state).
    pub torrent_states: Mutex<HashMap<u32, TorrentState>>,
}

// ── HTTP/FTP Download Tracking ───────────────────────────────────

/// Represents an active HTTP/FTP direct download.
#[derive(Debug, Clone, Serialize)]
pub struct HttpDownload {
    pub id: u32,
    pub url: String,
    pub file_name: String,
    pub save_path: String,
    pub total_bytes: u64,
    pub downloaded_bytes: u64,
    pub speed: u64,
    pub status: String, // "downloading", "completed", "error"
    pub error_msg: Option<String>,
}

// ── Country Traffic Stats ─────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct CountryTraffic {
    pub country_code: String,
    pub peer_count: u64,
    pub download_bytes: u64,
    pub upload_bytes: u64,
    pub last_seen: u64,
}

impl TorrentManager {
    pub async fn new() -> Result<Self> {
        let data_dir = crate::config::AppConfig::get_data_dir();
        std::fs::create_dir_all(&data_dir).context("Failed to create data directory")?;

        // Load config before creating session (config has download path)
        let cfg = crate::config::AppConfig::load(&data_dir);
        let download_path = cfg.effective_path(None).map(PathBuf::from).unwrap_or_else(|| data_dir.clone());

        let opts = SessionOptions {
            listen_port_range: Some(6881..6889),
            enable_upnp_port_forwarding: true,
            socks_proxy_url: cfg.socks5_proxy_url.clone(),
            disable_dht: cfg.global_disable_dht,
            fastresume: true,
            blocklist_url: cfg.blocklist_url.clone(),
            ..Default::default()
        };

        let session = Session::new_with_opts(download_path.clone(), opts).await.context(format!(
            "Failed to create librqbit Session.\nPossible causes:\n • Port range 6881-6889 is already in use\n • No write permission to {}\n • Another torrent client is already running\n\nTry closing other torrent clients or restarting the application.",
            download_path.display()
        ))?;

        let api = Api::new(session.clone(), None);
        let history = Self::load_history(&data_dir);
        Ok(Self {
            session, api,
            limits: Mutex::new(SpeedLimits::new()),
            queue: Mutex::new(QueueConfig::default()),
            forced: Mutex::new(HashSet::new()),
            sequential: Mutex::new(HashSet::new()),
            rss: Mutex::new(RssState::new()),
            config: Mutex::new(cfg),
            seed_start_times: Mutex::new(HashMap::new()),
            data_dir,
            speed_history: Mutex::new(SpeedHistory::new()),
            country_stats: Mutex::new(HashMap::new()),
            session_start: std::time::SystemTime::now(),
            history: Mutex::new(history),
            http_downloads: Mutex::new(HashMap::new()),
            http_download_tasks: Mutex::new(HashMap::new()),
            next_http_id: Mutex::new(1),
            torrent_states: Mutex::new(HashMap::new()),
        })
    }

    // ── Torrent management ────────────────────────────────────────

    /// Validate a URL to prevent SSRF attacks.
    /// Only allow magnet: links and HTTP/HTTPS/FTP URLs to public .torrent files.
    fn validate_torrent_url(url: &str) -> Result<(), String> {
        // Only allow specific schemes
        if url.starts_with("magnet:") {
            return Ok(());
        }
        // For HTTP/HTTPS URLs, verify they point to a .torrent file (not an internal service)
        if url.starts_with("http://") || url.starts_with("https://") || url.starts_with("ftp://") {
            // Parse the URL to check for SSRF indicators
            let parsed = url::Url::parse(url).map_err(|_| format!("Invalid URL: {}", url))?;
            let host = parsed.host_str().unwrap_or("");
            // Block private/reserved IP ranges to prevent SSRF
            if host == "localhost" || host == "127.0.0.1" || host == "::1"
                || host.starts_with("10.") || host.starts_with("172.16.") || host.starts_with("192.168.")
                || host == "0.0.0.0" || host.starts_with("169.254.")
            {
                return Err(format!("SSRF blocked: cannot connect to private IP range: {}", host));
            }
            // Block raw IP addresses that aren't public
            if let Some(ip) = parsed.host().and_then(|h| match h {
                url::Host::Ipv4(ip) => Some(ip),
                _ => None,
            }) {
                if ip.is_private() || ip.is_loopback() || ip.is_link_local() || ip.is_unspecified() || ip.is_multicast() {
                    return Err(format!("SSRF blocked: cannot connect to private IP: {}", ip));
                }
            }
            return Ok(());
        }
        Err(format!("Unsupported URL scheme: {}. Only magnet:, http://, https://, and ftp:// are allowed.",
            url.split(':').next().unwrap_or("unknown")))
    }

    pub async fn add_magnet(&self, magnet: &str) -> Result<u32> {
        // SSRF protection: validate the URL before passing to librqbit
        Self::validate_torrent_url(magnet)
            .map_err(|e| anyhow::anyhow!("{}", e))?;
        let id = self.add_torrent_inner(AddTorrent::from_url(magnet)).await?;
        self.enforce_queue().await;
        self.try_auto_assign(id);
        Ok(id)
    }

    pub async fn add_torrent_file(&self, path: &str) -> Result<u32> {
        let path = PathBuf::from(path);
        if !path.exists() { anyhow::bail!("File not found: {}", path.display()); }
        if path.extension().map(|e| !e.eq_ignore_ascii_case("torrent")).unwrap_or(true) {
            anyhow::bail!("Unsupported file type: '{}'. Only .torrent files are supported.", path.display());
        }
        let path_str = path.to_str().context("Path is not valid UTF-8")?;
        let add = AddTorrent::from_local_filename(path_str).context("Failed to read .torrent file")?;
        let id = self.add_torrent_inner(add).await?;
        self.enforce_queue().await;
        self.try_auto_assign(id);
        Ok(id)
    }

    async fn add_torrent_inner(&self, add: AddTorrent<'_>) -> Result<u32> {
        let resp = self.session.add_torrent(add, Some(AddTorrentOptions { overwrite: true, ..Default::default() })).await?;
        let handle = resp.into_handle().context("Failed to get torrent handle")?;
        let id: u32 = handle.id().try_into().map_err(|_| anyhow::anyhow!("Torrent ID overflow"))?;
        // Set initial state to Metadata (for magnet) or Downloading (for .torrent file)
        self.torrent_states.lock().unwrap().insert(id, TorrentState::Metadata);
        Ok(id)
    }

    pub fn get_torrent_state(&self, id: u32) -> Option<TorrentState> {
        self.torrent_states.lock().unwrap().get(&id).copied()
    }

    pub fn set_torrent_state(&self, id: u32, target: TorrentState) -> Result<(), String> {
        let mut states = self.torrent_states.lock().unwrap();
        let current = states.get(&id).copied().unwrap_or(TorrentState::Unknown);
        // First observation of a torrent: skip validation (handles fast-resume restored torrents)
        if current == TorrentState::Unknown {
            states.insert(id, target);
            return Ok(());
        }
        let new = current.transition(target)?;
        states.insert(id, new);
        Ok(())
    }

    /// Recover known torrent states from the librqbit state directory.
    pub async fn pause(&self, id: u32) -> Result<()> {
        self.forced.lock().unwrap().remove(&id);
        // Validate transition: current state → Paused
        let current = self.get_torrent_state(id).unwrap_or(TorrentState::Downloading);
        if let Err(e) = current.can_transition_to(TorrentState::Paused) {
            log::warn!("pause: {} (id={})", e, id);
        }
        self.session.pause(&self.find_handle(id)?).await?;
        // If the torrent was seeding, keep it as Seeding (librqbit remembers finished state)
        if current == TorrentState::Seeding || current == TorrentState::Downloading {
            let list = self.api.api_torrent_list_ext(ApiTorrentListOpts { with_stats: true });
            let list_val: Value = serde_json::to_value(&list).unwrap_or_default();
            let finished = list_val["torrents"].as_array().and_then(|arr| {
                arr.iter().find(|t| t["id"].as_u64() == Some(id as u64))
                    .and_then(|t| t["stats"]["finished"].as_bool())
            }).unwrap_or(false);
            if finished {
                self.set_torrent_state(id, TorrentState::Seeding).ok();
            } else {
                self.set_torrent_state(id, TorrentState::Paused).ok();
            }
        }
        Ok(())
    }

    pub async fn resume(&self, id: u32) -> Result<()> {
        self.forced.lock().unwrap().remove(&id);
        // Validate transition: current state → Downloading or Seeding
        let current = self.get_torrent_state(id).unwrap_or(TorrentState::Paused);
        let list = self.api.api_torrent_list_ext(ApiTorrentListOpts { with_stats: true });
        let list_val: Value = serde_json::to_value(&list).unwrap_or_default();
        let finished = list_val["torrents"].as_array().and_then(|arr| {
            arr.iter().find(|t| t["id"].as_u64() == Some(id as u64))
                .and_then(|t| t["stats"]["finished"].as_bool())
        }).unwrap_or(false);
        let target = if finished { TorrentState::Seeding } else { TorrentState::Downloading };
        if let Err(e) = current.can_transition_to(target) {
            log::warn!("resume: {} (id={})", e, id);
        }
        self.session.unpause(&self.find_handle(id)?).await?;
        self.set_torrent_state(id, target).ok();
        self.enforce_queue().await;
        Ok(())
    }

    pub async fn force_resume(&self, id: u32) -> Result<()> {
        self.forced.lock().unwrap().insert(id);
        let list = self.api.api_torrent_list_ext(ApiTorrentListOpts { with_stats: true });
        let list_val: Value = serde_json::to_value(&list).unwrap_or_default();
        let finished = list_val["torrents"].as_array().and_then(|arr| {
            arr.iter().find(|t| t["id"].as_u64() == Some(id as u64))
                .and_then(|t| t["stats"]["finished"].as_bool())
        }).unwrap_or(false);
        let target = if finished { TorrentState::Seeding } else { TorrentState::Downloading };
        self.set_torrent_state(id, target).ok();
        self.session.unpause(&self.find_handle(id)?).await?;
        Ok(())
    }

    pub async fn remove_force(&self, id: u32) -> Result<()> {
        self.forced.lock().unwrap().remove(&id);
        self.enforce_queue().await;
        Ok(())
    }

    /// Pause all active torrents.
    pub async fn pause_all(&self) -> Result<()> {
        let list = self.api.api_torrent_list_ext(ApiTorrentListOpts { with_stats: true });
        let list_val: Value = serde_json::to_value(&list).unwrap_or_default();
        let ids: Vec<u32> = list_val["torrents"].as_array()
            .map(|arr| arr.iter().filter_map(|t| t["id"].as_u64().map(|id| id as u32)).collect())
            .unwrap_or_default();
        for id in ids {
            if let Some(handle) = self.session.get(TorrentIdOrHash::Id(id as usize)) {
                let _ = self.session.pause(&handle).await;
            }
        }
        Ok(())
    }

    /// Resume all paused torrents.
    pub async fn resume_all(&self) -> Result<()> {
        let list = self.api.api_torrent_list_ext(ApiTorrentListOpts { with_stats: true });
        let list_val: Value = serde_json::to_value(&list).unwrap_or_default();
        let ids: Vec<u32> = list_val["torrents"].as_array()
            .map(|arr| arr.iter().filter_map(|t| {
                let paused = t["stats"]["state"].as_str() == Some("paused");
                if paused { t["id"].as_u64().map(|id| id as u32) } else { None }
            }).collect())
            .unwrap_or_default();
        for id in ids {
            if let Some(handle) = self.session.get(TorrentIdOrHash::Id(id as usize)) {
                let _ = self.session.unpause(&handle).await;
            }
        }
        Ok(())
    }

    pub async fn delete(&self, id: u32, delete_files: bool) -> Result<()> {
        // Record deletion in history before removing
        let list = self.api.api_torrent_list_ext(ApiTorrentListOpts { with_stats: true });
        let list_val: Value = serde_json::to_value(&list).unwrap_or_default();
        if let Some(t) = list_val["torrents"].as_array().and_then(|arr| arr.iter().find(|t| t["id"].as_u64() == Some(id as u64))) {
            let name = t["name"].as_str().unwrap_or("Unknown").to_string();
            let info_hash = t["info_hash"].as_str().unwrap_or("").to_string();
            let total_bytes = t["stats"]["total_bytes"].as_u64().unwrap_or(0);
            let uploaded_bytes = t["stats"]["uploaded_bytes"].as_u64().unwrap_or(0);
            let cat = self.get_torrent_category(id).and_then(|cid| {
                let cfg = self.config.lock().unwrap();
                cfg.categories.iter().find(|c| c.id == cid).map(|c| c.name.clone())
            });
            self.record_deleted(&name, &info_hash, total_bytes, uploaded_bytes, cat);
        }

        self.forced.lock().unwrap().remove(&id);
        self.torrent_states.lock().unwrap().remove(&id);
        self.session.delete(TorrentIdOrHash::Id(id as usize), delete_files).await?;
        self.enforce_queue().await;
        Ok(())
    }

    pub fn get_torrent_details(&self, id: u32) -> Result<TorrentDetailsResponse> {
        self.api.api_torrent_details(TorrentIdOrHash::Id(id as usize)).map_err(|e| anyhow::anyhow!("{}", e))
    }

    /// Get peer connections for a specific torrent.
    pub fn get_torrent_peers(&self, id: u32) -> Result<Value> {
        let idx = TorrentIdOrHash::Id(id as usize);
        let snapshot = self.api.api_peer_stats(idx, Default::default())?;
        Ok(serde_json::to_value(&snapshot)?)
    }

    /// Get tracker information for a specific torrent from the torrent details.
    pub fn get_torrent_trackers(&self, id: u32) -> Result<Value> {
        let details = self.api.api_torrent_details(TorrentIdOrHash::Id(id as usize))?;
        // Serialize to Value and extract tracker-related fields
        let val = serde_json::to_value(&details)?;
        // Try to get trackers array, or return whatever is available
        let trackers = val.get("trackers").cloned()
            .or_else(|| val.get("tracker_urls").cloned())
            .or_else(|| val.get("announce_list").cloned())
            .or_else(|| val.get("announce").map(|a| serde_json::json!([a])))
            .unwrap_or(serde_json::json!([]));
        Ok(trackers)
    }

    pub async fn update_only_files(&self, id: u32, only_files: Vec<usize>) -> Result<()> {
        let set: HashSet<usize> = only_files.into_iter().collect();
        self.session.update_only_files(&self.find_handle(id)?, &set).await.context("Failed to update file selection")?;
        Ok(())
    }

    // ── Queue management ──────────────────────────────────────────

    pub fn forced_snapshot(&self) -> HashSet<u32> { self.forced.lock().unwrap().clone() }

    pub fn sequential_snapshot(&self) -> HashSet<u32> { self.sequential.lock().unwrap().clone() }

    // ── Sequential download ───────────────────────────────────────

    pub fn set_sequential_download(&self, id: u32, enabled: bool) {
        let mut seq = self.sequential.lock().unwrap();
        if enabled {
            seq.insert(id);
        } else {
            seq.remove(&id);
        }
    }

    #[allow(dead_code)]
    pub fn toggle_sequential_download(&self, id: u32) -> bool {
        let mut seq = self.sequential.lock().unwrap();
        if seq.contains(&id) {
            seq.remove(&id);
            false
        } else {
            seq.insert(id);
            true
        }
    }

    #[allow(dead_code)]
    pub fn is_sequential(&self, id: u32) -> bool {
        self.sequential.lock().unwrap().contains(&id)
    }

    pub async fn enforce_queue(&self) {
        let list = self.api.api_torrent_list_ext(ApiTorrentListOpts { with_stats: true });
        let list_val: Value = serde_json::to_value(&list).unwrap_or_default();
        let raw_torrents: Vec<Value> = list_val["torrents"].as_array().cloned().unwrap_or_default();
        let config = self.queue.lock().unwrap().clone();
        let forced = self.forced.lock().unwrap().clone();

        let mut dl_ids: Vec<u32> = Vec::new();
        let mut seed_ids: Vec<u32> = Vec::new();
        for t in &raw_torrents {
            let id = t["id"].as_u64().unwrap_or(0) as u32;
            if forced.contains(&id) { continue; }
            let stats = t.get("stats");
            let raw_state = stats.and_then(|s| s["state"].as_str()).unwrap_or("unknown");
            let finished = stats.and_then(|s| s["finished"].as_bool()).unwrap_or(false);
            match (raw_state, finished) { ("live", false) => dl_ids.push(id), ("live", true) => seed_ids.push(id), _ => {} }
        }

        let max_dl = config.max_active_downloads as usize;
        if dl_ids.len() > max_dl {
            for id in dl_ids.iter().skip(max_dl) {
                if let Some(handle) = self.session.get(TorrentIdOrHash::Id(*id as usize)) { let _ = self.session.pause(&handle).await; }
            }
        }
        let max_seed = config.max_active_seeds as usize;
        if seed_ids.len() > max_seed {
            for id in seed_ids.iter().skip(max_seed) {
                if let Some(handle) = self.session.get(TorrentIdOrHash::Id(*id as usize)) { let _ = self.session.pause(&handle).await; }
            }
        }
    }

    pub fn set_queue_config(&self, max_dl: u32, max_seed: u32) {
        let mut q = self.queue.lock().unwrap();
        q.max_active_downloads = max_dl; q.max_active_seeds = max_seed;
    }

    pub fn get_queue_config(&self) -> QueueConfig { self.queue.lock().unwrap().clone() }

    // ── Speed limits ──────────────────────────────────────────────

    fn apply_limits(&self) {
        let mut limits = self.limits.lock().unwrap();
        let (dl, ul) = if limits.turtle_mode {
            (limits.turtle_download, limits.turtle_upload)
        } else if limits.schedule_active && limits.schedule_enabled {
            let now = Local::now();
            let wd = now.format("%u").to_string().parse::<u8>().unwrap_or(0);
            let h = now.hour() as u8; let m = now.minute() as u8;
            let active = limits.schedule_rules.iter().find(|r| r.matches(wd, h, m));
            match active {
                Some(r) => (r.download_limit, r.upload_limit),
                None => { limits.schedule_active = false; limits.normal_download = limits.saved_normal_download; limits.normal_upload = limits.saved_normal_upload; (limits.normal_download, limits.normal_upload) }
            }
        } else { (limits.normal_download, limits.normal_upload) };
        drop(limits);
        self.session.ratelimits.set_download_bps(dl.map(NonZeroU32::new).flatten());
        self.session.ratelimits.set_upload_bps(ul.map(NonZeroU32::new).flatten());
    }

    pub fn set_normal_download_limit(&self, bps: Option<u32>) { let mut l = self.limits.lock().unwrap(); l.normal_download = bps; l.saved_normal_download = bps; drop(l); self.apply_limits(); }
    pub fn set_normal_upload_limit(&self, bps: Option<u32>) { let mut l = self.limits.lock().unwrap(); l.normal_upload = bps; l.saved_normal_upload = bps; drop(l); self.apply_limits(); }
    pub fn set_turtle_download_limit(&self, bps: Option<u32>) { self.limits.lock().unwrap().turtle_download = bps; self.apply_limits(); }
    pub fn set_turtle_upload_limit(&self, bps: Option<u32>) { self.limits.lock().unwrap().turtle_upload = bps; self.apply_limits(); }
    pub fn set_turtle_mode(&self, enabled: bool) { self.limits.lock().unwrap().turtle_mode = enabled; self.apply_limits(); }

    pub fn check_schedule(&self) {
        let mut limits = self.limits.lock().unwrap();
        if !limits.schedule_enabled || limits.schedule_rules.is_empty() {
            if limits.schedule_active { limits.schedule_active = false; limits.normal_download = limits.saved_normal_download; limits.normal_upload = limits.saved_normal_upload; }
            drop(limits); self.apply_limits(); return;
        }
        let now = Local::now();
        let wd = now.format("%u").to_string().parse::<u8>().unwrap_or(0);
        let h = now.hour() as u8; let m = now.minute() as u8;
        let active = limits.schedule_rules.iter().find(|r| r.matches(wd, h, m));
        if active.is_some() && !limits.schedule_active { limits.saved_normal_download = limits.normal_download; limits.saved_normal_upload = limits.normal_upload; limits.schedule_active = true; }
        else if active.is_none() && limits.schedule_active { limits.schedule_active = false; limits.normal_download = limits.saved_normal_download; limits.normal_upload = limits.saved_normal_upload; }
        drop(limits); self.apply_limits();
    }

    pub fn set_schedule_rules(&self, rules: Vec<ScheduleRule>, enabled: bool) {
        let mut limits = self.limits.lock().unwrap();
        limits.schedule_rules = rules; limits.schedule_enabled = enabled;
        drop(limits); self.check_schedule();
    }

    pub fn get_schedule_rules(&self) -> (Vec<ScheduleRule>, bool, bool) {
        let limits = self.limits.lock().unwrap();
        (limits.schedule_rules.clone(), limits.schedule_enabled, limits.schedule_active)
    }

    // ── RSS management ────────────────────────────────────────────

    pub fn add_rss_feed(&self, name: String, url: String) -> RssFeed {
        let mut rss = self.rss.lock().unwrap();
        let feed = RssFeed { id: rss.next_feed_id, name, url, interval_secs: 1800, filters: vec![] };
        rss.next_feed_id += 1; rss.feeds.push(feed.clone()); feed
    }

    pub fn remove_rss_feed(&self, id: u32) { self.rss.lock().unwrap().feeds.retain(|f| f.id != id); }
    pub fn get_rss_feeds(&self) -> Vec<RssFeed> { self.rss.lock().unwrap().feeds.clone() }

    pub fn update_rss_feed(&self, id: u32, name: String, url: String, interval_secs: u64) {
        let mut rss = self.rss.lock().unwrap();
        if let Some(feed) = rss.feeds.iter_mut().find(|f| f.id == id) {
            feed.name = name; feed.url = url; feed.interval_secs = interval_secs;
        }
    }

    pub fn add_rss_filter(&self, feed_id: u32, name_regex: String, min_size: Option<u64>, max_size: Option<u64>, add_torrent: bool) -> Option<RssFilter> {
        let mut rss = self.rss.lock().unwrap();
        let fid = rss.next_filter_id; rss.next_filter_id += 1;
        let filter = RssFilter { id: fid, name_regex, min_size, max_size, add_torrent };
        rss.feeds.iter_mut().find(|f| f.id == feed_id)?.filters.push(filter.clone());
        Some(filter)
    }

    pub fn remove_rss_filter(&self, feed_id: u32, filter_id: u32) {
        let mut rss = self.rss.lock().unwrap();
        if let Some(feed) = rss.feeds.iter_mut().find(|f| f.id == feed_id) { feed.filters.retain(|f| f.id != filter_id); }
    }

    pub async fn poll_rss_feeds(&self) -> Vec<(u32, Vec<RssItem>)> {
        let (feeds, seen_links) = { let r = self.rss.lock().unwrap(); (r.feeds.clone(), r.seen_links.clone()) };
        let mut results = Vec::new();
        let mut new_seen = HashSet::new();

        for feed in &feeds {
            let items = match self.fetch_rss_feed(&feed.url).await {
                Ok(items) => items,
                Err(e) => { log::warn!("RSS fetch failed for '{}': {}", feed.name, e); continue; }
            };

            let mut new_items = Vec::new();
            for item in &items {
                if !seen_links.contains(&item.link) && !new_seen.contains(&item.link) {
                    new_seen.insert(item.link.clone()); new_items.push(item.clone());
                }
            }

            if !new_items.is_empty() {
                for item in &new_items { self.check_rss_filters(feed, item).await; }
                results.push((feed.id, new_items));
            }
        }

        if !new_seen.is_empty() {
            let mut rss = self.rss.lock().unwrap();
            rss.seen_links.extend(new_seen);
            // Cap seen_links at 10,000 entries to prevent memory leak
            if rss.seen_links.len() > 10_000 {
                let to_keep: HashSet<String> = rss.seen_links.iter().skip(rss.seen_links.len() - 10_000).cloned().collect();
                rss.seen_links = to_keep;
            }
        }
        results
    }

    async fn fetch_rss_feed(&self, url: &str) -> Result<Vec<RssItem>> {
        let client = rss_http_client();
        let resp = client.get(url).send().await?;
        let bytes = resp.bytes().await?;
        let channel = rss::Channel::read_from(&bytes[..])?;

        let items = channel.items().iter().filter_map(|item| {
            let title = item.title()?.to_string();
            let link = item.link()?.to_string();

            // Try enclosures first (standard RSS way), then content text, then description regex
            let size = item.enclosure()
                .map(|e| e.length())
                .and_then(|l| l.parse::<u64>().ok())
                .or_else(|| item.content().and_then(|c| c.parse::<u64>().ok()))
                .or_else(|| {
                    item.description().and_then(|desc| {
                        let re = regex::Regex::new(r"(?i)(\d+(?:\.\d+)?)\s*(KB|MB|GB|TB)").ok()?;
                        let caps = re.captures(desc)?;
                        let val: f64 = caps.get(1)?.as_str().parse().ok()?;
                        let multiplier = match caps.get(2)?.as_str().to_uppercase().as_str() {
                            "KB" => 1024.0, "MB" => 1024.0 * 1024.0,
                            "GB" => 1024.0 * 1024.0 * 1024.0,
                            "TB" => 1024.0 * 1024.0 * 1024.0 * 1024.0,
                            _ => return None,
                        };
                        Some((val * multiplier) as u64)
                    })
                });

            let pub_date = item.pub_date().map(|s| s.to_string());
            Some(RssItem { title, link, size, pub_date })
        }).collect();

        Ok(items)
    }

    async fn check_rss_filters(&self, feed: &RssFeed, item: &RssItem) {
        for filter in &feed.filters {
            if !filter.name_regex.is_empty() {
                let re = match regex::Regex::new(&filter.name_regex) { Ok(r) => r, Err(_) => continue, };
                if !re.is_match(&item.title) { continue; }
            }
            if let Some(min) = filter.min_size { if item.size.map_or(true, |s| s < min) { continue; } }
            if let Some(max) = filter.max_size { if item.size.map_or(false, |s| s > max) { continue; } }
            if filter.add_torrent {
                // Use add_magnet for all links — librqbit's from_url handles magnets AND HTTP .torrent URLs
                let _ = self.add_magnet(&item.link).await;
            }
        }
    }

    // ── Config / Categories / Tags ──────────────────────────────

    fn save_config(&self) {
        let cfg = self.config.lock().unwrap().clone();
        let data_dir = self.data_dir.clone();
        if let Err(e) = cfg.save(&data_dir) {
            log::warn!("Failed to save config: {}", e);
        }
    }

    pub fn get_categories(&self) -> Vec<crate::config::Category> {
        self.config.lock().unwrap().categories.clone()
    }

    pub fn add_category(&self, name: String, icon: String, save_path: Option<String>, auto_rule: Option<String>) -> crate::config::Category {
        let mut cfg = self.config.lock().unwrap();
        let cat = crate::config::Category { id: cfg.next_category_id, name, icon, save_path, auto_rule };
        cfg.next_category_id += 1;
        cfg.categories.push(cat.clone());
        drop(cfg);
        self.save_config();
        cat
    }

    pub fn remove_category(&self, id: u32) {
        self.config.lock().unwrap().categories.retain(|c| c.id != id);
        self.save_config();
    }

    pub fn update_category(&self, id: u32, name: String, icon: String, save_path: Option<String>, auto_rule: Option<String>) {
        let mut cfg = self.config.lock().unwrap();
        if let Some(cat) = cfg.categories.iter_mut().find(|c| c.id == id) {
            cat.name = name; cat.icon = icon; cat.save_path = save_path; cat.auto_rule = auto_rule;
        }
        drop(cfg);
        self.save_config();
    }

    pub fn get_tags(&self) -> Vec<crate::config::Tag> {
        self.config.lock().unwrap().tags.clone()
    }

    pub fn add_tag(&self, name: String, color: String, auto_rule: Option<String>) -> crate::config::Tag {
        let mut cfg = self.config.lock().unwrap();
        let tag = crate::config::Tag { id: cfg.next_tag_id, name, color, auto_rule };
        cfg.next_tag_id += 1;
        cfg.tags.push(tag.clone());
        drop(cfg);
        self.save_config();
        tag
    }

    pub fn remove_tag(&self, id: u32) {
        self.config.lock().unwrap().tags.retain(|t| t.id != id);
        self.save_config();
    }

    pub fn get_global_download_path(&self) -> Option<String> {
        self.config.lock().unwrap().global_download_path.clone()
    }

    pub fn set_global_download_path(&self, path: Option<String>) {
        self.config.lock().unwrap().global_download_path = path;
        self.save_config();
    }

    pub fn is_default_client_offered(&self) -> bool {
        self.config.lock().unwrap().default_client_offered
    }

    pub fn set_default_client_offered(&self) {
        self.config.lock().unwrap().default_client_offered = true;
        self.save_config();
    }

    // ── SOCKS5 Proxy ────────────────────────────────────────────

    pub fn get_socks5_proxy(&self) -> Option<String> {
        self.config.lock().unwrap().socks5_proxy_url.clone()
    }

    // ── Blocklist ────────────────────────────────────────────────

    pub fn get_blocklist_url(&self) -> Option<String> {
        self.config.lock().unwrap().blocklist_url.clone()
    }

    pub fn set_blocklist_url(&self, url: Option<String>) {
        self.config.lock().unwrap().blocklist_url = url;
        self.save_config();
    }

    pub fn set_socks5_proxy(&self, url: Option<String>) {
        self.config.lock().unwrap().socks5_proxy_url = url;
        self.save_config();
    }

    /// Test a SOCKS5 proxy connection by making a simple HTTP request through it.
    pub async fn test_socks5_proxy(url: &str) -> Result<String, String> {
        let proxy = reqwest::Proxy::all(url).map_err(|e| format!("Invalid proxy URL: {}", e))?;
        let client = reqwest::Client::builder()
            .proxy(proxy)
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .map_err(|e| format!("Failed to create test client: {}", e))?;

        // Try to reach a reliable external service
        let resp = client.get("https://httpbin.org/ip")
            .send()
            .await
            .map_err(|e| format!("Connection failed: {}", e))?;

        if resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            Ok(format!("Proxy connected! Response: {}", body))
        } else {
            Err(format!("Proxy test returned HTTP {}", resp.status()))
        }
    }

    pub fn get_full_config(&self) -> crate::config::AppConfig {
        self.config.lock().unwrap().clone()
    }

    pub fn set_torrent_category(&self, torrent_id: u32, category_id: Option<u32>) {
        let mut cfg = self.config.lock().unwrap();
        if let Some(cid) = category_id {
            cfg.torrent_categories.insert(torrent_id, cid);
        } else {
            cfg.torrent_categories.remove(&torrent_id);
        }
        drop(cfg);
        self.save_config();
    }

    pub fn get_torrent_category(&self, torrent_id: u32) -> Option<u32> {
        self.config.lock().unwrap().torrent_categories.get(&torrent_id).copied()
    }

    pub fn set_torrent_tags(&self, torrent_id: u32, tag_ids: Vec<u32>) {
        let mut cfg = self.config.lock().unwrap();
        cfg.torrent_tags.insert(torrent_id, tag_ids);
        drop(cfg);
        self.save_config();
    }

    pub fn get_torrent_tags(&self, torrent_id: u32) -> Vec<u32> {
        self.config.lock().unwrap().torrent_tags.get(&torrent_id).cloned().unwrap_or_default()
    }

    /// Try to read the torrent name from the API and auto-assign.
    fn try_auto_assign(&self, id: u32) {
        let list = self.api.api_torrent_list_ext(ApiTorrentListOpts { with_stats: true });
        let list_val: Value = serde_json::to_value(&list).unwrap_or_default();
        let name = list_val["torrents"].as_array().and_then(|arr| {
            arr.iter().find(|t| t["id"].as_u64() == Some(id as u64))
                .and_then(|t| t["name"].as_str().map(String::from))
        });
        if let Some(ref n) = name {
            self.auto_assign(id, n);
        }
    }

    /// Auto-assign category and tags based on torrent name during add.
    pub fn auto_assign(&self, id: u32, name: &str) {
        let mut cfg = self.config.lock().unwrap();
        let (cat_id, tag_ids) = cfg.auto_assign(name);
        if let Some(cid) = cat_id {
            cfg.torrent_categories.insert(id, cid);
        }
        if !tag_ids.is_empty() {
            cfg.torrent_tags.insert(id, tag_ids);
        }
        drop(cfg);
        self.save_config();
    }

    // ── Auto-management ───────────────────────────────────────────

    pub fn get_auto_management_config(&self) -> crate::config::AutoManagementConfig {
        self.config.lock().unwrap().auto_management.clone()
    }

    pub fn set_auto_management_config(&self, cfg: crate::config::AutoManagementConfig) {
        self.config.lock().unwrap().auto_management = cfg;
        self.save_config();
    }

    /// Check all seeding torrents and apply auto-management rules.
    pub async fn auto_manage(&self) {
        let am = self.config.lock().unwrap().auto_management.clone();
        if !am.enabled { return; }

        let list = self.api.api_torrent_list_ext(ApiTorrentListOpts { with_stats: true });
        let list_val: Value = serde_json::to_value(&list).unwrap_or_default();
        let raw_torrents: Vec<Value> = list_val["torrents"].as_array().cloned().unwrap_or_default();
        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);

        // Track seed start times: when a torrent first appears as "finished", record the time
        {
            let mut starts = self.seed_start_times.lock().unwrap();
            for t in &raw_torrents {
                let id = t["id"].as_u64().unwrap_or(0) as u32;
                let stats = t.get("stats");
                let finished = stats.and_then(|s| s["finished"].as_bool()).unwrap_or(false);
                if finished && !starts.contains_key(&id) {
                    starts.insert(id, now);
                }
            }
        }

        for t in &raw_torrents {
            let id = t["id"].as_u64().unwrap_or(0) as u32;
            if self.forced.lock().unwrap().contains(&id) { continue; }
            let stats = t.get("stats");
            let finished = stats.and_then(|s| s["finished"].as_bool()).unwrap_or(false);
            if !finished { continue; }

            let total = stats.and_then(|s| s["total_bytes"].as_u64()).unwrap_or(0);
            let uploaded = stats.and_then(|s| s["uploaded_bytes"].as_u64()).unwrap_or(0);
            let ratio = if total > 0 { uploaded as f64 / total as f64 } else { 0.0 };

            // Check ratio limit
            if am.ratio_limit > 0.0 && ratio < am.ratio_limit { continue; }

            // Check seed time limit
            if am.seed_time_limit_minutes > 0 {
                let seed_time_secs = am.seed_time_limit_minutes as u64 * 60;
                let elapsed = self.seed_start_times.lock().unwrap().get(&id).copied().map(|start| now.saturating_sub(start)).unwrap_or(0);
                if elapsed < seed_time_secs { continue; }
            }

            // Apply actions
            if am.remove_from_queue {
                let keep_files = !am.move_on_complete;
                let _ = self.delete(id, keep_files).await;
            } else if am.move_on_complete {
                // Use std::fs to move completed files to category folder
                let cat_id = self.get_torrent_category(id);
                let cat_path = self.config.lock().unwrap().effective_path(cat_id);
                if let Some(dest) = cat_path {
                    // Get the torrent's current download path
                    let name = t["name"].as_str().unwrap_or("unknown");
                    let current_path = {
                        let cfg = self.config.lock().unwrap();
                        PathBuf::from(cfg.effective_path(None).unwrap_or_else(|| self.data_dir.to_string_lossy().to_string()))
                    };
                    let dest_path = PathBuf::from(&dest).join(name);
                    if current_path != dest_path.parent().map(|p| p.to_path_buf()).unwrap_or_default() {
                        // Attempt to move files using filesystem operations
                        let src = current_path.join(name);
                        if src.exists() {
                            let _ = std::fs::create_dir_all(&dest_path);
                            if let Ok(entries) = std::fs::read_dir(&src) {
                                for entry in entries.flatten() {
                                    let file_name = entry.file_name();
                                    let _ = std::fs::rename(entry.path(), dest_path.join(&file_name));
                                }
                            }
                            // Delete the now-empty source directory
                            let _ = std::fs::remove_dir(&src);
                        }
                    }
                }
                let _ = self.pause(id).await;
            }
        }
    }

    // ── Re-check ─────────────────────────────────────────────────

    pub async fn re_check(&self, id: u32) -> Result<()> {
        // librqbit doesn't expose a public force_recheck API on ManagedTorrent or Session.
        // As a workaround, we pause and unpause the torrent which triggers librqbit to
        // re-verify file integrity on resume.
        let handle = self.find_handle(id)?;
        self.session.pause(&handle).await?;
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        self.session.unpause(&handle).await?;
        Ok(())
    }

    // ── Torrent history ─────────────────────────────────────────

    fn load_history(data_dir: &std::path::Path) -> Vec<TorrentHistoryEntry> {
        let path = data_dir.join("history.json");
        if path.exists() {
            match std::fs::read_to_string(&path) {
                Ok(content) => {
                    match serde_json::from_str(&content) {
                        Ok(h) => return h,
                        Err(e) => log::warn!("Failed to parse history.json: {}", e),
                    }
                }
                Err(e) => log::warn!("Failed to read history.json: {}", e),
            }
        }
        vec![]
    }

    fn save_history(&self) {
        let history = self.history.lock().unwrap().clone();
        let path = self.data_dir.join("history.json");
        if let Ok(content) = serde_json::to_string_pretty(&history) {
            let _ = std::fs::write(&path, content);
        }
    }

    /// Record a completed download in history.
    pub fn record_completed(&self, name: &str, info_hash: &str, total_bytes: u64, uploaded_bytes: u64, category_name: Option<String>, completed_at: u64) {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let mut history = self.history.lock().unwrap();
        // Don't record duplicates (same info_hash + completed event)
        if history.iter().any(|e| e.info_hash == info_hash && e.event == "completed") {
            return;
        }
        history.push(TorrentHistoryEntry {
            name: name.to_string(),
            info_hash: info_hash.to_string(),
            total_bytes,
            uploaded_bytes,
            event: "completed".to_string(),
            timestamp: now,
            category_name,
            completed_at: Some(completed_at),
        });
        // Cap history at 500 entries
        if history.len() > 500 {
            let excess = history.len() - 500;
            history.drain(0..excess);
        }
        drop(history);
        self.save_history();
    }

    /// Record a deleted torrent in history.
    pub fn record_deleted(&self, name: &str, info_hash: &str, total_bytes: u64, uploaded_bytes: u64, category_name: Option<String>) {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let mut history = self.history.lock().unwrap();
        history.push(TorrentHistoryEntry {
            name: name.to_string(),
            info_hash: info_hash.to_string(),
            total_bytes,
            uploaded_bytes,
            event: "deleted".to_string(),
            timestamp: now,
            category_name,
            completed_at: None,
        });
        if history.len() > 500 {
            let excess = history.len() - 500;
            history.drain(0..excess);
        }
        drop(history);
        self.save_history();
    }

    pub fn get_history(&self) -> Vec<TorrentHistoryEntry> {
        let history = self.history.lock().unwrap();
        let mut h = history.clone();
        h.reverse(); // Most recent first
        h
    }

    // ── HTTP/FTP direct downloads ─────────────────────────────────

    /// Start downloading a file from an HTTP or FTP URL.
    /// Returns the download ID. The actual download runs in a background task.
    pub fn add_http_download(&self, url: &str, download_dir: &std::path::Path) -> u32 {
        let id = {
            let mut next = self.next_http_id.lock().unwrap();
            let id = *next;
            *next += 1;
            id
        };

        // Extract filename from URL — use url::Url to strip query params
        let file_name = url::Url::parse(url)
            .ok()
            .and_then(|u| {
                u.path_segments()
                    .and_then(|s| s.last().filter(|s| !s.is_empty()))
                    .map(|s| s.to_string())
            })
            .unwrap_or_else(|| "download".to_string());
        let save_path = download_dir.join(&file_name);
        let save_path_str = save_path.to_string_lossy().to_string();
        let url_owned = url.to_string();

        // If file already exists, append a numeric suffix
        let final_save_path = if save_path.exists() {
            let stem = save_path.file_stem().unwrap_or_default().to_string_lossy().to_string();
            let ext = save_path.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
            let parent = save_path.parent().unwrap_or(std::path::Path::new("."));
            let mut counter = 1;
            loop {
                let candidate = parent.join(format!("{}({}){}", stem, counter, ext));
                if !candidate.exists() {
                    break candidate.to_string_lossy().to_string();
                }
                counter += 1;
            }
        } else {
            save_path_str.clone()
        };

        // Register the download
        {
            let mut downloads = self.http_downloads.lock().unwrap();
            downloads.insert(id, HttpDownload {
                id,
                url: url_owned.clone(),
                file_name: if final_save_path != save_path_str {
                    // Use the actual filename including the (N) suffix
                    std::path::Path::new(&final_save_path)
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string()
                } else {
                    file_name.clone()
                },
                save_path: final_save_path.clone(),
                total_bytes: 0,
                downloaded_bytes: 0,
                speed: 0,
                status: "downloading".to_string(),
                error_msg: None,
            });
        }

        id
    }

    /// Update an HTTP download's progress (called from the download task).
    pub fn update_http_progress(&self, id: u32, downloaded_bytes: u64, total_bytes: u64, speed: u64) {
        let mut downloads = self.http_downloads.lock().unwrap();
        if let Some(dl) = downloads.get_mut(&id) {
            dl.downloaded_bytes = downloaded_bytes;
            dl.total_bytes = total_bytes;
            dl.speed = speed;
        }
    }

    /// Mark an HTTP download as completed.
    pub fn complete_http_download(&self, id: u32, final_bytes: u64) {
        let mut downloads = self.http_downloads.lock().unwrap();
        if let Some(dl) = downloads.get_mut(&id) {
            dl.downloaded_bytes = final_bytes;
            dl.total_bytes = dl.total_bytes.max(final_bytes);
            dl.speed = 0;
            dl.status = "completed".to_string();
        }
    }

    /// Mark an HTTP download as errored.
    pub fn error_http_download(&self, id: u32, error_msg: String) {
        let mut downloads = self.http_downloads.lock().unwrap();
        if let Some(dl) = downloads.get_mut(&id) {
            dl.status = "error".to_string();
            dl.error_msg = Some(error_msg);
        }
    }

    /// Cancel an active HTTP/FTP download and abort the background task.
    pub fn cancel_http_download(&self, id: u32) {
        // Single lock acquisition to avoid TOCTOU race with the background task
        let mut downloads = self.http_downloads.lock().unwrap();
        let entry = downloads.remove(&id);
        let (save_path, was_completed) = match entry {
            Some(dl) => (Some(dl.save_path.clone()), dl.status == "completed"),
            None => (None, false),
        };
        drop(downloads);

        if let Some(handle) = self.http_download_tasks.lock().unwrap().remove(&id) {
            handle.abort();
        }

        // Only delete the file if the download wasn't already completed
        if let Some(path) = save_path {
            if !was_completed {
                let p = std::path::Path::new(&path);
                if p.exists() {
                    let _ = std::fs::remove_file(p);
                }
            }
        }
    }

    /// Store the JoinHandle for a running HTTP download task.
    pub fn register_http_task(&self, id: u32, handle: crate::JoinHandle) {
        self.http_download_tasks.lock().unwrap().insert(id, handle);
    }

    /// Remove the JoinHandle for a completed/errored HTTP download (called from the task).
    pub fn remove_http_task(&self, id: u32) {
        self.http_download_tasks.lock().unwrap().remove(&id);
    }

    /// Collect HTTP downloads as synthetic torrent entries for the frontend.
    pub fn http_downloads_as_torrents(&self) -> Vec<Value> {
        let downloads = self.http_downloads.lock().unwrap();
        downloads.values().map(|dl| {

            let state = match dl.status.as_str() {
                "completed" => "seeding",
                "error" => "error",
                _ => "downloading",
            };

            serde_json::json!({
                "id": dl.id,
                "name": dl.file_name,
                "info_hash": format!("http_{}", dl.id),
                "forced": false,
                "stats": {
                    "state": state,
                    "total_bytes": dl.total_bytes,
                    "progress_bytes": dl.downloaded_bytes,
                    "uploaded_bytes": 0u64,
                    "finished": dl.status == "completed",
                    "error": if dl.status == "error" { dl.error_msg.clone() } else { None },
                    "peers": 0u64,
                    "seeds": 0u64,
                    "live": {
                        "download_speed": dl.speed,
                        "upload_speed": 0u64,
                        "time_remaining": Value::Null,
                    }
                }
            })
        }).collect()
    }

    // ── Network Bind Address ────────────────────────────────────

    pub fn get_bind_address(&self) -> Option<String> {
        self.config.lock().unwrap().bind_address.clone()
    }

    pub fn set_bind_address(&self, addr: Option<String>) {
        self.config.lock().unwrap().bind_address = addr;
        self.save_config();
    }

    // ── uTP settings ────────────────────────────────────────────

    pub fn get_global_utp_enabled(&self) -> Option<bool> {
        self.config.lock().unwrap().global_utp_enabled
    }

    pub fn set_global_utp_enabled(&self, enabled: Option<bool>) {
        self.config.lock().unwrap().global_utp_enabled = enabled;
        self.save_config();
    }

    pub fn get_torrent_utp(&self, id: u32) -> Option<bool> {
        self.config.lock().unwrap().per_torrent_utp.get(&id).copied()
    }

    pub fn set_torrent_utp(&self, id: u32, enabled: Option<bool>) {
        let mut cfg = self.config.lock().unwrap();
        if let Some(val) = enabled {
            cfg.per_torrent_utp.insert(id, val);
        } else {
            cfg.per_torrent_utp.remove(&id);
        }
        drop(cfg);
        self.save_config();
    }

    // ── DHT / PEX / LPD settings ────────────────────────────────

    pub fn get_global_disable_dht(&self) -> bool {
        self.config.lock().unwrap().global_disable_dht
    }

    pub fn set_global_disable_dht(&self, disabled: bool) {
        self.config.lock().unwrap().global_disable_dht = disabled;
        self.save_config();
    }

    pub fn get_global_disable_pex(&self) -> bool {
        self.config.lock().unwrap().global_disable_pex
    }

    pub fn set_global_disable_pex(&self, disabled: bool) {
        self.config.lock().unwrap().global_disable_pex = disabled;
        self.save_config();
    }

    pub fn get_global_disable_lpd(&self) -> bool {
        self.config.lock().unwrap().global_disable_lpd
    }

    pub fn set_global_disable_lpd(&self, disabled: bool) {
        self.config.lock().unwrap().global_disable_lpd = disabled;
        self.save_config();
    }

    pub fn get_torrent_dht(&self, id: u32) -> Option<bool> {
        self.config.lock().unwrap().per_torrent_dht.get(&id).copied()
    }

    pub fn set_torrent_dht(&self, id: u32, disabled: Option<bool>) {
        let mut cfg = self.config.lock().unwrap();
        if let Some(val) = disabled {
            cfg.per_torrent_dht.insert(id, val);
        } else {
            cfg.per_torrent_dht.remove(&id);
        }
        drop(cfg);
        self.save_config();
    }

    pub fn get_torrent_pex(&self, id: u32) -> Option<bool> {
        self.config.lock().unwrap().per_torrent_pex.get(&id).copied()
    }

    pub fn set_torrent_pex(&self, id: u32, disabled: Option<bool>) {
        let mut cfg = self.config.lock().unwrap();
        if let Some(val) = disabled {
            cfg.per_torrent_pex.insert(id, val);
        } else {
            cfg.per_torrent_pex.remove(&id);
        }
        drop(cfg);
        self.save_config();
    }

    pub fn get_torrent_lpd(&self, id: u32) -> Option<bool> {
        self.config.lock().unwrap().per_torrent_lpd.get(&id).copied()
    }

    pub fn set_torrent_lpd(&self, id: u32, disabled: Option<bool>) {
        let mut cfg = self.config.lock().unwrap();
        if let Some(val) = disabled {
            cfg.per_torrent_lpd.insert(id, val);
        } else {
            cfg.per_torrent_lpd.remove(&id);
        }
        drop(cfg);
        self.save_config();
    }

    /// List available local network interfaces with their IPs (excluding loopback).
    pub fn list_network_interfaces() -> Vec<(String, String)> {
        let mut result = Vec::new();
        if let Ok(ifaces) = if_addrs::get_if_addrs() {
            for iface in &ifaces {
                let ip = iface.ip();
                if !ip.is_loopback() {
                    result.push((iface.name.clone(), ip.to_string()));
                }
            }
        }
        result
    }

    // ── Encryption mode ───────────────────────────────────────────

    pub fn get_encryption_mode(&self) -> String {
        self.config.lock().unwrap().encryption_mode.clone()
    }

    pub fn set_encryption_mode(&self, mode: String) {
        if mode != "forced" && mode != "enabled" && mode != "disabled" {
            log::warn!("Invalid encryption mode: {}. Defaulting to 'enabled'.", mode);
            return;
        }
        self.config.lock().unwrap().encryption_mode = mode;
        self.save_config();
    }

    pub fn get_torrent_encryption(&self, id: u32) -> Option<String> {
        self.config.lock().unwrap().per_torrent_encryption.get(&id).cloned()
    }

    pub fn set_torrent_encryption(&self, id: u32, mode: Option<String>) {
        let mut cfg = self.config.lock().unwrap();
        if let Some(m) = mode {
            if m == "forced" || m == "enabled" || m == "disabled" {
                cfg.per_torrent_encryption.insert(id, m);
            }
        } else {
            cfg.per_torrent_encryption.remove(&id);
        }
        drop(cfg);
        self.save_config();
    }

    // ── Portfolios ────────────────────────────────────────────────

    pub fn get_portfolios(&self) -> Vec<crate::config::Portfolio> {
        self.config.lock().unwrap().portfolios.clone()
    }

    pub fn add_portfolio(&self, name: String, icon: String, filter: String) -> crate::config::Portfolio {
        let mut cfg = self.config.lock().unwrap();
        let id = cfg.next_portfolio_id();
        let portfolio = crate::config::Portfolio { id, name, icon, filter };
        cfg.portfolios.push(portfolio.clone());
        drop(cfg);
        self.save_config();
        portfolio
    }

    pub fn update_portfolio(&self, id: u32, name: String, icon: String, filter: String) {
        let mut cfg = self.config.lock().unwrap();
        if let Some(p) = cfg.portfolios.iter_mut().find(|p| p.id == id) {
            p.name = name;
            p.icon = icon;
            p.filter = filter;
        }
        drop(cfg);
        self.save_config();
    }

    pub fn remove_portfolio(&self, id: u32) {
        self.config.lock().unwrap().portfolios.retain(|p| p.id != id);
        self.save_config();
    }

    // ── Dead code ────────────────────────────────────────────────

    #[allow(dead_code)]
    pub async fn add_torrent_with_limits(&self, url: &str, dl_limit: Option<u32>, ul_limit: Option<u32>) -> Result<u32> {
        let opts = Some(AddTorrentOptions {
            overwrite: true,
            ratelimits: LimitsConfig { download_bps: dl_limit.and_then(NonZeroU32::new), upload_bps: ul_limit.and_then(NonZeroU32::new) },
            ..Default::default()
        });
        let resp = self.session.add_torrent(AddTorrent::from_url(url), opts).await?;
        let handle = resp.into_handle().context("Failed to get torrent handle")?;
        Ok(handle.id().try_into().map_err(|_| anyhow::anyhow!("Torrent ID overflow"))?)
    }

    fn find_handle(&self, id: u32) -> Result<Arc<ManagedTorrent>> {
        self.session.get(TorrentIdOrHash::Id(id as usize)).context("Torrent not found")
    }
}

pub struct ManagerHandle {
    inner: std::sync::OnceLock<Result<Arc<TorrentManager>, String>>,
}

impl ManagerHandle {
    pub fn new() -> Self { Self { inner: std::sync::OnceLock::new() } }
    pub fn set_ready(&self, mgr: TorrentManager) { let _ = self.inner.set(Ok(Arc::new(mgr))); }
    pub fn set_error(&self, err: String) { let _ = self.inner.set(Err(err)); }
    pub fn get(&self) -> std::result::Result<&Arc<TorrentManager>, &str> {
        match self.inner.get() { Some(Ok(m)) => Ok(m), Some(Err(e)) => Err(e), None => Err("Torrent engine is still starting\u{2026}") }
    }
}
