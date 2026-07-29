import { useSignal, useComputed } from "@preact/signals";
import { useEffect } from "preact/hooks";
import {
  getEncryptionMode,
  setEncryptionMode,
} from "../hooks/useTorrents";

interface Props {
  onClose: () => void;
}

const MODES = [
  { value: "forced", label: "Forced", icon: "🔒", desc: "Only connect to peers that support encryption" },
  { value: "enabled", label: "Enabled", icon: "🔐", desc: "Prefer encrypted connections, fall back to plaintext" },
  { value: "disabled", label: "Disabled", icon: "🔓", desc: "Plaintext connections only" },
] as const;

export function EncryptionDialog({ onClose }: Props) {
  const current = useSignal("enabled");
  const selected = useSignal("enabled");
  const loading = useSignal(true);
  const saving = useSignal(false);
  const saved = useSignal(false);

  useEffect(() => {
    getEncryptionMode()
      .then((mode) => {
        current.value = mode;
        selected.value = mode;
        loading.value = false;
      })
      .catch(() => { loading.value = false; });
  }, []);

  const hasChanged = useComputed(() => selected.value !== current.value);

  const handleSave = async () => {
    saving.value = true;
    try {
      await setEncryptionMode(selected.value);
      current.value = selected.value;
      saved.value = true;
      setTimeout(() => (saved.value = false), 2000);
    } catch (err) {
      console.error("Failed to save encryption mode:", err);
    } finally {
      saving.value = false;
    }
  };

  return (
    <div class="dialog-overlay" onClick={onClose}>
      <div class="dialog enc-dialog" onClick={(e) => e.stopPropagation()}>
        <div class="dialog-header">
          <h2>
            <span class="enc-icon">🔐</span>
            Encryption Mode
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
            <div class="enc-loading">Loading…</div>
          ) : (
            <>
              <p class="enc-dialog-text">
                Choose how AsuTorrent handles protocol encryption (RC4 / 
                Azureus-style). Per-torrent overrides are available from the 
                context menu.
              </p>

              <div class="enc-options">
                {MODES.map((m) => (
                  <label
                    key={m.value}
                    class={`enc-option ${selected.value === m.value ? "selected" : ""}`}
                    onClick={() => (selected.value = m.value)}
                  >
                    <input
                      type="radio"
                      name="encryption"
                      value={m.value}
                      checked={selected.value === m.value}
                      onChange={() => (selected.value = m.value)}
                    />
                    <span class="enc-option-icon">{m.icon}</span>
                    <div class="enc-option-content">
                      <span class="enc-option-label">{m.label}</span>
                      <span class="enc-option-desc">{m.desc}</span>
                    </div>
                  </label>
                ))}
              </div>

              <div class="enc-dialog-note">
                <strong>{'\u26A0\uFE0F'}</strong>{" "}
                librqbit handles encryption transparently at the peer 
                connection level. These settings store your preference 
                for when the library exposes an encryption API.
              </div>
            </>
          )}
        </div>

        <div class="dialog-footer">
          <div class="enc-actions">
            {saved.value && <span class="enc-saved">{'\u2705'} Saved</span>}
            <button class="btn btn-ghost" onClick={onClose}>Close</button>
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
