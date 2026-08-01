use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Category {
    pub id: u32,
    pub name: String,
    pub icon: String,
    pub save_path: Option<String>,
    /// Auto-assign rule: regex on torrent name. If matched, torrent gets this category.
    pub auto_rule: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tag {
    pub id: u32,
    pub name: String,
    pub color: String,
    pub auto_rule: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutoManagementConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub move_on_complete: bool,
    #[serde(default)]
    pub remove_from_queue: bool,
    /// Ratio limit (uploaded / downloaded). 0 = unlimited.
    #[serde(default = "default_ratio")]
    pub ratio_limit: f64,
    /// Seed time limit in minutes. 0 = unlimited.
    #[serde(default)]
    pub seed_time_limit_minutes: u32,
}

fn default_ratio() -> f64 {
    2.0
}

impl Default for AutoManagementConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            move_on_complete: false,
            remove_from_queue: false,
            ratio_limit: 2.0,
            seed_time_limit_minutes: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Portfolio {
    pub id: u32,
    pub name: String,
    pub icon: String,
    /// Filter string (e.g. "downloading", "cat:1", "tag:3"). "all" means no filter.
    pub filter: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub global_download_path: Option<String>,
    pub categories: Vec<Category>,
    pub tags: Vec<Tag>,
    /// Per-torrent category assignment: torrent_id → category_id
    pub torrent_categories: std::collections::HashMap<u32, u32>,
    /// Per-torrent tags: torrent_id → Vec<tag_id>
    pub torrent_tags: std::collections::HashMap<u32, Vec<u32>>,
    #[serde(default)]
    pub auto_management: AutoManagementConfig,
    pub next_category_id: u32,
    pub next_tag_id: u32,
    /// Whether the "set as default torrent client" dialog has been offered.
    #[serde(default)]
    pub default_client_offered: bool,
    /// SOCKS5 proxy URL (e.g. "socks5://127.0.0.1:9050").
    #[serde(default)]
    pub socks5_proxy_url: Option<String>,
    /// Network interface bind address (e.g. "192.168.1.100"). Empty = all interfaces.
    #[serde(default)]
    pub bind_address: Option<String>,
    /// Global uTP protocol setting. None = use librqbit default, Some(true) = enabled, Some(false) = disabled.
    #[serde(default)]
    pub global_utp_enabled: Option<bool>,
    /// Per-torrent uTP overrides: torrent_id → enabled
    #[serde(default)]
    pub per_torrent_utp: std::collections::HashMap<u32, bool>,
    /// Global DHT disable flag. false = DHT enabled, true = DHT disabled.
    #[serde(default)]
    pub global_disable_dht: bool,
    /// Global PEX disable flag. false = PEX enabled, true = PEX disabled.
    #[serde(default)]
    pub global_disable_pex: bool,
    /// Global LPD disable flag. false = LPD enabled, true = LPD disabled.
    #[serde(default)]
    pub global_disable_lpd: bool,
    /// Per-torrent DHT overrides: torrent_id → disabled
    #[serde(default)]
    pub per_torrent_dht: std::collections::HashMap<u32, bool>,
    /// Per-torrent PEX overrides: torrent_id → disabled
    #[serde(default)]
    pub per_torrent_pex: std::collections::HashMap<u32, bool>,
    /// Per-torrent LPD overrides: torrent_id → disabled
    #[serde(default)]
    pub per_torrent_lpd: std::collections::HashMap<u32, bool>,
    /// Global encryption mode: "forced", "enabled", or "disabled".
    #[serde(default = "default_encryption_mode")]
    pub encryption_mode: String,
    /// Per-torrent encryption overrides: torrent_id → mode ("forced" | "enabled" | "disabled")
    #[serde(default)]
    pub per_torrent_encryption: std::collections::HashMap<u32, String>,
    /// Named filter presets (portfolios).
    #[serde(default)]
    pub portfolios: Vec<Portfolio>,
    /// Blocklist URL for blocking known bad IPs (e.g. https://example.com/blocklist.txt).
    #[serde(default)]
    pub blocklist_url: Option<String>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            global_download_path: None,
            categories: vec![
                Category {
                    id: 1,
                    name: "Movies".into(),
                    icon: "🎬".into(),
                    save_path: None,
                    auto_rule: None,
                },
                Category {
                    id: 2,
                    name: "TV".into(),
                    icon: "📺".into(),
                    save_path: None,
                    auto_rule: None,
                },
                Category {
                    id: 3,
                    name: "Music".into(),
                    icon: "🎵".into(),
                    save_path: None,
                    auto_rule: None,
                },
                Category {
                    id: 4,
                    name: "Games".into(),
                    icon: "🎮".into(),
                    save_path: None,
                    auto_rule: None,
                },
                Category {
                    id: 5,
                    name: "Software".into(),
                    icon: "💻".into(),
                    save_path: None,
                    auto_rule: None,
                },
            ],
            tags: vec![
                Tag {
                    id: 1,
                    name: "HD".into(),
                    color: "#34d35e".into(),
                    auto_rule: Some(r"1080p|720p".into()),
                },
                Tag {
                    id: 2,
                    name: "4K".into(),
                    color: "#9a7cf6".into(),
                    auto_rule: Some(r"2160p|4K".into()),
                },
                Tag {
                    id: 3,
                    name: "Remux".into(),
                    color: "#f0a020".into(),
                    auto_rule: Some(r"Remux".into()),
                },
            ],
            torrent_categories: std::collections::HashMap::new(),
            torrent_tags: std::collections::HashMap::new(),
            auto_management: AutoManagementConfig::default(),
            next_category_id: 6,
            next_tag_id: 4,
            default_client_offered: false,
            socks5_proxy_url: None,
            bind_address: None,
            global_utp_enabled: None,
            per_torrent_utp: std::collections::HashMap::new(),
            global_disable_dht: false,
            global_disable_pex: false,
            global_disable_lpd: false,
            per_torrent_dht: std::collections::HashMap::new(),
            per_torrent_pex: std::collections::HashMap::new(),
            per_torrent_lpd: std::collections::HashMap::new(),
            encryption_mode: "enabled".to_string(),
            per_torrent_encryption: std::collections::HashMap::new(),
            portfolios: vec![
                Portfolio {
                    id: 1,
                    name: "Active Downloads".into(),
                    icon: "\u{2B07}".into(),
                    filter: "downloading".into(),
                },
                Portfolio {
                    id: 2,
                    name: "Seeding".into(),
                    icon: "\u{2B06}".into(),
                    filter: "seeding".into(),
                },
            ],
            blocklist_url: None,
        }
    }
}

fn default_encryption_mode() -> String {
    "enabled".to_string()
}

impl AppConfig {
    /// Load config from JSON file, or create default.
    pub fn load(data_dir: &Path) -> Self {
        let path = data_dir.join("config.json");
        if path.exists() {
            match std::fs::read_to_string(&path) {
                Ok(content) => match serde_json::from_str(&content) {
                    Ok(cfg) => return cfg,
                    Err(e) => log::warn!("Failed to parse config.json: {}. Using defaults.", e),
                },
                Err(e) => log::warn!("Failed to read config.json: {}. Using defaults.", e),
            }
        }
        let cfg = AppConfig::default();
        let _ = cfg.save(data_dir);
        cfg
    }

    /// Save config to JSON file.
    pub fn save(&self, data_dir: &Path) -> Result<(), String> {
        let path = data_dir.join("config.json");
        let content = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        std::fs::write(&path, content).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn effective_path(&self, category_id: Option<u32>) -> Option<String> {
        category_id
            .and_then(|id| self.categories.iter().find(|c| c.id == id))
            .and_then(|c| c.save_path.clone())
            .or_else(|| self.global_download_path.clone())
    }

    /// Auto-assign category and tags based on torrent name.
    pub fn auto_assign(&mut self, name: &str) -> (Option<u32>, Vec<u32>) {
        let mut tags = Vec::new();
        for tag in &self.tags {
            if let Some(ref rule) = tag.auto_rule {
                if let Ok(re) = regex::Regex::new(rule) {
                    if re.is_match(name) {
                        tags.push(tag.id);
                    }
                }
            }
        }

        let category = self
            .categories
            .iter()
            .find(|c| {
                c.auto_rule
                    .as_ref()
                    .and_then(|rule| regex::Regex::new(rule).ok())
                    .is_some_and(|re| re.is_match(name))
            })
            .map(|c| c.id);

        (category, tags)
    }

    /// Get next portfolio ID.
    pub fn next_portfolio_id(&self) -> u32 {
        self.portfolios.iter().map(|p| p.id).max().unwrap_or(0) + 1
    }

    pub fn get_data_dir() -> PathBuf {
        dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("asutorrent")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let cfg = AppConfig::default();
        assert_eq!(cfg.categories.len(), 5);
        assert_eq!(cfg.tags.len(), 3);
        assert_eq!(cfg.next_category_id, 6);
        assert_eq!(cfg.next_tag_id, 4);
        assert_eq!(cfg.encryption_mode, "enabled");
        assert!(!cfg.global_disable_dht);
        assert!(!cfg.default_client_offered);
    }

    #[test]
    fn test_serialize_deserialize_roundtrip() {
        let cfg = AppConfig::default();
        let json = serde_json::to_string_pretty(&cfg).expect("serialize");
        let deserialized: AppConfig = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(deserialized.categories.len(), 5);
        assert_eq!(deserialized.tags.len(), 3);
        assert_eq!(deserialized.next_category_id, 6);
    }

    #[test]
    fn test_auto_assign_tags() {
        let mut cfg = AppConfig::default();
        // Torrent name matching HD tag rule
        let (cat, tags) = cfg.auto_assign("My.Movie.2024.1080p.WEB-DL");
        assert!(tags.contains(&1), "Should match HD tag (1080p)");
        assert!(cat.is_none(), "No category rule should match");
    }

    #[test]
    fn test_auto_assign_4k() {
        let mut cfg = AppConfig::default();
        let (_, tags) = cfg.auto_assign("Film.2160p.4K.Remux");
        assert!(tags.contains(&2), "Should match 4K tag (2160p)");
        assert!(tags.contains(&3), "Should match Remux tag");
        assert!(!tags.contains(&1), "Should NOT match HD tag");
    }

    #[test]
    fn test_auto_assign_no_match() {
        let mut cfg = AppConfig::default();
        let (_, tags) = cfg.auto_assign("Some Random File.txt");
        assert!(tags.is_empty(), "No tags should match random name");
    }

    #[test]
    fn test_effective_path_global() {
        let mut cfg = AppConfig::default();
        cfg.global_download_path = Some("/downloads".into());
        assert_eq!(cfg.effective_path(None), Some("/downloads".into()));
    }

    #[test]
    fn test_effective_path_category() {
        let mut cfg = AppConfig::default();
        cfg.global_download_path = Some("/global".into());
        if let Some(cat) = cfg.categories.iter_mut().find(|c| c.id == 1) {
            cat.save_path = Some("/movies".into());
        }
        assert_eq!(cfg.effective_path(Some(1)), Some("/movies".into()));
        assert_eq!(cfg.effective_path(Some(999)), Some("/global".into()));
    }

    #[test]
    fn test_next_portfolio_id() {
        let cfg = AppConfig::default();
        assert_eq!(cfg.next_portfolio_id(), 3);
        let empty = AppConfig {
            portfolios: vec![],
            ..AppConfig::default()
        };
        assert_eq!(empty.next_portfolio_id(), 1);
    }

    #[test]
    fn test_default_portfolios() {
        let cfg = AppConfig::default();
        assert_eq!(cfg.portfolios.len(), 2);
        assert_eq!(cfg.portfolios[0].name, "Active Downloads");
        assert_eq!(cfg.portfolios[1].name, "Seeding");
    }

    #[test]
    fn test_new_fields_deserialize_with_default() {
        // Ensure old configs without new fields still deserialize
        let old_json = r#"{
            "global_download_path": null,
            "categories": [],
            "tags": [],
            "torrent_categories": {},
            "torrent_tags": {},
            "auto_management": {},
            "next_category_id": 1,
            "next_tag_id": 1
        }"#;
        let cfg: AppConfig = serde_json::from_str(old_json).expect("Old config should deserialize");
        assert!(!cfg.default_client_offered);
        assert!(cfg.socks5_proxy_url.is_none());
        assert_eq!(cfg.encryption_mode, "enabled");
        assert!(!cfg.global_disable_dht);
        assert_eq!(cfg.portfolios.len(), 0);
    }
}
