import { describe, it, expect } from "vitest";
import {
  fmtBytes,
  fmtSpeed,
  fmtLimit,
  fmtETA,
  fmtDuration,
  fmtRatio,
  fmtDate,
} from "../utils/format";

describe("fmtBytes", () => {
  it("returns '0 B' for zero", () => {
    expect(fmtBytes(0)).toBe("0 B");
  });

  it("formats negative values as '0 B'", () => {
    expect(fmtBytes(-100)).toBe("0 B");
  });

  it("formats bytes with default suffix", () => {
    expect(fmtBytes(500)).toBe("500.0 B");
    expect(fmtBytes(1023)).toBe("1023.0 B");
  });

  it("formats KB", () => {
    expect(fmtBytes(1024)).toBe("1.0 KB");
    expect(fmtBytes(1536)).toBe("1.5 KB");
  });

  it("formats MB", () => {
    expect(fmtBytes(1048576)).toBe("1.0 MB");
    expect(fmtBytes(1572864)).toBe("1.5 MB");
  });

  it("formats GB with 2 decimals", () => {
    const oneGb = 1073741824;
    expect(fmtBytes(oneGb)).toBe("1.00 GB");
    expect(fmtBytes(oneGb * 2.5)).toBe("2.50 GB");
  });

  it("formats TB with 2 decimals", () => {
    const oneTb = 1099511627776;
    expect(fmtBytes(oneTb)).toBe("1.00 TB");
  });

  it("accepts custom suffix", () => {
    expect(fmtBytes(1500, "B/s")).toBe("1.5 KB/s");
    expect(fmtBytes(1500, "bps")).toBe("1.5 Kbps");
  });
});

describe("fmtSpeed", () => {
  it("returns '0 B/s' for zero", () => {
    expect(fmtSpeed(0)).toBe("0 B/s");
  });

  it("formats speed values", () => {
    expect(fmtSpeed(500)).toBe("500.0 B/s");
    expect(fmtSpeed(1500)).toBe("1.5 KB/s");
    expect(fmtSpeed(1048576)).toBe("1.0 MB/s");
  });
});

describe("fmtLimit", () => {
  it("returns ∞ for null", () => {
    expect(fmtLimit(null)).toBe("\u221E");
  });

  it("returns ∞ for zero", () => {
    expect(fmtLimit(0)).toBe("\u221E");
  });

  it("formats KB/s limits without decimals", () => {
    expect(fmtLimit(512000)).toBe("500 KB/s");
    expect(fmtLimit(102400)).toBe("100 KB/s");
  });

  it("formats MB/s limits with 1 decimal", () => {
    expect(fmtLimit(1048576)).toBe("1.0 MB/s");
    expect(fmtLimit(52428800)).toBe("50.0 MB/s");
  });
});

describe("fmtETA", () => {
  it("returns empty string for null", () => {
    expect(fmtETA(null)).toBe("");
  });

  it("returns empty string for zero/negative", () => {
    expect(fmtETA(0)).toBe("");
    expect(fmtETA(-5)).toBe("");
  });

  it("formats seconds", () => {
    expect(fmtETA(30)).toBe("30s");
    expect(fmtETA(59)).toBe("59s");
  });

  it("formats minutes and seconds", () => {
    expect(fmtETA(65)).toBe("1m 5s");
    expect(fmtETA(125)).toBe("2m 5s");
  });

  it("formats hours and minutes", () => {
    expect(fmtETA(3600)).toBe("1h 0m");
    expect(fmtETA(3725)).toBe("1h 2m");
  });

  it("formats days and hours", () => {
    expect(fmtETA(90000)).toBe("1d 1h");
    expect(fmtETA(172800)).toBe("2d 0h");
  });
});

describe("fmtDuration", () => {
  it("returns '0s' for zero", () => {
    expect(fmtDuration(0)).toBe("0s");
  });

  it("formats seconds only", () => {
    expect(fmtDuration(30)).toBe("30s");
  });

  it("formats minutes and seconds", () => {
    expect(fmtDuration(125)).toBe("2m 5s");
  });

  it("formats hours, minutes, seconds", () => {
    expect(fmtDuration(3725)).toBe("1h 2m 5s");
  });

  it("formats full duration", () => {
    expect(fmtDuration(90061)).toBe("1d 1h 1m 1s");
  });
});

describe("fmtRatio", () => {
  it("returns — for zero download", () => {
    expect(fmtRatio(0, 100)).toBe("\u2014");
  });

  it("formats ratio to 3 decimals", () => {
    expect(fmtRatio(100, 50)).toBe("0.500");
    expect(fmtRatio(100, 200)).toBe("2.000");
    expect(fmtRatio(100, 100)).toBe("1.000");
  });
});

describe("fmtDate", () => {
  it("returns — for falsy timestamp", () => {
    expect(fmtDate(0)).toBe("—");
    expect(fmtDate(NaN)).toBe("—");
  });

  it("returns 'Today' for current day", () => {
    const now = Math.floor(Date.now() / 1000);
    const result = fmtDate(now);
    expect(result).toContain("Today");
  });

  it("returns 'Yesterday' for one day ago", () => {
    const yesterday = Math.floor(Date.now() / 1000) - 86400;
    const result = fmtDate(yesterday);
    expect(result).toContain("Yesterday");
  });

  it("returns 'X days ago' for recent dates", () => {
    const threeDays = Math.floor(Date.now() / 1000) - 3 * 86400;
    const result = fmtDate(threeDays);
    expect(result).toContain("days ago");
  });
});
