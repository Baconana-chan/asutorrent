import { useSignal, useComputed } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { getHistory, TorrentHistoryEntry } from "../hooks/useTorrents";
import { fmtBytes, fmtDate } from "../utils/format";

interface Props {
  onClose: () => void;
}

export function HistoryDialog({ onClose }: Props) {
  const history = useSignal<TorrentHistoryEntry[]>([]);
  const loading = useSignal(true);
  const filter = useSignal<"all" | "completed" | "deleted">("all");

  useEffect(() => {
    loading.value = true;
    getHistory()
      .then((entries) => { history.value = entries; })
      .catch(() => { history.value = []; })
      .finally(() => { loading.value = false; });
  }, []);

  const filtered = useComputed(() => {
    const h = history.value;
    if (filter.value === "all") return h;
    return h.filter((e) => e.event === filter.value);
  });

  const hasItems = filtered.value.length > 0;
  const allCount = history.value.length;
  const completedCount = history.value.filter((e) => e.event === "completed").length;
  const deletedCount = history.value.filter((e) => e.event === "deleted").length;

  return (
    <div class="dialog-overlay" onClick={onClose}>
      <div class="dialog history-dialog" onClick={(e) => e.stopPropagation()}>
        <div class="dialog-header">
          <div class="dialog-title">📜 Torrent History</div>
          <button class="dialog-close" onClick={onClose}>&times;</button>
        </div>

        {/* Filter tabs */}
        <div class="history-tabs">
          <button
            class={`history-tab ${filter.value === "all" ? "active" : ""}`}
            onClick={() => (filter.value = "all")}
          >
            All ({allCount})
          </button>
          <button
            class={`history-tab ${filter.value === "completed" ? "active" : ""}`}
            onClick={() => (filter.value = "completed")}
          >
            Completed ({completedCount})
          </button>
          <button
            class={`history-tab ${filter.value === "deleted" ? "active" : ""}`}
            onClick={() => (filter.value = "deleted")}
          >
            Deleted ({deletedCount})
          </button>
        </div>

        <div class="dialog-body history-body">
          {loading.value ? (
            <div class="history-loading">Loading history\u2026</div>
          ) : !hasItems ? (
            <div class="history-empty">
              <div class="history-empty-icon">📜</div>
              <h3>No history yet</h3>
              <p>Completed and deleted torrents will appear here.</p>
            </div>
          ) : (
            <div class="history-list">
              <div class="history-list-header">
                <span class="h-col-event">Event</span>
                <span class="h-col-name">Name</span>
                <span class="h-col-size">Size</span>
                <span class="h-col-ratio">Ratio</span>
                <span class="h-col-date">Date</span>
              </div>
              {filtered.value.map((entry, i) => (
                <div key={`${entry.info_hash}-${entry.event}-${i}`} class="history-row">
                  <span class="h-col-event">
                    <span class={`history-event-badge ${entry.event}`}>
                      {entry.event === "completed" ? "✓" : "🗑"}
                    </span>
                  </span>
                  <span class="h-col-name" title={entry.name}>{entry.name}</span>
                  <span class="h-col-size">{fmtBytes(entry.total_bytes)}</span>
                  <span class="h-col-ratio">
                    {entry.total_bytes > 0
                      ? (entry.uploaded_bytes / entry.total_bytes).toFixed(2)
                      : "—"}
                  </span>
                  <span class="h-col-date">{fmtDate(entry.timestamp)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
