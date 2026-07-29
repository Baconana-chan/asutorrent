import { useSignal } from "@preact/signals";
import { searchTrackers, checkJackettAvailable, addMagnet } from "../hooks/useTorrents";
import type { SearchResultPayload } from "../hooks/useTorrents";
import { t } from "../hooks/useLocales";

interface Props {
  onClose: () => void;
}

const TRACKER_SOURCES = [
  { id: "nyaa", label: "Nyaa.si" },
  { id: "tpb", label: "ThePirateBay" },
  { id: "eztv", label: "EZTV" },
  { id: "yts", label: "YTS" },
  { id: "jackett", label: "Jackett" },
] as const;

export function TorrentSearchDialog({ onClose }: Props) {
  const query = useSignal("");
  const selectedSources = useSignal<Set<string>>(new Set(["nyaa", "tpb", "eztv", "yts"]));
  const results = useSignal<SearchResultPayload[]>([]);
  const searching = useSignal(false);
  const error = useSignal<string | null>(null);
  const jackettAvailable = useSignal(false);
  const checkingJackett = useSignal(false);
  const hasSearched = useSignal(false);

  const toggleSource = (id: string) => {
    const next = new Set(selectedSources.value);
    if (next.has(id)) next.delete(id); else next.add(id);
    selectedSources.value = next;
  };

  const doSearch = async () => {
    const q = query.value.trim();
    if (!q) return;
    const sources = [...selectedSources.value];
    if (sources.length === 0) return;

    searching.value = true;
    error.value = null;
    hasSearched.value = true;
    try {
      const r = await searchTrackers(q, sources);
      results.value = r;
    } catch (e) {
      error.value = String(e);
      results.value = [];
    } finally {
      searching.value = false;
    }
  };

  const checkJackett = async () => {
    checkingJackett.value = true;
    try {
      jackettAvailable.value = await checkJackettAvailable();
    } catch {
      jackettAvailable.value = false;
    } finally {
      checkingJackett.value = false;
    }
  };

  const handleAdd = async (magnet: string) => {
    try {
      await addMagnet(magnet);
    } catch (e) {
      console.error("Failed to add magnet:", e);
    }
  };

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return "—";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const v = bytes / Math.pow(1024, i);
    return v >= 100 ? `${v.toFixed(0)} ${units[i]}` : `${v.toFixed(1)} ${units[i]}`;
  };

  const getSourceClass = (tracker: string): string => {
    if (tracker.includes("Nyaa")) return "source-nyaa";
    if (tracker.includes("TPB") || tracker.includes("Pirate")) return "source-tpb";
    if (tracker.includes("EZTV") || tracker.includes("eztv")) return "source-eztv";
    if (tracker.includes("YTS")) return "source-yts";
    if (tracker.includes("Jackett")) return "source-jackett";
    return "";
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") doSearch();
  };

  return (
    <div class="dialog-overlay" onClick={onClose}>
      <div class="dialog search-dialog" onClick={(e) => e.stopPropagation()}>
        <div class="dialog-header">
          <h2>{t("search.title", "Search Trackers")}</h2>
          <button class="dialog-close" onClick={onClose} title={t("dialog.close", "Close")}>&times;</button>
        </div>

        <div class="dialog-body">
          {/* Search input row */}
          <div class="search-input-row">
            <div class="search-input-wrap">
              <input
                type="text"
                class="search-torrent-input"
                placeholder={t("search.placeholder", "Search torrents across public trackers…")}
                value={query.value}
                onInput={(e) => { query.value = (e.target as HTMLInputElement).value; }}
                onKeyDown={handleKeyDown}
                autoFocus
              />
              <button
                class="btn btn-primary search-go-btn"
                onClick={doSearch}
                disabled={searching.value || !query.value.trim() || selectedSources.value.size === 0}
              >
                {searching.value ? (
                  <span class="spinner-sm" />
                ) : (
                  <svg viewBox="0 0 16 16" fill="currentColor" style="width:14px;height:14px;">
                    <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
                  </svg>
                )}
                <span>{t("search.button", "Search")}</span>
              </button>
            </div>
          </div>

          {/* Source checkboxes */}
          <div class="search-sources">
            <span class="search-sources-label">{t("search.sources", "Sources:")}</span>
            <div class="search-source-toggles">
              {TRACKER_SOURCES.map((src) => (
                <label
                  key={src.id}
                  class={`source-toggle ${selectedSources.value.has(src.id) ? "active" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedSources.value.has(src.id)}
                    onChange={() => toggleSource(src.id)}
                  />
                  <span class="source-dot" data-source={src.id} />
                  <span>{src.label}</span>
                </label>
              ))}
              <button
                class="btn btn-ghost check-jackett-btn"
                onClick={checkJackett}
                disabled={checkingJackett.value}
                title={t("search.check_jackett", "Check if Jackett is available")}
              >
                {checkingJackett.value ? (
                  <span class="spinner-sm" />
                ) : jackettAvailable.value ? (
                  <svg viewBox="0 0 16 16" fill="currentColor" style="width:12px;height:12px;color:var(--green);">
                    <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/>
                  </svg>
                ) : (
                  <svg viewBox="0 0 16 16" fill="currentColor" style="width:12px;height:12px;color:var(--text-muted);">
                    <circle cx="8" cy="8" r="6.5"/>
                    <path d="M5 5l6 6M11 5l-6 6"/>
                  </svg>
                )}
                <span>{t("search.jackett_status", jackettAvailable.value ? "Jackett: OK" : "Jackett: ?")}</span>
              </button>
            </div>
          </div>

          {/* Error */}
          {error.value && (
            <div class="search-error">
              <span class="search-error-icon">{'\u26A0'}</span>
              {error.value}
            </div>
          )}

          {/* Empty state */}
          {hasSearched.value && !searching.value && results.value.length === 0 && !error.value && (
            <div class="search-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:32px;height:32px;opacity:0.3;">
                <circle cx="11" cy="11" r="8"/>
                <path d="M21 21l-4.35-4.35"/>
              </svg>
              <p>{t("search.no_results", "No results found.")}</p>
              <span class="search-empty-hint">{t("search.try_different", "Try a different query or enable more sources.")}</span>
            </div>
          )}

          {/* Results table */}
          {results.value.length > 0 && (
            <div class="search-results-wrap">
              <table class="search-results-table">
                <thead>
                  <tr>
                    <th class="col-name">{t("search.col_name", "Name")}</th>
                    <th class="col-size">{t("search.col_size", "Size")}</th>
                    <th class="col-seeds">{t("search.col_seeds", "S")}</th>
                    <th class="col-peers">{t("search.col_peers", "P")}</th>
                    <th class="col-tracker">{t("search.col_tracker", "Tracker")}</th>
                    <th class="col-category">{t("search.col_category", "Category")}</th>
                    <th class="col-action"></th>
                  </tr>
                </thead>
                <tbody>
                  {results.value.map((r, i) => (
                    <tr key={`${r.tracker}-${i}`} class="search-result-row">
                      <td class="col-name" title={r.name}>
                        <span class="result-name">{r.name}</span>
                      </td>
                      <td class="col-size"><span class="result-size">{formatSize(r.size)}</span></td>
                      <td class="col-seeds">
                        <span class={`result-seeds ${r.seeds > 0 ? "has-seeds" : ""}`}>
                          {r.seeds}
                        </span>
                      </td>
                      <td class="col-peers"><span class="result-peers">{r.peers}</span></td>
                      <td class="col-tracker">
                        <span class={`result-tracker ${getSourceClass(r.tracker)}`}>
                          {r.tracker}
                        </span>
                      </td>
                      <td class="col-category"><span class="result-category">{r.category}</span></td>
                      <td class="col-action">
                        <button
                          class="btn btn-primary btn-xs add-torrent-btn"
                          onClick={() => handleAdd(r.magnet)}
                          title={t("search.add_torrent", "Add this torrent")}
                        >
                          <svg viewBox="0 0 12 12" fill="currentColor" style="width:10px;height:10px;">
                            <path d="M5.5 1a.5.5 0 01.5.5V5h3.5a.5.5 0 01.5.5v1a.5.5 0 01-.5.5H6v3.5a.5.5 0 01-.5.5h-1a.5.5 0 01-.5-.5V7H.5A.5.5 0 010 6.5v-1A.5.5 0 01.5 5H4V1.5A.5.5 0 014.5 1h1z"/>
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
