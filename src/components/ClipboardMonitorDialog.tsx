import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import {
  getClipboardMonitor,
  setClipboardMonitor,
} from "../hooks/useTorrents";
import { t } from "../hooks/useLocales";

interface Props {
  onClose: () => void;
}

/** Settings dialog: enable/disable clipboard magnet monitoring. */
export function ClipboardMonitorDialog({ onClose }: Props) {
  const enabled = useSignal(true);
  const orig = useSignal(true);
  const loading = useSignal(true);
  const saving = useSignal(false);
  const saved = useSignal(false);

  useEffect(() => {
    getClipboardMonitor()
      .then((v) => {
        enabled.value = v;
        orig.value = v;
      })
      .catch(() => {})
      .finally(() => {
        loading.value = false;
      });
  }, []);

  const hasChanged = enabled.value !== orig.value;

  const handleSave = async () => {
    saving.value = true;
    try {
      await setClipboardMonitor(enabled.value);
      orig.value = enabled.value;
      saved.value = true;
      setTimeout(() => (saved.value = false), 2000);
    } catch (err) {
      console.error("Failed to save clipboard monitor setting:", err);
    } finally {
      saving.value = false;
    }
  };

  return (
    <div class="dialog-overlay" onClick={onClose}>
      <div
        class="dialog clipboard-monitor-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="dialog-header">
          <h2>
            <span class="clipboard-dialog-icon">{'📋'}</span>
            {t("clipboard.title", "Clipboard Monitoring")}
          </h2>
          <button class="dialog-close" onClick={onClose}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <line x1="4" y1="4" x2="12" y2="12" />
              <line x1="12" y1="4" x2="4" y2="12" />
            </svg>
          </button>
        </div>

        <div class="dialog-body">
          {loading.value ? (
            <div class="utp-loading">{t("general.loading", "Loading…")}</div>
          ) : (
            <>
              <p class="clipboard-dialog-text">
                {t("clipboard.text", "Automatically detect magnet links copied to your clipboard and ask whether to add them as torrents.")}
              </p>
              <label
                class="clipboard-toggle-row"
                onClick={() => (enabled.value = !enabled.value)}
              >
                <div class={`toggle ${enabled.value ? "on" : "off"}`}>
                  <div class="toggle-knob" />
                </div>
                <span>{t("clipboard.toggle", "Monitor clipboard for magnet links")}</span>
              </label>
              <div class="clipboard-note">
                {'\u2139\ufe0f'} {t("clipboard.note", "The clipboard is checked every 2 seconds. A prompt appears only for new links — the same link sitting in the clipboard won't be offered twice.")}
              </div>
            </>
          )}
        </div>

        <div class="dialog-footer">
          <div class="clipboard-actions">
            {saved.value && <span class="clipboard-saved">{'\u2705'} {t("clipboard.saved", "Saved")}</span>}
            <button class="btn btn-ghost" onClick={onClose}>
              {t("clipboard.close", "Close")}
            </button>
            <button
              class="btn btn-primary"
              onClick={handleSave}
              disabled={!hasChanged || saving.value}
            >
              {saving.value ? t("clipboard.saving", "Saving…") : t("clipboard.save", "Save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
