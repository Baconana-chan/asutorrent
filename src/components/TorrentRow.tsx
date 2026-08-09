import type { TorrentListEntry } from "../hooks/useTorrents";
import type { ColumnDef, ColumnKey } from "../hooks/useColumnConfig";
import { fmtBytes, fmtSpeed, fmtETA } from "../utils/format";
import { healthScoreColor, healthTitle } from "../utils/health";

interface Props {
  torrent: TorrentListEntry;
  selected: boolean;
  index: number;
  columns: ColumnDef[];
  search?: string;
  onSelect: (id: number, ctrl: boolean, shift: boolean) => void;
  onDoubleClick: (id: number) => void;
  onContextMenu: (e: MouseEvent, id: number) => void;
}

/** Highlight matched text in a string */
function highlightText(text: string, query: string): preact.ComponentChildren {
  if (!query || !text) return text;
  const q = query.toLowerCase();
  const lower = text.toLowerCase();
  if (!lower.includes(q)) return text;
  const idx = lower.indexOf(q);
  return (
    <>
      {text.slice(0, idx)}
      <mark class="search-highlight">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}



/** Render cell content for a given column key */
function Cell({ torrent, col, search }: { torrent: TorrentListEntry; col: ColumnKey; search?: string }) {
  const state = (torrent.state ?? "").toLowerCase();
  const progress = torrent.progress ?? 0;
  const pct = (progress * 100).toFixed(1);

  const stateClass =
    state === "downloading" || state === "metadata"
      ? "downloading"
      : state === "seeding" || state === "completed"
        ? "seeding"
        : state === "paused"
          ? "paused"
          : state === "error"
            ? "error"
            : "checking";

  const stateLabel =
    state === "metadata"
      ? "Meta"
      : state === "completed"
        ? "Done"
        : state.charAt(0).toUpperCase() + state.slice(1);

  switch (col) {
    case "name":
      return (
        <>
          <span
            class="state-dot"
            style={{
              background:
                stateClass === "downloading"
                  ? "var(--accent-light)"
                  : stateClass === "seeding"
                    ? "var(--green)"
                    : stateClass === "paused"
                      ? "var(--yellow)"
                      : stateClass === "error"
                        ? "var(--red)"
                        : "var(--purple)",
            }}
          />
          {torrent.health && (
            <span
              class="health-dot"
              style={`background: ${healthScoreColor(torrent.health.score)}; --health-color: ${healthScoreColor(torrent.health.score)};`}
              title={healthTitle(torrent.health)}
            />
          )}
          {torrent.forced && (
            <span class="forced-badge" title="Force resumed (exempt from queue)">
              ⚡
            </span>
          )}
          {torrent.sequential && (
            <span class="sequential-badge" title="Sequential download mode (pieces in order)">
              🔢
            </span>
          )}
          {torrent.super_seed && (
            <span
              class="super-seed-badge"
              title="Super-seed mode (stored for future use — librqbit support pending)"
            >
              🌱
            </span>
          )}
          <span class="name-text">{highlightText(torrent.name || "Loading\u2026", search ?? "")}</span>
          {torrent.tags.map((tag) => (
            <span
              key={tag.id}
              class="row-tag-badge"
              style={`--tag-color: ${tag.color};`}
              title={`Label: ${tag.name}`}
            >
              {tag.name}
            </span>
          ))}
        </>
      );

    case "tags":
      return (
        <div class="tags-cell">
          {torrent.tags.length === 0 ? (
            <span class="tags-empty">—</span>
          ) : (
            torrent.tags.map((tag) => (
              <span
                key={tag.id}
                class="row-tag-badge"
                style={`--tag-color: ${tag.color};`}
                title={`Label: ${tag.name}`}
              >
                {tag.name}
              </span>
            ))
          )}
        </div>
      );

    case "size":
      return (
        <span style="color: var(--text-muted); font-size: 11px;">
          {fmtBytes(torrent.size)}
        </span>
      );

    case "progress":
      return (
        <>
          <div class="progress-bar-row">
            <div
              class={`progress-fill-row ${stateClass}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span class="progress-pct">{pct}%</span>
        </>
      );

    case "download_speed":
      return <>{fmtSpeed(torrent.download_speed)}</>;

    case "upload_speed":
      return <>{fmtSpeed(torrent.upload_speed)}</>;

    case "eta":
      return <>{fmtETA(torrent.eta)}</>;

    case "peers":
      return (
        <>
          {torrent.peers > 0 && (
            <span style="color: var(--accent-light);">{torrent.peers}</span>
          )}
          <span style="color: var(--text-muted);">/</span>
          {torrent.seeds > 0 && (
            <span style="color: var(--green);">{torrent.seeds}</span>
          )}
        </>
      );

    case "seeds":
      return (
        <span style="color: var(--green); font-family: var(--font-mono); font-size: 11px;">
          {torrent.seeds}
        </span>
      );

    case "state":
      return <span class={`state-badge ${stateClass}`}>{stateLabel}</span>;

    case "health": {
      const h = torrent.health;
      const score = Math.round(h?.score ?? 0);
      const color = h ? healthScoreColor(h.score) : "var(--text-muted)";
      return (
        <div class="health-cell" title={healthTitle(h)}>
          <div class="health-track">
            <div class="health-fill" style={{ width: `${score}%`, background: color }} />
          </div>
          <span class="health-score" style={{ color }}>{h ? score : "—"}</span>
        </div>
      );
    }

    default:
      return null;
  }
}

export function TorrentRow({
  torrent,
  selected,
  index,
  columns,
  search,
  onSelect,
  onDoubleClick,
  onContextMenu,
}: Props) {
  const handleClick = (e: MouseEvent) => {
    onSelect(torrent.id, e.ctrlKey || e.metaKey, e.shiftKey);
  };

  const handleContext = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(e, torrent.id);
  };

  return (
    <div
      class={`torrent-row ${selected ? "selected" : ""}`}
      style={`--row-index: ${Math.min(index, 50)}`}
      onClick={handleClick}
      onDblClick={() => onDoubleClick(torrent.id)}
      onContextMenu={handleContext}
    >
      {columns.map((col) => {
        const extra = col.extraStyle ? `; ${col.extraStyle}` : "";
        const isName = col.key === "name";
        const isSpeed = col.key === "download_speed" || col.key === "upload_speed";
        const isProgress = col.key === "progress";
        const cls = [
          "td",
          isName && "name-cell",
          isSpeed && "td-speed",
          col.key === "download_speed" && "down",
          col.key === "upload_speed" && "up",
          isProgress && "progress-cell",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <div key={col.key} class={cls} style={`flex: ${col.style}${extra}`}>
            <Cell torrent={torrent} col={col.key} search={search} />
          </div>
        );
      })}
    </div>
  );
}
