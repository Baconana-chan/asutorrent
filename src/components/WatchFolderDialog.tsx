import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { getWatchFolder, setWatchFolder } from "../hooks/useTorrents";
import { open } from "@tauri-apps/plugin-dialog";

interface Props {
  onClose: () => void;
}

export function WatchFolderDialog({ onClose }: Props) {
  const folder = useSignal("");
  const savedFolder = useSignal<string | null>(null);
  const changed = useSignal(false);
  const saving = useSignal(false);
  const error = useSignal<string | null>(null);

  useEffect(() => {
    getWatchFolder().then((path) => {
      folder.value = path ?? "";
      savedFolder.value = path;
    }).catch(() => {});
  }, []);

  const handleChange = (val: string) => {
    folder.value = val;
    error.value = null;
    changed.value = val !== (savedFolder.value ?? "");
  };

  const handleBrowse = async () => {
    try {
      const result = await open({ directory: true, multiple: false });
      if (typeof result === "string") {
        handleChange(result);
      }
    } catch {
      /* cancelled */
    }
  };

  const handleSave = async () => {
    saving.value = true;
    error.value = null;
    try {
      const val = folder.value.trim() || null;
      await setWatchFolder(val);
      savedFolder.value = val;
      folder.value = val ?? "";
      changed.value = false;
    } catch (err) {
      error.value = String(err);
    } finally {
      saving.value = false;
    }
  };

  const handleClear = () => {
    folder.value = "";
    error.value = null;
    changed.value = (savedFolder.value ?? "") !== "";
  };

  return (
    <div class="modal-overlay" onClick={onClose}>
      <div class="watch-dialog" onClick={(e) => e.stopPropagation()}>
        <div class="dialog-header">
          <span class="dialog-title">Watch Folder</span>
          <button class="dialog-close" onClick={onClose}>&times;</button>
        </div>

        <div class="watch-dialog-body">
          <p class="watch-dialog-hint">
            Drop <code>.torrent</code> files into the watch folder and AsuTorrent
            will automatically add them — just like qBittorrent.
          </p>

          <label class="bind-field">
            <span class="bind-label">Folder</span>
            <div class="bind-input-wrap">
              <input
                type="text"
                class="bind-input"
                placeholder="No watch folder set"
                value={folder.value}
                onInput={(e) => handleChange((e.target as HTMLInputElement).value)}
              />
              <button
                class="bind-list-toggle"
                onClick={handleBrowse}
                title="Browse for folder"
              >
                📁
              </button>
            </div>
          </label>

          {folder.value.trim() && (
            <p class="watch-dialog-status">
              <span class="watch-dot" />
              Watching — new .torrent files will be added automatically
            </p>
          )}

          <p class="watch-dialog-note">
            The folder is scanned every 5 seconds. Successfully added files are
            moved to an <code>.added</code> subfolder so they aren't processed
            twice.
          </p>

          {error.value && <div class="dialog-error">{error.value}</div>}

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
              disabled={!folder.value.trim()}
            >
              Clear
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
