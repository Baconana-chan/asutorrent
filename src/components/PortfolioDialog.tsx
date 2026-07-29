import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import {
  getPortfolios, addPortfolio, updatePortfolio, removePortfolio,
  type PortfolioPayload,
} from "../hooks/useTorrents";

interface Props {
  currentFilter: string;
  onClose: () => void;
  onSaved: () => void;
}

const ICON_OPTIONS = ["📁", "⭐", "🎬", "📺", "🎵", "🎮", "📚", "🔧", "📥", "📤", "⏳", "✅", "❌", "🔥", "💾", "🔒", "🌐", "🎯", "📊", "🔍"];

export function PortfolioDialog({ currentFilter, onClose, onSaved }: Props) {
  const portfolios = useSignal<PortfolioPayload[]>([]);
  const loading = useSignal(true);
  const saving = useSignal(false);
  const editId = useSignal<number | null>(null);
  const name = useSignal("");
  const icon = useSignal("📁");
  const filter = useSignal("all");
  const showIconPicker = useSignal(false);

  useEffect(() => {
    loadPortfolios();
  }, []);

  const loadPortfolios = async () => {
    try {
      portfolios.value = await getPortfolios();
      loading.value = false;
    } catch {
      loading.value = false;
    }
  };

  const startNew = () => {
    editId.value = null;
    name.value = "";
    icon.value = "📁";
    filter.value = currentFilter;
  };

  const startEdit = (p: PortfolioPayload) => {
    editId.value = p.id;
    name.value = p.name;
    icon.value = p.icon;
    filter.value = p.filter;
  };

  const handleSave = async () => {
    if (!name.value.trim()) return;
    saving.value = true;
    try {
      if (editId.value === null) {
        await addPortfolio(name.value.trim(), icon.value, filter.value);
      } else {
        await updatePortfolio(editId.value, name.value.trim(), icon.value, filter.value);
      }
      await loadPortfolios();
      editId.value = null;
      name.value = "";
      icon.value = "📁";
      onSaved();
    } catch (err) {
      console.error("Failed to save portfolio:", err);
    } finally {
      saving.value = false;
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await removePortfolio(id);
      await loadPortfolios();
      if (editId.value === id) {
        editId.value = null;
        name.value = "";
        icon.value = "📁";
      }
      onSaved();
    } catch (err) {
      console.error("Failed to delete portfolio:", err);
    }
  };

  const filterLabels: Record<string, string> = {
    all: "All torrents",
    downloading: "Downloading",
    seeding: "Seeding",
    paused: "Paused",
    error: "Errors",
    checking: "Checking",
  };

  const getFilterLabel = (f: string): string => {
    if (f.startsWith("cat:")) return `Category #${f.slice(4)}`;
    if (f.startsWith("tag:")) return `Tag #${f.slice(4)}`;
    return filterLabels[f] || f;
  };

  return (
    <div class="dialog-overlay" onClick={onClose}>
      <div class="dialog portfolio-dialog" onClick={(e) => e.stopPropagation()}>
        <div class="dialog-header">
          <h2>Portfolios</h2>
          <button class="dialog-close" onClick={onClose}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <line x1="4" y1="4" x2="12" y2="12" />
              <line x1="12" y1="4" x2="4" y2="12" />
            </svg>
          </button>
        </div>

        <div class="dialog-body">
          {loading.value ? (
            <div class="portfolio-loading">Loading…</div>
          ) : (
            <>
              {/* Edit / Create form */}
              <div class="portfolio-form">
                <input
                  type="text"
                  class="portfolio-input"
                  placeholder="Portfolio name…"
                  value={name.value}
                  onInput={(e) => (name.value = (e.target as HTMLInputElement).value)}
                />
                <div class="portfolio-form-row">
                  <div class="portfolio-icon-picker-wrap">
                    <button
                      class="portfolio-icon-btn"
                      onClick={() => (showIconPicker.value = !showIconPicker.value)}
                      title="Choose icon"
                    >
                      {icon.value || "📁"}
                    </button>
                    {showIconPicker.value && (
                      <div class="portfolio-icon-grid">
                        {ICON_OPTIONS.map((ic) => (
                          <button
                            key={ic}
                            class={`portfolio-icon-option ${ic === icon.value ? "selected" : ""}`}
                            onClick={() => { icon.value = ic; showIconPicker.value = false; }}
                          >
                            {ic}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <span class="portfolio-filter-badge">{getFilterLabel(filter.value)}</span>
                  <button
                    class="btn btn-primary btn-sm"
                    onClick={handleSave}
                    disabled={!name.value.trim() || saving.value}
                  >
                    {saving.value ? "…" : editId.value === null ? "Add" : "Save"}
                  </button>
                  {editId.value !== null && (
                    <button class="btn btn-ghost btn-sm" onClick={() => { editId.value = null; name.value = ""; icon.value = "📁"; }}>
                      Cancel
                    </button>
                  )}
                  {editId.value === null && (
                    <button class="btn btn-ghost btn-sm" onClick={startNew} title="Create from current filter">
                      + New
                    </button>
                  )}
                </div>
              </div>

              <div class="portfolio-sep" />

              {/* Portfolio list */}
              {portfolios.value.length === 0 ? (
                <div class="portfolio-empty">No portfolios yet. Create one above!</div>
              ) : (
                <div class="portfolio-list">
                  {portfolios.value.map((p) => (
                    <div
                      key={p.id}
                      class={`portfolio-item ${editId.value === p.id ? "editing" : ""}`}
                    >
                      <span class="portfolio-item-icon">{p.icon}</span>
                      <div class="portfolio-item-info">
                        <span class="portfolio-item-name">{p.name}</span>
                        <span class="portfolio-item-filter">{getFilterLabel(p.filter)}</span>
                      </div>
                      <div class="portfolio-item-actions">
                        <button
                          class="portfolio-item-btn"
                          onClick={() => startEdit(p)}
                          title="Edit"
                        >
                          ✏️
                        </button>
                        <button
                          class="portfolio-item-btn danger"
                          onClick={() => handleDelete(p.id)}
                          title="Delete"
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div class="dialog-footer">
          <button class="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
