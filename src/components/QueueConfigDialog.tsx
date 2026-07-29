import { useSignal, useComputed } from "@preact/signals";
import { setQueueConfig, QueueConfigPayload } from "../hooks/useTorrents";

interface Props {
  config: QueueConfigPayload;
  onClose: () => void;
  onSaved: (cfg: QueueConfigPayload) => void;
}

export function QueueConfigDialog({ config, onClose, onSaved }: Props) {
  const maxDl = useSignal(config.max_active_downloads);
  const maxSeed = useSignal(config.max_active_seeds);
  const saving = useSignal(false);
  const error = useSignal<string | null>(null);

  const dirty = useComputed(
    () => maxDl.value !== config.max_active_downloads ||
      maxSeed.value !== config.max_active_seeds
  );

  const handleSave = async () => {
    saving.value = true;
    error.value = null;
    try {
      const dl = Math.max(1, maxDl.value);
      const seed = Math.max(0, maxSeed.value);
      await setQueueConfig(dl, seed);
      onSaved({ max_active_downloads: dl, max_active_seeds: seed });
      onClose();
    } catch (e) {
      error.value = String(e);
    } finally {
      saving.value = false;
    }
  };

  const handleOverlay = (e: MouseEvent) => {
    if ((e.target as HTMLElement).classList.contains("dialog-overlay")) {
      onClose();
    }
  };

  return (
    <div class="dialog-overlay" onClick={handleOverlay}>
      <div class="dialog speed-limits-dialog queue-dialog">
        <div class="dialog-header">
          <span class="dialog-title">Queue Settings</span>
          <button class="dialog-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div class="dialog-body">
          <div class="limit-section">
            <h4>Queue limits</h4>
            <p class="limit-desc">
              When the number of active downloads or seeds exceeds the limit,
              the newest torrents are paused (force-resumed torrents are exempt).
            </p>

            <div class="limit-row">
              <label>Max active downloads</label>
              <div class="limit-input-wrap">
                <input
                  type="number"
                  min="1"
                  max="999"
                  value={maxDl}
                  onInput={(e) => {
                    const v = parseInt((e.target as HTMLInputElement).value);
                    if (!isNaN(v)) maxDl.value = Math.max(1, Math.min(999, v));
                  }}
                />
              </div>
            </div>

            <div class="limit-row">
              <label>Max active seeds</label>
              <div class="limit-input-wrap">
                <input
                  type="number"
                  min="0"
                  max="999"
                  value={maxSeed}
                  onInput={(e) => {
                    const v = parseInt((e.target as HTMLInputElement).value);
                    if (!isNaN(v)) maxSeed.value = Math.max(0, Math.min(999, v));
                  }}
                />
              </div>
            </div>
          </div>

          {error.value && <div class="dialog-error">{error.value}</div>}
        </div>

        <div class="dialog-footer">
          <button class="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            class="btn btn-primary"
            disabled={!dirty.value || saving.value}
            onClick={handleSave}
          >
            {saving.value ? "Saving\u{2026}" : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}
