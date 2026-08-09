import { describe, it, expect, vi } from "vitest";

// utils/health.ts now localizes through useLocales, which uses `signal` and
// `effect` at module scope — mock @preact/signals so the test runs standalone.
vi.mock("@preact/signals", () => ({
  signal: (initial: unknown) => ({ value: initial }),
  effect: () => () => {},
  useSignal: (initial: unknown) => ({ value: initial }),
}));

import {
  healthStatus,
  healthLabelText,
  healthScoreColor,
  fmtAge,
  fmtAvailability,
  healthTitle,
} from "../utils/health";
import type { HealthPayload } from "../hooks/useTorrents";

function makeHealth(over: Partial<HealthPayload> = {}): HealthPayload {
  return {
    score: 85,
    label: "excellent",
    seeds: 12,
    peers: 4,
    age_secs: 3600 * 5,
    availability: 1,
    ...over,
  };
}

describe("healthStatus", () => {
  it("returns — for missing health", () => {
    expect(healthStatus(null)).toBe("—");
    expect(healthStatus(undefined)).toBe("—");
  });

  it("combines label text and score", () => {
    expect(healthStatus(makeHealth())).toBe("Excellent (85)");
    expect(healthStatus(makeHealth({ label: "dead", score: 5 }))).toBe("Dead (5)");
  });

  it("localizes health level labels", () => {
    expect(healthLabelText("excellent")).toBe("Excellent");
    expect(healthLabelText("low")).toBe("Low");
  });

  it("rounds fractional scores", () => {
    expect(healthStatus(makeHealth({ score: 84.6 }))).toBe("Excellent (85)");
  });
});

describe("healthScoreColor", () => {
  it("clamps scores to 0..100", () => {
    expect(() => healthScoreColor(-50)).not.toThrow();
    expect(() => healthScoreColor(150)).not.toThrow();
  });

  it("returns an rgb() string", () => {
    expect(healthScoreColor(50)).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
  });

  it("matches the label palette at the stops", () => {
    // excellent #4ade80 → rgb(74, 222, 128); dead #f87171 → rgb(248, 113, 113)
    const high = healthScoreColor(100).match(/\d+/g)!.map(Number);
    expect(high).toEqual([74, 222, 128]);
    const low = healthScoreColor(0).match(/\d+/g)!.map(Number);
    expect(low).toEqual([248, 113, 113]);
  });

  it("is green at high scores and red at low scores", () => {
    const high = healthScoreColor(100).match(/\d+/g)!.map(Number);
    const low = healthScoreColor(0).match(/\d+/g)!.map(Number);
    // Green channel dominates at 100, red channel dominates at 0
    expect(high[1]).toBeGreaterThan(high[0]);
    expect(low[0]).toBeGreaterThan(low[1]);
  });
});

describe("fmtAge", () => {
  it("returns — for missing age", () => {
    expect(fmtAge(0)).toBe("—");
    expect(fmtAge(NaN)).toBe("—");
  });

  it("formats minutes", () => {
    expect(fmtAge(45)).toBe("<1m");
    expect(fmtAge(60)).toBe("1m");
    expect(fmtAge(3600 - 1)).toBe("59m");
  });

  it("formats hours and minutes", () => {
    expect(fmtAge(3600)).toBe("1h 0m");
    expect(fmtAge(3725)).toBe("1h 2m");
  });

  it("formats days and hours", () => {
    expect(fmtAge(90000)).toBe("1d 1h");
    expect(fmtAge(172800 + 7200)).toBe("2d 2h");
  });
});

describe("fmtAvailability", () => {
  it("returns — for missing values", () => {
    expect(fmtAvailability(undefined)).toBe("—");
    expect(fmtAvailability(NaN)).toBe("—");
  });

  it("formats as percentage", () => {
    expect(fmtAvailability(1)).toBe("100%");
    expect(fmtAvailability(0.5)).toBe("50%");
    expect(fmtAvailability(0.1234)).toBe("12%");
  });

  it("clamps out-of-range values", () => {
    expect(fmtAvailability(2)).toBe("100%");
    expect(fmtAvailability(-1)).toBe("0%");
  });
});

describe("healthTitle", () => {
  it("returns unknown for missing health", () => {
    expect(healthTitle(null)).toBe("Health: unknown");
  });

  it("includes score, seeds, peers, age and availability", () => {
    const title = healthTitle(makeHealth({ age_secs: 3600, availability: 0.8 }));
    expect(title).toContain("Health: Excellent (85)");
    expect(title).toContain("Seed sources: 12");
    expect(title).toContain("Peers: 4");
    expect(title).toContain("Added: 1h 0m ago");
    expect(title).toContain("Availability: ~80%");
  });
});
