import { useSignal } from "@preact/signals";
import {
  setNormalDownloadLimit,
  setNormalUploadLimit,
  setTurtleDownloadLimit,
  setTurtleUploadLimit,
  setTurtleMode,
  SpeedLimitsPayload,
} from "../hooks/useTorrents";
import { fmtLimit } from "../utils/format";

interface Props {
  limits: SpeedLimitsPayload;
  onChanged: (limits: SpeedLimitsPayload) => void;
  onClose: () => void;
}

export function SpeedLimitsDialog({ limits, onChanged, onClose }: Props) {
  const normalDlKb = useSignal(
    limits.normal_download ? Math.round(limits.normal_download / 1024) : 0
  );
  const normalUlKb = useSignal(
    limits.normal_upload ? Math.round(limits.normal_upload / 1024) : 0
  );
  const turtleDlKb = useSignal(
    limits.turtle_download ? Math.round(limits.turtle_download / 1024) : 0
  );
  const turtleUlKb = useSignal(
    limits.turtle_upload ? Math.round(limits.turtle_upload / 1024) : 0
  );
  const enabledTurtle = useSignal(limits.turtle_mode);

  const handleSave = async () => {
    const ndl = normalDlKb.value > 0 ? normalDlKb.value * 1024 : 0;
    const nul = normalUlKb.value > 0 ? normalUlKb.value * 1024 : 0;
    const tdl = turtleDlKb.value > 0 ? turtleDlKb.value * 1024 : 0;
    const tul = turtleUlKb.value > 0 ? turtleUlKb.value * 1024 : 0;

    // Write each slot directly — no mode-switching needed
    await setNormalDownloadLimit(ndl > 0 ? ndl : null);
    await setNormalUploadLimit(nul > 0 ? nul : null);
    await setTurtleDownloadLimit(tdl > 0 ? tdl : null);
    await setTurtleUploadLimit(tul > 0 ? tul : null);
    await setTurtleMode(enabledTurtle.value);

    onChanged({
      normal_download: ndl > 0 ? ndl : null,
      normal_upload: nul > 0 ? nul : null,
      turtle_download: tdl > 0 ? tdl : null,
      turtle_upload: tul > 0 ? tul : null,
      turtle_mode: enabledTurtle.value,
    });

    onClose();
  };

  return (
    <div class="modal-overlay" onClick={onClose}>
      <div class="modal speed-limits-dialog" onClick={(e) => e.stopPropagation()}>
        <h2>Speed Limits</h2>

        <div class="speed-limits-section">
          <h3>Normal mode</h3>
          <LimitRow label="Download (KB/s):" value={normalDlKb.value} onChange={(v) => (normalDlKb.value = v)} />
          <LimitRow label="Upload (KB/s):" value={normalUlKb.value} onChange={(v) => (normalUlKb.value = v)} />
        </div>

        <div class="speed-limits-section">
          <h3>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
              <input
                type="checkbox"
                checked={enabledTurtle.value}
                onChange={(e) =>
                  (enabledTurtle.value = (e.target as HTMLInputElement).checked)
                }
              />
              Turtle mode
            </label>
          </h3>
          {enabledTurtle.value && (
            <>
              <LimitRow label="Download (KB/s):" value={turtleDlKb.value} onChange={(v) => (turtleDlKb.value = v)} />
              <LimitRow label="Upload (KB/s):" value={turtleUlKb.value} onChange={(v) => (turtleUlKb.value = v)} />
            </>
          )}
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button class="btn btn-primary" onClick={handleSave}>Apply</button>
        </div>
      </div>
    </div>
  );
}

function LimitRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const preview = value > 0 ? fmtLimit(value * 1024) : "Unlimited";

  return (
    <div class="speed-limit-row">
      <label>{label}</label>
      <input
        type="number"
        min="0"
        class="modal-input speed-input"
        value={value}
        onInput={(e) =>
          onChange(Math.max(0, Number((e.target as HTMLInputElement).value)))
        }
      />
      <span class="speed-preview">{preview}</span>
    </div>
  );
}
