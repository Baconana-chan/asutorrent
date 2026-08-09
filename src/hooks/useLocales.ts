import { signal, effect } from "@preact/signals";
import type { LocaleData } from "../locales/types";
import { data as en } from "../locales/en";
import { data as enGb } from "../locales/enGb";
import { data as enPirate } from "../locales/enPirate";
import { data as enAnime } from "../locales/enAnime";
import { data as enUwu } from "../locales/enUwu";
import { data as enCaveman } from "../locales/enCaveman";
import { data as enOld } from "../locales/enOld";
import { data as enNyc } from "../locales/enNyc";
import { data as enTexan } from "../locales/enTexan";
import { data as ru } from "../locales/ru";
import { data as de } from "../locales/de";
import { data as da } from "../locales/da";
import { data as fr } from "../locales/fr";
import { data as it } from "../locales/it";
import { data as es } from "../locales/es";
import { data as id } from "../locales/id";
import { data as zh } from "../locales/zh";
import { data as zhTw } from "../locales/zhTw";
import { data as ja } from "../locales/ja";
import { data as ko } from "../locales/ko";
import { data as pl } from "../locales/pl";
import { data as sv } from "../locales/sv";
import { data as nl } from "../locales/nl";
import { data as pt } from "../locales/pt";
import { data as ptBr } from "../locales/ptBr";
import { data as uk } from "../locales/uk";

// ── Available locales ───────────────────────────────────────────
export type LocaleCode = "en" | "en-gb" | "en-pirate" | "en-anime" | "en-uwu" | "en-caveman" | "en-old" | "en-nyc" | "en-texan" | "ru" | "de" | "da" | "fr" | "it" | "es" | "id" | "zh" | "zh-tw" | "ja" | "ko" | "pl" | "pt" | "pt-br" | "sv" | "nl" | "uk";

export type LocaleGroup = "real" | "fan";

export const LOCALES: { code: LocaleCode; name: string; native: string; group: LocaleGroup }[] = [
  // ── Real languages ─────────────────────────────────────────
  { code: "en", name: "English", native: "English", group: "real" },
  { code: "en-gb", name: "British English", native: "British English 🇬🇧", group: "real" },
  { code: "ru", name: "Russian", native: "Русский", group: "real" },
  { code: "de", name: "German", native: "Deutsch", group: "real" },
  { code: "da", name: "Danish", native: "Dansk", group: "real" },
  { code: "fr", name: "French", native: "Français", group: "real" },
  { code: "it", name: "Italian", native: "Italiano", group: "real" },
  { code: "es", name: "Spanish", native: "Español", group: "real" },
  { code: "id", name: "Indonesian", native: "Bahasa Indonesia", group: "real" },
  { code: "zh", name: "Chinese (Simplified)", native: "简体中文", group: "real" },
  { code: "zh-tw", name: "Chinese (Traditional)", native: "繁體中文", group: "real" },
  { code: "ja", name: "Japanese", native: "日本語", group: "real" },
  { code: "ko", name: "Korean", native: "한국어", group: "real" },
  { code: "pl", name: "Polish", native: "Polski", group: "real" },
  { code: "sv", name: "Swedish", native: "Svenska", group: "real" },
  { code: "nl", name: "Dutch", native: "Nederlands", group: "real" },
  { code: "pt", name: "Portuguese", native: "Português", group: "real" },
  { code: "pt-br", name: "Portuguese (Brazil)", native: "Português (Brasil)", group: "real" },
  { code: "uk", name: "Ukrainian", native: "Українська", group: "real" },
  // ── Fan languages ──────────────────────────────────────────
  { code: "en-pirate", name: "Pirate", native: "Pirate ☠️", group: "fan" },
  { code: "en-anime", name: "Anime English", native: "Anime English ✿", group: "fan" },
  { code: "en-uwu", name: "UwU", native: "UwU 🐾", group: "fan" },
  { code: "en-caveman", name: "Caveman", native: "Caveman 🦴", group: "fan" },
  { code: "en-old", name: "Old English", native: "Old English 🏰", group: "fan" },
  { code: "en-nyc", name: "New York", native: "New York 🗽", group: "fan" },
  { code: "en-texan", name: "Texan", native: "Texan 🤠", group: "fan" },
];

// ── Locale data (per-language modules under src/locales/) ────────
const locales: Record<LocaleCode, LocaleData> = {
  en,
  "en-gb": enGb,
  "en-pirate": enPirate,
  "en-anime": enAnime,
  "en-uwu": enUwu,
  "en-caveman": enCaveman,
  "en-old": enOld,
  "en-nyc": enNyc,
  "en-texan": enTexan,
  ru,
  de,
  da,
  fr,
  it,
  es,
  id,
  zh,
  "zh-tw": zhTw,
  ja,
  ko,
  pl,
  sv,
  nl,
  pt,
  "pt-br": ptBr,
  uk,
};

// ── Reactive singleton ──────────────────────────────────────────
export const locale = signal<LocaleCode>(
  (localStorage.getItem("asutorrent-locale") as LocaleCode) || "en"
);

// ── Reactive noCase toggle (strips caps, dots, and commas) ─────
export const noCase = signal<boolean>(
  localStorage.getItem("asutorrent-nocase") === "true"
);

// Sync noCase to a data attribute on <html> so CSS can react to it
effect(() => {
  document.documentElement.toggleAttribute("data-no-case", noCase.value);
});

function applyNoCase(text: string): string {
  if (!noCase.value) return text;
  return text.toLowerCase().replace(/\./g, "").replace(/,/g, "");
}

// ── Translation function ────────────────────────────────────────
// Missing keys fall back to English, then to the explicit fallback,
// then to the key itself — so partial translations are always safe.
export function t(key: string, fallback?: string): string {
  const loc = locale.value || "en";
  const data = locales[loc] ?? locales.en;
  const text = data[key] ?? locales.en[key] ?? fallback ?? key;
  // Surface incomplete translations during development only.
  const isDev = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV;
  if (
    isDev &&
    loc !== "en" &&
    data[key] === undefined &&
    locales.en[key] !== undefined &&
    fallback === undefined
  ) {
    console.warn(`[i18n] Missing "${key}" in locale "${loc}" — falling back to English`);
  }
  return applyNoCase(text);
}

// ── Convenience: update a locale's translations ──────────────────
export function setLocaleData(code: LocaleCode, data: Partial<LocaleData>) {
  if (!locales[code]) locales[code] = { ...en };
  Object.assign(locales[code], data);
}

// ── Set initial lang attribute ──────────────────────────────────
if (typeof document !== "undefined") {
  document.documentElement.setAttribute("lang", locale.value);
}
