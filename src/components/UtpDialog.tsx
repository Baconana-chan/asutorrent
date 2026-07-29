import { useSignal, useComputed } from "@preact/signals";
import { useEffect } from "preact/hooks";
import {
  getGlobalUtpEnabled,
  setGlobalUtpEnabled,
} from "../hooks/useTorrents";

interface Props {
  onClose: () => void;
}

type UtpState = "default" | "on" | "off";

export function UtpDialog({ onClose }: Props) {
  const current = useSignal<UtpState>("default");
  const loading = useSignal(true);
  const saving = useSignal(false);
  const saved = useSignal(false);

  // Load current setting on mount
  useEffect(() => {
    getGlobalUtpEnabled()
      .then((val) => {
        if (val === true) current.value = "on";
        else if (val === false) current.value = "off";
        else current.value = "default";
        selected.value = current.value;
        loading.value = false;
      })
      .catch(() => {
        loading.value = false;
      });
  }, []);

  const selected = useSignal<UtpState>(current.value);

  const hasChanged = useComputed(() => selected.value !== current.value);

  const handleSave = async () => {
    saving.value = true;
    try {
      let val: boolean | null;
      if (selected.value === "on") val = true;
      else if (selected.value === "off") val = false;
      else val = null;
      await setGlobalUtpEnabled(val);
      current.value = selected.value;
      saved.value = true;
      setTimeout(() => (saved.value = false), 2000);
    } catch (err) {
      console.error("Failed to save uTP setting:", err);
    } finally {
      saving.value = false;
    }
  };

  const options: { value: UtpState; label: string; desc: string }[] = [
    {
      value: "default",
      label: "Default (auto)",
      desc: "Let librqbit decide — TCP only in current version",
    },
    {
      value: "on",
      label: "Enabled",
      desc: "Prefer uTP protocol for peer connections",
    },
    {
      value: "off",
      label: "Disabled",
      desc: "Use TCP only",
    },
  ];

  return (
    <div class="dialog-overlay" onClick={onClose}>
      <div class="dialog utp-dialog" onClick={(e) => e.stopPropagation()}>
        <div class="dialog-header">
          <h2>
            <span class="utp-dialog-icon">{'\u{1F310}'}</span>
            uTP Protocol
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
            <div class="utp-loading">Loading…</div>
          ) : (
            <>
              <p class="utp-dialog-text">
                uTP (Micro Transport Protocol) is a UDP-based transport for
                BitTorrent that adapts to network conditions. Enable or disable
                it globally below. Per-torrent overrides are available from the
                context menu.
              </p>

              <div class="utp-options">
                {options.map((opt) => (
                  <label
                    key={opt.value}
                    class={`utp-option ${
                      selected.value === opt.value ? "selected" : ""
                    }`}
                    onClick={() => (selected.value = opt.value)}
                  >
                    <input
                      type="radio"
                      name="utp"
                      value={opt.value}
                      checked={selected.value === opt.value}
                      onChange={() => (selected.value = opt.value)}
                    />
                    <div class="utp-option-content">
                      <span class="utp-option-label">{opt.label}</span>
                      <span class="utp-option-desc">{opt.desc}</span>
                    </div>
                  </label>
                ))}
              </div>

              <div class="utp-dialog-note">
                <strong>{'\u26A0\uFE0F'}</strong>{" "}
                librqbit (the underlying library) currently only supports TCP
                peer connections. Enabling uTP stores your preference for when
                uTP support is added to the library.
              </div>
            </>
          )}
        </div>

        <div class="dialog-footer">
          <div class="utp-dialog-actions">
            {saved.value && <span class="utp-saved-indicator">{'\u2705'} Saved</span>}
            <button class="btn btn-ghost" onClick={onClose}>
              Close
            </button>
            <button
              class="btn btn-primary"
              onClick={handleSave}
              disabled={!hasChanged.value || saving.value}
            >
              {saving.value ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
