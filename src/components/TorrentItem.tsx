import type { TorrentListEntry } from "../hooks/useTorrents";
import { pauseTorrent, resumeTorrent, deleteTorrent } from "../hooks/useTorrents";

interface Props {
  torrent: TorrentListEntry;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatSpeed(bytesPerSec: number): string {
  return formatBytes(bytesPerSec).replace(/( [BKMGTP])/, "$1/s");
}

function formatETA(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return "∞";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const stateColors: Record<string, string> = {
  downloading: "#3b82f6",
  seeding: "#22c55e",
  paused: "#f59e0b",
  checking: "#8b5cf6",
  queued: "#6b7280",
  error: "#ef4444",
  completed: "#22c55e",
  metadata: "#a855f7",
};

export function TorrentItem({ torrent }: Props) {
  const progressPct = (torrent.progress * 100).toFixed(1);
  const stateLabel = (torrent.state ?? "unknown").charAt(0).toUpperCase() + (torrent.state ?? "unknown").slice(1);
  const stateColor = stateColors[torrent.state?.toLowerCase() ?? ""] || "#6b7280";
  const isPaused = torrent.state?.toLowerCase() === "paused";

  const handlePauseResume = () => {
    if (isPaused) {
      resumeTorrent(torrent.id);
    } else {
      pauseTorrent(torrent.id);
    }
  };

  const handleDelete = () => {
    if (confirm(`Delete "${torrent.name || "Unknown"}"?`)) {
      deleteTorrent(torrent.id, false);
    }
  };

  return (
    <div class="torrent-item">
      <div class="torrent-main">
        <div class="torrent-info">
          <div class="torrent-name">
            <span class="state-dot" style={{ background: stateColor }} />
            {torrent.name || "Loading metadata..."}
          </div>
          <div class="torrent-meta">
            <span class="meta-badge" style={{ background: stateColor }}>
              {stateLabel}
            </span>
            <span>{formatBytes(torrent.size)}</span>
            <span>⬇ {formatSpeed(torrent.download_speed)}</span>
            <span>⬆ {formatSpeed(torrent.upload_speed)}</span>
            {torrent.eta !== null && torrent.eta > 0 && <span>ETA: {formatETA(torrent.eta)}</span>}
            <span>Peers: {torrent.peers} | Seeds: {torrent.seeds}</span>
          </div>
        </div>
        <div class="torrent-actions">
          <button
            class="btn btn-sm"
            onClick={handlePauseResume}
            title={isPaused ? "Resume" : "Pause"}
          >
            {isPaused ? "▶" : "⏸"}
          </button>
          <button class="btn btn-sm btn-danger" onClick={handleDelete} title="Delete">
            ✕
          </button>
        </div>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style={{ width: `${progressPct}%` }} />
        <span class="progress-text">{progressPct}%</span>
      </div>
    </div>
  );
}
