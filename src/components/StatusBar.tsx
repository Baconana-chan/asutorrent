import { t } from "../hooks/useLocales";
import {
  sessionStats,
  torrents,
  SpeedLimitsPayload,
  QueueConfigPayload,
  speedSchedule,
} from "../hooks/useTorrents";
import { fmtSpeed, fmtLimit } from "../utils/format";

interface Props {
  speedLimits: SpeedLimitsPayload | null;
  queueConfig: QueueConfigPayload | null;
  checkingUpdate?: boolean;
  onCheckUpdates?: () => void;
}

export function StatusBar({ speedLimits, queueConfig, checkingUpdate, onCheckUpdates }: Props) {
  const stats = sessionStats.value;
  const total = torrents.value.length;
  const activeDl = stats.active_downloads;
  const activeUl = stats.active_seeds;
  const sched = speedSchedule.value;

  const turtle = speedLimits?.turtle_mode ?? false;
  const dlLimit = speedLimits
    ? speedLimits.turtle_mode
      ? speedLimits.turtle_download
      : speedLimits.normal_download
    : null;
  const ulLimit = speedLimits
    ? speedLimits.turtle_mode
      ? speedLimits.turtle_upload
      : speedLimits.normal_upload
    : null;

  return (
    <div class="status-bar">
      <span class="sb-item">
        <span class="sb-dot green" />
        {t("status.dht")}: <span class="val">{t("status.dht_ok")}</span>
      </span>
      <span class="sb-item">
        <span class="sb-dot green" />
        {t("status.connection")}: <span class="val">{t("status.online")}</span>
      </span>

      {/* Queue stats */}
      {queueConfig && (
        <span class="sb-item" title={t("status.queue_title")}>
          {t("status.dl_queue")}:{" "}
          <span class="val">
            {activeDl}/{queueConfig.max_active_downloads}
          </span>
          {" | "}
          {t("status.seeds")}:{" "}
          <span class="val">
            {activeUl}/{queueConfig.max_active_seeds}
          </span>
        </span>
      )}

      {/* Schedule indicator */}
      {sched?.active && (
        <span class="sb-item">
          <span class="sb-dot blue" />
          <span class="val" style="color: var(--accent);">{t("status.schedule")}</span>
        </span>
      )}

      {/* Speed limits indicator */}
      {dlLimit !== null && dlLimit > 0 && (
        <span class="sb-item">
          {t("status.dl_limit")}:{" "}
          <span class="val speed down">{fmtLimit(dlLimit)}</span>
        </span>
      )}
      {ulLimit !== null && ulLimit > 0 && (
        <span class="sb-item">
          {t("status.ul_limit")}:{" "}
          <span class="val speed up">{fmtLimit(ulLimit)}</span>
        </span>
      )}

      {turtle && (
        <span class="sb-item">
          <span class="sb-dot yellow" />
          <span class="val" style="color: var(--yellow);">
            {t("status.turtle")}
          </span>
        </span>
      )}

      <span class="sb-item">
        {t("status.dl")}:{" "}
        <span class="val speed down">{fmtSpeed(stats.download_speed)}</span>
      </span>
      <span class="sb-item">
        {t("status.ul")}:{" "}
        <span class="val speed up">{fmtSpeed(stats.upload_speed)}</span>
      </span>

      <span class="sb-spacer" />

      <span class="sb-item">
        {t("status.downloading").replace("{n}", String(activeDl))} / {t("status.seeding_count").replace("{n}", String(activeUl))}
      </span>
      <span class="sb-item">
        <span class="val">{total}</span> {t("status.torrents").replace("{n}", String(total)).replace("{s}", total !== 1 ? "s" : "")}
      </span>

      {onCheckUpdates && (
        <button
          class="sb-btn sb-update-btn"
          onClick={onCheckUpdates}
          disabled={checkingUpdate}
          title={t("update.check_now")}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" style="width:12px;height:12px;">
            <path d="M8 2v6l4 2M14 8A6 6 0 112 8a6 6 0 0112 0z"/>
          </svg>
          {checkingUpdate && <span class="sb-update-spinner" />}
        </button>
      )}
    </div>
  );
}
