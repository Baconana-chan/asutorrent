import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { t } from "../hooks/useLocales";
import { torrents, rssFeeds, getPortfolios, refreshConfig } from "../hooks/useTorrents";
import { categoriesDefs, tagDefs } from "../hooks/useTorrents";
import type { PortfolioPayload } from "../hooks/useTorrents";

interface Props {
  filter: string;
  onFilterChange: (f: string) => void;
  onOpenRss: () => void;
  onOpenCategories: () => void;
  onOpenMonitor?: () => void;
  onOpenHistory?: () => void;
  onOpenPortfolios?: () => void;
}

export function Sidebar({ filter, onFilterChange, onOpenRss, onOpenCategories, onOpenMonitor, onOpenHistory, onOpenPortfolios }: Props) {
  const list = Array.isArray(torrents.value) ? torrents.value : [];

  const portfolios = useSignal<PortfolioPayload[]>([]);

  useEffect(() => {
    // Shared category/label defs stay in sync via refreshConfig()
    refreshConfig();
    getPortfolios().then((p) => (portfolios.value = p)).catch(() => {});
  }, []);

  // Refresh portfolios when filter changes (catches edits from PortfolioDialog)
  useEffect(() => {
    getPortfolios().then((p) => (portfolios.value = p)).catch(() => {});
  }, [filter]);

  const counts = {
    all: list.length,
    downloading: list.filter((t) => t.state === "downloading" || t.state === "metadata").length,
    seeding: list.filter((t) => t.state === "seeding" || t.state === "completed").length,
    paused: list.filter((t) => t.state === "paused").length,
    error: list.filter((t) => t.state === "error").length,
    checking: list.filter((t) => t.state === "checking").length,
  };

  const items = [
    { id: "all", icon: "\u{1F4E6}", label: t("sidebar.all"), count: counts.all },
    { id: "downloading", icon: "\u2B07", label: t("sidebar.downloading"), count: counts.downloading },
    { id: "seeding", icon: "\u2B06", label: t("sidebar.seeding"), count: counts.seeding },
    { id: "paused", icon: "\u23F8", label: t("sidebar.paused"), count: counts.paused },
    { id: "error", icon: "\u26A0", label: t("sidebar.errors"), count: counts.error },
    { id: "checking", icon: "\u{1F504}", label: t("sidebar.checking"), count: counts.checking },
  ];

  const feedCount = rssFeeds.value.length;

  return (
    <div class="sidebar">
      <div class="sidebar-section">
        <div class="sidebar-section-title">{t("sidebar.history")}</div>
        <div class="sidebar-item" onClick={onOpenHistory} title={t("sidebar.history_title")}>
          <span class="icon">{'\u{1F4DC}'}</span>
          <span class="label">{t("sidebar.history")}</span>
        </div>
      </div>

      <div class="sidebar-sep" />

      <div class="sidebar-section">
        <div class="sidebar-section-title">{t("sidebar.status")}</div>
        {items.map((item) => (
          <div
            key={item.id}
            class={`sidebar-item ${filter === item.id ? "active" : ""}`}
            onClick={() => onFilterChange(item.id)}
          >
            <span class="icon">{item.icon}</span>
            <span class="label">{item.label}</span>
            {item.count > 0 && <span class="count">{item.count}</span>}
          </div>
        ))}
      </div>

      <div class="sidebar-sep" />

      <div class="sidebar-section">
        <div class="sidebar-section-title">
          {t("sidebar.portfolios")}
          <button
            class="sidebar-section-action"
            onClick={onOpenPortfolios}
            title={t("sidebar.manage_portfolios")}
          >
            +
          </button>
        </div>
        {portfolios.value.length === 0 ? (
          <div class="sidebar-item disabled">
            <span class="icon">{'\u{1F4C1}'}</span>
            <span class="label" style="font-style: italic;">{t("sidebar.no_portfolios")}</span>
          </div>
        ) : (
          portfolios.value.map((pf) => (
            <div
              key={pf.id}
              class={`sidebar-item ${filter === pf.filter ? "active" : ""}`}
              onClick={() => onFilterChange(pf.filter)}
              title={t("sidebar.show").replace("{name}", pf.name)}
            >
              <span class="icon">{pf.icon}</span>
              <span class="label">{pf.name}</span>
            </div>
          ))
        )}
      </div>

      <div class="sidebar-sep" />

      <div class="sidebar-section">
        <div class="sidebar-section-title">{t("sidebar.monitor")}</div>
        <div class="sidebar-item" onClick={onOpenMonitor} title={t("sidebar.monitor_title")}>
          <span class="icon">{'\u{1F4CA}'}</span>
          <span class="label">{t("sidebar.monitor")}</span>
        </div>
      </div>

      <div class="sidebar-sep" />

      <div class="sidebar-section">
        <div class="sidebar-section-title">{t("sidebar.rss")}</div>
        <div class="sidebar-item" onClick={onOpenRss}>
          <span class="icon">{'\u{1F4E1}'}</span>
          <span class="label">{t("sidebar.feeds")}</span>
          {feedCount > 0 && <span class="count">{feedCount}</span>}
        </div>
      </div>

      <div class="sidebar-sep" />

      <div class="sidebar-section">
        <div class="sidebar-section-title">{t("sidebar.categories")}</div>
        {categoriesDefs.value.map((cat) => (
          <div
            key={cat.id}
            class={`sidebar-item ${filter === `cat:${cat.id}` ? "active" : ""}`}
            onClick={() => onFilterChange(`cat:${cat.id}`)}
          >
            <span class="icon">{cat.icon}</span>
            <span class="label">{cat.name}</span>
          </div>
        ))}
        <div class="sidebar-item" onClick={onOpenCategories}>
          <span class="icon">{'\u2699'}</span>
          <span class="label" style="font-style: italic;">{t("sidebar.manage")}</span>
        </div>
      </div>

      <div class="sidebar-sep" />

      <div class="sidebar-section">
        <div class="sidebar-section-title">{t("sidebar.tags")}</div>
        {tagDefs.value.map((tag) => (
          <div
            key={tag.id}
            class={`sidebar-item ${filter === `tag:${tag.id}` ? "active" : ""}`}
            onClick={() => onFilterChange(`tag:${tag.id}`)}
          >
            <span class="icon" style={{ color: tag.color }}>{'\u{1F3F7}'}</span>
            <span class="label">{tag.name}</span>
          </div>
        ))}
        <div class="sidebar-item" onClick={onOpenCategories}>
          <span class="icon">{'\u2699'}</span>
          <span class="label" style="font-style: italic;">{t("sidebar.manage")}</span>
        </div>
      </div>
    </div>
  );
}
