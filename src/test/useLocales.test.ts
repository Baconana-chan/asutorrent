import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock @preact/signals to avoid requiring component context.
// useLocales.ts uses `signal` and `effect` at module scope, so the mock
// must provide them (and keep useSignal for any hook usage).
vi.mock("@preact/signals", () => ({
  signal: (initial: unknown) => ({ value: initial }),
  effect: () => () => {},
  useSignal: (initial: unknown) => ({ value: initial }),
}));

// Now import the module after mocking
import { t, LOCALES, locale } from "../hooks/useLocales";
import { data as ruData } from "../locales/ru";

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

  it("falls back to English when a key is missing from the active locale", () => {
    const prev = locale.value;
    locale.value = "ru";
    try {
      // Simulate an unfinished translation: temporarily drop one Russian key.
      const key = "status.dht";
      const saved = ruData[key];
      delete ruData[key];
      try {
        expect(t(key)).toBe("DHT"); // English value, not the raw key
      } finally {
        ruData[key] = saved;
      }
    } finally {
      locale.value = prev;
    }
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
    expect(codes).toContain("da");
    expect(codes).toContain("fr");
    expect(codes).toContain("it");
    expect(codes).toContain("es");
    expect(codes).toContain("id");
    expect(codes).toContain("zh");
    expect(codes).toContain("zh-tw");
    expect(codes).toContain("ja");
    expect(codes).toContain("ko");
    expect(codes).toContain("pl");
    expect(codes).toContain("sv");
    expect(codes).toContain("nl");
    expect(codes).toContain("pt");
    expect(codes).toContain("pt-br");
    expect(codes).toContain("uk");
    expect(codes).toContain("en-pirate");
    expect(codes).toContain("en-uwu");
    expect(codes).toContain("en-caveman");
    expect(codes).toContain("en-old");
    expect(codes).toContain("en-nyc");
    expect(codes).toContain("en-texan");
    expect(LOCALES.length).toBeGreaterThanOrEqual(25);
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
