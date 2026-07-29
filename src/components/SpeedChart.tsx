import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";

interface SpeedSample {
  timestamp: number;
  dl_bytes: number;
  ul_bytes: number;
}

interface SpeedResponse {
  period: string;
  period_secs: number;
  samples: SpeedSample[];
}

interface Props {
  /** Height of the chart canvas in pixels. Default 200. */
  height?: number;
}

function formatBytes(n: number): string {
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB/s`;
  if (n >= 1_024) return `${(n / 1_024).toFixed(0)} KB/s`;
  return `${n} B/s`;
}

function formatTime(ts: number, periodSecs: number): string {
  const d = new Date(ts * 1000);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  if (periodSecs <= 3600) return `${h}:${m}`;
  // For day/week, show day + hour
  const day = d.getDate();
  const month = d.getMonth() + 1;
  return `${month}/${day} ${h}:${m}`;
}

export function SpeedChart({ height = 200 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const data = useSignal<SpeedResponse | null>(null);
  const loading = useSignal(true);
  const period = useSignal<"hour" | "day" | "week">("hour");
  const hoverIdx = useSignal<number | null>(null);

  const fetchData = async (p: string) => {
    loading.value = true;
    try {
      const resp = await fetch(`http://127.0.0.1:8080/api/v2/stats/speed?period=${p}`, {
        credentials: "include",
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      data.value = await resp.json();
    } catch {
      // Use empty data on error
      data.value = { period: p, period_secs: p === "week" ? 604800 : p === "day" ? 86400 : 3600, samples: [] };
    } finally {
      loading.value = false;
    }
  };

  useEffect(() => {
    fetchData(period.value);
    const interval = setInterval(() => fetchData(period.value), 10_000);
    return () => clearInterval(interval);
  }, [period.value]);

  // ── Canvas drawing ─────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data.value) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;
    const pad = { top: 16, right: 16, bottom: 32, left: 52 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    // Clear
    ctx.clearRect(0, 0, w, h);

    const samples = data.value.samples;
    if (samples.length === 0) {
      ctx.fillStyle = "#5a6e62";
      ctx.font = "12px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("No speed data yet — start downloading!", w / 2, h / 2);
      return;
    }

    // Find max value for scaling
    const maxVal = Math.max(1, ...samples.map((s) => Math.max(s.dl_bytes, s.ul_bytes)));
    const scaleY = (v: number) => pad.top + plotH - (v / maxVal) * plotH;

    const minTs = samples[0].timestamp;
    const maxTs = samples[samples.length - 1].timestamp;
    const range = Math.max(1, maxTs - minTs);
    const scaleX = (ts: number) => pad.left + ((ts - minTs) / range) * plotW;

    // ── Grid lines ───────────────────────────────────────────────
    ctx.strokeStyle = "rgba(45, 138, 78, 0.1)";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (plotH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();

      // Y-axis labels
      const val = maxVal - (maxVal / 4) * i;
      ctx.fillStyle = "#5a6e62";
      ctx.font = "10px Inter, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(formatBytes(val), pad.left - 6, y + 3);
    }

    // ── X-axis time labels ───────────────────────────────────────
    const numLabels = Math.min(samples.length, 6);
    const labelStep = Math.max(1, Math.floor(samples.length / numLabels));
    ctx.fillStyle = "#5a6e62";
    ctx.font = "10px Inter, sans-serif";
    ctx.textAlign = "center";
    for (let i = 0; i < samples.length; i += labelStep) {
      const x = scaleX(samples[i].timestamp);
      ctx.fillText(formatTime(samples[i].timestamp, data.value.period_secs), x, h - 8);
    }

    // ── Draw area fill (download) ────────────────────────────────
    const dlPath = () => {
      const path = new Path2D();
      path.moveTo(scaleX(samples[0].timestamp), pad.top + plotH);
      for (const s of samples) {
        path.lineTo(scaleX(s.timestamp), scaleY(s.dl_bytes));
      }
      path.lineTo(scaleX(samples[samples.length - 1].timestamp), pad.top + plotH);
      path.closePath();
      return path;
    };
    ctx.fillStyle = "rgba(45, 138, 78, 0.15)";
    ctx.fill(dlPath());

    // ── Draw area fill (upload) ──────────────────────────────────
    const ulPath = () => {
      const path = new Path2D();
      path.moveTo(scaleX(samples[0].timestamp), pad.top + plotH);
      for (const s of samples) {
        path.lineTo(scaleX(s.timestamp), scaleY(s.ul_bytes));
      }
      path.lineTo(scaleX(samples[samples.length - 1].timestamp), pad.top + plotH);
      path.closePath();
      return path;
    };
    ctx.fillStyle = "rgba(52, 211, 94, 0.08)";
    ctx.fill(ulPath());

    // ── Draw line (download) ─────────────────────────────────────
    ctx.beginPath();
    ctx.moveTo(scaleX(samples[0].timestamp), scaleY(samples[0].dl_bytes));
    for (let i = 1; i < samples.length; i++) {
      // Smooth curve using quadratic bezier
      const xc = (scaleX(samples[i - 1].timestamp) + scaleX(samples[i].timestamp)) / 2;
      const yc = (scaleY(samples[i - 1].dl_bytes) + scaleY(samples[i].dl_bytes)) / 2;
      ctx.quadraticCurveTo(scaleX(samples[i - 1].timestamp), scaleY(samples[i - 1].dl_bytes), xc, yc);
    }
    ctx.strokeStyle = "#34c26a";
    ctx.lineWidth = 2;
    ctx.stroke();

    // ── Draw line (upload) ───────────────────────────────────────
    ctx.beginPath();
    ctx.moveTo(scaleX(samples[0].timestamp), scaleY(samples[0].ul_bytes));
    for (let i = 1; i < samples.length; i++) {
      const xc = (scaleX(samples[i - 1].timestamp) + scaleX(samples[i].timestamp)) / 2;
      const yc = (scaleY(samples[i - 1].ul_bytes) + scaleY(samples[i].ul_bytes)) / 2;
      ctx.quadraticCurveTo(scaleX(samples[i - 1].timestamp), scaleY(samples[i - 1].ul_bytes), xc, yc);
    }
    ctx.strokeStyle = "#4ade80";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    // ── Hover indicator ──────────────────────────────────────────
    if (hoverIdx.value !== null && samples[hoverIdx.value]) {
      const s = samples[hoverIdx.value];
      const x = scaleX(s.timestamp);
      const yDl = scaleY(s.dl_bytes);
      const yUl = scaleY(s.ul_bytes);

      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, pad.top + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      // DL dot
      ctx.beginPath();
      ctx.arc(x, yDl, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#34c26a";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // UL dot
      ctx.beginPath();
      ctx.arc(x, yUl, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#4ade80";
      ctx.fill();

      // Tooltip
      const tooltipX = Math.min(x + 10, w - 140);
      const tooltipY = Math.max(pad.top + 4, Math.min(yDl - 30, pad.top + plotH - 50));
      ctx.fillStyle = "rgba(11, 17, 14, 0.92)";
      ctx.roundRect?.(tooltipX, tooltipY, 130, 42, 4) ?? ctx.fillRect(tooltipX, tooltipY, 130, 42);
      ctx.fill();
      ctx.strokeStyle = "rgba(45, 138, 78, 0.3)";
      ctx.lineWidth = 1;
      ctx.strokeRect(tooltipX, tooltipY, 130, 42);

      ctx.fillStyle = "#34c26a";
      ctx.font = "bold 10px Inter, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`DL ${formatBytes(s.dl_bytes)}`, tooltipX + 6, tooltipY + 14);
      ctx.fillStyle = "#4ade80";
      ctx.fillText(`UL ${formatBytes(s.ul_bytes)}`, tooltipX + 6, tooltipY + 28);
    }

    // ── Legend ───────────────────────────────────────────────────
    ctx.fillStyle = "#34c26a";
    ctx.fillRect(w - 90, 6, 10, 2);
    ctx.font = "10px Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = "#8aa096";
    ctx.fillText("Download", w - 76, 10);
    ctx.fillStyle = "#4ade80";
    ctx.fillRect(w - 90, 18, 10, 2);
    ctx.fillStyle = "#8aa096";
    ctx.fillText("Upload", w - 76, 22);
  }, [data.value, period.value, hoverIdx.value]);

  // ── Mouse tracking for hover ─────────────────────────────────
  const handleMouseMove = (e: MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas || !data.value?.samples.length) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pad = { top: 16, right: 16, bottom: 32, left: 52 };
    const plotW = rect.width - pad.left - pad.right;
    const minTs = data.value.samples[0].timestamp;
    const maxTs = data.value.samples[data.value.samples.length - 1].timestamp;
    const range = Math.max(1, maxTs - minTs);
    const ts = minTs + ((x - pad.left) / plotW) * range;

    // Find nearest sample
    let nearest = 0;
    let minDist = Infinity;
    for (let i = 0; i < data.value.samples.length; i++) {
      const dist = Math.abs(data.value.samples[i].timestamp - ts);
      if (dist < minDist) { minDist = dist; nearest = i; }
    }
    hoverIdx.value = nearest;
  };

  const handleMouseLeave = () => { hoverIdx.value = null; };

  const handlePeriodChange = (p: "hour" | "day" | "week") => {
    period.value = p;
    fetchData(p);
  };

  return (
    <div class="speed-chart">
      <div class="speed-chart-header">
        <div class="speed-chart-title">
          <span>📊 Speed History</span>
          {loading.value && <span class="speed-chart-loading">⟳</span>}
        </div>
        <div class="speed-chart-periods">
          {(["hour", "day", "week"] as const).map((p) => (
            <button
              key={p}
              class={`speed-chart-period-btn ${period.value === p ? "active" : ""}`}
              onClick={() => handlePeriodChange(p)}
            >
              {p === "hour" ? "Hour" : p === "day" ? "Day" : "Week"}
            </button>
          ))}
        </div>
      </div>
      <div class="speed-chart-canvas-wrap" style={{ height: `${height}px` }}>
        <canvas
          ref={canvasRef}
          class="speed-chart-canvas"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />
      </div>
    </div>
  );
}
