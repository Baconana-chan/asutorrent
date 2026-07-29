import { useSignal } from "@preact/signals";
import { open, save } from "@tauri-apps/plugin-dialog";
import { createTorrentFile } from "../hooks/useTorrents";

interface Props {
  onClose: () => void;
}

const PIECE_SIZES = [
  { value: null, label: "Auto (2 MiB)", desc: "Recommended for most files" },
  { value: 16384, label: "16 KiB", desc: "Smallest — for tiny files" },
  { value: 65536, label: "64 KiB", desc: "Small files" },
  { value: 262144, label: "256 KiB", desc: "Medium" },
  { value: 524288, label: "512 KiB", desc: "Medium-large" },
  { value: 1048576, label: "1 MiB", desc: "Large files" },
  { value: 2097152, label: "2 MiB", desc: "Default" },
  { value: 4194304, label: "4 MiB", desc: "Very large files" },
  { value: 8388608, label: "8 MiB", desc: "Huge files" },
  { value: 16777216, label: "16 MiB", desc: "Maximum" },
];

export function CreateTorrentDialog({ onClose }: Props) {
  const sourcePath = useSignal("");
  const torrentName = useSignal("");
  const pieceSize = useSignal<number | null>(null);
  const trackerInput = useSignal("");
  const trackers = useSignal<string[]>([]);
  const outputPath = useSignal("");
  const creating = useSignal(false);
  const error = useSignal<string | null>(null);
  const done = useSignal(false);
  const showPiecePicker = useSignal(false);

  const handlePickSource = async () => {
    try {
      const result = await open({
        multiple: false,
        directory: true,
        title: "Select folder or file to create torrent from",
      });
      if (result) {
        sourcePath.value = result;
        if (!torrentName.value) {
          // Derive name from path
          const parts = result.replace(/\\/g, "/").split("/");
          torrentName.value = parts[parts.length - 1] || "";
        }
      }
    } catch { /* cancelled */ }
  };

  const handlePickOutput = async () => {
    try {
      const name = torrentName.value.trim() || (sourcePath.value ? sourcePath.value.split("/").pop()?.split("\\").pop() : "untitled") || "untitled";
      const result = await save({
        defaultPath: `${name}.torrent`,
        filters: [{ name: "Torrent file", extensions: ["torrent"] }],
      });
      if (result) {
        outputPath.value = result;
      }
    } catch { /* cancelled */ }
  };

  const addTracker = () => {
    const url = trackerInput.value.trim();
    if (url && !trackers.value.includes(url)) {
      trackers.value = [...trackers.value, url];
      trackerInput.value = "";
    }
  };

  const removeTracker = (idx: number) => {
    trackers.value = trackers.value.filter((_, i) => i !== idx);
  };

  const handleCreate = async () => {
    if (!sourcePath.value || !outputPath.value) return;
    creating.value = true;
    error.value = null;
    try {
      await createTorrentFile(
        sourcePath.value,
        outputPath.value,
        torrentName.value.trim() || null,
        pieceSize.value,
        trackers.value.length > 0 ? trackers.value : null,
      );
      done.value = true;
      setTimeout(() => onClose(), 1500);
    } catch (e) {
      error.value = String(e);
    } finally {
      creating.value = false;
    }
  };

  const isReady = sourcePath.value && outputPath.value && !creating.value;
  const selectedPieceLabel = PIECE_SIZES.find((p) => p.value === pieceSize.value)?.label ?? "Auto (2 MiB)";

  return (
    <div class="dialog-overlay" onClick={onClose}>
      <div class="dialog create-torrent-dialog" onClick={(e) => e.stopPropagation()}>
        <div class="dialog-header">
          <h2>
            <span class="ct-icon">{"\u{1F3D7}"}</span>
            Create .torrent
          </h2>
          <button class="dialog-close" onClick={onClose}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <line x1="4" y1="4" x2="12" y2="12" />
              <line x1="12" y1="4" x2="4" y2="12" />
            </svg>
          </button>
        </div>

        <div class="dialog-body">
          {done.value ? (
            <div class="ct-done">
              <span style="font-size: 32px;">{"\u2705"}</span>
              <p>Torrent created successfully!</p>
              <p class="ct-done-path">{outputPath.value}</p>
            </div>
          ) : (
            <div class="ct-form">
              {/* Source path */}
              <div class="ct-field">
                <label class="ct-label">Source folder / file</label>
                <div class="ct-input-row">
                  <input
                    type="text"
                    class="ct-input"
                    value={sourcePath.value}
                    placeholder="Select a folder or file…"
                    readOnly
                  />
                  <button class="btn btn-secondary btn-sm" onClick={handlePickSource}>
                    Browse…
                  </button>
                </div>
              </div>

              {/* Torrent name */}
              <div class="ct-field">
                <label class="ct-label">Torrent name</label>
                <input
                  type="text"
                  class="ct-input"
                  value={torrentName.value}
                  onInput={(e) => (torrentName.value = (e.target as HTMLInputElement).value)}
                  placeholder="Name for the torrent"
                />
              </div>

              {/* Piece size */}
              <div class="ct-field">
                <label class="ct-label">Piece size</label>
                <div class="ct-piece-picker">
                  <button
                    class="ct-piece-btn"
                    onClick={() => (showPiecePicker.value = !showPiecePicker.value)}
                  >
                    {selectedPieceLabel}
                    <span class="ct-piece-arrow">{showPiecePicker.value ? "\u25B2" : "\u25BC"}</span>
                  </button>
                  {showPiecePicker.value && (
                    <div class="ct-piece-dropdown">
                      {PIECE_SIZES.map((ps) => (
                        <button
                          key={ps.label}
                          class={`ct-piece-option ${pieceSize.value === ps.value ? "selected" : ""}`}
                          onClick={() => { pieceSize.value = ps.value; showPiecePicker.value = false; }}
                        >
                          <span class="ct-piece-opt-label">{ps.label}</span>
                          <span class="ct-piece-opt-desc">{ps.desc}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Trackers */}
              <div class="ct-field">
                <label class="ct-label">Trackers</label>
                <div class="ct-input-row">
                  <input
                    type="text"
                    class="ct-input"
                    value={trackerInput.value}
                    onInput={(e) => (trackerInput.value = (e.target as HTMLInputElement).value)}
                    placeholder="udp://tracker.example.com:6969"
                    onKeyDown={(e) => { if (e.key === "Enter") addTracker(); }}
                  />
                  <button class="btn btn-secondary btn-sm" onClick={addTracker}>Add</button>
                </div>
                {trackers.value.length > 0 && (
                  <div class="ct-tracker-list">
                    {trackers.value.map((t, i) => (
                      <div key={i} class="ct-tracker-item">
                        <span class="ct-tracker-url">{t}</span>
                        <button class="ct-tracker-remove" onClick={() => removeTracker(i)} title="Remove">{"\u2716"}</button>
                      </div>
                    ))}
                  </div>
                )}
                <span class="ct-hint">Optional. Press Enter to add multiple.</span>
              </div>

              {/* Output path */}
              <div class="ct-field">
                <label class="ct-label">Output .torrent file</label>
                <div class="ct-input-row">
                  <input
                    type="text"
                    class="ct-input"
                    value={outputPath.value}
                    placeholder="Where to save the .torrent file"
                    readOnly
                  />
                  <button class="btn btn-secondary btn-sm" onClick={handlePickOutput}>
                    Save as…
                  </button>
                </div>
              </div>

              {error.value && (
                <div class="ct-error">
                  <span class="ct-error-icon">{"\u26A0"}</span>
                  {error.value}
                </div>
              )}
            </div>
          )}
        </div>

        <div class="dialog-footer">
          <div class="ct-actions">
            {!done.value && (
              <>
                <button class="btn btn-ghost" onClick={onClose}>Cancel</button>
                <button
                  class="btn btn-primary"
                  onClick={handleCreate}
                  disabled={!isReady}
                >
                  {creating.value ? "Creating…" : "Create .torrent"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
