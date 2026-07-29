import { describe, it, expect } from "vitest";
import { fmtSpeed, fmtLimit, fmtETA, fmtBytes } from "../utils/format";

describe("Torrent data formatting", () => {
  it("formats bytes correctly", () => {
    expect(fmtBytes(0)).toBe("0 B");
    expect(fmtBytes(500)).toBe("500.0 B");
    expect(fmtBytes(1500)).toBe("1.5 KB");
    expect(fmtBytes(1048576)).toBe("1.0 MB");
    expect(fmtBytes(1073741824)).toBe("1.00 GB");
  });

  it("formats speed values correctly", () => {
    expect(fmtSpeed(0)).toBe("0 B/s");
    expect(fmtSpeed(500)).toBe("500.0 B/s");
    expect(fmtSpeed(1500)).toBe("1.5 KB/s");
    expect(fmtSpeed(1048576)).toBe("1.0 MB/s");
    expect(fmtSpeed(1073741824)).toBe("1.00 GB/s");
  });

  it("formats limit values correctly", () => {
    expect(fmtLimit(null)).toBe("\u221E");
    expect(fmtLimit(0)).toBe("\u221E");
    expect(fmtLimit(1)).toBe("1 B/s");
    expect(fmtLimit(512000)).toBe("500 KB/s");
    expect(fmtLimit(1048576)).toBe("1.0 MB/s");
  });

  it("computes ETA correctly", () => {
    expect(fmtETA(null)).toBe("");
    expect(fmtETA(0)).toBe("");
    expect(fmtETA(30)).toBe("30s");
    expect(fmtETA(125)).toBe("2m 5s");
    expect(fmtETA(3725)).toBe("1h 2m");
    expect(fmtETA(90000)).toBe("1d 1h");
  });
});

describe("Torrent state validation", () => {
  // Reproduce the TorrentState logic from state_machine.rs
  const VALID_TRANSITIONS: [string, string][] = [
    ["metadata", "downloading"],
    ["metadata", "paused"],
    ["metadata", "error"],
    ["downloading", "seeding"],
    ["downloading", "paused"],
    ["downloading", "checking"],
    ["seeding", "paused"],
    ["seeding", "checking"],
    ["paused", "downloading"],
    ["paused", "seeding"],
    ["paused", "checking"],
    ["checking", "downloading"],
    ["checking", "seeding"],
    ["checking", "paused"],
    ["error", "paused"],
    ["error", "downloading"],
  ];

  it("valid transitions are allowed", () => {
    for (const [from, to] of VALID_TRANSITIONS) {
      expect(VALID_TRANSITIONS).toContainEqual([from, to]);
    }
  });

  it("invalid transitions are rejected", () => {
    const invalid: [string, string][] = [
      ["seeding", "downloading"],
      ["metadata", "seeding"],
      ["paused", "metadata"],
      ["unknown", "seeding"],
      ["checking", "metadata"],
    ];
    for (const [from, to] of invalid) {
      expect(VALID_TRANSITIONS).not.toContainEqual([from, to]);
    }
  });

  it("maps librqbit states correctly", () => {
    function fromLibrqbit(raw: string, finished: boolean): string {
      if (raw === "live" && finished) return "seeding";
      if (raw === "live") return "downloading";
      if (raw === "paused" && finished) return "seeding";
      if (raw === "paused") return "paused";
      if (raw === "error") return "error";
      if (raw === "initializing") return "metadata";
      if (raw === "downloading") return "downloading";
      if (raw === "seeding") return "seeding";
      if (raw === "checking") return "checking";
      return "unknown";
    }

    expect(fromLibrqbit("live", false)).toBe("downloading");
    expect(fromLibrqbit("live", true)).toBe("seeding");
    expect(fromLibrqbit("paused", false)).toBe("paused");
    expect(fromLibrqbit("paused", true)).toBe("seeding");
    expect(fromLibrqbit("error", false)).toBe("error");
    expect(fromLibrqbit("initializing", false)).toBe("metadata");
    expect(fromLibrqbit("unknown", false)).toBe("unknown");
  });
});
