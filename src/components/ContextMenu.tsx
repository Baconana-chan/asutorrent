import { useEffect, useRef } from "preact/hooks";
import {
  pauseTorrent,
  resumeTorrent,
  forceResumeTorrent,
  removeForceResume,
  deleteTorrent,
  reCheckTorrent,
  setSequentialDownload,
  setTorrentUtp,
  setTorrentDht,
  setTorrentPex,
  setTorrentLpd,
  setTorrentEncryption,
} from "../hooks/useTorrents";

export interface MenuItem {
  id: string;
  label: string;
  icon: string;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
  action: () => void;
}

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

/**
 * Custom context menu that appears at a fixed screen position.
 * Closes on click outside, Escape, scroll, or window resize.
 */
export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const handleScroll = () => onClose();
    const handleResize = () => onClose();

    // Delay listener attachment so the right-click that opened the menu doesn't close it
    requestAnimationFrame(() => {
      document.addEventListener("mousedown", handleClick);
      document.addEventListener("keydown", handleKey);
      window.addEventListener("scroll", handleScroll, true);
      window.addEventListener("resize", handleResize);
    });

    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleResize);
    };
  }, [onClose]);

  // Clamp position so menu stays within viewport
  const menuWidth = 200;
  const menuHeight = items.length * 30;
  const clampedX = Math.min(x, window.innerWidth - menuWidth - 8);
  const clampedY = Math.min(y, window.innerHeight - menuHeight - 8);

  return (
    <div
      ref={ref}
      class="context-menu"
      style={{
        left: `${Math.max(4, clampedX)}px`,
        top: `${Math.max(4, clampedY)}px`,
      }}
      role="menu"
    >
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} class="context-menu-sep" />
        ) : (
          <button
            key={item.id}
            class={`context-menu-item ${item.danger ? "danger" : ""}`}
            disabled={item.disabled}
            onClick={() => {
              item.action();
              onClose();
            }}
            role="menuitem"
          >
            <span class="context-menu-icon">{item.icon}</span>
            <span class="context-menu-label">{item.label}</span>
          </button>
        )
      )}
    </div>
  );
}

// ── Helpers to build menus ──────────────────────────────────────

export function buildTorrentMenu(
  ids: number[],
  states: string[],
  forced: boolean[],
  names: string[],
  onAction: () => void,
  onPlayFile?: (torrentId: number, fileIndex: number, fileName: string) => void,
  sequentialIds?: Set<number>,
  torrentUtpValues?: Map<number, boolean | null>,
  torrentDhtValues?: Map<number, boolean | null>,
  torrentPexValues?: Map<number, boolean | null>,
  torrentLpdValues?: Map<number, boolean | null>,
  torrentEncryptionValues?: Map<number, string | null>,
): MenuItem[] {
  const allPaused = states.every((s) => s === "paused");
  const allActive = states.every(
    (s) => s === "downloading" || s === "seeding" || s === "metadata"
  );
  const anyForced = forced.some((f) => f);
  const allForced = forced.every((f) => f);

  const items: MenuItem[] = [];

  // Play option for single torrent (plays file 0; precise file selection via FileTree)
  if (ids.length === 1 && onPlayFile) {
    const torrentId = ids[0];
    const fileName = names[0] || `Torrent #${torrentId}`;
    items.push({
      id: "play-media",
      label: "Play",
      icon: "▶",
      action: () => {
        onPlayFile(torrentId, 0, fileName);
        onAction();
      },
    });
    items.push({
      id: "sep-play",
      label: "",
      icon: "",
      separator: true,
      action: () => {},
    });
  }

  // Resume (normal) — remove force flag + unpause
  if (allPaused || states.some((s) => s === "paused")) {
    items.push({
      id: "resume",
      label: ids.length === 1 ? "Resume" : `Resume (${ids.length})`,
      icon: "▶",
      action: () => {
        ids.forEach((id) => resumeTorrent(id));
        onAction();
      },
    });
  }

  // Force Resume — add force flag + unpause
  if (!allForced) {
    items.push({
      id: "force-resume",
      label:
        ids.length === 1
          ? "Force resume"
          : `Force resume (${ids.length})`,
      icon: "⏩",
      action: () => {
        ids.forEach((id) => forceResumeTorrent(id));
        onAction();
      },
    });
  }

  // Remove Force Resume — remove force flag, subject to queue
  if (anyForced) {
    items.push({
      id: "remove-force",
      label:
        ids.length === 1
          ? "Remove force resume"
          : `Remove force (${ids.length})`,
      icon: "⏸",
      action: () => {
        ids.forEach((id) => removeForceResume(id));
        onAction();
      },
    });
  }

  // Pause
  if (
    allActive ||
    states.some((s) => s === "downloading" || s === "seeding")
  ) {
    items.push({
      id: "pause",
      label: ids.length === 1 ? "Pause" : `Pause (${ids.length})`,
      icon: "⏸",
      action: () => {
        ids.forEach((id) => pauseTorrent(id));
        onAction();
      },
    });
  }

  // ── Network feature toggles per-torrent ──
  if (ids.length === 1) {
    const tid = ids[0];

    const netFeatures: { id: string; label: string; val: boolean | null; icon: string; set: (id: number, v: boolean | null) => Promise<void> }[] = [
      {
        id: "dht",
        label: "DHT",
        val: torrentDhtValues?.get(tid) ?? null,
        icon: "🌐",
        set: setTorrentDht,
      },
      {
        id: "pex",
        label: "PEX",
        val: torrentPexValues?.get(tid) ?? null,
        icon: "🔁",
        set: setTorrentPex,
      },
      {
        id: "lpd",
        label: "LPD",
        val: torrentLpdValues?.get(tid) ?? null,
        icon: "🏠",
        set: setTorrentLpd,
      },
      {
        id: "utp",
        label: "uTP",
        val: torrentUtpValues?.get(tid) ?? null,
        icon: "⏺",
        set: setTorrentUtp,
      },
    ];

    // Encryption mode toggle
    const encVal = torrentEncryptionValues?.get(tid) ?? null;
    const encIcon = encVal === "forced" ? "🔒" : encVal === "disabled" ? "🔓" : "🔐";
    const encLabel = encVal === "forced" ? "🔒 Encryption: Forced" : encVal === "disabled" ? "🔓 Encryption: Disabled" : "🔐 Encryption: Default";
    items.push({
      id: "encryption-sep",
      label: "",
      icon: "",
      separator: true,
      action: () => {},
    });
    items.push({
      id: "encryption",
      label: encLabel,
      icon: encIcon,
      action: () => {
        // Cycle: default → forced → enabled → disabled → default
        let next: string | null;
        if (encVal === null) next = "forced";
        else if (encVal === "forced") next = "disabled";
        else if (encVal === "disabled") next = null;
        else next = null; // "enabled" → default
        setTorrentEncryption(tid, next);
        onAction();
      },
    });

    for (const feat of netFeatures) {
      const stateIcon =
        feat.id === "utp"
          ? feat.val === true ? "🌐" : feat.val === false ? "🔌" : "⏺"
          : feat.val === true ? "🚫" : feat.val === false ? "✅" : "⏺";
      const stateLabel =
        feat.val === true ? "Off" : feat.val === false ? "On" : "Def";
      items.push({
        id: feat.id,
        label: `${feat.label}: ${stateLabel}`,
        icon: stateIcon,
        action: () => {
          let next: boolean | null;
          if (feat.val === null) next = true;
          else if (feat.val === true) next = false;
          else next = null;
          feat.set(tid, next);
          onAction();
        },
      });
    }
  }

  // Sequential download toggle
  items.push({
    id: "sep-seq",
    label: "",
    icon: "",
    separator: true,
    action: () => {},
  });

  if (ids.length === 1) {
    const isSeq = sequentialIds?.has(ids[0]) ?? false;
    items.push({
      id: "sequential",
      label: isSeq ? "Sequential: ON" : "Sequential: OFF",
      icon: isSeq ? "🔢" : "➡️",
      action: () => {
        setSequentialDownload(ids[0], !isSeq);
        onAction();
      },
    });
  }

  // Force re-check
  items.push({
    id: "recheck",
    label: ids.length === 1 ? "Force re-check" : `Re-check (${ids.length})`,
    icon: "🔄",
    action: () => {
      ids.forEach((id) => reCheckTorrent(id));
      onAction();
    },
  });

  items.push({
    id: "sep1",
    label: "",
    icon: "",
    separator: true,
    action: () => {},
  });

  // Delete
  if (ids.length > 0) {
    items.push({
      id: "delete-torrent",
      label:
        ids.length === 1
          ? "Delete torrent"
          : `Delete (${ids.length}) torrents`,
      icon: "🗑",
      danger: true,
      action: () => {
        ids.forEach((id) => deleteTorrent(id, false));
        onAction();
      },
    });
    items.push({
      id: "delete-files",
      label:
        ids.length === 1
          ? "Delete torrent + files"
          : `Delete (${ids.length}) + files`,
      icon: "🔥",
      danger: true,
      action: () => {
        ids.forEach((id) => deleteTorrent(id, true));
        onAction();
      },
    });
  }

  return items;
}
