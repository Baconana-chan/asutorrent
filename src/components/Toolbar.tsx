import { useSignal } from "@preact/signals";
import { AddTorrentModal } from "./AddTorrent";
import { t, locale, noCase, LOCALES, type LocaleCode } from "../hooks/useLocales";

interface Props {
  selectedCount: number;
  onPauseAll: () => void;
  onResumeAll: () => void;
  onDeleteSelected: () => void;
  search: string;
  onSearch: (v: string) => void;
  turtleMode: boolean;
  onTurtleToggle: () => void;
  onOpenSpeedLimits: () => void;
  onOpenQueueConfig: () => void;
  onOpenSchedule: () => void;
  onOpenCategories: () => void;
  onOpenAutoMgmt: () => void;
  onExportJson: () => void;
  onExportCsv: () => void;
  onImport: () => void;
  onOpenProxy: () => void;
  onOpenBindAddress: () => void;
  onOpenUtp: () => void;
  onOpenNetworkFeatures: () => void;
  onOpenEncryption: () => void;
  onCreateTorrent: () => void;
  onOpenSearch: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
  onOpenAbout: () => void;
}

function LocaleSwitcher() {
  const open = useSignal(false);
  const search = useSignal("");
  const current = locale.value;

  const filtered = LOCALES.filter((l) =>
    l.name.toLowerCase().includes(search.value.toLowerCase()) ||
    l.native.toLowerCase().includes(search.value.toLowerCase()) ||
    l.code.toLowerCase().includes(search.value.toLowerCase())
  );

  const select = (code: LocaleCode) => {
    locale.value = code;
    localStorage.setItem("asutorrent-locale", code);
    open.value = false;
    search.value = "";
  };

  // Close on click outside
  const handleBlur = (e: FocusEvent) => {
    if (!(e.currentTarget as HTMLElement)?.contains(e.relatedTarget as Node)) {
      open.value = false;
      search.value = "";
    }
  };

  return (
    <div
      class="locale-switcher"
      onBlur={handleBlur}
      onKeyDown={(e) => { if (e.key === "Escape") { open.value = false; search.value = ""; } }}
      tabIndex={-1}
    >
      <button
        class={`toolbar-btn locale-trigger${open.value ? " active" : ""}`}
        onClick={() => {
          open.value = !open.value;
          if (open.value) search.value = "";
        }}
        title={t("toolbar.locale")}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" style="width:15px;height:15px;">
          <circle cx="10" cy="10" r="8"/>
          <path d="M3 10h14M10 3c-1.5 0-3 3-3 7s1.5 7 3 7 3-3 3-7-1.5-7-3-7z"/>
          <path d="M4.5 6c0 0 2-2 5.5-2s5.5 2 5.5 2M4.5 14c0 0 2 2 5.5 2s5.5-2 5.5-2"/>
        </svg>
      </button>
      {open.value && (
        <div class="locale-dropdown">
          <div class="locale-search-wrap">
            <input
              class="locale-search"
              type="text"
              placeholder="Search…"
              value={search.value}
              onInput={(e) => (search.value = (e.target as HTMLInputElement).value)}
              autoFocus
            />
          </div>
          <div class="locale-list">
            {filtered.length === 0 && (
              <div class="locale-empty">No matches</div>
            )}
            {filtered.map((l) => (
              <button
                class={`locale-option${l.code === current ? " active" : ""}`}
                onClick={() => select(l.code)}
              >
                <span class="locale-option-native">{l.native}</span>
                <span class="locale-option-name">{l.name}</span>
                {l.code === current && <span class="locale-option-check">{'✓'}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
      <label
        class="nocase-toggle"
        title="Без заглавных, точек и запятых — No caps, dots, or commas"
      >
        <input
          type="checkbox"
          checked={noCase.value}
          onChange={() => {
            noCase.value = !noCase.value;
            localStorage.setItem("asutorrent-nocase", String(noCase.value));
          }}
        />
        <span class="nocase-label">Aa</span>
      </label>
    </div>
  );
}

export function Toolbar({
  selectedCount,
  onPauseAll,
  onResumeAll,
  onDeleteSelected,
  search,
  onSearch,
  turtleMode,
  onTurtleToggle,
  onOpenSpeedLimits,
  onOpenQueueConfig,
  onOpenSchedule,
  onOpenCategories,
  onOpenAutoMgmt,
  onExportJson,
  onExportCsv,
  onImport,
  onOpenProxy,
  onOpenBindAddress,
  onOpenUtp,
  onOpenNetworkFeatures,
  onOpenEncryption,
  onCreateTorrent,
  onOpenSearch,
  isDark,
  onToggleTheme,
  onOpenAbout,
}: Props) {
  const showAdd = useSignal(false);

  return (
    <>
      <div class="toolbar">
        <div class="toolbar-group">            <button
            class="toolbar-btn labeled"
            onClick={() => (showAdd.value = true)}
            title={t("toolbar.add_torrent")}
          >
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
              <line x1="8" y1="3" x2="8" y2="13" />
              <line x1="3" y1="8" x2="13" y2="8" />
            </svg>
            {t("toolbar.add")}
          </button>
          <button
            class="toolbar-btn"
            onClick={onCreateTorrent}
            title={t("toolbar.create_torrent")}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
              <path d="M8 2v12M2 8h12"/>
              <rect x="3" y="3" width="10" height="10" rx="2"/>
            </svg>
          </button>
          {/* Search Trackers button */}
          <button
            class="toolbar-btn"
            onClick={onOpenSearch}
            title={t("toolbar.search_trackers")}
          >
            <svg viewBox="0 0 16 16" fill="currentColor" style="width:15px;height:15px;">
              <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
            </svg>
          </button>
        </div>

        <div class="toolbar-sep" />

        <div class="toolbar-group">
          <button
            class="toolbar-btn"
            onClick={onResumeAll}
            title={t("toolbar.resume")}
            disabled={selectedCount === 0}
          >
            <svg viewBox="0 0 16 16" fill="currentColor">
              <polygon points="4,3 13,8 4,13" />
            </svg>
          </button>
          <button
            class="toolbar-btn"
            onClick={onPauseAll}
            title={t("toolbar.pause")}
            disabled={selectedCount === 0}
          >
            <svg viewBox="0 0 16 16" fill="currentColor">
              <rect x="4" y="3" width="3" height="10" rx="1" />
              <rect x="9" y="3" width="3" height="10" rx="1" />
            </svg>
          </button>
        </div>

        <div class="toolbar-sep" />

        <div class="toolbar-group">
          <button
            class="toolbar-btn"
            onClick={onDeleteSelected}
            title={t("toolbar.delete")}
            disabled={selectedCount === 0}
          >
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            >
              <path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M5 4v9a1 1 0 001 1h4a1 1 0 001-1V4" />
            </svg>
          </button>
        </div>

        <div class="toolbar-sep" />

        <div class="toolbar-group">
          {/* Categories & Tags */}
          <button
            class="toolbar-btn"
            onClick={onOpenCategories}
            title={t("toolbar.categories")}
          >
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              style="width:16px;height:16px;"
            >
              <path d="M3 4h14v2H3V4zm0 5h14v2H3V9zm0 5h14v2H3v-2z" />
            </svg>
          </button>
        </div>

        <div class="toolbar-sep" />

        <div class="toolbar-group">
          <button
            class="toolbar-btn"
            onClick={onOpenAutoMgmt}
            title={t("toolbar.auto_mgmt")}
          >
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              style="width:16px;height:16px;"
            >
              <path d="M10 2C5.58 2 2 5.58 2 10s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm1 11.41l-4-4L8.41 8 11 10.59 15.59 6 17 7.41l-6 6z" />
            </svg>
          </button>

          <button
            class="toolbar-btn"
            onClick={onOpenQueueConfig}
            title={t("toolbar.queue")}
          >
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              style="width:16px;height:16px;"
            >
              <path d="M3 4h14v2H3V4zm0 5h14v2H3V9zm0 5h14v2H3v-2z" />
            </svg>
          </button>
        </div>

        <div class="toolbar-spacer" />

        <div class="toolbar-group">
          {/* Speed schedule */}
          <button
            class="toolbar-btn"
            onClick={onOpenSchedule}
            title={t("toolbar.speed_schedule")}
          >
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              style="width:16px;height:16px;"
            >
              <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm0 14.5a6.5 6.5 0 110-13 6.5 6.5 0 010 13zM10.5 5v5.5L14 12.5l-.5 1-4-2V5h1z" />
            </svg>
          </button>

          {/* Speed limits / Turtle mode */}
          <button
            class={`toolbar-btn ${turtleMode ? "active" : ""}`}
            onClick={onTurtleToggle}
            title={turtleMode ? t("toolbar.turtle_on") : t("toolbar.turtle_off")}
          >
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              style="width:18px;height:18px;"
            >
              <path d="M10 2C5.58 2 2 5.58 2 10s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6zm-1-9h2v5H9V7zm0 6h2v2H9v-2z" />
            </svg>
          </button>            <button class="toolbar-btn" onClick={onOpenBindAddress} title={t("toolbar.bind_address")}>
              <svg viewBox="0 0 20 20" fill="currentColor" style="width:15px;height:15px;">
                <path d="M10 2C5.58 2 2 5.58 2 10s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z"/>
                <circle cx="10" cy="10" r="2"/>
              </svg>
            </button>
            <button class="toolbar-btn" onClick={onOpenEncryption} title={t("toolbar.encryption")}>
              <svg viewBox="0 0 20 20" fill="currentColor" style="width:15px;height:15px;">
                <rect x="7" y="9" width="6" height="7" rx="1"/>
                <path d="M7 9V6a3 3 0 016 0v3"/>
              </svg>
            </button>
            <button class="toolbar-btn" onClick={onOpenNetworkFeatures} title={t("toolbar.network_features")}>
              <svg viewBox="0 0 20 20" fill="currentColor" style="width:15px;height:15px;">
                <circle cx="10" cy="5" r="2"/>
                <path d="M10 8c-2 0-4 1-4 3h8c0-2-2-3-4-3z"/>
                <path d="M6 12v2c0 1.1.9 2 2 2h4c1.1 0 2-.9 2-2v-2"/>
              </svg>
            </button>
            <button class="toolbar-btn" onClick={onOpenUtp} title={t("toolbar.utp")}>
              <svg viewBox="0 0 20 20" fill="currentColor" style="width:15px;height:15px;">
                <path d="M10 2C5.58 2 2 5.58 2 10s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zM9 6h2v6H9V6zm0 8h2v2H9v-2z"/>
              </svg>
            </button>
            <button class="toolbar-btn" onClick={onOpenProxy} title={t("toolbar.proxy")}>
              <svg viewBox="0 0 20 20" fill="currentColor" style="width:15px;height:15px;">
                <path d="M10 2C5.58 2 2 5.58 2 10s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6zm-1-8h2v5H9V8zm0-3h2v2H9V5z"/>
              </svg>
            </button>
            <button class="toolbar-btn" onClick={onOpenSpeedLimits} title={t("toolbar.speed_limits")}>
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              style="width:16px;height:16px;"
            >
              <path d="M15 17h2V7h-2v10zm-4 0h2V3h-2v14zm-4 0h2V9H7v8zm-4 0h2V5H3v12z" />
            </svg>
          </button>

          <div class="toolbar-sep" />

          <div class="toolbar-group" style="display:flex;align-items:center;gap:2px;">
            <span style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px;margin-right:4px;">{t("toolbar.file")}</span>
            <button class="toolbar-btn" onClick={onExportJson} title={t("toolbar.export_json")}>
              <svg viewBox="0 0 20 20" fill="currentColor" style="width:15px;height:15px;">
                <path d="M13 8V2H7v6H2l8 8 8-8h-5zM4 18h12v2H4v-2z"/>
              </svg>
            </button>
            <button class="toolbar-btn" onClick={onExportCsv} title={t("toolbar.export_csv")}>
              <svg viewBox="0 0 20 20" fill="currentColor" style="width:15px;height:15px;">
                <path d="M13 8V2H7v6H2l8 8 8-8h-5zM4 18h12v2H4v-2z"/>
              </svg>
              <span style="font-size:9px;margin-left:1px;color:var(--text-muted);">CSV</span>
            </button>
            <button class="toolbar-btn" onClick={onImport} title={t("toolbar.import")}>
              <svg viewBox="0 0 20 20" fill="currentColor" style="width:15px;height:15px;">
                <path d="M13 8V2H7v6H2l8 8 8-8h-5zM4 18h12v2H4v-2z" transform="rotate(180,10,10)"/>
              </svg>
            </button>
          </div>

          {selectedCount > 0 && (
            <span style="font-size: 11px; color: var(--text-muted); margin: 0 8px;">
              {selectedCount}{' '}{t("toolbar.selected").replace("{count}", String(selectedCount))}
            </span>
          )}
          <div class="toolbar-search">
            <span class="search-icon">{'\u2315'}</span>
            <input
              type="text"
              placeholder={t("toolbar.search_placeholder")}
              value={search}
              onInput={(e) =>
                onSearch((e.target as HTMLInputElement).value)
              }
              title={t("toolbar.search_title")}
            />
          </div>

          <div class="toolbar-sep" />

          <button
            class={`toolbar-btn theme-btn ${isDark ? "" : "active"}`}
            onClick={onToggleTheme}
            title={isDark ? t("toolbar.theme_dark") : t("toolbar.theme_light")}
          >
            {isDark ? (
              /* Sun icon */
              <svg viewBox="0 0 20 20" fill="currentColor" style="width:16px;height:16px;">
                <circle cx="10" cy="10" r="4"/>
                <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.93 4.93l1.41 1.41M13.66 13.66l1.41 1.41M4.93 15.07l1.41-1.41M13.66 6.34l1.41-1.41"/>
              </svg>
            ) : (
              /* Moon icon */
              <svg viewBox="0 0 20 20" fill="currentColor" style="width:16px;height:16px;">
                <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/>
              </svg>
            )}
          </button>

          {/* Locale switcher */}
          <LocaleSwitcher />

          {/* About button */}
          <button
            class="toolbar-btn"
            onClick={onOpenAbout}
            title={t("toolbar.about")}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" style="width:16px;height:16px;">
              <circle cx="10" cy="10" r="8"/>
              <path d="M10 9v6M10 7v.01"/>
            </svg>
          </button>
        </div>
      </div>

      {showAdd.value && (
        <AddTorrentModal onClose={() => (showAdd.value = false)} />
      )}
    </>
  );
}
