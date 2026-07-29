import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { StatusBar } from "../../components/StatusBar";

// Mock useLocales
vi.mock("../../hooks/useLocales", () => ({
  t: (key: string, fallback?: string) => {
    const dict: Record<string, string> = {
      "status.dht": "DHT",
      "status.dht_ok": "OK",
      "status.connection": "Connection",
      "status.online": "Online",
      "status.dl": "DL",
      "status.ul": "UL",
      "status.dl_queue": "DL Queue",
      "status.seeds": "Seeds",
      "status.queue_title": "Queue stats",
      "status.seeding_count": "Seeding",
      "status.downloading": "Downloading",
      "status.torrents": "torrents",
      "status.turtle": "Turtle",
      "status.dl_limit": "DL Limit",
      "status.ul_limit": "UL Limit",
      "status.schedule": "Schedule",
      "update.check_now": "Check for updates",
    };
    return dict[key] ?? fallback ?? key;
  },
}));

// Mock sessionStats signal
vi.mock("../../hooks/useTorrents", () => ({
  sessionStats: { value: { download_speed: 0, upload_speed: 0, active_downloads: 0, active_seeds: 0 } },
  torrents: { value: [] },
  speedSchedule: { value: null },
}));

describe("StatusBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders DHT and Connection status", () => {
    render(<StatusBar speedLimits={null} queueConfig={null} />);

    // Use text matchers because text is split across sibling elements
    expect(screen.getByText((c) => c.includes("DHT"))).not.toBeNull();
    expect(screen.getByText("OK")).not.toBeNull();
    expect(screen.getByText((c) => c.includes("Connection"))).not.toBeNull();
    expect(screen.getByText("Online")).not.toBeNull();
  });

  it("renders download and upload speed labels", () => {
    render(<StatusBar speedLimits={null} queueConfig={null} />);

    expect(screen.getByText((c) => c.includes("DL"))).not.toBeNull();
    expect(screen.getByText((c) => c.includes("UL"))).not.toBeNull();
  });

  it("renders speed limit indicators when limits are set", () => {
    const limits = {
      normal_download: 1048576,
      normal_upload: 524288,
      turtle_download: null,
      turtle_upload: null,
      turtle_mode: false,
    };

    render(<StatusBar speedLimits={limits} queueConfig={null} />);

    expect(screen.getByText((c) => c.includes("DL Limit"))).not.toBeNull();
    expect(screen.getByText((c) => c.includes("UL Limit"))).not.toBeNull();
  });

  it("renders turtle mode indicator", () => {
    const limits = {
      normal_download: null,
      normal_upload: null,
      turtle_download: 1048576,
      turtle_upload: 524288,
      turtle_mode: true,
    };

    render(<StatusBar speedLimits={limits} queueConfig={null} />);

    expect(screen.getByText("Turtle")).not.toBeNull();
  });

  it("renders total torrent count", () => {
    render(<StatusBar speedLimits={null} queueConfig={null} />);

    expect(screen.getByText("torrents")).not.toBeNull();
  });

  it("shows update check button when onCheckUpdates is provided", () => {
    const onCheckUpdates = vi.fn();
    render(
      <StatusBar
        speedLimits={null}
        queueConfig={null}
        onCheckUpdates={onCheckUpdates}
      />
    );

    const checkBtn = screen.getByTitle("Check for updates");
    expect(checkBtn).not.toBeNull();
    fireEvent.click(checkBtn);

    expect(onCheckUpdates).toHaveBeenCalledTimes(1);
  });

  it("renders queue stats when queueConfig is provided", () => {
    const queueConfig = {
      max_active_downloads: 5,
      max_active_seeds: 3,
    };

    render(
      <StatusBar
        speedLimits={null}
        queueConfig={queueConfig}
      />
    );

    expect(screen.getByText((c) => c.includes("DL Queue"))).not.toBeNull();
    expect(screen.getByText((c) => c.includes("Seeds"))).not.toBeNull();
  });
});
