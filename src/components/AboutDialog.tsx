import { t } from "../hooks/useLocales";

interface Props {
  onClose: () => void;
}

const RUST_DEPENDENCIES = [
  { name: "Tauri", version: "2", desc: "Native desktop framework" },
  { name: "librqbit", version: "8", desc: "BitTorrent engine" },
  { name: "Axum", version: "0.7", desc: "HTTP server (streaming)" },
  { name: "Tokio", version: "1", desc: "Async runtime" },
  { name: "Serde", version: "1", desc: "Serialization" },
  { name: "reqwest", version: "0.12", desc: "HTTP client (RSS, proxy)" },
  { name: "maxminddb", version: "0.30", desc: "GeoIP (peer map)" },
  { name: "rss", version: "2", desc: "RSS feed parsing" },
  { name: "chrono", version: "0.4", desc: "Date/time" },
  { name: "regex", version: "1", desc: "Regex matching" },
  { name: "image", version: "0.25", desc: "Image decoding (tray icon)" },
  { name: "if-addrs", version: "0.12", desc: "Network interfaces" },
];

const FRONTEND_DEPENDENCIES = [
  { name: "Preact", version: "10.26", desc: "UI framework" },
  { name: "@preact/signals", version: "2.0", desc: "Reactive state" },
  { name: "@tauri-apps/api", version: "2.0", desc: "Tauri IPC bridge" },
  { name: "@tauri-apps/plugin-dialog", version: "2.0", desc: "File dialogs" },
  { name: "TypeScript", version: "5.7", desc: "Type system" },
  { name: "Vite", version: "6.0", desc: "Build tool" },
];

export function AboutDialog({ onClose }: Props) {
  return (
    <div class="dialog-overlay" onClick={onClose}>
      <div class="dialog about-dialog" onClick={(e) => e.stopPropagation()}>
        <div class="dialog-header">
          <span class="dialog-title">{t("about.title")}</span>
          <button class="dialog-close" onClick={onClose}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <line x1="4" y1="4" x2="12" y2="12" />
              <line x1="12" y1="4" x2="4" y2="12" />
            </svg>
          </button>
        </div>

        <div class="about-dialog-body">
          {/* App identity */}
          <div class="about-hero">
            <div class="about-logo">
              <svg viewBox="0 0 48 48" fill="none" width="48" height="48">
                <circle cx="24" cy="24" r="20" stroke="var(--accent)" stroke-width="2.5" fill="var(--accent-bg)" />
                <path d="M18 30h12M18 24h12M18 18h8" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" />
                <circle cx="34" cy="14" r="4" fill="var(--accent)" />
              </svg>
            </div>
            <div class="about-title-block">
              <h2 class="about-app-name">AsuTorrent</h2>
              <span class="about-version">{t("about.version")}</span>
              <span class="about-tagline">{t("about.tagline")}</span>
            </div>
          </div>

          {/* Description */}
          <div class="about-section">
            <p class="about-description">
              {t("about.description")}
            </p>
          </div>

          {/* Tech stack columns */}
          <div class="about-stack-grid">
            <div class="about-section">
              <h3 class="about-section-title">
                <svg viewBox="0 0 16 16" fill="currentColor" style="width:14px;height:14px;">
                  <path d="M2 4h12v1H2V4zm0 3h12v1H2V7zm0 3h12v1H2v-1z"/>
                </svg>
                {t("about.rust_backend")}
              </h3>
              <div class="about-dep-list">
                {RUST_DEPENDENCIES.map((dep) => (
                  <div class="about-dep-item" key={dep.name}>
                    <div class="about-dep-info">
                      <span class="about-dep-name">{dep.name}</span>
                      <span class="about-dep-version">{dep.version}</span>
                    </div>
                    <span class="about-dep-desc">{dep.desc}</span>
                  </div>
                ))}
              </div>
            </div>

            <div class="about-section">
              <h3 class="about-section-title">
                <svg viewBox="0 0 16 16" fill="currentColor" style="width:14px;height:14px;">
                  <path d="M8 1C4.14 1 1 4.14 1 8s3.14 7 7 7 7-3.14 7-7-3.14-7-7-7zm0 12c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/>
                </svg>
                {t("about.frontend")}
              </h3>
              <div class="about-dep-list">
                {FRONTEND_DEPENDENCIES.map((dep) => (
                  <div class="about-dep-item" key={dep.name}>
                    <div class="about-dep-info">
                      <span class="about-dep-name">{dep.name}</span>
                      <span class="about-dep-version">{dep.version}</span>
                    </div>
                    <span class="about-dep-desc">{dep.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* License */}
          <div class="about-license">
            <svg viewBox="0 0 16 16" fill="currentColor" style="width:14px;height:14px;">
              <path d="M8 1C4.14 1 1 4.14 1 8s3.14 7 7 7 7-3.14 7-7-3.14-7-7-7zm0 12c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zM7 4h2v5H7V4zm0 6h2v2H7v-2z"/>
            </svg>
            <div class="about-license-text">
              {t("about.license")}
            </div>
          </div>
        </div>

        <div class="dialog-footer">
          <button class="btn btn-primary" onClick={onClose}>
            {t("about.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
