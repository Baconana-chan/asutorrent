import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { t } from "../hooks/useLocales";
import { getSocks5Proxy, setSocks5Proxy, testSocks5Proxy, getBlocklistUrl, setBlocklistUrl } from "../hooks/useTorrents";

interface Props {
  onClose: () => void;
}

export function ProxyDialog({ onClose }: Props) {
  const proxyUrl = useSignal("");
  const savedUrl = useSignal<string | null>(null);
  const testResult = useSignal<string | null>(null);
  const testError = useSignal<string | null>(null);
  const testing = useSignal(false);
  const saving = useSignal(false);
  const changed = useSignal(false);

  // ── Blocklist state ────────────────────────────────────────
  const blocklistUrl = useSignal("");
  const savedBlocklistUrl = useSignal<string | null>(null);
  const blocklistChanged = useSignal(false);
  const savingBlocklist = useSignal(false);

  useEffect(() => {
    Promise.all([
      getSocks5Proxy(),
      getBlocklistUrl(),
    ]).then(([proxy, blocklist]) => {
      proxyUrl.value = proxy ?? "";
      savedUrl.value = proxy;
      blocklistUrl.value = blocklist ?? "";
      savedBlocklistUrl.value = blocklist;
    }).catch(() => {});
  }, []);

  const handleChange = (val: string) => {
    proxyUrl.value = val;
    changed.value = val !== (savedUrl.value ?? "");
  };

  const handleTest = async () => {
    if (!proxyUrl.value.trim()) {
      testError.value = t("proxy.enter_url");
      testResult.value = null;
      return;
    }
    testing.value = true;
    testResult.value = null;
    testError.value = null;
    try {
      const result = await testSocks5Proxy(proxyUrl.value.trim());
      testResult.value = result;
    } catch (err) {
      testError.value = String(err);
    } finally {
      testing.value = false;
    }
  };

  const handleSave = async () => {
    saving.value = true;
    try {
      const val = proxyUrl.value.trim() || null;
      await setSocks5Proxy(val);
      savedUrl.value = proxyUrl.value;
      changed.value = false;
    } catch (err) {
      testError.value = String(err);
    } finally {
      saving.value = false;
    }
  };

  const handleClear = async () => {
    proxyUrl.value = "";
    changed.value = true;
  };

  return (
    <div class="modal-overlay" onClick={onClose}>
      <div class="proxy-dialog" onClick={(e) => e.stopPropagation()}>
        <div class="dialog-header">
          <span class="dialog-title">{t("proxy.title")}</span>
          <button class="dialog-close-btn" onClick={onClose}>✕</button>
        </div>

        <div class="proxy-dialog-body">
          {/* ── SOCKS5 Proxy Section ────────────────────────────── */}
          <div class="proxy-section">
            <h3 class="proxy-section-title">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" style="width:14px;height:14px;">
                <rect x="2" y="4" width="12" height="10" rx="2" />
                <path d="M5 8h6M8 5v6" />
              </svg>
              SOCKS5 Proxy
            </h3>
            <p class="proxy-dialog-hint">
              {t("proxy.hint")}
            </p>

            <label class="proxy-field">
              <span class="proxy-label">{t("proxy.url_label")}</span>
              <input
                type="text"
                class="proxy-input"
                placeholder={t("proxy.placeholder")}
                value={proxyUrl.value}
                onInput={(e) => handleChange((e.target as HTMLInputElement).value)}
              />
            </label>

            {testResult.value && (
              <div class="proxy-test-result success">{testResult.value}</div>
            )}
            {testError.value && (
              <div class="proxy-test-result error">{testError.value}</div>
            )}

            <div class="proxy-dialog-actions">
              <button
                class="btn btn-primary"
                onClick={handleSave}
                disabled={saving.value || !changed.value}
              >
                {saving.value ? t("proxy.saving") : t("proxy.save")}
              </button>
              <button
                class="btn"
                onClick={handleClear}
                disabled={!proxyUrl.value}
              >
                {t("proxy.clear")}
              </button>
              <button
                class="btn"
                onClick={handleTest}
                disabled={testing.value || !proxyUrl.value.trim()}
              >
                {testing.value ? t("proxy.testing") : t("proxy.test")}
              </button>
            </div>
          </div>

          {/* ── Separator ───────────────────────────────────────── */}
          <div class="proxy-section-separator" />

          {/* ── IP Blocklist Section ───────────────────────────── */}
          <div class="proxy-section">
            <h3 class="proxy-section-title">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" style="width:14px;height:14px;">
                <circle cx="8" cy="8" r="6" />
                <path d="M5 5l6 6M5 11L11 5" />
              </svg>
              IP Blocklist
            </h3>
            <p class="proxy-dialog-hint">
              Block known bad IPs from connecting to your client.
              Provide a URL to a blocklist file (e.g. from iblocklist.com).
              Applied on next restart.
            </p>

            <label class="proxy-field">
              <span class="proxy-label">Blocklist URL</span>
              <input
                type="text"
                class="proxy-input"
                placeholder="https://example.com/blocklist.txt"
                value={blocklistUrl.value}
                onInput={(e) => {
                  const val = (e.target as HTMLInputElement).value;
                  blocklistUrl.value = val;
                  blocklistChanged.value = val !== (savedBlocklistUrl.value ?? "");
                }}
              />
            </label>

            <div class="proxy-dialog-actions">
              <button
                class="btn btn-primary"
                onClick={async () => {
                  savingBlocklist.value = true;
                  try {
                    const val = blocklistUrl.value.trim() || null;
                    await setBlocklistUrl(val);
                    savedBlocklistUrl.value = blocklistUrl.value;
                    blocklistChanged.value = false;
                  } catch (err) {
                    console.error("Failed to save blocklist URL:", err);
                  } finally {
                    savingBlocklist.value = false;
                  }
                }}
                disabled={savingBlocklist.value || !blocklistChanged.value}
              >
                {savingBlocklist.value ? "Saving…" : "Save Blocklist"}
              </button>
              <button
                class="btn"
                onClick={async () => {
                  blocklistUrl.value = "";
                  blocklistChanged.value = true;
                }}
                disabled={!blocklistUrl.value}
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
