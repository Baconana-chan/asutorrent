import { useSignal } from "@preact/signals";
import { addMagnet } from "../hooks/useTorrents";
import { t } from "../hooks/useLocales";

interface Props {
  url: string;
  name: string | null;
  onClose: () => void;
}

/**
 * Shown when the clipboard monitor detects a magnet link. Lets the user
 * add it as a torrent or ignore it.
 */
export function ClipboardMagnetDialog({ url, name, onClose }: Props) {
  const adding = useSignal(false);
  const error = useSignal<string | null>(null);

  const handleAdd = async () => {
    adding.value = true;
    error.value = null;
    try {
      await addMagnet(url);
      onClose();
    } catch (e) {
      error.value = String(e);
      adding.value = false;
    }
  };

  return (
    <div class="dialog-overlay" onClick={onClose}>
      <div
        class="dialog clipboard-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="dialog-header">
          <h2>
            <span class="clipboard-dialog-icon">{'📋'}</span>
            {t("clipboard.magnet_title", "Magnet link detected")}
          </h2>
          <button class="dialog-close" onClick={onClose}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <line x1="4" y1="4" x2="12" y2="12" />
              <line x1="12" y1="4" x2="4" y2="12" />
            </svg>
          </button>
        </div>

        <div class="dialog-body">
          <p class="clipboard-dialog-text">
            {t("clipboard.magnet_text", "A magnet link was found in your clipboard. Add it as a torrent?")}
          </p>
          {name && (
            <div class="clipboard-name" title={name}>
              {name}
            </div>
          )}
          <div class="clipboard-url" title={url}>
            {url}
          </div>
          {error.value && <div class="dialog-error">{error.value}</div>}
        </div>

        <div class="dialog-footer">
          <button class="btn btn-ghost" onClick={onClose}>
            {t("clipboard.ignore", "Ignore")}
          </button>
          <button
            class="btn btn-primary"
            onClick={handleAdd}
            disabled={adding.value}
          >
            {adding.value ? t("clipboard.adding", "Adding…") : t("clipboard.add_torrent", "➕ Add torrent")}
          </button>
        </div>
      </div>
    </div>
  );
}
