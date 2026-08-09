import { signal } from "@preact/signals";

// ── Types ─────────────────────────────────────────────────────

export type ColumnKey =
  | "name"
  | "size"
  | "progress"
  | "download_speed"
  | "upload_speed"
  | "eta"
  | "peers"
  | "seeds"
  | "state"
  | "health"
  | "tags";

export interface ColumnDef {
  key: ColumnKey;
  label: string;
  /** Locale key for the column header (falls back to `label`) */
  labelKey?: string;
  /** CSS `flex` value for the column cell */
  style: string;
  /** Extra inline styles (e.g., `justify-content: flex-end`) */
  extraStyle?: string;
  /** Whether the column is visible by default */
  defaultVisible: boolean;
}

export interface ColumnEntry {
  key: ColumnKey;
  visible: boolean;
}

// ── All columns definition ────────────────────────────────────

export const ALL_COLUMNS: ColumnDef[] = [
  { key: "name",           label: "Name",     labelKey: "col.name",     style: "1 1 250px",                                         defaultVisible: true },
  { key: "size",           label: "Size",     labelKey: "col.size",     style: "0 0 85px",   extraStyle: "justify-content: flex-end;", defaultVisible: true },
  { key: "progress",       label: "Progress", labelKey: "col.progress", style: "1 1 150px",                                         defaultVisible: true },
  { key: "download_speed", label: "Down",     labelKey: "col.down",     style: "0 0 85px",   extraStyle: "justify-content: flex-end;", defaultVisible: true },
  { key: "upload_speed",   label: "Up",       labelKey: "col.up",       style: "0 0 85px",   extraStyle: "justify-content: flex-end;", defaultVisible: true },
  { key: "eta",            label: "ETA",      labelKey: "col.eta",      style: "0 0 80px",   extraStyle: "justify-content: flex-end;", defaultVisible: true },
  { key: "peers",          label: "Peers",    labelKey: "col.peers",    style: "0 0 70px",   extraStyle: "justify-content: center;",   defaultVisible: true },
  { key: "seeds",          label: "Seeds",    labelKey: "col.seeds",    style: "0 0 60px",   extraStyle: "justify-content: center;",   defaultVisible: false },
  { key: "state",          label: "Status",   labelKey: "col.status",   style: "0 0 80px",   extraStyle: "justify-content: center;",   defaultVisible: true },
  { key: "health",         label: "Health",   labelKey: "col.health",   style: "0 0 90px",   extraStyle: "justify-content: center;",   defaultVisible: false },
  { key: "tags",           label: "Tags",     labelKey: "col.tags",     style: "1 1 120px",                                          defaultVisible: false },
];

export const ALL_KEYS: ColumnKey[] = ALL_COLUMNS.map((c) => c.key);

export function defByKey(key: ColumnKey): ColumnDef {
  return ALL_COLUMNS.find((c) => c.key === key)!;
}

// ── Persistence ────────────────────────────────────────────────

const STORAGE_KEY = "asutorrent_column_config";

function loadConfig(): ColumnEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: ColumnEntry[] = JSON.parse(raw);
      // Ensure all columns are present (merge with defaults)
      const existingKeys = new Set(parsed.map((e) => e.key));
      for (const def of ALL_COLUMNS) {
        if (!existingKeys.has(def.key)) {
          parsed.push({ key: def.key, visible: def.defaultVisible });
        }
      }
      // Remove stale entries
      return parsed.filter((e) => ALL_KEYS.includes(e.key));
    }
  } catch { /* ignore */ }
  return ALL_COLUMNS.map((def) => ({ key: def.key, visible: def.defaultVisible }));
}

function saveConfig(entries: ColumnEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch { /* ignore */ }
}

// ── Shared signal ──────────────────────────────────────────────

/** Persistent column order + visibility. Read-only outside this module. */
export const columnConfig = signal<ColumnEntry[]>(loadConfig());

/** Reorder: move `fromIndex` → `toIndex` */
export function moveColumn(fromIndex: number, toIndex: number) {
  const arr = [...columnConfig.value];
  if (fromIndex < 0 || fromIndex >= arr.length) return;
  if (toIndex < 0 || toIndex >= arr.length) return;
  const [moved] = arr.splice(fromIndex, 1);
  arr.splice(toIndex, 0, moved);
  columnConfig.value = arr;
  saveConfig(arr);
}

/** Toggle visibility of a single column */
export function toggleColumn(key: ColumnKey) {
  const arr = columnConfig.value.map((e) =>
    e.key === key ? { ...e, visible: !e.visible } : e
  );
  columnConfig.value = arr;
  saveConfig(arr);
}

/** Set all columns to their default visibility and order */
export function resetColumns() {
  const arr = ALL_COLUMNS.map((def) => ({ key: def.key, visible: def.defaultVisible }));
  columnConfig.value = arr;
  saveConfig(arr);
}


