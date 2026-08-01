use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Unified search result from any tracker adapter.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub name: String,
    pub magnet: String,
    pub size: u64,
    pub seeds: u32,
    pub peers: u32,
    pub tracker: String,  // e.g. "Nyaa.si", "TPB", "EZTV"
    pub category: String, // e.g. "Video", "Audio", "Application"
}

/// Adapter interface — each tracker implements this.
#[async_trait::async_trait]
pub trait TrackerAdapter: Send + Sync {
    async fn search(&self, query: &str) -> Vec<SearchResult>;
}

// ── HTTP helper ──────────────────────────────────────────────────

fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent("AsuTorrent/0.1 (+https://github.com/Baconana-chan/asutorrent)")
        .timeout(Duration::from_secs(10))
        .build()
        .unwrap_or_default()
}

fn parse_size(s: &str) -> u64 {
    let s = s.trim().to_lowercase();
    let (num_str, unit) = if let Some(idx) = s.find(|c: char| !c.is_ascii_digit() && c != '.') {
        let (n, u) = s.split_at(idx);
        (n, u.trim())
    } else {
        (s.as_str(), "b")
    };
    let bytes: f64 = num_str.parse().unwrap_or(0.0);
    match unit {
        "kib" | "kb" => (bytes * 1024.0) as u64,
        "mib" | "mb" => (bytes * 1024.0 * 1024.0) as u64,
        "gib" | "gb" => (bytes * 1024.0 * 1024.0 * 1024.0) as u64,
        "tib" | "tb" => (bytes * 1024.0 * 1024.0 * 1024.0 * 1024.0) as u64,
        _ if unit.starts_with('g') => (bytes * 1024.0 * 1024.0 * 1024.0) as u64,
        _ if unit.starts_with('m') => (bytes * 1024.0 * 1024.0) as u64,
        _ if unit.starts_with('k') => (bytes * 1024.0) as u64,
        _ => bytes as u64,
    }
}

// ── Nyaa.si Adapter ──────────────────────────────────────────────

pub struct NyaaAdapter;

#[async_trait::async_trait]
impl TrackerAdapter for NyaaAdapter {
    async fn search(&self, query: &str) -> Vec<SearchResult> {
        let client = http_client();
        let url = format!("https://nyaa.si/api/?q={}", urlencoding::encode(query));
        match client.get(&url).send().await {
            Ok(resp) if resp.status().is_success() => {
                let json: serde_json::Value = resp.json().await.unwrap_or_default();
                json["torrents"]
                    .as_array()
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|t| {
                                let name = t["name"].as_str()?.to_string();
                                let magnet = t["magnet"].as_str()?.to_string();
                                let size_str = t["size"].as_str().unwrap_or("0");
                                let seeds =
                                    t["seeders"].as_str().unwrap_or("0").parse().unwrap_or(0);
                                let peers =
                                    t["leechers"].as_str().unwrap_or("0").parse().unwrap_or(0);
                                let category =
                                    t["category"].as_str().unwrap_or("Unknown").to_string();
                                Some(SearchResult {
                                    name,
                                    magnet,
                                    size: parse_size(size_str),
                                    seeds,
                                    peers,
                                    tracker: "Nyaa.si".into(),
                                    category,
                                })
                            })
                            .collect()
                    })
                    .unwrap_or_default()
            }
            _ => {
                log::warn!("Nyaa.si search failed for: {}", query);
                vec![]
            }
        }
    }
}

// ── ThePirateBay (apibay) Adapter ───────────────────────────────

pub struct TPBAdapter;

#[async_trait::async_trait]
impl TrackerAdapter for TPBAdapter {
    async fn search(&self, query: &str) -> Vec<SearchResult> {
        let client = http_client();
        let url = format!("https://apibay.org/q.php?q={}", urlencoding::encode(query));
        match client.get(&url).send().await {
            Ok(resp) if resp.status().is_success() => {
                let json: Vec<serde_json::Value> = resp.json().await.unwrap_or_default();
                json.iter()
                    .filter_map(|t| {
                        let name = t["name"].as_str()?.to_string();
                        let info_hash = t["info_hash"].as_str()?;
                        if info_hash.len() < 10 {
                            return None;
                        }
                        let magnet = format!(
                            "magnet:?xt=urn:btih:{}&dn={}",
                            info_hash,
                            urlencoding::encode(&name)
                        );
                        let size = t["size"]
                            .as_str()
                            .unwrap_or("0")
                            .parse::<u64>()
                            .unwrap_or(0);
                        let seeds = t["seeders"].as_str().unwrap_or("0").parse().unwrap_or(0);
                        let peers = t["leechers"].as_str().unwrap_or("0").parse().unwrap_or(0);
                        let category = t["category"].as_str().unwrap_or("0").to_string();
                        Some(SearchResult {
                            name,
                            magnet,
                            size,
                            seeds,
                            peers,
                            tracker: "TPB".into(),
                            category: match category.as_str() {
                                "201" => "Video",
                                "202" => "Video (HD)",
                                "203" => "Video (UHD)",
                                "204" => "Audio",
                                "205" => "Games",
                                "206" => "Applications",
                                "207" => "Porn",
                                "208" => "Other",
                                _ => "Other",
                            }
                            .to_string(),
                        })
                    })
                    .collect()
            }
            _ => {
                log::warn!("TPB search failed for: {}", query);
                vec![]
            }
        }
    }
}

// ── EZTV Adapter ────────────────────────────────────────────────

pub struct EZTVAdapter;

#[async_trait::async_trait]
impl TrackerAdapter for EZTVAdapter {
    async fn search(&self, query: &str) -> Vec<SearchResult> {
        let client = http_client();
        let url = format!(
            "https://eztvx.to/api/get-torrents?imdb_id=-1&limit=50&page=1&search={}",
            urlencoding::encode(query)
        );
        match client.get(&url).send().await {
            Ok(resp) if resp.status().is_success() => {
                let json: serde_json::Value = resp.json().await.unwrap_or_default();
                json["torrents"]
                    .as_array()
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|t| {
                                let name = t["title"].as_str()?.to_string();
                                let magnet = t["magnet_url"].as_str()?.to_string();
                                let size_str = t["size_bytes"].as_str().unwrap_or("0");
                                let seeds = t["seeds"].as_u64().unwrap_or(0) as u32;
                                let peers = t["peers"].as_u64().unwrap_or(0) as u32;
                                let size = size_str.parse::<u64>().unwrap_or(0);
                                Some(SearchResult {
                                    name,
                                    magnet,
                                    size,
                                    seeds,
                                    peers,
                                    tracker: "EZTV".into(),
                                    category: "TV".into(),
                                })
                            })
                            .collect()
                    })
                    .unwrap_or_default()
            }
            _ => {
                log::warn!("EZTV search failed for: {}", query);
                vec![]
            }
        }
    }
}

// ── YTS Adapter ────────────────────────────────────────────────

pub struct YTSAdapter;

#[async_trait::async_trait]
impl TrackerAdapter for YTSAdapter {
    async fn search(&self, query: &str) -> Vec<SearchResult> {
        let client = http_client();
        let url = format!(
            "https://yts.mx/api/v2/list_movies.json?query_term={}",
            urlencoding::encode(query)
        );
        match client.get(&url).send().await {
            Ok(resp) if resp.status().is_success() => {
                let json: serde_json::Value = resp.json().await.unwrap_or_default();
                json["data"]["movies"]
                    .as_array()
                    .map(|arr| {
                        arr.iter()
                            .flat_map(|m| {
                                let name = match m["title_long"]
                                    .as_str()
                                    .or_else(|| m["title"].as_str())
                                {
                                    Some(n) => n.to_string(),
                                    None => return vec![],
                                };
                                let year = m["year"].as_u64().unwrap_or(0);
                                let category = format!("Movies {}", year);
                                // Each movie can have multiple torrents (quality variants)
                                m["torrents"]
                                    .as_array()
                                    .map(|torrents| {
                                        torrents
                                            .iter()
                                            .filter_map(|t| {
                                                let quality = t["quality"].as_str().unwrap_or("?");
                                                let full_name =
                                                    format!("{} ({} - {})", name, quality, year);
                                                let hash = t["hash"].as_str()?;
                                                let magnet = format!(
                                                    "magnet:?xt=urn:btih:{}&dn={}",
                                                    hash,
                                                    urlencoding::encode(&full_name)
                                                );
                                                let size = t["size_bytes"].as_u64().unwrap_or(0);
                                                let seeds = t["seeds"].as_u64().unwrap_or(0) as u32;
                                                let peers = t["peers"].as_u64().unwrap_or(0) as u32;
                                                Some(SearchResult {
                                                    name: full_name,
                                                    magnet,
                                                    size,
                                                    seeds,
                                                    peers,
                                                    tracker: "YTS".into(),
                                                    category: category.clone(),
                                                })
                                            })
                                            .collect::<Vec<_>>()
                                    })
                                    .unwrap_or_default()
                            })
                            .collect()
                    })
                    .unwrap_or_default()
            }
            _ => {
                log::warn!("YTS search failed for: {}", query);
                vec![]
            }
        }
    }
}

// ── Jackett Adapter ──────────────────────────────────────────────

pub struct JackettAdapter {
    api_key: Option<String>,
}

impl JackettAdapter {
    pub fn new(api_key: Option<String>) -> Self {
        Self { api_key }
    }

    /// Check if Jackett is reachable at localhost:9117.
    pub async fn is_available() -> bool {
        let client = http_client();
        client
            .get("http://127.0.0.1:9117")
            .send()
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false)
    }
}

#[async_trait::async_trait]
impl TrackerAdapter for JackettAdapter {
    async fn search(&self, query: &str) -> Vec<SearchResult> {
        let api_key = match &self.api_key {
            Some(k) => k.clone(),
            None => {
                // Try to auto-detect Jackett API key from config
                let config_path =
                    dirs::config_dir().map(|p| p.join("Jackett").join("ServerConfig.json"));
                if let Some(path) = config_path {
                    if path.exists() {
                        if let Ok(content) = std::fs::read_to_string(&path) {
                            if let Ok(cfg) = serde_json::from_str::<serde_json::Value>(&content) {
                                if let Some(key) = cfg["APIKey"].as_str().map(String::from) {
                                    key
                                } else {
                                    return vec![];
                                }
                            } else {
                                return vec![];
                            }
                        } else {
                            return vec![];
                        }
                    } else {
                        return vec![];
                    }
                } else {
                    return vec![];
                }
            }
        };

        let client = http_client();
        let url = format!(
            "http://127.0.0.1:9117/api/v2.0/indexers/all/results?apikey={}&Query={}",
            api_key,
            urlencoding::encode(query)
        );

        match client.get(&url).send().await {
            Ok(resp) if resp.status().is_success() => {
                let json: serde_json::Value = resp.json().await.unwrap_or_default();
                json["Results"]
                    .as_array()
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|r| {
                                let title = r["Title"].as_str()?.to_string();
                                let magnet = r["MagnetUri"].as_str()?.to_string();
                                if magnet.is_empty() {
                                    return None;
                                }
                                let size = r["Size"].as_u64().unwrap_or(0);
                                let seeds = r["Seeders"].as_u64().unwrap_or(0) as u32;
                                let peers = r["Peers"].as_u64().unwrap_or(0) as u32;
                                let tracker_name =
                                    r["Tracker"].as_str().unwrap_or("Jackett").to_string();
                                let category =
                                    r["CategoryDesc"].as_str().unwrap_or("Unknown").to_string();
                                Some(SearchResult {
                                    name: title,
                                    magnet,
                                    size,
                                    seeds,
                                    peers,
                                    tracker: format!("Jackett ({})", tracker_name),
                                    category,
                                })
                            })
                            .collect()
                    })
                    .unwrap_or_default()
            }
            _ => {
                log::warn!("Jackett search failed for: {}", query);
                vec![]
            }
        }
    }
}

// ── Orchestrator ─────────────────────────────────────────────────

/// Run search against selected adapters concurrently.
pub async fn search_all(query: &str, sources: &[String]) -> Vec<SearchResult> {
    let adapters: Vec<Box<dyn TrackerAdapter>> = build_adapters(sources);
    let mut handles = Vec::new();
    for adapter in adapters {
        let q = query.to_string();
        handles.push(tokio::spawn(async move { adapter.search(&q).await }));
    }
    let mut results = Vec::new();
    for handle in handles {
        if let Ok(mut r) = handle.await {
            results.append(&mut r);
        }
    }
    // Sort by seeds descending
    results.sort_by_key(|b| std::cmp::Reverse(b.seeds));
    results
}

fn build_adapters(sources: &[String]) -> Vec<Box<dyn TrackerAdapter>> {
    let mut adapters: Vec<Box<dyn TrackerAdapter>> = Vec::new();
    for src in sources {
        match src.as_str() {
            "nyaa" => adapters.push(Box::new(NyaaAdapter)),
            "tpb" => adapters.push(Box::new(TPBAdapter)),
            "eztv" => adapters.push(Box::new(EZTVAdapter)),
            "yts" => adapters.push(Box::new(YTSAdapter)),
            "jackett" => adapters.push(Box::new(JackettAdapter::new(None))),
            _ => log::warn!("Unknown tracker source: {}", src),
        }
    }
    adapters
}

/// Check if Jackett is running at localhost:9117.
pub async fn check_jackett() -> bool {
    JackettAdapter::is_available().await
}
