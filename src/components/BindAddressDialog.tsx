import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { getBindAddress, setBindAddress, listNetworkInterfaces } from "../hooks/useTorrents";

interface Props {
  onClose: () => void;
}

export function BindAddressDialog({ onClose }: Props) {
  const bindAddr = useSignal("");
  const savedAddr = useSignal<string | null>(null);
  const interfaces = useSignal<[string, string][]>([]);
  const showList = useSignal(false);
  const changed = useSignal(false);
  const saving = useSignal(false);

  useEffect(() => {
    getBindAddress().then((addr) => {
      bindAddr.value = addr ?? "";
      savedAddr.value = addr;
    }).catch(() => {});
    listNetworkInterfaces().then((list) => {
      interfaces.value = list;
    }).catch(() => {});
  }, []);

  const handleChange = (val: string) => {
    bindAddr.value = val;
    changed.value = val !== (savedAddr.value ?? "");
  };

  const handleSelectIface = (ip: string) => {
    bindAddr.value = ip;
    changed.value = ip !== (savedAddr.value ?? "");
    showList.value = false;
  };

  const handleSave = async () => {
    saving.value = true;
    try {
      const val = bindAddr.value.trim() || null;
      await setBindAddress(val);
      savedAddr.value = bindAddr.value;
      changed.value = false;
    } catch (err) {
      console.error("Failed to save bind address:", err);
    } finally {
      saving.value = false;
    }
  };

  const handleClear = async () => {
    bindAddr.value = "";
    changed.value = true;
  };

  return (
    <div class="modal-overlay" onClick={onClose}>
      <div class="bind-dialog" onClick={(e) => e.stopPropagation()}>
        <div class="dialog-header">
          <span class="dialog-title">Network Bind Address</span>
          <button class="dialog-close-btn" onClick={onClose}>✕</button>
        </div>

        <div class="bind-dialog-body">
          <p class="bind-dialog-hint">
            Choose which network interface or IP address AsuTorrent should listen on.
            Leave empty to bind to <strong>all interfaces</strong> (0.0.0.0).
          </p>
          <p class="bind-dialog-note">
            ⚠️ This stores your preference in configuration. Full per-IP binding requires
            librqbit v8+ library support which does not yet expose a bind interface API.
            When support is added, the value stored here will be applied on next restart.
          </p>

          <label class="bind-field">
            <span class="bind-label">Bind IP Address</span>
            <div class="bind-input-wrap">
              <input
                type="text"
                class="bind-input"
                placeholder="0.0.0.0 (all interfaces)"
                value={bindAddr.value}
                onInput={(e) => handleChange((e.target as HTMLInputElement).value)}
              />
              {interfaces.value.length > 0 && (
                <button
                  class="bind-list-toggle"
                  onClick={() => (showList.value = !showList.value)}
                  title="Show available interfaces"
                >
                  {showList.value ? "▲" : "▼"}
                </button>
              )}
            </div>
          </label>

          {showList.value && interfaces.value.length > 0 && (
            <div class="bind-iface-list">
              <div class="bind-iface-list-title">Available Interfaces</div>
              {interfaces.value.map(([name, ip]) => (
                <div
                  key={`${name}-${ip}`}
                  class={`bind-iface-item ${bindAddr.value === ip ? "selected" : ""}`}
                  onClick={() => handleSelectIface(ip)}
                >
                  <span class="bind-iface-name">{name}</span>
                  <span class="bind-iface-ip">{ip}</span>
                </div>
              ))}
            </div>
          )}

          <div class="bind-dialog-actions">
            <button
              class="btn btn-primary"
              onClick={handleSave}
              disabled={saving.value || !changed.value}
            >
              {saving.value ? "Saving…" : "Save"}
            </button>
            <button
              class="btn"
              onClick={handleClear}
              disabled={!bindAddr.value}
            >
              Clear
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
