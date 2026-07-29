import { useSignal } from "@preact/signals";
import { setAutoManagementConfig } from "../hooks/useTorrents";
import type { AutoManagementConfigPayload } from "../hooks/useTorrents";

interface Props {
  config: AutoManagementConfigPayload;
  onSaved: (cfg: AutoManagementConfigPayload) => void;
  onClose: () => void;
}

export function AutoManagementDialog({ config, onSaved, onClose }: Props) {
  const enabled = useSignal(config.enabled);
  const moveOnComplete = useSignal(config.move_on_complete);
  const removeFromQueue = useSignal(config.remove_from_queue);
  const ratioLimit = useSignal(config.ratio_limit > 0 ? String(config.ratio_limit) : "");
  const seedTimeLimit = useSignal(
    config.seed_time_limit_minutes > 0 ? String(config.seed_time_limit_minutes) : ""
  );

  const error = useSignal<string | null>(null);

  const handleSave = async () => {
    error.value = null;
    const ratio = ratioLimit.value.trim() ? parseFloat(ratioLimit.value) : 0;
    const seedMin = seedTimeLimit.value.trim() ? parseInt(seedTimeLimit.value, 10) : 0;

    if (ratioLimit.value.trim() && (isNaN(ratio) || ratio < 0)) {
      error.value = "Ratio limit must be a positive number or empty (unlimited).";
      return;
    }
    if (seedTimeLimit.value.trim() && (isNaN(seedMin) || seedMin < 0)) {
      error.value = "Seed time limit must be a positive number or empty (unlimited).";
      return;
    }

    const newConfig: AutoManagementConfigPayload = {
      enabled: enabled.value,
      move_on_complete: moveOnComplete.value,
      remove_from_queue: removeFromQueue.value,
      ratio_limit: ratio,
      seed_time_limit_minutes: seedMin,
    };

    try {
      await setAutoManagementConfig(newConfig);
      onSaved(newConfig);
      onClose();
    } catch (e) {
      error.value = String(e);
    }
  };

  return (
    <div class="dialog-overlay" onClick={onClose}>
      <div class="dialog auto-mgmt-dialog" onClick={(e) => e.stopPropagation()}>
        <div class="dialog-header">
          <span class="dialog-title">Auto-Management</span>
          <button class="dialog-close" onClick={onClose}>&times;</button>
        </div>

        <div class="dialog-body">
          {/* Enable toggle */}
          <div class="am-toggle-row">
            <label class="am-toggle-label">
              <input type="checkbox" checked={enabled.value}
                onChange={(e) => (enabled.value = (e.target as HTMLInputElement).checked)} />
              Enable auto-management
            </label>
          </div>

          {enabled.value && (
            <>
              <p class="am-desc">
                Automatically manage completed torrents based on ratio and seed time limits.
              </p>

              {/* Actions on completion */}
              <div class="am-section">
                <h4>Actions on completion</h4>

                <div class="am-check-row">
                  <label class="am-check-label">
                    <input type="checkbox" checked={moveOnComplete.value}
                      onChange={(e) => (moveOnComplete.value = (e.target as HTMLInputElement).checked)} />
                    Move completed files to category folder
                  </label>
                </div>

                <div class="am-check-row">
                  <label class="am-check-label">
                    <input type="checkbox" checked={removeFromQueue.value}
                      onChange={(e) => (removeFromQueue.value = (e.target as HTMLInputElement).checked)} />
                    Remove torrent from queue (delete after reaching limits)
                  </label>
                </div>
              </div>

              {/* Limits */}
              <div class="am-section">
                <h4>Limits</h4>

                <div class="am-input-row">
                  <label>Ratio limit</label>
                  <div class="am-input-wrap">
                    <input type="number" class="modal-input am-input" value={ratioLimit.value}
                      placeholder="2.0"
                      min="0" step="0.1"
                      onInput={(e) => (ratioLimit.value = (e.target as HTMLInputElement).value)} />
                    <span class="am-input-suffix">
                      {ratioLimit.value.trim()
                        ? `upload ${ratioLimit.value}× downloaded`
                        : "unlimited"}
                    </span>
                  </div>
                </div>

                <div class="am-input-row">
                  <label>Seed time limit</label>
                  <div class="am-input-wrap">
                    <input type="number" class="modal-input am-input" value={seedTimeLimit.value}
                      placeholder="0"
                      min="0"
                      onInput={(e) => (seedTimeLimit.value = (e.target as HTMLInputElement).value)} />
                    <span class="am-input-suffix">
                      {seedTimeLimit.value.trim()
                        ? `${seedTimeLimit.value} minutes`
                        : "unlimited"}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}

          {error.value && <div class="dialog-error">{error.value}</div>}
        </div>

        <div class="dialog-footer">
          <button class="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button class="btn btn-primary" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}
