import { useState } from "preact/hooks";
import { t } from "../hooks/useLocales";
import { deleteTorrent } from "../hooks/useTorrents";

interface Props {
  ids: number[];
  names: string[];
  onClose: () => void;
  onDone: () => void;
}

/**
 * Modal dialog for confirming torrent deletion.
 * Offers two choices: delete the torrent entry only, or also remove the files from disk.
 */
export function DeleteConfirmDialog({ ids, names, onClose, onDone }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const count = ids.length;
  const single = count === 1;

  const doDelete = async (withFiles: boolean) => {
    setBusy(true);
    setErr(null);
    try {
      for (const id of ids) {
        await deleteTorrent(id, withFiles);
      }
      onDone();
      onClose();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  // Show up to 3 names
  const preview = names.slice(0, 3);
  const extra = names.length - 3;

  return (
    <div class="modal-overlay" onClick={onClose}>
      <div class="modal delete-dialog" onClick={(e) => e.stopPropagation()}>
        <h2 style="margin-bottom: 8px;">
          {single ? t("delete.title_single") : t("delete.title_multi").replace("{count}", String(count))}
        </h2>

        <p class="delete-dialog-desc">
          {single
            ? <>{t("delete.confirm_single").replace("{name}", names[0])}</>
            : t("delete.confirm_multi").replace("{count}", String(count))
          }
        </p>

        {!single && preview.length > 0 && (
          <div class="delete-dialog-list">
            {preview.map((n) => (
              <div key={n} class="delete-dialog-item">{n}</div>
            ))}
            {extra > 0 && <div class="delete-dialog-item muted">{t("delete.and_more").replace("{n}", String(extra))}</div>}
          </div>
        )}

        {err && <p style="color: var(--red); font-size: 12px; margin-top: 8px;">{err}</p>}

        <div class="modal-actions" style="margin-top: 20px;">
          <button class="btn btn-secondary" onClick={onClose} disabled={busy}>
            {t("delete.cancel")}
          </button>
          <button
            class="btn btn-secondary"
            onClick={() => doDelete(false)}
            disabled={busy}
            style="color: var(--yellow); border-color: var(--yellow);"
          >
            {busy ? t("delete.deleting") : (single ? t("delete.delete_torrent") : t("delete.delete_torrents"))}
          </button>
          <button
            class="btn btn-primary"
            onClick={() => doDelete(true)}
            disabled={busy}
            style="background: var(--red);"
          >
            {busy ? t("delete.deleting") : t("delete.delete_with_files")}
          </button>
        </div>
      </div>
    </div>
  );
}
