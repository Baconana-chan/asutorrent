import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock @preact/signals to avoid requiring component context
vi.mock("@preact/signals", () => ({
  useSignal: (initial: string) => ({ value: initial }),
}));

// Now import the module after mocking
import { t, LOCALES } from "../hooks/useLocales";

describe("useLocales", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns the key as fallback when no translation exists", () => {
    const result = t("nonexistent.key");
    expect(result).toBe("nonexistent.key");
  });

  it("returns the fallback string when provided and key missing", () => {
    const result = t("nonexistent.key", "Fallback Text");
    expect(result).toBe("Fallback Text");
  });

  it("returns English translation for known keys", () => {
    expect(t("toolbar.add")).toBe("Add");
    expect(t("about.title")).toBe("About AsuTorrent");
    expect(t("general.ok")).toBe("OK");
  });

  it("has all required locale codes", () => {
    const codes = LOCALES.map((l) => l.code);
    expect(codes).toContain("en");
    expect(codes).toContain("ru");
    expect(codes).toContain("de");
    expect(codes).toContain("fr");
    expect(codes).toContain("es");
    expect(codes).toContain("zh");
    expect(codes).toContain("zh-tw");
    expect(codes).toContain("ja");
    expect(codes).toContain("ko");
    expect(codes).toContain("pl");
    expect(codes).toContain("uk");
    expect(codes).toContain("en-pirate");
    expect(LOCALES.length).toBeGreaterThanOrEqual(12);
  });

  it("each locale has a name and native name", () => {
    for (const l of LOCALES) {
      expect(l.name).toBeTruthy();
      expect(l.native).toBeTruthy();
    }
  });

  it("update keys are present for the update dialog", () => {
    expect(t("update.title")).toBe("Update Available");
    expect(t("update.download")).toBe("Download");
    expect(t("update.skip")).toBe("Skip This Version");
    expect(t("update.check_now")).toBe("Check for updates");
  });
});
