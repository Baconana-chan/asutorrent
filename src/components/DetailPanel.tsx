import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import {
  torrents, getTorrentFiles, updateTorrentFiles,
  getCategories, getTags, getTorrentCategory, getTorrentTags, setTorrentCategory, setTorrentTags,
  getTorrentPeers, getTorrentTrackers,
} from "../hooks/useTorrents";
import type { TorrentFileEntry, CategoryPayload, TagPayload } from "../hooks/useTorrents";
import { FileTree } from "./FileTree";
import { fmtBytes, fmtSpeed } from "../utils/format";

type Tab = "info" | "peers" | "trackers" | "files";

interface Props {
  selectedId: number | null;
  onPlayFile?: (torrentId: number, fileIndex: number, fileName: string) => void;
}

export function DetailPanel({ selectedId, onPlayFile }: Props) {
  const tab = useSignal<Tab>("info");
  const t = selectedId !== null ? torrents.value.find((x) => x.id === selectedId) : null;

  // ── Category / Tags state ──────────────────────────────────────
  const categories = useSignal<CategoryPayload[]>([]);
  const tags = useSignal<TagPayload[]>([]);
  const torrentCatId = useSignal<number | null>(null);
  const torrentTagIds = useSignal<number[]>([]);

  useEffect(() => {
    if (selectedId === null) return;
    Promise.all([
      getCategories(), getTags(),
      getTorrentCategory(selectedId), getTorrentTags(selectedId),
    ]).then(([cats, ts, catId, tagIds]) => {
      categories.value = cats;
      tags.value = ts;
      torrentCatId.value = catId;
      torrentTagIds.value = tagIds;
    }).catch(() => {});
  }, [selectedId]);

  const handleCategoryChange = async (catId: number | null) => {
    if (selectedId === null) return;
    try {
      await setTorrentCategory(selectedId, catId);
      torrentCatId.value = catId;
    } catch (e) { console.error(e); }
  };

  const handleTagToggle = async (tagId: number) => {
    if (selectedId === null) return;
    const current = torrentTagIds.value;
    const next = current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId];
    try {
      await setTorrentTags(selectedId, next);
      torrentTagIds.value = next;
    } catch (e) { console.error(e); }
  };

  // ── Peer data state ────────────────────────────────────────────
  const peerData = useSignal<any[] | null>(null);
  const peerLoading = useSignal(false);

  useEffect(() => {
    if (tab.value !== "peers" || selectedId === null) return;
    peerLoading.value = true;
    peerData.value = null;
    getTorrentPeers(selectedId)
      .then((data) => {
        // Extract peers from the response — it has a "peers" map with ip:port keys
        const peers = data?.peers ? Object.entries(data.peers).map(([key, val]: [string, any]) => {
          const [ip, port] = key.split(':');
          return { ip: ip || key, port: port || '', ...val };
        }) : [];
        peerData.value = peers;
      })
      .catch(() => { peerData.value = []; })
      .finally(() => { peerLoading.value = false; });
  }, [selectedId, tab.value]);

  // ── Tracker data state ──────────────────────────────────────────
  const trackerData = useSignal<any[] | null>(null);
  const trackerLoading = useSignal(false);

  useEffect(() => {
    if (tab.value !== "trackers" || selectedId === null) return;
    trackerLoading.value = true;
    trackerData.value = null;
    getTorrentTrackers(selectedId)
      .then((data) => {
        const arr = Array.isArray(data) ? data : [];
        trackerData.value = arr;
      })
      .catch(() => { trackerData.value = []; })
      .finally(() => { trackerLoading.value = false; });
  }, [selectedId, tab.value]);

  // ── File tree state ────────────────────────────────────────────
  const fileEntries = useSignal<TorrentFileEntry[]>([]);
  const fileLoading = useSignal(false);

  useEffect(() => {
    if (tab.value !== "files" || selectedId === null) return;
    fileLoading.value = true;
    getTorrentFiles(selectedId)
      .then((data) => { fileEntries.value = data.files; })
      .catch(() => { fileEntries.value = []; })
      .finally(() => { fileLoading.value = false; });
  }, [selectedId, tab.value]);

  const handleFileSelection = async (includedIndices: number[]) => {
    if (selectedId === null) return;
    try { await updateTorrentFiles(selectedId, includedIndices); }
    catch (e) { console.error("Failed to update file selection:", e); }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "info", label: "Info" },
    { id: "peers", label: "Peers" },
    { id: "trackers", label: "Trackers" },
    { id: "files", label: "Files" },
  ];

  return (
    <div class="detail-panel">
      <div class="detail-tabs">
        {tabs.map((tabDef) => (
          <button
            key={tabDef.id}
            class={`detail-tab ${tab.value === tabDef.id ? "active" : ""}`}
            onClick={() => (tab.value = tabDef.id)}
          >
            {tabDef.label}
          </button>
        ))}
      </div>
      <div class="detail-content">
        {t ? (
          <>
            {tab.value === "info" && (
              <div>
                <InfoRow label="Name" value={t.name || "—"} />
                <InfoRow label="Size" value={fmtBytes(t.size)} />
                <InfoRow label="Progress" value={`${(t.progress * 100).toFixed(2)}%`} />
                <InfoRow label="State" value={t.state || "—"} />
                <InfoRow label="Download speed" value={fmtSpeed(t.download_speed)} />
                <InfoRow label="Upload speed" value={fmtSpeed(t.upload_speed)} />
                <InfoRow label="Peers / Seeds" value={`${t.peers} / ${t.seeds}`} />
                <InfoRow label="ETA" value={t.eta ? `${t.eta}s` : "—"} />

                {/* Category selector */}
                <div class="info-row-cat">
                  <span class="info-label">Category</span>
                  <select
                    class="cat-select"
                    value={torrentCatId.value ?? ""}
                    onChange={(e) => {
                      const val = (e.target as HTMLSelectElement).value;
                      handleCategoryChange(val ? Number(val) : null);
                    }}
                  >
                    <option value="">None</option>
                    {categories.value.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.icon} {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Tags */}
                <div class="info-row-cat">
                  <span class="info-label">Tags</span>
                  <div class="tags-inline">
                    {tags.value.map((tag) => {
                      const active = torrentTagIds.value.includes(tag.id);
                      return (
                        <span
                          key={tag.id}
                          class={`tag-pill ${active ? "active" : ""}`}
                          style={`--tag-color: ${tag.color};`}
                          onClick={() => handleTagToggle(tag.id)}
                        >
                          {tag.name}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
            {tab.value === "peers" && (
              <div class="detail-list-tab">
                {peerLoading.value && <div class="detail-list-loading"><span class="spinner" /> Loading peers…</div>}
                {!peerLoading.value && peerData.value === null && selectedId !== null && (
                  <div class="detail-placeholder">No peer data available</div>
                )}
                {!peerLoading.value && peerData.value !== null && peerData.value.length === 0 && (
                  <div class="detail-placeholder">No active peer connections</div>
                )}
                {!peerLoading.value && peerData.value !== null && peerData.value.length > 0 && (
                  <>
                    <div class="detail-list-header">
                      <span class="detail-list-col ip">IP Address</span>
                      <span class="detail-list-col port">Port</span>
                      <span class="detail-list-col client">Client</span>
                      <span class="detail-list-col flags">Flags</span>
                      <span class="detail-list-col progress">Progress</span>
                    </div>
                    <div class="detail-list-body">
                      {peerData.value.map((peer, i) => (
                        <div key={i} class="detail-list-row">
                          <span class="detail-list-col ip">
                            <span class="peer-ip-dot" />
                            {peer.ip}
                          </span>
                          <span class="detail-list-col port">{peer.port || '—'}</span>
                          <span class="detail-list-col client">{peer.client || peer.peer_id?.substring(0, 20) || '—'}</span>
                          <span class="detail-list-col flags">
                            {peer.flags ? (
                              <span class="peer-flags">
                                {peer.flags.dht && <span class="peer-flag" title="DHT">D</span>}
                                {peer.flags.pex && <span class="peer-flag" title="PEX">X</span>}
                                {peer.flags.utp && <span class="peer-flag" title="uTP">U</span>}
                                {!peer.flags.dht && !peer.flags.pex && !peer.flags.utp && '—'}
                              </span>
                            ) : '—'}
                          </span>
                          <span class="detail-list-col progress">
                            {peer.progress !== undefined ? `${(peer.progress * 100).toFixed(1)}%` : '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            {tab.value === "trackers" && (
              <div class="detail-list-tab">
                {trackerLoading.value && <div class="detail-list-loading"><span class="spinner" /> Loading trackers…</div>}
                {!trackerLoading.value && trackerData.value === null && selectedId !== null && (
                  <div class="detail-placeholder">No tracker data available</div>
                )}
                {!trackerLoading.value && trackerData.value !== null && trackerData.value.length === 0 && (
                  <div class="detail-placeholder">No trackers configured</div>
                )}
                {!trackerLoading.value && trackerData.value !== null && trackerData.value.length > 0 && (
                  <>
                    <div class="detail-list-header">
                      <span class="detail-list-col url">Tracker URL</span>
                      <span class="detail-list-col status">Status</span>
                      <span class="detail-list-col peers">Peers</span>
                      <span class="detail-list-col seeds">Seeds</span>
                      <span class="detail-list-col leeches">Leeches</span>
                    </div>
                    <div class="detail-list-body">
                      {trackerData.value.map((trk: any, i: number) => (
                        <div key={i} class="detail-list-row">
                          <span class="detail-list-col url" title={trk.url || trk}>{
                            (trk.url || trk?.toString() || '—').length > 50
                              ? (trk.url || trk?.toString() || '').substring(0, 50) + '…'
                              : trk.url || trk?.toString() || '—'
                          }</span>
                          <span class="detail-list-col status">
                            <span class={`tracker-status ${(trk.status || '').toLowerCase()}`}>
                              {trk.status || '—'}
                            </span>
                          </span>
                          <span class="detail-list-col peers">{trk.peers ?? trk.num_peers ?? '—'}</span>
                          <span class="detail-list-col seeds">{trk.seeds ?? trk.num_seeds ?? '—'}</span>
                          <span class="detail-list-col leeches">{trk.leeches ?? trk.num_leeches ?? '—'}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            {tab.value === "files" && (
              <FileTree
                files={fileEntries.value}
                onSelectionChange={handleFileSelection}
                loading={fileLoading.value}
                onPlayFile={selectedId !== null && onPlayFile ? (fileIdx: number, fileName: string) => {
                  onPlayFile(selectedId, fileIdx, fileName);
                } : undefined}
              />
            )}
          </>
        ) : (
          <div class="detail-placeholder">
            Select a torrent to see details
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style="display: flex; gap: 12px; padding: 2px 0;">
      <span style="min-width: 130px; color: var(--text-muted);">{label}</span>
      <span>{value}</span>
    </div>
  );
}


