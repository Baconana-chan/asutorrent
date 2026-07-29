import { useSignal, useComputed } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";

interface Props {
  url: string;
  fileName: string;
  onClose: () => void;
}

export function VideoPlayer({ url, fileName, onClose }: Props) {
  const playing = useSignal(false);
  const ended = useSignal(false);
  const errorMsg = useSignal<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Auto-focus overlay for Escape key to work
  useEffect(() => {
    overlayRef.current?.focus();
  }, []);

  // Detect media type for icon
  const isAudio = useComputed(() => {
    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    return ["mp3", "flac", "ogg", "oga", "wav", "aac", "m4a", "wma", "opus"].includes(ext);
  });

  const handleKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  };

  const handleOverlayClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).classList.contains("video-player-overlay")) {
      onClose();
    }
  };

  const handleMediaError = () => {
    playing.value = false;
    errorMsg.value = "Failed to load media. The file may not be fully downloaded or the stream may be unavailable.";
  };

  return (
    <div class="video-player-overlay" ref={overlayRef} onClick={handleOverlayClick} onKeyDown={handleKey} tabIndex={-1}>
      <div class="video-player-container">
        {/* Header bar */}
        <div class="video-player-header">
          <div class="video-player-title">
            <span class="video-player-icon">{isAudio.value ? "🎵" : "🎬"}</span>
            <span class="video-player-name">{fileName}</span>
          </div>
          <button class="video-player-close" onClick={onClose} title="Close (Esc)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Media element */}
        <div class="video-player-media-wrap">
          {errorMsg.value ? (
            <div class="video-player-error">
              <div class="video-error-icon">⚠️</div>
              <div class="video-error-text">{errorMsg.value}</div>
            </div>
          ) : isAudio.value ? (
            <>
              <div class="audio-visualizer">
                <div class="audio-icon-large">🎵</div>
                <div class="audio-playing-indicator">
                  <span class={`audio-bar ${playing.value ? "active" : ""}`} style="animation-delay: 0s" />
                  <span class={`audio-bar ${playing.value ? "active" : ""}`} style="animation-delay: 0.1s" />
                  <span class={`audio-bar ${playing.value ? "active" : ""}`} style="animation-delay: 0.2s" />
                  <span class={`audio-bar ${playing.value ? "active" : ""}`} style="animation-delay: 0.05s" />
                  <span class={`audio-bar ${playing.value ? "active" : ""}`} style="animation-delay: 0.15s" />
                </div>
              </div>
              <audio
                src={url}
                controls
                autoPlay
                preload="metadata"
                onPlay={() => { playing.value = true; ended.value = false; errorMsg.value = null; }}
                onPause={() => { playing.value = false; }}
                onEnded={() => { ended.value = true; playing.value = false; }}
                onError={handleMediaError}
              >
                Your browser does not support audio playback.
              </audio>
            </>
          ) : (
            <video
              class="video-element"
              src={url}
              controls
              autoPlay
              preload="metadata"
              onPlay={() => { playing.value = true; ended.value = false; errorMsg.value = null; }}
              onPause={() => { playing.value = false; }}
              onEnded={() => { ended.value = true; playing.value = false; }}
              onError={handleMediaError}
            >
              Your browser does not support video playback.
            </video>
          )}
        </div>

        {/* Bottom info bar */}
        <div class="video-player-footer">
          <span class="video-player-hint">
            {errorMsg.value
              ? "Try selecting a different file or check the download status"
              : ended.value
                ? "Playback finished"
                : isAudio.value
                  ? playing.value ? "Playing…" : "Paused"
                  : "Use the video controls to seek, change volume, or go fullscreen"}
          </span>
        </div>
      </div>
    </div>
  );
}
