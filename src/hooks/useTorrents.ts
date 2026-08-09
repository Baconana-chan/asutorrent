import { useEffect } from "preact/hooks";
import { signal } from "@preact/signals";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type { HealthPayload } from "../utils/health";

// Re-export so existing imports stay valid (type defined in utils/health).
export type { HealthPayload } from "../utils/health";

// ── Types matching the cleaned-up Rust JSON contract ─────────────

/** A label (tag) applied to a torrent: id + display name + color. */
export interface TagRef {
  id: number;
  name: string;
  color: string;
}

export interface TorrentListEntry {
  id: number;
  name: string | null;
  info_hash: string;
  size: number;
  progress: number;
  state: string;
  download_speed: number;
  upload_speed: number;
  peers: number;
  seeds: number;
  eta: number | null;
  forced: boolean;
  sequential: boolean;
  super_seed: boolean;
  /** Health indicator (score, seeds, peers, age, availability). */
  health: HealthPayload | null;
  /** Colored labels applied to this torrent (populated from config). */
  tags: TagRef[];
}

interface TorrentStatsPayload {
  state: string;
  total_bytes: number;
  progress_bytes: number;
  uploaded_bytes: number;
  finished: boolean;
  error: string | null;
  peers: number;
  seeds: number;
  live: LiveStatsPayload | null;
}

interface LiveStatsPayload {
  download_speed: number;
  upload_speed: number;
  time_remaining: { secs: number; nanos: number } | null;
}

interface RawTorrentPayload {
  id: number | null;
  name: string | null;
  info_hash: string;
  forced: boolean;
  sequential?: boolean;
  super_seed?: boolean;
  health?: HealthPayload | null;
  stats: TorrentStatsPayload | null;
}

export interface SessionStatsPayload {
  active_downloads: number;
  active_seeds: number;
  download_speed: number;
  upload_speed: number;
  total_downloaded: number;
  total_uploaded: number;
  uptime_secs: number;
  total_peers: number;
}

interface TorrentStatsEvent {
  torrents: RawTorrentPayload[];
  stats: SessionStatsPayload;
}

interface EngineErrorEvent { error: string; }

export interface ScheduleRulePayload {
  days: number[];
  start_hour: number;
  start_minute: number;
  end_hour: number;
  end_minute: number;
  download_limit: number | null;
  upload_limit: number | null;
}

export interface SpeedSchedulePayload { rules: ScheduleRulePayload[]; enabled: boolean; active: boolean; }

interface SpeedLimitsUpdatedEvent {
  schedule_active: boolean; schedule_enabled: boolean;
  normal_download: number | null; normal_upload: number | null;
  turtle_mode: boolean; turtle_download: number | null; turtle_upload: number | null;
}

// ── RSS types ────────────────────────────────────────────────────

export interface RssFeedPayload {
  id: number;
  name: string;
  url: string;
  interval_secs: number;
  filters: RssFilterPayload[];
}

export interface RssFilterPayload {
  id: number;
  name_regex: string;
  min_size: number | null;
  max_size: number | null;
  add_torrent: boolean;
}

export interface RssItemPayload {
  title: string;
  link: string;
  size: number | null;
  pub_date: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────

function mapTorrent(raw: RawTorrentPayload): TorrentListEntry {
  const s = raw.stats;
  const live = s?.live ?? null;
  const total = s?.total_bytes ?? 0;
  const downloaded = s?.progress_bytes ?? 0;
  const eta = live?.time_remaining
    ? live.time_remaining.secs + (live.time_remaining.nanos > 0 ? 1 : 0)
    : null;
  return {
    id: raw.id ?? 0, name: raw.name, info_hash: raw.info_hash, size: total,
    progress: total > 0 ? downloaded / total : 0, state: s?.state ?? "unknown",
    download_speed: live?.download_speed ?? 0, upload_speed: live?.upload_speed ?? 0,
    peers: s?.peers ?? 0, seeds: s?.seeds ?? 0, eta, forced: raw.forced ?? false,
    sequential: raw.sequential ?? false,
    super_seed: raw.super_seed ?? false,
    health: raw.health ?? null,
    tags: [], // populated from config (see refreshConfig)
  };
}

// ── Reactive signals ─────────────────────────────────────────────

export const torrents = signal<TorrentListEntry[]>([]);
export const sessionStats = signal<SessionStatsPayload>({ active_downloads: 0, active_seeds: 0, download_speed: 0, upload_speed: 0, total_downloaded: 0, total_uploaded: 0, uptime_secs: 0, total_peers: 0 });
export const loading = signal(true);
export const loadingError = signal<string | null>(null);
export const speedSchedule = signal<SpeedSchedulePayload | null>(null);
export const rssFeeds = signal<RssFeedPayload[]>([]);
export const rssNewItems = signal<Record<string, RssItemPayload[]>>({});

/** Magnet link detected in the clipboard (set by the "clipboard-magnet" event). */
export const clipboardMagnet = signal<{ url: string; name: string | null } | null>(null);

/**
 * Queue of .torrent file paths awaiting preview confirmation. Any component
 * (add dialog, drag-and-drop) pushes here; the app renders the preview dialog
 * while the queue is non-empty and shifts after each confirmed add.
 */
export const torrentPreviewQueue = signal<string[]>([]);

// ── Shared label/category config (kept in sync via refreshConfig) ──

export const categoriesDefs = signal<CategoryPayload[]>([]);
export const tagDefs = signal<TagPayload[]>([]);
export const torrentCategoryMap = signal<Record<string, number>>({});
export const torrentTagMap = signal<Record<string, number[]>>({});

/**
 * Reload the full config from the backend and publish it to the shared
 * signals above. Call after any category/label change so the whole UI
 * (table badges, sidebar filters, detail panel) stays in sync.
 */
export async function refreshConfig(): Promise<void> {
  try {
    const cfg = await getFullConfig();
    categoriesDefs.value = cfg.categories ?? [];
    tagDefs.value = cfg.tags ?? [];
    torrentCategoryMap.value = (cfg.torrent_categories ?? {}) as Record<string, number>;
    torrentTagMap.value = (cfg.torrent_tags ?? {}) as Record<string, number[]>;
  } catch { /* ignore */ }
}

const LOADING_TIMEOUT_MS = 10_000;

export function useTorrents() {
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    timeoutId = setTimeout(() => {
      if (!cancelled && loading.value) {
        loading.value = false;
        loadingError.value = "Could not connect to the torrent engine.\nThe engine did not respond within 10 seconds.\n\nPossible causes:\n  • Another torrent client is already running\n  • The port range (6881-6889) is in use\n  • A firewall is blocking the application\n\nClick Retry to try again.";
      }
    }, LOADING_TIMEOUT_MS);

    const unlistenError = listen<EngineErrorEvent>("engine-error", (event) => {
      if (cancelled) return;
      loading.value = false;
      loadingError.value = "Failed to start the torrent engine:\n\n" + event.payload.error + "\n\nClick Retry to try again.";
    });

    const unlistenStats = listen<TorrentStatsEvent>("torrent-stats", (event) => {
      if (cancelled) return;
      const data = event.payload;
      const rawList: RawTorrentPayload[] = Array.isArray(data.torrents) ? data.torrents : [];
      torrents.value = rawList.map(mapTorrent);
      sessionStats.value = {
        active_downloads: data.stats?.active_downloads ?? 0,
        active_seeds: data.stats?.active_seeds ?? 0,
        download_speed: data.stats?.download_speed ?? 0,
        upload_speed: data.stats?.upload_speed ?? 0,
        total_downloaded: data.stats?.total_downloaded ?? 0,
        total_uploaded: data.stats?.total_uploaded ?? 0,
        uptime_secs: data.stats?.uptime_secs ?? 0,
        total_peers: data.stats?.total_peers ?? 0,
      };
      loading.value = false; loadingError.value = null;
    });

    const unlistenLimits = listen<SpeedLimitsUpdatedEvent>("speed-limits-updated", (event) => {
      if (cancelled || !speedSchedule.value) return;
      speedSchedule.value = { ...speedSchedule.value, active: event.payload.schedule_active, enabled: event.payload.schedule_enabled };
    });

    // Listen for RSS new items
    const unlistenRss = listen<Record<string, RssItemPayload[]>>("rss-new-items", (event) => {
      if (cancelled) return;
      rssNewItems.value = { ...rssNewItems.value, ...event.payload };
    });

    // Listen for magnet links detected in the clipboard. A pending prompt is
    // never replaced (avoids accidentally adding a newer link mid-interaction).
    const unlistenClipboard = listen<{ url: string; name: string | null }>("clipboard-magnet", (event) => {
      if (cancelled) return;
      if (clipboardMagnet.value) return;
      clipboardMagnet.value = {
        url: event.payload.url,
        name: event.payload.name ?? null,
      };
    });

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      unlistenError.then((fn) => fn());
      unlistenStats.then((fn) => fn());
      unlistenLimits.then((fn) => fn());
      unlistenRss.then((fn) => fn());
      unlistenClipboard.then((fn) => fn());
    };
  }, []);
}

// ── Tauri IPC wrappers ──────────────────────────────────────────

export async function addMagnet(url: string): Promise<number> { return invoke<number>("add_magnet", { url }); }
export async function addTorrentFile(path: string): Promise<number> { return invoke<number>("add_torrent_file", { path }); }

// ── Torrent file preview (before adding) ───────────────────────

export interface TorrentPreviewFile {
  path: string;
  components: string[];
  size: number;
}

export interface TorrentPreviewPayload {
  name: string;
  info_hash: string;
  total_size: number;
  piece_length: number;
  creation_date: number | null;
  comment: string | null;
  trackers: string[];
  files: TorrentPreviewFile[];
}

/** Parse a .torrent file and return its contents without adding it. */
export async function previewTorrentFile(path: string): Promise<TorrentPreviewPayload> {
  return invoke<TorrentPreviewPayload>("preview_torrent_file", { path });
}

/** Add a .torrent file restricted to the given file indices. */
export async function addTorrentFileSelected(path: string, selected: number[]): Promise<number> {
  return invoke<number>("add_torrent_file_selected", { path, selected });
}
export async function pauseTorrent(id: number): Promise<void> { return invoke("pause_torrent", { id }); }
export async function resumeTorrent(id: number): Promise<void> { return invoke("resume_torrent", { id }); }
export async function forceResumeTorrent(id: number): Promise<void> { return invoke("force_resume_torrent", { id }); }
export async function removeForceResume(id: number): Promise<void> { return invoke("remove_force_resume", { id }); }
export async function deleteTorrent(id: number, deleteFiles = false): Promise<void> { return invoke("delete_torrent", { id, deleteFiles }); }
export async function retryLoading(): Promise<void> { window.location.reload(); }

// ── File tree / priorities ──────────────────────────────────────

export interface TorrentFileEntry { name: string; components: string[]; length: number; included: boolean; attributes: Record<string, unknown>; }

export async function getTorrentFiles(id: number): Promise<{ files: TorrentFileEntry[]; name: string | null }> {
  const result = await invoke<{ files: TorrentFileEntry[] | null; name: string | null }>("get_torrent_files", { id });
  return { files: result.files ?? [], name: result.name ?? null };
}

export async function updateTorrentFiles(id: number, indices: number[]): Promise<void> { return invoke("update_torrent_files", { id, indices }); }

// ── Speed limits / Turtle mode ─────────────────────────────────

export interface SpeedLimitsPayload { normal_download: number | null; normal_upload: number | null; turtle_download: number | null; turtle_upload: number | null; turtle_mode: boolean; }

export async function setNormalDownloadLimit(bps: number | null): Promise<void> { return invoke("set_normal_download_limit", { bps }); }
export async function setNormalUploadLimit(bps: number | null): Promise<void> { return invoke("set_normal_upload_limit", { bps }); }
export async function setTurtleDownloadLimit(bps: number | null): Promise<void> { return invoke("set_turtle_download_limit", { bps }); }
export async function setTurtleUploadLimit(bps: number | null): Promise<void> { return invoke("set_turtle_upload_limit", { bps }); }
export async function setTurtleMode(enabled: boolean): Promise<void> { return invoke("set_turtle_mode", { enabled }); }
export async function getSpeedLimits(): Promise<SpeedLimitsPayload> { return invoke("get_speed_limits"); }

// ── Queue config ────────────────────────────────────────────────

export interface QueueConfigPayload { max_active_downloads: number; max_active_seeds: number; }

export async function setQueueConfig(maxActiveDownloads: number, maxActiveSeeds: number): Promise<void> { return invoke("set_queue_config", { maxActiveDownloads, maxActiveSeeds }); }
export async function getQueueConfig(): Promise<QueueConfigPayload> { return invoke("get_queue_config"); }

// ── Speed schedule ─────────────────────────────────────────────

export async function setSpeedSchedule(rules: ScheduleRulePayload[], enabled: boolean): Promise<void> { return invoke("set_speed_schedule", { rules, enabled }); }
export async function getSpeedSchedule(): Promise<SpeedSchedulePayload> { return invoke("get_speed_schedule"); }

// ── RSS ─────────────────────────────────────────────────────────

export async function addRssFeed(name: string, url: string): Promise<RssFeedPayload> { return invoke("add_rss_feed", { name, url }); }
export async function removeRssFeed(id: number): Promise<void> { return invoke("remove_rss_feed", { id }); }
export async function getRssFeeds(): Promise<RssFeedPayload[]> { return invoke("get_rss_feeds"); }
export async function updateRssFeed(id: number, name: string, url: string, intervalSecs: number): Promise<void> { return invoke("update_rss_feed", { id, name, url, intervalSecs }); }
export async function addRssFilter(feedId: number, nameRegex: string, minSize: number | null, maxSize: number | null, addTorrent: boolean): Promise<RssFilterPayload> { return invoke("add_rss_filter", { feedId, nameRegex, minSize, maxSize, addTorrent }); }
export async function removeRssFilter(feedId: number, filterId: number): Promise<void> { return invoke("remove_rss_filter", { feedId, filterId }); }
export async function pollRss(): Promise<Record<string, RssItemPayload[]>> { return invoke("poll_rss"); }

// ── Categories & Tags ─────────────────────────────────────────

export interface CategoryPayload {
  id: number;
  name: string;
  icon: string;
  save_path: string | null;
  auto_rule: string | null;
}

export interface TagPayload {
  id: number;
  name: string;
  color: string;
  auto_rule: string | null;
}

export interface AppConfigPayload {
  global_download_path: string | null;
  categories: CategoryPayload[];
  tags: TagPayload[];
  torrent_categories: Record<string, number>;
  torrent_tags: Record<string, number[]>;
  next_category_id: number;
  next_tag_id: number;
}

export async function getCategories(): Promise<CategoryPayload[]> { return invoke("get_categories"); }
export async function addCategory(name: string, icon: string, savePath: string | null, autoRule: string | null): Promise<CategoryPayload> { return invoke("add_category", { name, icon, savePath, autoRule }); }
export async function removeCategory(id: number): Promise<void> { return invoke("remove_category", { id }); }
export async function updateCategory(id: number, name: string, icon: string, savePath: string | null, autoRule: string | null): Promise<void> { return invoke("update_category", { id, name, icon, savePath, autoRule }); }
export async function getTags(): Promise<TagPayload[]> { return invoke("get_tags"); }
export async function addTag(name: string, color: string, autoRule: string | null): Promise<TagPayload> { return invoke("add_tag", { name, color, autoRule }); }
export async function removeTag(id: number): Promise<void> { return invoke("remove_tag", { id }); }
export async function updateTag(id: number, name: string, color: string, autoRule: string | null): Promise<void> { return invoke("update_tag", { id, name, color, autoRule }); }
export async function getGlobalDownloadPath(): Promise<string | null> { return invoke("get_global_download_path"); }
export async function setGlobalDownloadPath(path: string | null): Promise<void> { return invoke("set_global_download_path", { path }); }
export async function getFullConfig(): Promise<AppConfigPayload> { return invoke("get_full_config"); }
export async function setTorrentCategory(torrentId: number, categoryId: number | null): Promise<void> { return invoke("set_torrent_category", { torrentId, categoryId }); }
export async function getTorrentCategory(torrentId: number): Promise<number | null> { return invoke("get_torrent_category", { torrentId }); }
export async function setTorrentTags(torrentId: number, tagIds: number[]): Promise<void> { return invoke("set_torrent_tags", { torrentId, tagIds }); }
export async function getTorrentTags(torrentId: number): Promise<number[]> { return invoke("get_torrent_tags", { torrentId }); }

// ── Auto-management & Re-check ────────────────────────────────

export interface AutoManagementConfigPayload {
  enabled: boolean;
  move_on_complete: boolean;
  remove_from_queue: boolean;
  ratio_limit: number;
  seed_time_limit_minutes: number;
}

export async function getAutoManagementConfig(): Promise<AutoManagementConfigPayload> {
  return invoke("get_auto_management_config");
}

export async function setAutoManagementConfig(config: AutoManagementConfigPayload): Promise<void> {
  return invoke("set_auto_management_config", { config });
}

export async function reCheckTorrent(id: number): Promise<void> {
  return invoke("re_check_torrent", { id });
}

// ── Watch folder ───────────────────────────────────────────────

export async function getWatchFolder(): Promise<string | null> {
  return invoke("get_watch_folder");
}

export async function setWatchFolder(path: string | null): Promise<void> {
  return invoke("set_watch_folder", { path });
}

// ── Clipboard monitoring ─────────────────────────────────────

export async function getClipboardMonitor(): Promise<boolean> {
  return invoke<boolean>("get_clipboard_monitor");
}

export async function setClipboardMonitor(enabled: boolean): Promise<void> {
  return invoke("set_clipboard_monitor", { enabled });
}

// ── Torrent History ──────────────────────────────────────────

export interface TorrentHistoryEntry {
  name: string;
  info_hash: string;
  total_bytes: number;
  uploaded_bytes: number;
  event: "completed" | "deleted";
  timestamp: number;
  category_name: string | null;
  completed_at: number | null;
}

export async function getHistory(): Promise<TorrentHistoryEntry[]> {
  return invoke<TorrentHistoryEntry[]>("get_history");
}

// ── Sequential Download ────────────────────────────────────────

export async function setSequentialDownload(id: number, enabled: boolean): Promise<void> {
  return invoke("set_sequential_download", { id, enabled });
}

// ── HTTP/FTP Direct Downloads ────────────────────────────────

export async function addHttpDownload(url: string): Promise<number> {
  return invoke<number>("add_http_download", { url });
}

export async function cancelHttpDownload(id: number): Promise<void> {
  return invoke("cancel_http_download", { id });
}

// ── Network Bind Address ───────────────────────────────────

export async function getBindAddress(): Promise<string | null> {
  return invoke<string | null>("get_bind_address");
}

export async function setBindAddress(addr: string | null): Promise<void> {
  return invoke("set_bind_address", { addr });
}

export async function listNetworkInterfaces(): Promise<[string, string][]> {
  return invoke<[string, string][]>("list_network_interfaces");
}

// ── SOCKS5 Proxy ───────────────────────────────────────────

export async function getSocks5Proxy(): Promise<string | null> {
  return invoke<string | null>("get_socks5_proxy");
}

export async function setSocks5Proxy(url: string | null): Promise<void> {
  return invoke("set_socks5_proxy", { url });
}

export async function testSocks5Proxy(url: string): Promise<string> {
  return invoke<string>("test_socks5_proxy", { url });
}

// ── Blocklist (IP filter) ──────────────────────────────────

export async function getBlocklistUrl(): Promise<string | null> {
  return invoke<string | null>("get_blocklist_url");
}

export async function setBlocklistUrl(url: string | null): Promise<void> {
  return invoke("set_blocklist_url", { url });
}

// ── DHT / PEX / LPD Settings ─────────────────────────────────

export async function getGlobalDisableDht(): Promise<boolean> {
  return invoke<boolean>("get_global_disable_dht");
}
export async function setGlobalDisableDht(disabled: boolean): Promise<void> {
  return invoke("set_global_disable_dht", { disabled });
}
export async function getGlobalDisablePex(): Promise<boolean> {
  return invoke<boolean>("get_global_disable_pex");
}
export async function setGlobalDisablePex(disabled: boolean): Promise<void> {
  return invoke("set_global_disable_pex", { disabled });
}
export async function getGlobalDisableLpd(): Promise<boolean> {
  return invoke<boolean>("get_global_disable_lpd");
}
export async function setGlobalDisableLpd(disabled: boolean): Promise<void> {
  return invoke("set_global_disable_lpd", { disabled });
}

export async function getTorrentDht(id: number): Promise<boolean | null> {
  return invoke<boolean | null>("get_torrent_dht", { id });
}
export async function setTorrentDht(id: number, disabled: boolean | null): Promise<void> {
  return invoke("set_torrent_dht", { id, disabled });
}
export async function getTorrentPex(id: number): Promise<boolean | null> {
  return invoke<boolean | null>("get_torrent_pex", { id });
}
export async function setTorrentPex(id: number, disabled: boolean | null): Promise<void> {
  return invoke("set_torrent_pex", { id, disabled });
}
export async function getTorrentLpd(id: number): Promise<boolean | null> {
  return invoke<boolean | null>("get_torrent_lpd", { id });
}
export async function setTorrentLpd(id: number, disabled: boolean | null): Promise<void> {
  return invoke("set_torrent_lpd", { id, disabled });
}

// ── Encryption Mode ─────────────────────────────────────────

export async function getEncryptionMode(): Promise<string> {
  return invoke<string>("get_encryption_mode");
}
export async function setEncryptionMode(mode: string): Promise<void> {
  return invoke("set_encryption_mode", { mode });
}
export async function getTorrentEncryption(id: number): Promise<string | null> {
  return invoke<string | null>("get_torrent_encryption", { id });
}
export async function setTorrentEncryption(id: number, mode: string | null): Promise<void> {
  return invoke("set_torrent_encryption", { id, mode });
}

// ── Portfolios ──────────────────────────────────────────────────

export interface PortfolioPayload {
  id: number;
  name: string;
  icon: string;
  filter: string;
}

export async function getPortfolios(): Promise<PortfolioPayload[]> {
  return invoke<PortfolioPayload[]>("get_portfolios");
}
export async function addPortfolio(name: string, icon: string, filter: string): Promise<PortfolioPayload> {
  return invoke<PortfolioPayload>("add_portfolio", { name, icon, filter });
}
export async function updatePortfolio(id: number, name: string, icon: string, filter: string): Promise<void> {
  return invoke("update_portfolio", { id, name, icon, filter });
}
export async function removePortfolio(id: number): Promise<void> {
  return invoke("remove_portfolio", { id });
}

// ── uTP Settings ────────────────────────────────────────────

export async function getGlobalUtpEnabled(): Promise<boolean | null> {
  return invoke<boolean | null>("get_global_utp_enabled");
}

export async function setGlobalUtpEnabled(enabled: boolean | null): Promise<void> {
  return invoke("set_global_utp_enabled", { enabled });
}

export async function getTorrentUtp(id: number): Promise<boolean | null> {
  return invoke<boolean | null>("get_torrent_utp", { id });
}

export async function setTorrentUtp(id: number, enabled: boolean | null): Promise<void> {
  return invoke("set_torrent_utp", { id, enabled });
}

export async function getTorrentSuperSeed(id: number): Promise<boolean | null> {
  return invoke<boolean | null>("get_torrent_super_seed", { id });
}

export async function setTorrentSuperSeed(id: number, enabled: boolean | null): Promise<void> {
  return invoke("set_torrent_super_seed", { id, enabled });
}

// ── Default Client Registration ────────────────────────────

export async function isDefaultClientOffered(): Promise<boolean> {
  return invoke<boolean>("is_default_client_offered");
}

export async function setDefaultClientOffered(): Promise<void> {
  return invoke("set_default_client_offered");
}

export async function registerDefaultClient(): Promise<void> {
  return invoke("register_default_client");
}

// ── Peer & Tracker data ─────────────────────────────────

export async function getTorrentPeers(id: number): Promise<any> {
  return invoke("get_torrent_peers", { id });
}

export async function getTorrentTrackers(id: number): Promise<any> {
  return invoke("get_torrent_trackers", { id });
}

// ── Tracker Search ────────────────────────────────────────

export interface SearchResultPayload {
  name: string;
  magnet: string;
  size: number;
  seeds: number;
  peers: number;
  tracker: string;
  category: string;
}

export async function searchTrackers(query: string, sources: string[]): Promise<SearchResultPayload[]> {
  return invoke<SearchResultPayload[]>("search_trackers", { query, sources });
}

export async function checkJackettAvailable(): Promise<boolean> {
  return invoke<boolean>("check_jackett_available");
}

// ── Create .torrent File ────────────────────────────────────

export async function createTorrentFile(
  sourcePath: string,
  outputPath: string,
  name: string | null,
  pieceLength: number | null,
  trackers: string[] | null,
): Promise<string> {
  return invoke<string>("create_torrent_file", { sourcePath, outputPath, name, pieceLength, trackers });
}

// ── Export / Import ──────────────────────────────────────────

export async function exportTorrentsJson(): Promise<string> {
  return invoke<string>("export_torrents_json");
}

export async function exportTorrentsCsv(): Promise<string> {
  return invoke<string>("export_torrents_csv");
}

export async function exportTorrentsToFile(path: string, format: string): Promise<number> {
  return invoke<number>("export_torrents_to_file", { path, format });
}

export async function importTorrentsFromFile(path: string): Promise<number[]> {
  return invoke<number[]>("import_torrents_from_file", { path });
}

export async function importTorrentsJson(jsonData: string): Promise<number[]> {
  return invoke<number[]>("import_torrents_json", { jsonData });
}

export async function importTorrentsCsv(csvData: string): Promise<number[]> {
  return invoke<number[]>("import_torrents_csv", { csvData });
}
