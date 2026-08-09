import { useSignal } from "@preact/signals";
import { t } from "../hooks/useLocales";
import { addMagnet, addHttpDownload, torrentPreviewQueue } from "../hooks/useTorrents";
import { open } from "@tauri-apps/plugin-dialog";

interface Props {
  onClose: () => void;
}

// ── Input detection helpers ─────────────────────────────────────

/** Returns true if the trimmed input looks like a local .torrent file path. */
function isTorrentFilePath(s: string): boolean {
  return /\.torrent$/i.test(s.trim());
}

/** Checks if a string is 40 hex characters (standard BitTorrent info-hash v1). */
function isHexInfoHash(s: string): boolean {
  return /^[0-9a-f]{40}$/i.test(s);
}

/** Checks if a string is 32 base32 characters (BitTorrent info-hash v1, base32-encoded). */
function isBase32InfoHash(s: string): boolean {
  return /^[2-7a-z]{32}$/i.test(s);
}

/** Returns true if the input looks like an HTTP, HTTPS, or FTP URL for direct download. */
function isHttpFtpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s) || /^ftp:\/\//i.test(s);
}

/**
 * If the input is a bare info-hash (hex or base32), wrap it in a magnet link.
 * Otherwise returns the input unchanged.
 */
function normalizeInput(raw: string): { value: string; detected: "magnet" | "torrent-file" | "info-hash" | "http-download" | "other" } {
  const s = raw.trim();
  if (!s) return { value: s, detected: "other" };

  if (isTorrentFilePath(s)) {
    return { value: s, detected: "torrent-file" };
  }

  // Detect HTTP/FTP direct download links
  if (isHttpFtpUrl(s)) {
    return { value: s, detected: "http-download" };
  }

  if (isHexInfoHash(s)) {
    return { value: `magnet:?xt=urn:btih:${s.toLowerCase()}`, detected: "info-hash" };
  }

  if (isBase32InfoHash(s)) {
    return { value: `magnet:?xt=urn:btih:${s.toUpperCase()}`, detected: "info-hash" };
  }

  return { value: s, detected: "other" };
}

// ── Component ───────────────────────────────────────────────────

export function AddTorrentModal({ onClose }: Props) {
  const input = useSignal("");
  const error = useSignal<string | null>(null);
  const adding = useSignal(false);

  const handleAdd = async () => {
    const raw = input.value.trim();
    if (!raw) return;

    const { value: resolved, detected } = normalizeInput(raw);
    adding.value = true;
    error.value = null;

    try {
      if (detected === "torrent-file") {
        // Open the file-preview dialog instead of adding blindly.
        torrentPreviewQueue.value = [resolved];
      } else if (detected === "http-download") {
        await addHttpDownload(resolved);
      } else {
        await addMagnet(resolved);
      }
      onClose();
    } catch (e) {
      error.value = String(e);
    } finally {
      adding.value = false;
    }
  };

  const handleFile = async () => {
    try {
      const result = await open({
        multiple: false,
        filters: [{ name: "Torrent", extensions: ["torrent"] }],
      });
      if (result) {
        // Open the file-preview dialog so the user can pick which files to add.
        torrentPreviewQueue.value = [result];
        onClose();
      }
    } catch { /* cancelled */ }
  };

  const handleKey = (e: KeyboardEvent) => {
    if (e.key === "Enter") handleAdd();
    if (e.key === "Escape") onClose();
  };

  // Live preview of what the user is typing
  const raw = input.value.trim();
  const { detected } = raw ? normalizeInput(raw) : { detected: "other" as const };

  const hintText =
    detected === "torrent-file" ? t("add_torrent.hint_torrent")
    : detected === "info-hash" ? t("add_torrent.hint_hash")
    : detected === "http-download" ? t("add_torrent.hint_http")
    : null;

  return (
    <div class="modal-overlay" onClick={onClose}>
      <div class="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t("add_torrent.title")}</h2>
        <input
          class="modal-input"
          type="text"
          placeholder={t("add_torrent.placeholder")}
          value={input.value}
          onInput={(e) => (input.value = (e.target as HTMLInputElement).value)}
          onKeyDown={handleKey}
          disabled={adding.value}
          autoFocus
        />
        {hintText && (
          <p style="color: var(--accent); font-size: 11px; margin-top: 6px;">
            {hintText}
          </p>
        )}
        {error.value && <p style="color: var(--red); font-size: 12px; margin-top: 8px;">{error.value}</p>}
        <div class="modal-actions">
          <button class="btn btn-secondary" onClick={handleFile} disabled={adding.value}>
            📁 {t("add_torrent.browse")}
          </button>
          <button class="btn btn-secondary" onClick={onClose} disabled={adding.value}>
            {t("add_torrent.cancel")}
          </button>
          <button class="btn btn-primary" onClick={handleAdd} disabled={adding.value || !raw}>
            {adding.value ? t("add_torrent.adding") : t("add_torrent.add")}
          </button>
        </div>
      </div>
    </div>
  );
}
