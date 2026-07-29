import { useSignal, useComputed } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { torrents } from "../hooks/useTorrents";

interface PeerGeoResponse {
  total_peers: number;
  total_torrents: number;
  torrents: {
    id: number;
    name: string;
    peer_count: number;
    state: string;
  }[];
}

interface Props {
  onClose: () => void;
}

// ── SVG world map path data (simplified continents for visual reference) ──
const WORLD_PATHS = [
  { id: "na", label: "North America", d: "M20,15 L60,10 L95,20 L100,35 L105,50 L100,60 L95,70 L85,75 L70,70 L55,65 L40,60 L25,55 L20,45 L15,35 L15,25 Z" },
  { id: "sa", label: "South America", d: "M60,75 L75,70 L85,75 L90,85 L85,100 L80,115 L75,125 L70,130 L65,125 L60,115 L55,105 L50,95 L50,85 L55,80 Z" },
  { id: "eu", label: "Europe", d: "M105,20 L115,15 L125,15 L135,18 L140,25 L145,30 L140,38 L135,42 L125,45 L115,43 L108,38 L105,30 Z" },
  { id: "af", label: "Africa", d: "M105,50 L115,45 L125,45 L135,48 L140,55 L142,65 L140,78 L135,88 L128,95 L120,98 L112,95 L108,88 L105,78 L103,68 L102,58 Z" },
  { id: "as", label: "Asia", d: "M140,15 L155,10 L170,12 L185,15 L195,22 L200,30 L198,40 L195,48 L185,55 L175,58 L165,55 L155,50 L148,45 L142,38 L140,30 L138,22 Z" },
  { id: "au", label: "Australia", d: "M175,90 L185,85 L195,88 L200,95 L198,105 L190,110 L180,108 L175,100 Z" },
];

function usePeerGeoData() {
  const geoData = useSignal<PeerGeoResponse | null>(null);
  const loading = useSignal(true);
  const error = useSignal<string | null>(null);

  const loadData = async () => {
    loading.value = true;
    error.value = null;
    try {
      const resp = await window.fetch("http://127.0.0.1:8080/api/v2/peers/geo", { credentials: "include" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      geoData.value = await resp.json();
    } catch {
      error.value = "Web API unavailable — showing live data from Tauri events.";
      const list = Array.isArray(torrents.value) ? torrents.value : [];
      const torrentInfo = list.map((t) => ({ id: t.id, name: t.name ?? "Unknown", peer_count: t.peers, state: t.state }));
      geoData.value = {
        total_peers: torrentInfo.reduce((s, t) => s + t.peer_count, 0),
        total_torrents: torrentInfo.length,
        torrents: torrentInfo,
      };
    } finally {
      loading.value = false;
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30_000);
    return () => clearInterval(interval);
  }, []);

  return { geoData, loading, error };
}

/// Inner content of the peer map — can be embedded in MonitorDashboard.
export function PeerMapInner() {
  const { geoData, loading, error } = usePeerGeoData();
  const maxPeers = useComputed(() => Math.max(1, ...(geoData.value?.torrents.map((t) => t.peer_count) ?? [1])));
  const totalPeers = geoData.value?.total_peers ?? 0;
  const totalTorrents = geoData.value?.total_torrents ?? 0;

  const formatPeers = (n: number): string => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
  };

  if (loading.value && !geoData.value) {
    return (
      <div class="peer-map-loading">
        <div class="spinner" />
        <p>Loading peer data...</p>
      </div>
    );
  }

  return (
    <>
      {/* ── Stats overview ──────────────────────────────────── */}
      <div class="peer-map-stats">
        <div class="peer-map-stat-card">
          <div class="peer-map-stat-icon">🌍</div>
          <div class="peer-map-stat-val">{formatPeers(totalPeers)}</div>
          <div class="peer-map-stat-label">Total Peers</div>
        </div>
        <div class="peer-map-stat-card">
          <div class="peer-map-stat-icon">📦</div>
          <div class="peer-map-stat-val">{totalTorrents}</div>
          <div class="peer-map-stat-label">Active Torrents</div>
        </div>
        <div class="peer-map-stat-card">
          <div class="peer-map-stat-icon">⚡</div>
          <div class="peer-map-stat-val">
            {totalTorrents > 0 ? Math.round(totalPeers / totalTorrents) : 0}
          </div>
          <div class="peer-map-stat-label">Avg Peers/Torrent</div>
        </div>
        <div class="peer-map-stat-card">
          <div class="peer-map-stat-icon">🔄</div>
          <div class="peer-map-stat-val">
            {geoData.value?.torrents.filter((t) => t.state === "downloading").length ?? 0}
          </div>
          <div class="peer-map-stat-label">Downloading</div>
        </div>
      </div>

      {/* ── World Map ────────────────────────────────────────── */}
      <div class="peer-map-container">
        <svg viewBox="0 0 220 145" class="peer-map-svg" xmlns="http://www.w3.org/2000/svg">
          <rect width="220" height="145" fill="rgba(13, 20, 16, 0.5)" rx="6" />
          {[0, 1, 2, 3, 4].map((i) => (
            <line key={`h${i}`} x1="0" y1={29 * i + 10} x2="220" y2={29 * i + 10}
              stroke="rgba(45, 138, 78, 0.06)" stroke-width="0.5" />
          ))}
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <line key={`v${i}`} x1={44 * i} y1="0" x2={44 * i} y2="145"
              stroke="rgba(45, 138, 78, 0.06)" stroke-width="0.5" />
          ))}
          {WORLD_PATHS.map((p) => (
            <g key={p.id} class="peer-map-continent">
              <path d={p.d} fill="rgba(45, 138, 78, 0.06)"
                stroke="rgba(52, 211, 94, 0.2)" stroke-width="0.8" class="peer-map-path" />
            </g>
          ))}
          {totalPeers > 0 && Array.from({ length: Math.min(totalPeers, 30) }).map((_, i) => {
            const seed = i * 137.5;
            const lat = ((seed * 1.3) % 140) + 10;
            const lon = ((seed * 2.7) % 100) + 15;
            const size = 1.5 + (i % 3) * 0.5;
            const delay = (i * 0.15) % 4;
            const duration = 2 + (i % 4);
            return (
              <circle key={`dot-${i}`} cx={lat} cy={lon} r={size}
                fill="rgba(52, 211, 94, 0.7)" class="peer-map-dot"
                style={{ animationDelay: `${delay}s`, animationDuration: `${duration}s` }} />
            );
          })}
        </svg>
        <div class="peer-map-map-label">
          {totalPeers > 0
            ? `🌐 ${totalPeers} peers across ${WORLD_PATHS.length} regions`
            : "🌐 No active peer connections"}
        </div>
      </div>

      {/* ── Hint ─────────────────────────────────────────────── */}
      {error.value && <div class="peer-map-hint"><span>ℹ️ {error.value}</span></div>}
      {!error.value && (
        <div class="peer-map-hint">
          <span>💡 Place <code>GeoLite2-City.mmdb</code> in the app data directory for geo-location</span>
        </div>
      )}

      {/* ── Per-torrent peer breakdown ──────────────────────── */}
      <div class="peer-map-torrents">
        <div class="peer-map-torrents-title">
          Peers per Torrent
          <span class="peer-map-torrents-count">
            {geoData.value?.torrents.filter((t) => t.peer_count > 0).length ?? 0} active
          </span>
        </div>
        <div class="peer-map-torrent-list">
          {geoData.value?.torrents
            .filter((t) => t.peer_count > 0)
            .sort((a, b) => b.peer_count - a.peer_count)
            .slice(0, 20)
            .map((t) => {
              const pct = (t.peer_count / maxPeers.value) * 100;
              return (
                <div key={t.id} class="peer-map-torrent-row">
                  <span class="peer-map-torrent-name" title={t.name}>{t.name}</span>
                  <div class="peer-map-torrent-bar-wrap">
                    <div class="peer-map-torrent-bar" style={{ width: `${pct}%` }} />
                  </div>
                  <span class="peer-map-torrent-count">{t.peer_count}</span>
                </div>
              );
            })}
          {(!geoData.value?.torrents.some((t) => t.peer_count > 0)) && (
            <div class="peer-map-empty"><span>No active peer connections</span></div>
          )}
        </div>
      </div>
    </>
  );
}

/// Standalone PeerMap dialog (wraps PeerMapInner with dialog chrome).
export function PeerMap({ onClose }: Props) {
  return (
    <div class="dialog-overlay" onClick={onClose}>
      <div class="dialog peer-map-dialog" onClick={(e) => e.stopPropagation()}>
        <div class="dialog-header">
          <span class="dialog-title">
            <span style="margin-right: 6px;">🗺️</span>
            Peer Map — Distribution Overview
          </span>
          <button class="dialog-close" onClick={onClose}>&times;</button>
        </div>
        <div class="dialog-body">
          <PeerMapInner />
        </div>
        <div class="dialog-footer">
          <button class="btn btn-primary btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
