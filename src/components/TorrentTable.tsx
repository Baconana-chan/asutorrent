import { useSignal, useComputed } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import {
  torrents, TorrentListEntry, addMagnet, addTorrentFile,
  getCategories, getFullConfig, getTorrentUtp,
  getTorrentDht, getTorrentPex, getTorrentLpd, getTorrentEncryption,
  type CategoryPayload,
} from "../hooks/useTorrents";
import { TorrentRow } from "./TorrentRow";
import { ContextMenu, buildTorrentMenu, MenuItem } from "./ContextMenu";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import {
  columnConfig, defByKey,
  moveColumn, toggleColumn, resetColumns,
  type ColumnDef, type ColumnKey,
} from "../hooks/useColumnConfig";

interface Props {
  filter: string;
  search: string;
  onSelectionChange: (ids: Set<number>) => void;
  onPlayFile?: (torrentId: number, fileIndex: number, fileName: string) => void;
}

type SortKey = ColumnKey;
type SortDir = "asc" | "desc";

/** Returns true if the trimmed input looks like a magnet link or URL. */
function isMagnetOrUrl(s: string): boolean {
  const t = s.trim();
  return t.startsWith("magnet:") || t.startsWith("http://") || t.startsWith("https://");
}

export function TorrentTable({ filter, search, onSelectionChange, onPlayFile }: Props) {
  const sortKey = useSignal<SortKey>("name");
  const sortDir = useSignal<SortDir>("asc");
  const selected = useSignal<Set<number>>(new Set());
  const selectionAnchor = useSignal<number | null>(null);

  // Context menu state
  const ctxMenuPos = useSignal<{ x: number; y: number } | null>(null);
  const ctxMenuItems = useSignal<MenuItem[]>([]);

  // Delete dialog state
  const deleteIds = useSignal<number[]>([]);
  const deleteNames = useSignal<string[]>([]);

  // Category/Tag filter data
  const categories = useSignal<CategoryPayload[]>([]);
  const torrentCatMap = useSignal<Record<string, number>>({});
  const torrentTagMap = useSignal<Record<string, number[]>>({});
  const tagNameMap = useSignal<Record<number, string>>({});

  // Column picker state
  const showColumnPicker = useSignal(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Drag-to-reorder state
  const dragColIdx = useSignal<number | null>(null);
  const dragOverColIdx = useSignal<number | null>(null);

  useEffect(() => {
    getCategories().then((c) => (categories.value = c)).catch(() => {});
    getFullConfig().then((cfg) => {
      torrentCatMap.value = cfg.torrent_categories as Record<string, number>;
      torrentTagMap.value = cfg.torrent_tags as Record<string, number[]>;
      // Build a reusable map: tag ID → tag name
      const map: Record<number, string> = {};
      for (const tag of (cfg.tags ?? [])) {
        map[tag.id] = tag.name;
      }
      tagNameMap.value = map;
    }).catch(() => {});
  }, []);

  // Re-apply tag names whenever the torrent list updates
  useEffect(() => {
    const map = tagNameMap.value;
    if (Object.keys(map).length === 0) return;
    const tagMap = torrentTagMap.value;
    const updated = torrents.value.map((t) => {
      const tagIds = tagMap[String(t.id)] ?? [];
      const names = tagIds.map((tid) => map[tid] ?? "").filter(Boolean);
      return { ...t, tags: names };
    });
    torrents.value = updated;
  }, [torrents.value, tagNameMap.value, torrentTagMap.value]);

  // Close column picker on outside click
  useEffect(() => {
    if (!showColumnPicker.value) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        showColumnPicker.value = false;
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showColumnPicker.value]);

  // Drag & drop state (for torrent files)
  const dragOver = useSignal(false);
  const dropFeedback = useSignal<string | null>(null);

  // ── Visible columns derived from config ─────────────────────────
  const visibleColumns = useComputed<ColumnDef[]>(() =>
    columnConfig.value
      .filter((e) => e.visible)
      .map((e) => defByKey(e.key))
  );

  const filtered = useComputed(() => {
    let list = torrents.value;
    if (filter !== "all") {
      if (filter.startsWith("cat:")) {
        const catId = Number(filter.slice(4));
        const map = torrentCatMap.value;
        list = list.filter((t) => map[String(t.id)] === catId);
      } else if (filter.startsWith("tag:")) {
        const tagId = Number(filter.slice(4));
        const map = torrentTagMap.value;
        list = list.filter((t) => (map[String(t.id)] ?? []).includes(tagId));
      } else {
        list = list.filter((t) => {
          const s = (t.state ?? "").toLowerCase();
          if (filter === "downloading") return s === "downloading" || s === "metadata";
          if (filter === "seeding") return s === "seeding" || s === "completed";
          if (filter === "paused") return s === "paused";
          if (filter === "error") return s === "error";
          if (filter === "checking") return s === "checking";
          return true;
        });
      }
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((t) => {
        // Search by torrent name
        if (t.name?.toLowerCase().includes(q)) return true;
        // Search by info_hash
        if (t.info_hash.toLowerCase().includes(q)) return true;
        // Search by tag names
        if (t.tags.some((tag) => tag.toLowerCase().includes(q))) return true;
        return false;
      });
    }
    const key = sortKey.value;
    const dir = sortDir.value;
    list = [...list].sort((a, b) => {
      const cmp = compare(a, b, key);
      return dir === "asc" ? cmp : -cmp;
    });
    return list;
  });

  // ── Selection ──────────────────────────────────────────────────
  const handleSelect = (id: number, ctrl: boolean, shift: boolean) => {
    const list = filtered.value;
    const s = new Set(selected.value);
    if (shift && selectionAnchor.value !== null) {
      const idxA = list.findIndex((t) => t.id === selectionAnchor.value);
      const idxB = list.findIndex((t) => t.id === id);
      if (idxA !== -1 && idxB !== -1) {
        const [start, end] = idxA < idxB ? [idxA, idxB] : [idxB, idxA];
        for (let i = start; i <= end; i++) s.add(list[i].id);
      }
    } else if (ctrl) {
      if (s.has(id)) s.delete(id);
      else s.add(id);
    } else {
      s.clear();
      s.add(id);
    }
    selectionAnchor.value = id;
    selected.value = s;
    onSelectionChange(s);
  };

  // Per-torrent network feature values (lazily loaded on menu open)
  const torrentUtpValues = useSignal<Map<number, boolean | null>>(new Map());
  const torrentDhtValues = useSignal<Map<number, boolean | null>>(new Map());
  const torrentPexValues = useSignal<Map<number, boolean | null>>(new Map());
  const torrentLpdValues = useSignal<Map<number, boolean | null>>(new Map());
  const torrentEncryptionValues = useSignal<Map<number, string | null>>(new Map());

  // ── Context menu ───────────────────────────────────────────────
  const handleContextMenu = async (e: MouseEvent, id: number) => {
    const s = new Set(selected.value);
    if (!s.has(id)) {
      s.clear();
      s.add(id);
      selectionAnchor.value = id;
      selected.value = s;
      onSelectionChange(s);
    }
    const ids = [...s];
    const states = ids.map((tid) => torrents.value.find((t) => t.id === tid)?.state ?? "");
    const forced = ids.map((tid) => torrents.value.find((t) => t.id === tid)?.forced ?? false);
    const names = ids.map((tid) => torrents.value.find((t) => t.id === tid)?.name ?? "");
    const sequentialIds = new Set(torrents.value.filter((t) => t.sequential).map((t) => t.id));

    // Fetch network feature values for single selection
    if (ids.length === 1) {
      try {
        const [utp, dht, pex, lpd, enc] = await Promise.all([
          getTorrentUtp(ids[0]),
          getTorrentDht(ids[0]),
          getTorrentPex(ids[0]),
          getTorrentLpd(ids[0]),
          getTorrentEncryption(ids[0]),
        ]);
        torrentUtpValues.value = new Map([[ids[0], utp]]);
        torrentDhtValues.value = new Map([[ids[0], dht]]);
        torrentPexValues.value = new Map([[ids[0], pex]]);
        torrentLpdValues.value = new Map([[ids[0], lpd]]);
        torrentEncryptionValues.value = new Map([[ids[0], enc]]);
      } catch { /* ignore */ }
    }

    ctxMenuItems.value = buildTorrentMenu(ids, states, forced, names, () => { ctxMenuPos.value = null; }, onPlayFile, sequentialIds, torrentUtpValues.value, torrentDhtValues.value, torrentPexValues.value, torrentLpdValues.value, torrentEncryptionValues.value);
    ctxMenuPos.value = { x: e.clientX, y: e.clientY };
  };

  const handleDblClick = (_id: number) => {};

  // ── Drag & Drop (torrent files) ─────────────────────────────────
  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragOver.value = true;
    if (e.dataTransfer?.types.includes("text/plain")) {
      dropFeedback.value = "Drop magnet link or URL\u2026";
    } else if (e.dataTransfer?.types.includes("Files")) {
      dropFeedback.value = "Drop .torrent file\u2026";
    } else {
      dropFeedback.value = "Drop magnet link, URL, or .torrent file";
    }
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragOver.value = false;
    dropFeedback.value = null;
  };

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragOver.value = false;
    dropFeedback.value = null;
    const dt = e.dataTransfer;
    if (!dt) return;
    const text = dt.getData("text/plain");
    if (text) {
      const lines = text.split("\n").map((s) => s.trim()).filter(Boolean);
      for (const line of lines) {
        if (isMagnetOrUrl(line)) {
          try { await addMagnet(line); } catch { /* ignore */ }
        }
      }
    }
    if (dt.files.length > 0) {
      for (let i = 0; i < dt.files.length; i++) {
        const file = dt.files[i];
        const path = (file as unknown as { path?: string }).path;
        if (path && /\.torrent$/i.test(path)) {
          try { await addTorrentFile(path); } catch { /* ignore */ }
        }
      }
    }
  };

  // ── Column drag-to-reorder ────────────────────────────────────
  const handleColDragStart = (e: DragEvent, idx: number) => {
    const dt = e.dataTransfer;
    if (!dt) return;
    dt.effectAllowed = "move";
    dt.setData("text/plain", String(idx));
    dragColIdx.value = idx;
  };

  const handleColDragOver = (e: DragEvent, idx: number) => {
    e.preventDefault();
    const dt = e.dataTransfer;
    if (!dt) return;
    dt.dropEffect = "move";
    dragOverColIdx.value = idx;
  };

  const handleColDragLeave = () => {
    dragOverColIdx.value = null;
  };

  const handleColDrop = (e: DragEvent, toIdx: number) => {
    e.preventDefault();
    const dt = e.dataTransfer;
    if (!dt) return;
    const fromStr = dt.getData("text/plain");
    const fromIdx = Number(fromStr);
    if (!isNaN(fromIdx) && fromIdx !== toIdx) {
      moveColumn(fromIdx, toIdx);
    }
    dragColIdx.value = null;
    dragOverColIdx.value = null;
  };

  const handleColDragEnd = () => {
    dragColIdx.value = null;
    dragOverColIdx.value = null;
  };

  // ── Sort ───────────────────────────────────────────────────────
  const toggleSort = (key: SortKey) => {
    if (sortKey.value === key) {
      sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
    } else {
      sortKey.value = key;
      sortDir.value = "asc";
    }
  };

  const sortIcon = (key: SortKey) => {
    if (sortKey.value !== key) return "";
    return sortDir.value === "asc" ? "\u2191" : "\u2193";
  };

  const hasItems = filtered.value.length > 0;
  const cols = visibleColumns.value;

  return (
    <div
      class={`torrent-table-wrap ${dragOver.value ? "drag-over" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag feedback overlay */}
      {dragOver.value && (
        <div class="drop-overlay">
          <div class="drop-overlay-content">
            <div class="drop-icon">+</div>
            <span>{dropFeedback.value || "Drop torrent here"}</span>
          </div>
        </div>
      )}

      <div class="torrent-table-header">
        {cols.map((col, idx) => (
          <div
            key={col.key}
            class={[
              "th",
              dragColIdx.value === idx && "th-dragging",
              dragOverColIdx.value === idx && "th-drag-over",
            ].filter(Boolean).join(" ")}
            style={`flex: ${col.style}${col.extraStyle ? `; ${col.extraStyle}` : ""}`}
            onClick={() => toggleSort(col.key)}
            draggable
            onDragStart={(e) => handleColDragStart(e, idx)}
            onDragOver={(e) => handleColDragOver(e, idx)}
            onDragLeave={handleColDragLeave}
            onDrop={(e) => handleColDrop(e, idx)}
            onDragEnd={handleColDragEnd}
            title={`Sort by ${col.label}`}
          >
            {col.label}
            <span class="sort-icon">{sortIcon(col.key)}</span>
          </div>
        ))}

        {/* Column picker trigger */}
        <div class="th th-picker-trigger" style="flex: 0 0 28px; justify-content: center;">
          <button
            class="col-picker-btn"
            onClick={(e) => { e.stopPropagation(); showColumnPicker.value = !showColumnPicker.value; }}
            title="Customize columns"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
              <line x1="3" y1="4" x2="13" y2="4" />
              <line x1="3" y1="8" x2="13" y2="8" />
              <line x1="3" y1="12" x2="13" y2="12" />
            </svg>
          </button>

          {/* Column picker dropdown */}
          {showColumnPicker.value && (
            <div class="col-picker-dropdown" ref={pickerRef} onClick={(e) => e.stopPropagation()}>
              <div class="col-picker-header">
                <span>Columns</span>
                <button class="col-picker-reset-btn" onClick={resetColumns} title="Reset to defaults">
                  Reset
                </button>
              </div>
              {columnConfig.value.map((entry, idx) => {
                const def = defByKey(entry.key);
                return (
                  <label
                    key={entry.key}
                    class="col-picker-item"
                    draggable
                    onDragStart={(e) => {
                      const dt = e.dataTransfer;
                      if (!dt) return;
                      dt.effectAllowed = "move";
                      dt.setData("text/plain", String(idx));
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      const dt = e.dataTransfer;
                      if (!dt) return;
                      dt.dropEffect = "move";
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const dt = e.dataTransfer;
                      if (!dt) return;
                      const fromStr = dt.getData("text/plain");
                      const fromIdx = Number(fromStr);
                      if (!isNaN(fromIdx) && fromIdx !== idx) {
                        moveColumn(fromIdx, idx);
                      }
                    }}
                  >
                    <span class="col-picker-drag-handle" title="Drag to reorder">⠿</span>
                    <input
                      type="checkbox"
                      checked={entry.visible}
                      onChange={() => toggleColumn(entry.key)}
                    />
                    <span class="col-picker-label">{def.label}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div class="torrent-table">
        {hasItems ? (
          filtered.value.map((t, i) => (
            <TorrentRow
              key={t.id}
              torrent={t}
              index={i}
              columns={cols}
              search={search}
              selected={selected.value.has(t.id)}
              onSelect={handleSelect}
              onDoubleClick={handleDblClick}
              onContextMenu={handleContextMenu}
            />
          ))
        ) : (
          <div class="empty-table">
            <div class="empty-icon">📥</div>
            <h3>{search ? "No matching torrents" : "No torrents yet"}</h3>
            <p>
              {search
                ? "Try a different search term."
                : "Add a magnet link or torrent file to get started."}
            </p>
          </div>
        )}
      </div>

      {ctxMenuPos.value && (
        <ContextMenu
          x={ctxMenuPos.value.x}
          y={ctxMenuPos.value.y}
          items={ctxMenuItems.value}
          onClose={() => (ctxMenuPos.value = null)}
        />
      )}

      {deleteIds.value.length > 0 && (
        <DeleteConfirmDialog
          ids={deleteIds.value}
          names={deleteNames.value}
          onClose={() => { deleteIds.value = []; deleteNames.value = []; }}
          onDone={() => {
            selected.value = new Set();
            selectionAnchor.value = null;
            onSelectionChange(new Set());
          }}
        />
      )}
    </div>
  );
}

function compare(a: TorrentListEntry, b: TorrentListEntry, key: SortKey): number {
  switch (key) {
    case "name": return (a.name ?? "").localeCompare(b.name ?? "");
    case "size": return a.size - b.size;
    case "progress": return a.progress - b.progress;
    case "download_speed": return a.download_speed - b.download_speed;
    case "upload_speed": return a.upload_speed - b.upload_speed;
    case "eta": return (a.eta ?? 0) - (b.eta ?? 0);
    case "state": return (a.state ?? "").localeCompare(b.state ?? "");
    case "peers": return a.peers - b.peers;
    case "seeds": return a.seeds - b.seeds;
    default: return 0;
  }
}
