import { sessionStats, torrents } from "../hooks/useTorrents";
import { fmtBytes, fmtSpeed, fmtDuration, fmtRatio } from "../utils/format";

/**
 * Displays session-level statistics in a card-based layout:
 * total downloaded/uploaded, uptime, peer activity, speed averages.
 */
export function SessionStats() {
  const stats = sessionStats.value;
  const list = torrents.value;

  const totalTorrents = list.length;
  const activeDl = list.filter((t) => t.state === "downloading" || t.state === "metadata").length;
  const activeSeed = list.filter((t) => t.state === "seeding" || t.state === "completed").length;
  const paused = list.filter((t) => t.state === "paused").length;
  const errored = list.filter((t) => t.state === "error").length;

  // Compute total size of all torrents
  const totalSize = list.reduce((acc, t) => acc + t.size, 0);
  // Compute remaining bytes to download
  const totalRemaining = list.reduce((acc, t) => acc + Math.round(t.size * (1 - t.progress)), 0);

  const cards: { icon: string; label: string; value: string; color?: string }[] = [
    { icon: "📥", label: "Total Downloaded", value: fmtBytes(stats.total_downloaded), color: "var(--accent-light)" },
    { icon: "📤", label: "Total Uploaded", value: fmtBytes(stats.total_uploaded), color: "var(--green)" },
    { icon: "📊", label: "Global Ratio", value: fmtRatio(stats.total_downloaded, stats.total_uploaded), color: "var(--text)" },
    { icon: "⏱️", label: "Session Uptime", value: fmtDuration(stats.uptime_secs), color: "var(--accent)" },
    { icon: "📦", label: "Torrents", value: `${totalTorrents}`, color: "var(--text)" },
    { icon: "⬇️", label: "Active Downloads", value: `${activeDl}`, color: "var(--accent-light)" },
    { icon: "⬆️", label: "Active Seeds", value: `${activeSeed}`, color: "var(--green)" },
    { icon: "⏸️", label: "Paused", value: `${paused}`, color: "var(--yellow)" },
    { icon: "❌", label: "Errors", value: `${errored}`, color: "var(--red)" },
    { icon: "👥", label: "Total Peers", value: `${stats.total_peers}`, color: "var(--purple)" },
    { icon: "💾", label: "Total Size", value: fmtBytes(totalSize), color: "var(--text-secondary)" },
    { icon: "📋", label: "Remaining", value: fmtBytes(totalRemaining), color: "var(--text-muted)" },
  ];

  return (
    <div class="session-stats">
      <div class="session-stats-grid">
        {cards.map((card) => (
          <div key={card.label} class="session-stat-card">
            <div class="session-stat-icon">{card.icon}</div>
            <div class="session-stat-value" style={card.color ? { color: card.color } : undefined}>
              {card.value}
            </div>
            <div class="session-stat-label">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Speed summary row */}
      <div class="session-speed-row">
        <span class="session-speed-item">
          <span class="session-speed-dot" style="background: var(--accent-light);" />
          Download: <strong>{fmtSpeed(stats.download_speed)}</strong>
        </span>
        <span class="session-speed-item">
          <span class="session-speed-dot" style="background: var(--green);" />
          Upload: <strong>{fmtSpeed(stats.upload_speed)}</strong>
        </span>
      </div>
    </div>
  );
}
