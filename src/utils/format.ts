/**
 * Shared formatting utilities for the AsuTorrent UI.
 * All components should import from here instead of defining their own copies.
 */

/** Format byte count to human-readable string (B, KB, MB, GB, TB) */
export function fmtBytes(v: number, suffix = "B"): string {
  if (v <= 0) return `0 ${suffix}`;
  const u = [suffix, `K${suffix}`, `M${suffix}`, `G${suffix}`, `T${suffix}`];
  const i = Math.min(Math.floor(Math.log(v) / Math.log(1024)), u.length - 1);
  const decimals = v >= 1_000_000_000 ? 2 : 1;
  return `${(v / Math.pow(1024, i)).toFixed(decimals)} ${u[i]}`;
}

/** Format speed (bytes/sec) to human-readable string */
export function fmtSpeed(v: number): string {
  if (v <= 0) return "0 B/s";
  return fmtBytes(v, "B/s");
}

/**
 * Format speed limit. Returns ∞ if null/zero.
 * Uses 0 decimal places for KB/s, 1 decimal for MB/s+.
 */
export function fmtLimit(bps: number | null): string {
  if (bps === null || bps <= 0) return "\u221E";
  const u = ["B/s", "KB/s", "MB/s", "GB/s"];
  const i = Math.min(Math.floor(Math.log(bps) / Math.log(1024)), u.length - 1);
  const decimals = bps >= 1_000_000 ? 1 : 0;
  return `${(bps / Math.pow(1024, i)).toFixed(decimals)} ${u[i]}`;
}

/** Format seconds to human-readable ETA string (e.g. "2m 5s", "1h 2m", "1d 1h") */
export function fmtETA(seconds: number | null): string {
  if (seconds === null || seconds <= 0 || !isFinite(seconds)) return "";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Format duration (total seconds) as "Xd Xh Xm Xs" */
export function fmtDuration(totalSecs: number): string {
  if (totalSecs <= 0) return "0s";
  const days = Math.floor(totalSecs / 86400);
  const hours = Math.floor((totalSecs % 86400) / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0) parts.push(`${mins}m`);
  parts.push(`${secs}s`);
  return parts.join(" ");
}

/** Format share ratio (uploaded / downloaded) */
export function fmtRatio(downloaded: number, uploaded: number): string {
  if (downloaded <= 0) return "\u2014";
  return (uploaded / downloaded).toFixed(3);
}

/** Format date from Unix timestamp with relative labels (Today, Yesterday) */
export function fmtDate(ts: number): string {
  if (!ts) return "—";
  const d = new Date(ts * 1000);
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays === 0) {
    return `Today ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } else if (diffDays === 1) {
    return `Yesterday ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  }
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
