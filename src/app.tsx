import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import {
  useTorrents,
  loading,
  loadingError,
  retryLoading,
  getRssFeeds,
} from "./hooks/useTorrents";
import { Toolbar } from "./components/Toolbar";
import { Sidebar } from "./components/Sidebar";
import { TorrentTable } from "./components/TorrentTable";
import { DetailPanel } from "./components/DetailPanel";
import { StatusBar } from "./components/StatusBar";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { DeleteConfirmDialog } from "./components/DeleteConfirmDialog";
import { SpeedLimitsDialog } from "./components/SpeedLimitsDialog";
import { QueueConfigDialog } from "./components/QueueConfigDialog";
import { SpeedScheduleDialog } from "./components/SpeedScheduleDialog";
import { RssDialog } from "./components/RssDialog";
import { CategoriesDialog } from "./components/CategoriesDialog";
import { AutoManagementDialog } from "./components/AutoManagementDialog";
import { MonitorDashboard } from "./components/MonitorDashboard";
import { HistoryDialog } from "./components/HistoryDialog";
import { VideoPlayer } from "./components/VideoPlayer";
import { SetupDefaultClientDialog } from "./components/SetupDefaultClientDialog";
import { WatchFolderDialog } from "./components/WatchFolderDialog";
import { ProxyDialog } from "./components/ProxyDialog";
import { BindAddressDialog } from "./components/BindAddressDialog";
import { UtpDialog } from "./components/UtpDialog";
import { NetworkFeaturesDialog } from "./components/NetworkFeaturesDialog";
import { EncryptionDialog } from "./components/EncryptionDialog";
import { ClipboardMagnetDialog } from "./components/ClipboardMagnetDialog";
import { ClipboardMonitorDialog } from "./components/ClipboardMonitorDialog";
import { TorrentPreviewDialog } from "./components/TorrentPreviewDialog";
import { PortfolioDialog } from "./components/PortfolioDialog";
import { CreateTorrentDialog } from "./components/CreateTorrentDialog";
import { TorrentSearchDialog } from "./components/TorrentSearchDialog";
import { AboutDialog } from "./components/AboutDialog";
import { UpdateDialog } from "./components/UpdateDialog";
import { locale } from "./hooks/useLocales";
import { save, open } from "@tauri-apps/plugin-dialog";
import { pauseTorrent, resumeTorrent } from "./hooks/useTorrents";
import { torrents } from "./hooks/useTorrents";
import {
  setTurtleMode,
  getSpeedLimits,
  getQueueConfig,
  getSpeedSchedule,
  getAutoManagementConfig,
  SpeedLimitsPayload,
  QueueConfigPayload,
  ScheduleRulePayload,
  AutoManagementConfigPayload,
  speedSchedule,
  rssFeeds,
  exportTorrentsToFile,
  importTorrentsFromFile,
  isDefaultClientOffered,
  getPortfolios,
  clipboardMagnet,
  torrentPreviewQueue,
} from "./hooks/useTorrents";

function AppInner() {
  useTorrents();

  const filter = useSignal("all");
  const search = useSignal("");
  const selectedIds = useSignal<Set<number>>(new Set());
  const selectedSingle = useSignal<number | null>(null);

  const deleteIds = useSignal<number[]>([]);
  const deleteNames = useSignal<string[]>([]);

  const speedLimits = useSignal<SpeedLimitsPayload | null>(null);
  const showSpeedDialog = useSignal(false);

  const queueConfig = useSignal<QueueConfigPayload | null>(null);
  const showQueueDialog = useSignal(false);

  const showScheduleDialog = useSignal(false);
  const showRssDialog = useSignal(false);
  const showCategoriesDialog = useSignal(false);
  const showAutoMgmtDialog = useSignal(false);
  const autoMgmtConfig = useSignal<AutoManagementConfigPayload | null>(null);
  const showMonitor = useSignal(false);
  const showHistory = useSignal(false);
  const showDefaultClientDialog = useSignal(false);
  const showProxyDialog = useSignal(false);
  const showBindDialog = useSignal(false);
  const showUtpDialog = useSignal(false);
  const showNetFeaturesDialog = useSignal(false);
  const showEncryptionDialog = useSignal(false);
  const showClipboardDialog = useSignal(false);
  const showPortfolioDialog = useSignal(false);
  const showCreateTorrentDialog = useSignal(false);
  const showSearchDialog = useSignal(false);
  const showAboutDialog = useSignal(false);
  const showWatchFolderDialog = useSignal(false);

  // Update state
  const updateInfo = useSignal<{ version: string; name: string; url: string; notes: string; current_version: string } | null>(null);
  const showUpdateDialog = useSignal(false);
  const checkingUpdate = useSignal(false);

  const checkForUpdates = async (silentFail = false) => {
    const skipVersion = localStorage.getItem("asutorrent-skip-version");
    checkingUpdate.value = true;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result: any = await invoke("check_for_updates", { currentVersion: "1.0.0" });
      if (result) {
        if (result.version === skipVersion) {
          // User skipped this version
          updateInfo.value = null;
        } else {
          updateInfo.value = result;
          showUpdateDialog.value = true;
        }
      } else {
        updateInfo.value = null;
      }
    } catch (e) {
      if (!silentFail) {
        console.error("Update check failed:", e);
      }
      updateInfo.value = null;
    } finally {
      checkingUpdate.value = false;
    }
  };

  const handleSkipVersion = () => {
    if (updateInfo.value) {
      localStorage.setItem("asutorrent-skip-version", updateInfo.value.version);
    }
    updateInfo.value = null;
    showUpdateDialog.value = false;
  };

  // Theme state — read from localStorage, default to dark
  const isDark = useSignal(
    localStorage.getItem("asutorrent-theme") !== "light"
  );

  // Apply theme on mount and on change
  useEffect(() => {
    const theme = isDark.value ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", theme);
  }, [isDark.value]);

  // Persist locale on change
  useEffect(() => {
    localStorage.setItem("asutorrent-locale", locale.value);
    document.documentElement.setAttribute("lang", locale.value);
  }, [locale.value]);

  const toggleTheme = () => {
    isDark.value = !isDark.value;
    localStorage.setItem("asutorrent-theme", isDark.value ? "dark" : "light");
  };

  // Video player state
  const videoPlayerUrl = useSignal<string | null>(null);
  const videoPlayerFile = useSignal<string>("");

  const playVideo = (torrentId: number, fileIndex: number, fileName: string) => {
    videoPlayerUrl.value = `http://127.0.0.1:8080/api/v2/torrents/stream/${torrentId}/${fileIndex}`;
    videoPlayerFile.value = fileName;
  };

  useEffect(() => {
    getSpeedLimits().then((limits) => { speedLimits.value = limits; }).catch(() => {});
    getQueueConfig().then((cfg) => { queueConfig.value = cfg; }).catch(() => {});
    getSpeedSchedule().then((sched) => { speedSchedule.value = sched; }).catch(() => {});
    getRssFeeds().then((feeds) => { rssFeeds.value = feeds; }).catch(() => {});
    getAutoManagementConfig().then((cfg) => { autoMgmtConfig.value = cfg; }).catch(() => {});
    // Show default client dialog on first launch
    isDefaultClientOffered().then((offered) => {
      if (!offered) showDefaultClientDialog.value = true;
    }).catch(() => {});
    // Check for updates on startup (silent fail if cannot reach GitHub)
    checkForUpdates(true);
  }, []);

  const handleRefreshPortfolios = () => {
    getPortfolios().catch(() => {});
  };

  const handleOpenAutoMgmt = () => {
    getAutoManagementConfig().then((cfg) => {
      autoMgmtConfig.value = cfg;
      showAutoMgmtDialog.value = true;
    }).catch(() => {});
  };

  const handleTurtleToggle = () => {
    const current = speedLimits.value;
    if (!current) return;
    const newMode = !current.turtle_mode;
    setTurtleMode(newMode).then(() => {
      speedLimits.value = { ...current, turtle_mode: newMode };
    });
  };

  const handleLimitsChanged = (limits: SpeedLimitsPayload) => {
    speedLimits.value = limits;
  };

  const onPauseAll = () => { selectedIds.value.forEach((id) => pauseTorrent(id)); };
  const onResumeAll = () => { selectedIds.value.forEach((id) => resumeTorrent(id)); };
  const onDeleteSelected = () => {
    const ids = [...selectedIds.value];
    if (ids.length === 0) return;
    deleteIds.value = ids;
    deleteNames.value = ids.map(
      (id) => torrents.value.find((t) => t.id === id)?.name ?? `Torrent #${id}`
    );
  };

  const handleExport = async (format: string) => {
    try {
      const filters = format === "json"
        ? [{ name: "JSON", extensions: ["json"] as string[] }]
        : [{ name: "CSV", extensions: ["csv"] as string[] }];
      const path = await save({
        defaultPath: `torrents.${format}`,
        filters,
      });
      if (!path) return;
      const count = await exportTorrentsToFile(path, format);
      alert(`✅ Exported ${count} torrent(s) to ${path}`);
    } catch (err) {
      console.error("Export failed:", err);
      alert("❌ Export failed: " + err);
    }
  };

  const handleImport = async () => {
    try {
      const path = await open({
        filters: [
          { name: "Torrent List", extensions: ["json", "csv"] as string[] },
          { name: "JSON", extensions: ["json"] as string[] },
          { name: "CSV", extensions: ["csv"] as string[] },
        ],
        multiple: false,
      });
      if (!path) return;
      const ids = await importTorrentsFromFile(path);
      alert(`✅ Imported ${ids.length} torrent(s) from ${path}`);
      if (ids.length === 0) {
        alert("⚠️ No torrents were imported. The file may be empty or contain invalid entries.");
      }
    } catch (err) {
      console.error("Import failed:", err);
      alert("❌ Import failed: " + err);
    }
  };

  if (loading.value && !loadingError.value) {
    return (
      <div class="loading-screen">
        <div class="spinner" />
        <p>Starting torrent engine\u{2026}</p>
        <span class="loading-hint">Connecting to the BitTorrent session\u{2026}</span>
      </div>
    );
  }

  if (loadingError.value) {
    return (
      <div class="error-screen">
        <div class="error-icon">{'\u26A0'}</div>
        <h2>Torrent Engine Error</h2>
        <pre class="error-message">{loadingError.value}</pre>
        <div class="error-actions">
          <button class="btn btn-primary" onClick={retryLoading}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div class="app">
      <Toolbar
        selectedCount={selectedIds.value.size}
        onPauseAll={onPauseAll}
        onResumeAll={onResumeAll}
        onDeleteSelected={onDeleteSelected}
        search={search.value}
        onSearch={(v) => (search.value = v)}
        turtleMode={speedLimits.value?.turtle_mode ?? false}
        onTurtleToggle={handleTurtleToggle}
        onOpenSpeedLimits={() => (showSpeedDialog.value = true)}
        onOpenQueueConfig={() => (showQueueDialog.value = true)}
        onOpenSchedule={() => (showScheduleDialog.value = true)}
        onOpenCategories={() => (showCategoriesDialog.value = true)}
        onOpenAutoMgmt={handleOpenAutoMgmt}
        onOpenWatchFolder={() => (showWatchFolderDialog.value = true)}
        onExportJson={() => handleExport("json")}
        onExportCsv={() => handleExport("csv")}
        onImport={handleImport}
        onOpenProxy={() => (showProxyDialog.value = true)}
        onOpenBindAddress={() => (showBindDialog.value = true)}
        onOpenUtp={() => (showUtpDialog.value = true)}
        onOpenNetworkFeatures={() => (showNetFeaturesDialog.value = true)}
        onOpenEncryption={() => (showEncryptionDialog.value = true)}
        onOpenClipboard={() => (showClipboardDialog.value = true)}
        onCreateTorrent={() => (showCreateTorrentDialog.value = true)}
        onOpenSearch={() => (showSearchDialog.value = true)}
        isDark={isDark.value}
        onToggleTheme={toggleTheme}
        onOpenAbout={() => (showAboutDialog.value = true)}
      />
      <div class="main-area">
        <Sidebar
          filter={filter.value}
          onFilterChange={(v) => (filter.value = v)}
          onOpenRss={() => (showRssDialog.value = true)}
          onOpenCategories={() => (showCategoriesDialog.value = true)}
          onOpenMonitor={() => (showMonitor.value = true)}
          onOpenHistory={() => (showHistory.value = true)}
          onOpenPortfolios={() => (showPortfolioDialog.value = true)}
        />
        <div class="content-area">
          <TorrentTable
            filter={filter.value}
            search={search.value}
            onSelectionChange={(ids) => {
              selectedIds.value = ids;
              selectedSingle.value = ids.size === 1 ? [...ids][0] : null;
            }}
            onPlayFile={playVideo}
          />
          <DetailPanel selectedId={selectedSingle.value} onPlayFile={playVideo} />
        </div>
      </div>
      <StatusBar speedLimits={speedLimits.value} queueConfig={queueConfig.value} checkingUpdate={checkingUpdate.value} onCheckUpdates={() => checkForUpdates(false)} />

      {deleteIds.value.length > 0 && (
        <DeleteConfirmDialog
          ids={deleteIds.value}
          names={deleteNames.value}
          onClose={() => { deleteIds.value = []; deleteNames.value = []; }}
          onDone={() => { selectedIds.value = new Set(); }}
        />
      )}

      {showSpeedDialog.value && speedLimits.value && (
        <SpeedLimitsDialog
          limits={speedLimits.value}
          onChanged={handleLimitsChanged}
          onClose={() => (showSpeedDialog.value = false)}
        />
      )}

      {showQueueDialog.value && queueConfig.value && (
        <QueueConfigDialog
          config={queueConfig.value}
          onSaved={(cfg) => { queueConfig.value = cfg; }}
          onClose={() => (showQueueDialog.value = false)}
        />
      )}

      {showScheduleDialog.value && speedSchedule.value && (
        <SpeedScheduleDialog
          rules={speedSchedule.value.rules}
          enabled={speedSchedule.value.enabled}
          active={speedSchedule.value.active}
          onSaved={(rules: ScheduleRulePayload[], enabled: boolean) => {
            speedSchedule.value = { rules, enabled, active: false };
          }}
          onClose={() => (showScheduleDialog.value = false)}
        />
      )}

      {showRssDialog.value && (
        <RssDialog onClose={() => (showRssDialog.value = false)} />
      )}

      {showCategoriesDialog.value && (
        <CategoriesDialog onClose={() => (showCategoriesDialog.value = false)} />
      )}

      {showAutoMgmtDialog.value && autoMgmtConfig.value && (
        <AutoManagementDialog
          config={autoMgmtConfig.value}
          onSaved={(cfg) => { autoMgmtConfig.value = cfg; }}
          onClose={() => (showAutoMgmtDialog.value = false)}
        />
      )}

      {showHistory.value && (
        <HistoryDialog onClose={() => (showHistory.value = false)} />
      )}

      {showMonitor.value && (
        <MonitorDashboard onClose={() => (showMonitor.value = false)} />
      )}

      {showBindDialog.value && (
        <BindAddressDialog onClose={() => (showBindDialog.value = false)} />
      )}

      {showSearchDialog.value && (
        <TorrentSearchDialog onClose={() => (showSearchDialog.value = false)} />
      )}

      {showCreateTorrentDialog.value && (
        <CreateTorrentDialog onClose={() => (showCreateTorrentDialog.value = false)} />
      )}

      {showPortfolioDialog.value && (
        <PortfolioDialog
          currentFilter={filter.value}
          onClose={() => (showPortfolioDialog.value = false)}
          onSaved={handleRefreshPortfolios}
        />
      )}

      {showEncryptionDialog.value && (
        <EncryptionDialog onClose={() => (showEncryptionDialog.value = false)} />
      )}

      {showClipboardDialog.value && (
        <ClipboardMonitorDialog onClose={() => (showClipboardDialog.value = false)} />
      )}

      {clipboardMagnet.value && (
        <ClipboardMagnetDialog
          url={clipboardMagnet.value.url}
          name={clipboardMagnet.value.name}
          onClose={() => (clipboardMagnet.value = null)}
        />
      )}

      {torrentPreviewQueue.value.length > 0 && <TorrentPreviewDialog />}

      {showNetFeaturesDialog.value && (
        <NetworkFeaturesDialog onClose={() => (showNetFeaturesDialog.value = false)} />
      )}

      {showUtpDialog.value && (
        <UtpDialog onClose={() => (showUtpDialog.value = false)} />
      )}

      {showProxyDialog.value && (
        <ProxyDialog onClose={() => (showProxyDialog.value = false)} />
      )}

      {showDefaultClientDialog.value && (
        <SetupDefaultClientDialog
          onClose={() => (showDefaultClientDialog.value = false)}
        />
      )}

      {showAboutDialog.value && (
        <AboutDialog onClose={() => (showAboutDialog.value = false)} />
      )}

      {showWatchFolderDialog.value && (
        <WatchFolderDialog onClose={() => (showWatchFolderDialog.value = false)} />
      )}

      {showUpdateDialog.value && updateInfo.value && (
        <UpdateDialog
          update={updateInfo.value}
          onClose={() => { showUpdateDialog.value = false; }}
          onSkip={handleSkipVersion}
        />
      )}

      {videoPlayerUrl.value && (
        <VideoPlayer
          url={videoPlayerUrl.value}
          fileName={videoPlayerFile.value}
          onClose={() => {
            videoPlayerUrl.value = null;
            videoPlayerFile.value = "";
          }}
        />
      )}
    </div>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}
