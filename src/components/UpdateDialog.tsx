import { t } from "../hooks/useLocales";
import { useEffect, useRef } from "preact/hooks";

interface UpdateInfo {
  version: string;
  name: string;
  url: string;
  notes: string;
  current_version: string;
}

interface Props {
  update: UpdateInfo;
  onClose: () => void;
  onSkip: () => void;
}

function parseReleaseNotes(body: string): string {
  // Strip markdown a bit for readability
  return body
    .split("\n")
    .slice(0, 30)
    .map((line) => {
      // Remove leading markdown syntax
      return line.replace(/^#+\s*/, "").replace(/^\s*[-*]\s*/, "  • ");
    })
    .join("\n");
}

export function UpdateDialog({ update, onClose, onSkip }: Props) {
  const notesRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (notesRef.current) {
      notesRef.current.scrollTop = 0;
    }
  }, []);

  const handleDownload = () => {
    window.open(update.url, "_blank");
  };

  return (
    <div class="dialog-overlay" onClick={onClose}>
      <div class="dialog update-dialog" onClick={(e) => e.stopPropagation()}>
        <div class="dialog-header">
          <span class="dialog-title">{t("update.title")}</span>
          <button class="dialog-close" onClick={onClose}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <line x1="4" y1="4" x2="12" y2="12" />
              <line x1="12" y1="4" x2="4" y2="12" />
            </svg>
          </button>
        </div>

        <div class="update-dialog-body">
          <div class="update-hero">
            <div class="update-icon">
              <svg viewBox="0 0 40 40" fill="none" width="40" height="40">
                <path d="M20 4l4 12h12l-10 8 4 12-10-8-10 8 4-12-10-8h12z" fill="var(--yellow)" opacity="0.8" />
                <path d="M20 8l2 8h10l-8 6 3 10-7-6-7 6 3-10-8-6h10z" fill="var(--accent)" opacity="0.6" />
              </svg>
            </div>
            <div class="update-info">
              <h2 class="update-available">{t("update.available")}</h2>
              <div class="update-versions">
                <span class="update-current">{t("update.current")}: v{update.current_version}</span>
                <svg viewBox="0 0 16 16" fill="currentColor" style="width:14px;height:14px;">
                  <path d="M8 2l6 6-6 6-1.5-1.5L10 9H2V7h8L6.5 3.5z"/>
                </svg>
                <span class="update-latest">{t("update.latest")}: v{update.version}</span>
              </div>
              <span class="update-name">{update.name}</span>
            </div>
          </div>

          <div class="update-section">
            <h3 class="update-section-title">{t("update.release_notes")}</h3>
            <pre class="update-notes" ref={notesRef}>
              {parseReleaseNotes(update.notes)}
            </pre>
          </div>
        </div>

        <div class="dialog-footer update-footer">
          <button class="btn btn-ghost" onClick={onSkip}>
            {t("update.skip")}
          </button>
          <div class="update-footer-right">
            <button class="btn" onClick={onClose}>
              {t("update.later")}
            </button>
            <button class="btn btn-primary" onClick={handleDownload}>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:14px;height:14px;">
                <path d="M8 2v10M4 8l4 4 4-4M2 13h12"/>
              </svg>
              {t("update.download")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
