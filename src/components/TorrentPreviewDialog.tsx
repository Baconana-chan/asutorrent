import { useComputed, useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import {
  torrentPreviewQueue,
  previewTorrentFile,
  addTorrentFileSelected,
  type TorrentPreviewPayload,
  type TorrentFileEntry,
} from "../hooks/useTorrents";
import { FileTree } from "./FileTree";
import { fmtBytes, fmtDate } from "../utils/format";
import { t } from "../hooks/useLocales";

/**
 * Modal shown before a .torrent file is added. Rendered from app.tsx while
 * `torrentPreviewQueue` is non-empty; after a confirmed add the current path
 * is shifted off, so dropping several files steps through them one by one.
 */
export function TorrentPreviewDialog() {
  const path = torrentPreviewQueue.value[0];
  const preview = useSignal<TorrentPreviewPayload | null>(null);
  const loading = useSignal(false);
  const error = useSignal<string | null>(null);
  const adding = useSignal(false);
  /** null = every file selected (initial); replaced by FileTree reports. */
  const selected = useSignal<number[] | null>(null);

  useEffect(() => {
    if (!path) return;
    loading.value = true;
    error.value = null;
    preview.value = null;
    selected.value = null;
    previewTorrentFile(path)
      .then((p) => { preview.value = p; })
      .catch((e) => { error.value = String(e); })
      .finally(() => { loading.value = false; });
  }, [path]);

  // Stable per preview — FileTree manages checkbox state internally and only
  // reports the current selection via onSelectionChange.
  const entries = useComputed<TorrentFileEntry[]>(() =>
    (preview.value?.files ?? []).map((f) => ({
      name: f.path.split("/").pop() || f.path,
      components: f.components,
      length: f.size,
      included: true,
      attributes: {},
    }))
  );

  const all = preview.value?.files ?? [];
  const fileCount = all.length;
  const selCount = selected.value === null ? fileCount : selected.value.length;
  const selSize = selected.value === null
    ? preview.value?.total_size ?? 0
    : selected.value.reduce((sum, i) => sum + (all[i]?.size ?? 0), 0);

  const handleClose = () => { torrentPreviewQueue.value = []; };
  const handleSkip = () => { torrentPreviewQueue.value = torrentPreviewQueue.value.slice(1); };

  const handleAdd = async () => {
    if (!path) return;
    adding.value = true;
    error.value = null;
    try {
      const idx = selected.value ?? all.map((_, i) => i);
      await addTorrentFileSelected(path, idx);
      torrentPreviewQueue.value = torrentPreviewQueue.value.slice(1);
    } catch (e) {
      error.value = String(e);
    } finally {
      adding.value = false;
    }
  };

  const remaining = torrentPreviewQueue.value.length;
  const pending = Math.max(0, remaining - 1);

  // Close on Escape, matching the other dialogs.
  const handleKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && !adding.value) handleClose();
  };
  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [adding.value]);

  return (
    <div class="modal-overlay" onClick={handleClose}>
      <div class="modal preview-modal" onClick={(e) => e.stopPropagation()}>
        <div class="preview-head">
          <h2 class="preview-title" title={preview.value?.name}>
            {loading.value
              ? t("preview.reading", "Reading torrent…")
              : preview.value?.name || t("preview.title", "Torrent preview")}
          </h2>
          {pending > 0 && (
            <span class="preview-counter">
              {t("preview.more_in_queue", "{n} more in queue").replace("{n}", String(pending))}
            </span>
          )}
        </div>

        {loading.value && (
          <div class="preview-loading"><span class="spinner" /> {t("preview.parsing", "Parsing .torrent file…")}</div>
        )}

        {error.value && !loading.value && (
          <div class="preview-error">
            <p>{error.value}</p>
            <div class="modal-actions">
              <button class="btn btn-secondary" onClick={handleClose}>{t("preview.close", "Close")}</button>
            </div>
          </div>
        )}

        {preview.value && !loading.value && (
          <>
            <div class="preview-info">
              <div class="preview-info-item">
                <span class="preview-info-label">{t("preview.size", "Size")}</span>
                <span class="preview-info-value">{fmtBytes(preview.value.total_size)}</span>
              </div>
              <div class="preview-info-item">
                <span class="preview-info-label">{t("preview.files", "Files")}</span>
                <span class="preview-info-value">{fileCount}</span>
              </div>
              <div class="preview-info-item">
                <span class="preview-info-label">{t("preview.piece_size", "Piece size")}</span>
                <span class="preview-info-value">{fmtBytes(preview.value.piece_length)}</span>
              </div>
              <div class="preview-info-item">
                <span class="preview-info-label">{t("preview.trackers", "Trackers")}</span>
                <span class="preview-info-value">{preview.value.trackers.length}</span>
              </div>
              {preview.value.creation_date ? (
                <div class="preview-info-item">
                  <span class="preview-info-label">{t("preview.created", "Created")}</span>
                  <span class="preview-info-value">{fmtDate(preview.value.creation_date)}</span>
                </div>
              ) : null}
              <div class="preview-info-item">
                <span class="preview-info-label">{t("preview.info_hash", "Info hash")}</span>
                <span class="preview-info-value preview-hash">{preview.value.info_hash}</span>
              </div>
            </div>

            {preview.value.comment && (
              <p class="preview-comment" title={preview.value.comment}>
                💬 {preview.value.comment.length > 220 ? preview.value.comment.slice(0, 220) + "…" : preview.value.comment}
              </p>
            )}

            {fileCount > 0 ? (
              <div class="preview-files">
                <FileTree
                  files={entries.value}
                  loading={false}
                  onSelectionChange={(idx) => { selected.value = idx; }}
                />
              </div>
            ) : (
              <div class="preview-files preview-files-empty">
                {t("preview.no_files", "No file information available in this torrent.")}
              </div>
            )}

            {error.value && <p style="color: var(--red); font-size: 12px; margin-top: 8px;">{error.value}</p>}

            <div class="modal-actions">
              <button class="btn btn-secondary" onClick={handleClose} disabled={adding.value}>
                {t("preview.cancel", "Cancel")}
              </button>
              {remaining > 1 && (
                <button class="btn btn-secondary" onClick={handleSkip} disabled={adding.value}>
                  {t("preview.skip", "Skip")}
                </button>
              )}
              <button
                class="btn btn-primary"
                onClick={handleAdd}
                disabled={adding.value || fileCount === 0}
              >
                {adding.value
                  ? t("preview.adding", "Adding…")
                  : selCount !== fileCount
                    ? t("preview.add_selected", "Add ({count} files, {size})")
                        .replace("{count}", String(selCount))
                        .replace("{size}", fmtBytes(selSize))
                    : t("preview.add_all", "Add ({size})").replace("{size}", fmtBytes(selSize))}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
