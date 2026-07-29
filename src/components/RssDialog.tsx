import { useSignal, useComputed } from "@preact/signals";
import { useEffect } from "preact/hooks";
import {
  RssFeedPayload,
  addRssFeed,
  removeRssFeed,
  getRssFeeds,
  addRssFilter,
  removeRssFilter,
  rssNewItems,
  pollRss,
} from "../hooks/useTorrents";
import { fmtBytes } from "../utils/format";

/** Wrapper to match original fmtSize: returns empty string for null/zero */
function fmtSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "";
  return fmtBytes(bytes);
}

interface Props {
  onClose: () => void;
}

export function RssDialog({ onClose }: Props) {
  const feeds = useSignal<RssFeedPayload[]>([]);
  const selectedFeed = useSignal<number | null>(null);
  const newName = useSignal("");
  const newUrl = useSignal("");
  const adding = useSignal(false);
  const error = useSignal<string | null>(null);
  const showAddForm = useSignal(false);

  // Filter editor state
  const filterRegex = useSignal("");
  const filterMinSize = useSignal("");
  const filterMaxSize = useSignal("");
  const filterAutoAdd = useSignal(true);

  // Load feeds on mount
  useEffect(() => {
    getRssFeeds()
      .then((f) => {
        feeds.value = f;
        if (f.length > 0) selectedFeed.value = f[0].id;
      })
      .catch(() => {});
  }, []);

  const selected = useComputed(() => feeds.value.find((f) => f.id === selectedFeed.value) ?? null);

  const newItemsForSelected = useComputed(() => {
    const sel = selected.value;
    if (!sel) return [];
    return rssNewItems.value[sel.id.toString()] ?? [];
  });

  const handleAddFeed = async () => {
    if (!newName.value.trim() || !newUrl.value.trim()) return;
    adding.value = true;
    error.value = null;
    try {
      const feed = await addRssFeed(newName.value.trim(), newUrl.value.trim());
      feeds.value = [...feeds.value, feed];
      selectedFeed.value = feed.id;
      newName.value = "";
      newUrl.value = "";
      showAddForm.value = false;
    } catch (e) {
      error.value = String(e);
    } finally {
      adding.value = false;
    }
  };

  const handleRemoveFeed = async (id: number) => {
    try {
      await removeRssFeed(id);
      feeds.value = feeds.value.filter((f) => f.id !== id);
      if (selectedFeed.value === id) {
        selectedFeed.value = feeds.value.length > 0 ? feeds.value[0].id : null;
      }
    } catch (e) {
      error.value = String(e);
    }
  };

  const handleAddFilter = async () => {
    const sel = selected.value;
    if (!sel) return;
    try {
      const filter = await addRssFilter(
        sel.id,
        filterRegex.value,
        filterMinSize.value ? parseInt(filterMinSize.value) * 1024 * 1024 : null,
        filterMaxSize.value ? parseInt(filterMaxSize.value) * 1024 * 1024 : null,
        filterAutoAdd.value
      );
      feeds.value = feeds.value.map((f) =>
        f.id === sel.id ? { ...f, filters: [...f.filters, filter] } : f
      );
      filterRegex.value = "";
      filterMinSize.value = "";
      filterMaxSize.value = "";
    } catch (e) {
      error.value = String(e);
    }
  };

  const handleRemoveFilter = async (feedId: number, filterId: number) => {
    try {
      await removeRssFilter(feedId, filterId);
      feeds.value = feeds.value.map((f) =>
        f.id === feedId ? { ...f, filters: f.filters.filter((fl) => fl.id !== filterId) } : f
      );
    } catch (e) {
      error.value = String(e);
    }
  };

  const handlePoll = async () => {
    try {
      await pollRss();
    } catch (e) {
      error.value = String(e);
    }
  };

  const handleOverlay = (e: MouseEvent) => {
    if ((e.target as HTMLElement).classList.contains("dialog-overlay")) onClose();
  };

  return (
    <div class="dialog-overlay" onClick={handleOverlay}>
      <div class="dialog rss-dialog">
        <div class="dialog-header">
          <span class="dialog-title">RSS Feeds</span>
          <button class="dialog-close" onClick={onClose}>&times;</button>
        </div>

        <div class="dialog-body rss-body">
          {/* Left pane: feed list */}
          <div class="rss-sidebar">
            <div class="rss-feed-list">
              {feeds.value.map((feed) => (
                <div
                  key={feed.id}
                  class={`rss-feed-item ${selectedFeed.value === feed.id ? "active" : ""}`}
                  onClick={() => (selectedFeed.value = feed.id)}
                >
                  <span class="rss-feed-name">{feed.name}</span>
                  <span class="rss-feed-count">{feed.filters.length}</span>
                  <button
                    class="rss-feed-del"
                    onClick={(e) => { e.stopPropagation(); handleRemoveFeed(feed.id); }}
                    title="Remove feed"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
            {showAddForm.value ? (
              <div class="rss-add-form">
                <input
                  class="rss-input"
                  placeholder="Feed name"
                  value={newName.value}
                  onInput={(e) => (newName.value = (e.target as HTMLInputElement).value)}
                />
                <input
                  class="rss-input"
                  placeholder="RSS URL"
                  value={newUrl.value}
                  onInput={(e) => (newUrl.value = (e.target as HTMLInputElement).value)}
                />
                <div class="rss-add-actions">
                  <button class="btn btn-primary" disabled={adding.value} onClick={handleAddFeed}>
                    {adding.value ? "Adding..." : "Add"}
                  </button>
                  <button class="btn btn-ghost" onClick={() => (showAddForm.value = false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <button class="btn btn-secondary rss-add-btn" onClick={() => (showAddForm.value = true)}>
                + Add Feed
              </button>
            )}
          </div>

          {/* Right pane: feed details */}
          <div class="rss-content">
            {selected.value ? (
              <>
                <div class="rss-details-header">
                  <div>
                    <h3>{selected.value.name}</h3>
                    <span class="rss-url">{selected.value.url}</span>
                  </div>
                  <button class="btn btn-secondary" onClick={handlePoll} title="Poll now">
                    Refresh
                  </button>
                </div>

                {/* Filters section */}
                <div class="rss-section">
                  <h4>Filters ({selected.value.filters.length})</h4>
                  {selected.value.filters.length === 0 && (
                    <p class="rss-empty">No filters — all new items will be ignored. Add a filter to auto-download.</p>
                  )}
                  {selected.value.filters.map((fl) => (
                    <div key={fl.id} class="rss-filter-row">
                      <span class="rss-filter-regex">{fl.name_regex || ".*"}</span>
                      <span class="rss-filter-size">
                        {fl.min_size ? `> ${fmtSize(fl.min_size)}` : ""}
                        {fl.max_size ? ` < ${fmtSize(fl.max_size)}` : ""}
                      </span>
                      <span class={`rss-filter-action ${fl.add_torrent ? "on" : ""}`}>
                        {fl.add_torrent ? "Auto-add" : "Notify"}
                      </span>
                      <button class="rss-filter-del" onClick={() => handleRemoveFilter(selected.value!.id, fl.id)}>
                        &times;
                      </button>
                    </div>
                  ))}

                  {/* Add filter form */}
                  <div class="rss-filter-form">
                    <input
                      class="rss-input"
                      placeholder="Title regex (e.g. 2160p|4K)"
                      value={filterRegex.value}
                      onInput={(e) => (filterRegex.value = (e.target as HTMLInputElement).value)}
                    />
                    <div class="rss-filter-form-row">
                      <input
                        class="rss-input rss-size-input"
                        placeholder="Min MB"
                        value={filterMinSize.value}
                        type="number"
                        onInput={(e) => (filterMinSize.value = (e.target as HTMLInputElement).value)}
                      />
                      <input
                        class="rss-input rss-size-input"
                        placeholder="Max MB"
                        value={filterMaxSize.value}
                        type="number"
                        onInput={(e) => (filterMaxSize.value = (e.target as HTMLInputElement).value)}
                      />
                      <label class="rss-auto-label">
                        <input
                          type="checkbox"
                          checked={filterAutoAdd.value}
                          onChange={(e) => (filterAutoAdd.value = (e.target as HTMLInputElement).checked)}
                        />
                        Auto-add
                      </label>
                      <button class="btn btn-primary rss-filter-add" onClick={handleAddFilter}>
                        +
                      </button>
                    </div>
                  </div>
                </div>

                {/* Items section */}
                <div class="rss-section rss-items-section">
                  <h4>
                    New Items
                    <span class="rss-items-count">{newItemsForSelected.value.length}</span>
                  </h4>
                  <div class="rss-items-list">
                    {newItemsForSelected.value.length === 0 ? (
                      <p class="rss-empty">No new items yet. Click Refresh or wait for auto-poll.</p>
                    ) : (
                      newItemsForSelected.value.map((item, i) => (
                        <div key={i} class="rss-item-row">
                          <span class="rss-item-title">{item.title}</span>
                          <span class="rss-item-size">{fmtSize(item.size)}</span>
                          <span class="rss-item-date">
                            {item.pub_date ? item.pub_date.slice(0, 16) : ""}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div class="rss-no-feed">
                <p>No feed selected. Add a feed to get started.</p>
              </div>
            )}
            {error.value && <div class="dialog-error">{error.value}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
