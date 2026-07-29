import { useSignal } from "@preact/signals";
import {
  setSpeedSchedule,
  ScheduleRulePayload,
} from "../hooks/useTorrents";
import { fmtLimit } from "../utils/format";

interface Props {
  rules: ScheduleRulePayload[];
  enabled: boolean;
  active: boolean;
  onClose: () => void;
  onSaved: (rules: ScheduleRulePayload[], enabled: boolean) => void;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function RuleEditor({
  rule,
  index,
  onChange,
  onDelete,
}: {
  rule: ScheduleRulePayload;
  index: number;
  onChange: (i: number, r: ScheduleRulePayload) => void;
  onDelete: (i: number) => void;
}) {
  const toggleDay = (d: number) => {
    const days = rule.days.includes(d)
      ? rule.days.filter((x) => x !== d)
      : [...rule.days, d].sort();
    onChange(index, { ...rule, days });
  };

  return (
    <div class="schedule-rule">
      <div class="schedule-rule-header">
        <span class="schedule-rule-title">Rule {index + 1}</span>
        <button
          class="schedule-rule-del"
          onClick={() => onDelete(index)}
          title="Remove rule"
        >
          &times;
        </button>
      </div>

      {/* Days of week */}
      <div class="schedule-days">
        {DAY_LABELS.map((label, d) => (
          <button
            key={d}
            class={`schedule-day-btn ${rule.days.includes(d) ? "active" : ""}`}
            onClick={() => toggleDay(d)}
          >
            {label}
          </button>
        ))}
        <span class="schedule-days-hint">
          {rule.days.length === 0 ? "(all days)" : ""}
        </span>
      </div>

      {/* Time range */}
      <div class="schedule-time-row">
        <label>From</label>
        <div class="schedule-time-inputs">
          <input
            type="number"
            min="0"
            max="23"
            value={rule.start_hour}
            class="schedule-hour"
            onInput={(e) => {
              const v = Math.min(23, Math.max(0, parseInt((e.target as HTMLInputElement).value) || 0));
              onChange(index, { ...rule, start_hour: v });
            }}
          />
          <span>:</span>
          <input
            type="number"
            min="0"
            max="59"
            value={rule.start_minute}
            class="schedule-minute"
            onInput={(e) => {
              const v = Math.min(59, Math.max(0, parseInt((e.target as HTMLInputElement).value) || 0));
              onChange(index, { ...rule, start_minute: v });
            }}
          />
        </div>

        <label>To</label>
        <div class="schedule-time-inputs">
          <input
            type="number"
            min="0"
            max="23"
            value={rule.end_hour}
            class="schedule-hour"
            onInput={(e) => {
              const v = Math.min(23, Math.max(0, parseInt((e.target as HTMLInputElement).value) || 0));
              onChange(index, { ...rule, end_hour: v });
            }}
          />
          <span>:</span>
          <input
            type="number"
            min="0"
            max="59"
            value={rule.end_minute}
            class="schedule-minute"
            onInput={(e) => {
              const v = Math.min(59, Math.max(0, parseInt((e.target as HTMLInputElement).value) || 0));
              onChange(index, { ...rule, end_minute: v });
            }}
          />
        </div>
      </div>

      {/* Speed limits */}
      <div class="schedule-speed-row">
        <div class="schedule-speed-field">
          <label>DL limit</label>
          <div class="schedule-speed-input-wrap">
            <input
              type="number"
              min="0"
              placeholder="Unlimited"
              class="schedule-kbps-input"
              value={rule.download_limit !== null ? Math.round(rule.download_limit / 1024) : ""}
              onInput={(e) => {
                const v = parseInt((e.target as HTMLInputElement).value);
                onChange(index, {
                  ...rule,
                  download_limit: !isNaN(v) && v > 0 ? v * 1024 : null,
                });
              }}
            />
            <span class="schedule-kbps-label">KB/s</span>
          </div>
        </div>
        <div class="schedule-speed-field">
          <label>UL limit</label>
          <div class="schedule-speed-input-wrap">
            <input
              type="number"
              min="0"
              placeholder="Unlimited"
              class="schedule-kbps-input"
              value={rule.upload_limit !== null ? Math.round(rule.upload_limit / 1024) : ""}
              onInput={(e) => {
                const v = parseInt((e.target as HTMLInputElement).value);
                onChange(index, {
                  ...rule,
                  upload_limit: !isNaN(v) && v > 0 ? v * 1024 : null,
                });
              }}
            />
            <span class="schedule-kbps-label">KB/s</span>
          </div>
        </div>
        <div class="schedule-preview">
          {fmtLimit(rule.download_limit)} / {fmtLimit(rule.upload_limit)}
        </div>
      </div>
    </div>
  );
}

export function SpeedScheduleDialog({
  rules,
  enabled,
  active,
  onClose,
  onSaved,
}: Props) {
  const localRules = useSignal<ScheduleRulePayload[]>(
    rules.length > 0
      ? JSON.parse(JSON.stringify(rules))
      : [
          {
            days: [],
            start_hour: 22,
            start_minute: 0,
            end_hour: 8,
            end_minute: 0,
            download_limit: 1024 * 1024, // 1 MB/s
            upload_limit: 512 * 1024,     // 512 KB/s
          },
        ]
  );
  const localEnabled = useSignal(enabled);
  const saving = useSignal(false);
  const error = useSignal<string | null>(null);

  const handleSave = async () => {
    saving.value = true;
    error.value = null;
    try {
      const rules = localRules.value;
      await setSpeedSchedule(rules, localEnabled.value);
      onSaved(rules, localEnabled.value);
      onClose();
    } catch (e) {
      error.value = String(e);
    } finally {
      saving.value = false;
    }
  };

  const addRule = () => {
    localRules.value = [
      ...localRules.value,
      {
        days: [],
        start_hour: 0,
        start_minute: 0,
        end_hour: 23,
        end_minute: 59,
        download_limit: null,
        upload_limit: null,
      },
    ];
  };

  const updateRule = (i: number, r: ScheduleRulePayload) => {
    const copy = [...localRules.value];
    copy[i] = r;
    localRules.value = copy;
  };

  const deleteRule = (i: number) => {
    localRules.value = localRules.value.filter((_, idx) => idx !== i);
  };

  const handleOverlay = (e: MouseEvent) => {
    if ((e.target as HTMLElement).classList.contains("dialog-overlay")) {
      onClose();
    }
  };

  return (
    <div class="dialog-overlay" onClick={handleOverlay}>
      <div class="dialog speed-schedule-dialog">
        <div class="dialog-header">
          <span class="dialog-title">Speed Schedule</span>
          <button class="dialog-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div class="dialog-body">
          <div class="schedule-enable-row">
            <label class="schedule-toggle-label">
              <input
                type="checkbox"
                checked={localEnabled.value}
                onChange={(e) =>
                  (localEnabled.value = (e.target as HTMLInputElement).checked)
                }
              />
              <span>Enable speed schedule</span>
            </label>
            {active && (
              <span class="schedule-active-badge">Active now</span>
            )}
          </div>

          <p class="schedule-desc">
            When a rule's time window matches the current time, its limits
            override the normal speed limits. Turtle mode still takes
            precedence over the schedule.
          </p>

          {localRules.value.map((rule, i) => (
            <RuleEditor
              key={i}
              rule={rule}
              index={i}
              onChange={updateRule}
              onDelete={deleteRule}
            />
          ))}

          <button class="btn btn-secondary schedule-add-btn" onClick={addRule}>
            + Add Rule
          </button>

          {error.value && <div class="dialog-error">{error.value}</div>}
        </div>

        <div class="dialog-footer">
          <button class="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            class="btn btn-primary"
            disabled={saving.value}
            onClick={handleSave}
          >
            {saving.value ? "Saving\u{2026}" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
