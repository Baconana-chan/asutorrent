/**
 * Presentation helpers for the torrent health indicator.
 * The health score/labels are computed on the backend; this module only
 * maps them to colors, human-readable titles and age strings.
 */

import { t } from "../hooks/useLocales";

/** Health indicator computed by the backend from swarm signals. */
export interface HealthPayload {
  /** 0–100 overall health score */
  score: number;
  label: "excellent" | "good" | "medium" | "low" | "dead";
  /** Estimated seed sources (peers that demonstrably fed us pieces) */
  seeds: number;
  /** Currently connected peers */
  peers: number;
  /** Seconds since this torrent was added (0 if unknown) */
  age_secs: number;
  /** Soft estimate of piece availability in the swarm, 0..1 */
  availability: number;
}

export type HealthLabel = HealthPayload["label"];

/** Human-readable name per health level (localized). */
export function healthLabelText(label: HealthLabel): string {
  return t(`health.label.${label}`, label);
}

/** Fallback when a torrent has no health data yet. */
export const HEALTH_UNKNOWN_COLOR = "#64748b";

/**
 * Color stops for the health score gradient, aligned with the semantic
 * label palette: green (excellent) → lime (good) → yellow (medium) →
 * orange (low) → red (dead). Interpolated linearly between stops.
 */
const SCORE_STOPS: Array<[number, [number, number, number]]> = [
  [100, [74, 222, 128]], //  #4ade80 excellent
  [75, [163, 230, 53]], //   #a3e635 good
  [50, [250, 204, 21]], //   #facc15 medium
  [25, [251, 146, 60]], //   #fb923c low
  [0, [248, 113, 113]], //   #f87171 dead
];

/**
 * Interpolate a color across the green → red gradient by score (0–100).
 * Returns an `rgb(...)` string usable in inline styles.
 */
export function healthScoreColor(score: number): string {
  const clamped = Math.max(0, Math.min(100, score));
  for (let i = 0; i < SCORE_STOPS.length - 1; i++) {
    const [hi, hiColor] = SCORE_STOPS[i];
    const [lo, loColor] = SCORE_STOPS[i + 1];
    if (clamped <= hi && clamped >= lo) {
      const t = (clamped - lo) / (hi - lo || 1);
      const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
      return `rgb(${mix(loColor[0], hiColor[0])}, ${mix(loColor[1], hiColor[1])}, ${mix(loColor[2], hiColor[2])})`;
    }
  }
  return "rgb(74, 222, 128)";
}

/** Short score label, e.g. "Excellent (85)". */
export function healthStatus(h: HealthPayload | null | undefined): string {
  if (!h) return "—";
  return t("health.status", "{label} ({score})")
    .replace("{label}", healthLabelText(h.label))
    .replace("{score}", String(Math.round(h.score)));
}

/** Format an age (seconds) as a compact string, e.g. "3d 2h", "45m". */
export function fmtAge(secs: number): string {
  if (!secs || secs <= 0 || !isFinite(secs)) return "—";
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) {
    return t("health.age_days", "{d}d {h}h").replace("{d}", String(d)).replace("{h}", String(h));
  }
  if (h > 0) {
    return t("health.age_hours", "{h}h {m}m").replace("{h}", String(h)).replace("{m}", String(m));
  }
  if (m > 0) {
    return t("health.age_minutes", "{m}m").replace("{m}", String(m));
  }
  return t("health.age_less_min", "<1m");
}

/** Format availability (0..1) as a percentage, e.g. "80%". */
export function fmtAvailability(a: number | undefined): string {
  if (a === undefined || a === null || !isFinite(a)) return "—";
  return `${Math.round(Math.max(0, Math.min(1, a)) * 100)}%`;
}

/** Full tooltip for the health indicator: score, seeds, peers, age, availability. */
export function healthTitle(h: HealthPayload | null | undefined): string {
  if (!h) return t("health.unknown", "Health: unknown");
  return [
    t("health.status_full", "Health: {status}").replace("{status}", healthStatus(h)),
    t("health.seed_sources_n", "Seed sources: {n}").replace("{n}", String(h.seeds)),
    t("health.peers_n", "Peers: {n}").replace("{n}", String(h.peers)),
    t("health.added_ago", "Added: {age} ago").replace("{age}", fmtAge(h.age_secs)),
    t("health.availability_n", "Availability: ~{pct}").replace("{pct}", fmtAvailability(h.availability)),
  ].join("\n");
}
