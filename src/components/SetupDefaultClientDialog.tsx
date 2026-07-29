import { useSignal } from "@preact/signals";
import { registerDefaultClient, setDefaultClientOffered } from "../hooks/useTorrents";

interface Props {
  onClose: () => void;
}

export function SetupDefaultClientDialog({ onClose }: Props) {
  const busy = useSignal(false);
  const done = useSignal(false);
  const errorMsg = useSignal<string | null>(null);

  const handleYes = async () => {
    busy.value = true;
    errorMsg.value = null;
    try {
      await registerDefaultClient();
      await setDefaultClientOffered();
      done.value = true;
    } catch (err) {
      errorMsg.value = String(err);
    } finally {
      busy.value = false;
    }
  };

  const handleNo = async () => {
    await setDefaultClientOffered();
    onClose();
  };

  const handleLater = async () => {
    // Don't mark as offered — will show again on next launch
    onClose();
  };

  if (done.value) {
    return (
      <div class="modal-overlay" onClick={onClose}>
        <div class="setup-dialog" onClick={(e) => e.stopPropagation()}>
          <div class="setup-dialog-icon">
            {errorMsg.value ? "⚠️" : "✅"}
          </div>
          <h3 class="setup-dialog-title">
            {errorMsg.value ? "Failed to Register" : "AsuTorrent Set Up!"}
          </h3>
          <p class="setup-dialog-text">
            {errorMsg.value
              ? `Could not register as default client: ${errorMsg.value}`
              : "AsuTorrent is now your default torrent client. Magnet links and .torrent files will open with AsuTorrent."}
          </p>
          <div class="setup-dialog-actions">
            <button class="btn btn-primary" onClick={onClose}>
              {errorMsg.value ? "Close" : "Get Started"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div class="modal-overlay">
      <div class="setup-dialog" onClick={(e) => e.stopPropagation()}>
        <div class="setup-dialog-icon">⚡</div>
        <h3 class="setup-dialog-title">Make AsuTorrent Your Default Torrent Client?</h3>
        <p class="setup-dialog-text">
          Set AsuTorrent as the default application for opening <strong>magnet links</strong>{" "}
          and <strong>.torrent files</strong>. This means clicking a torrent link or file will
          automatically open it in AsuTorrent.
        </p>
        <div class="setup-dialog-actions">
          <button
            class="btn btn-primary"
            onClick={handleYes}
            disabled={busy.value}
          >
            {busy.value ? "Setting up…" : "Yes, make default"}
          </button>
          <button
            class="btn"
            onClick={handleNo}
            disabled={busy.value}
          >
            No, thanks
          </button>
          <button
            class="btn btn-ghost"
            onClick={handleLater}
            disabled={busy.value}
          >
            Ask me later
          </button>
        </div>
        {errorMsg.value && (
          <p class="setup-dialog-error">Error: {errorMsg.value}</p>
        )}
      </div>
    </div>
  );
}
