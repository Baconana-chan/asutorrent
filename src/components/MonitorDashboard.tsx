import { useSignal } from "@preact/signals";
import { SpeedChart } from "./SpeedChart";
import { PeerMapInner } from "./PeerMap";
import { CountryTable } from "./CountryTraffic";
import { SessionStats } from "./SessionStats";

interface Props {
  onClose: () => void;
}

type Tab = "stats" | "map" | "speed" | "countries";

export function MonitorDashboard({ onClose }: Props) {
  const activeTab = useSignal<Tab>("stats");

  const tabs: { id: Tab; icon: string; label: string }[] = [
    { id: "stats", icon: "📈", label: "Session" },
    { id: "map", icon: "🗺️", label: "Peer Map" },
    { id: "speed", icon: "📊", label: "Speed" },
    { id: "countries", icon: "🌍", label: "Countries" },
  ];

  return (
    <div class="dialog-overlay" onClick={onClose}>
      <div
        class="dialog monitor-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="dialog-header">
          <span class="dialog-title">
            📊 Monitor Dashboard
          </span>
          <button class="dialog-close" onClick={onClose}>
            &times;
          </button>
        </div>

        {/* ── Tabs ─────────────────────────────────────────────── */}
        <div class="monitor-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              class={`monitor-tab ${activeTab.value === tab.id ? "active" : ""}`}
              onClick={() => (activeTab.value = tab.id)}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div class="monitor-body">
          {activeTab.value === "stats" && (
            <div class="monitor-tab-content">
              <SessionStats />
            </div>
          )}
          {activeTab.value === "map" && (
            <div class="monitor-tab-content">
              <PeerMapInner />
            </div>
          )}
          {activeTab.value === "speed" && (
            <div class="monitor-tab-content">
              <SpeedChart height={260} />
            </div>
          )}
          {activeTab.value === "countries" && (
            <div class="monitor-tab-content">
              <CountryTable />
            </div>
          )}
        </div>

        <div class="dialog-footer">
          <button class="btn btn-primary btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
