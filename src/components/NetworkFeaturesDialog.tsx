import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import {
  getGlobalDisableDht, setGlobalDisableDht,
  getGlobalDisablePex, setGlobalDisablePex,
  getGlobalDisableLpd, setGlobalDisableLpd,
} from "../hooks/useTorrents";

interface Props {
  onClose: () => void;
}

interface FeatureToggle {
  id: string;
  label: string;
  icon: string;
  description: string;
  note: string;
  get: () => Promise<boolean>;
  set: (v: boolean) => Promise<void>;
}

export function NetworkFeaturesDialog({ onClose }: Props) {
  const loading = useSignal(true);
  const saving = useSignal(false);
  const saved = useSignal(false);

  const dht = useSignal(false);
  const pex = useSignal(false);
  const lpd = useSignal(false);

  const dhtOrig = useSignal(false);
  const pexOrig = useSignal(false);
  const lpdOrig = useSignal(false);

  useEffect(() => {
    Promise.all([
      getGlobalDisableDht(),
      getGlobalDisablePex(),
      getGlobalDisableLpd(),
    ]).then(([d, p, l]) => {
      dht.value = d; dhtOrig.value = d;
      pex.value = p; pexOrig.value = p;
      lpd.value = l; lpdOrig.value = l;
      loading.value = false;
    }).catch(() => { loading.value = false; });
  }, []);

  const hasChanged = dht.value !== dhtOrig.value || pex.value !== pexOrig.value || lpd.value !== lpdOrig.value;

  const handleSave = async () => {
    saving.value = true;
    try {
      if (dht.value !== dhtOrig.value) await setGlobalDisableDht(dht.value);
      if (pex.value !== pexOrig.value) await setGlobalDisablePex(pex.value);
      if (lpd.value !== lpdOrig.value) await setGlobalDisableLpd(lpd.value);
      dhtOrig.value = dht.value;
      pexOrig.value = pex.value;
      lpdOrig.value = lpd.value;
      saved.value = true;
      setTimeout(() => (saved.value = false), 2000);
    } catch (err) {
      console.error("Failed to save network features:", err);
    } finally {
      saving.value = false;
    }
  };

  const features: FeatureToggle[] = [
    {
      id: "dht",
      label: "DHT",
      icon: "🌐",
      description: "Distributed Hash Table — finds peers without trackers",
      note: "Global setting applied on next restart. Per-torrent overrides are available from the context menu.",
      get: getGlobalDisableDht,
      set: setGlobalDisableDht,
    },
    {
      id: "pex",
      label: "PEX",
      icon: "🔁",
      description: "Peer Exchange — shares peer lists between connected peers",
      note: "Requires librqbit library support (not yet available).",
      get: getGlobalDisablePex,
      set: setGlobalDisablePex,
    },
    {
      id: "lpd",
      label: "LPD",
      icon: "🏠",
      description: "Local Peer Discovery — finds peers on the local network",
      note: "Requires librqbit library support (not yet available).",
      get: getGlobalDisableLpd,
      set: setGlobalDisableLpd,
    },
  ];

  return (
    <div class="dialog-overlay" onClick={onClose}>
      <div class="dialog netfeat-dialog" onClick={(e) => e.stopPropagation()}>
        <div class="dialog-header">
          <h2>Network Features</h2>
          <button class="dialog-close" onClick={onClose}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <line x1="4" y1="4" x2="12" y2="12" />
              <line x1="12" y1="4" x2="4" y2="12" />
            </svg>
          </button>
        </div>

        <div class="dialog-body">
          {loading.value ? (
            <div class="netfeat-loading">Loading…</div>
          ) : (
            <div class="netfeat-list">
              {features.map((f) => {
                const val = f.id === "dht" ? dht : f.id === "pex" ? pex : lpd;
                return (
                  <label key={f.id} class="netfeat-item">
                    <div class="netfeat-item-header">
                      <span class="netfeat-icon">{f.icon}</span>
                      <div class="netfeat-item-info">
                        <span class="netfeat-label">{f.label}</span>
                        <span class="netfeat-desc">{f.description}</span>
                      </div>
                      <div
                        class={`toggle ${val.value ? "off" : "on"}`}
                        onClick={() => { val.value = !val.value; }}
                      >
                        <div class="toggle-knob" />
                      </div>
                    </div>
                    <div class="netfeat-note">{f.note}</div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div class="dialog-footer">
          <div class="netfeat-actions">
            {saved.value && <span class="netfeat-saved">{'\u2705'} Saved</span>}
            <button class="btn btn-ghost" onClick={onClose}>Close</button>
            <button class="btn btn-primary" onClick={handleSave} disabled={!hasChanged || saving.value}>
              {saving.value ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
