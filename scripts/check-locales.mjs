#!/usr/bin/env node
/**
 * check-locales.mjs — locale parity checker.
 *
 * Compares every locale file in src/locales/ against the English baseline
 * (en.ts) and reports:
 *   • missing keys      — present in en, absent in the locale
 *   • extra keys        — present in the locale, absent in en
 *   • placeholder drift — same key, but the {placeholders} differ between
 *                         en and the locale (breaks t() interpolation)
 *
 * Usage:
 *   node scripts/check-locales.mjs            # full report
 *   node scripts/check-locales.mjs --quiet    # summary line only
 *   node scripts/check-locales.mjs --json     # machine-readable output
 *
 * Exit code: 0 when every locale matches en, 1 when any gap is found
 * (handy for CI).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCALES_DIR = join(ROOT, "src", "locales");
const BASELINE = "en";

const argv = new Set(process.argv.slice(2));
const quiet = argv.has("--quiet");
const asJson = argv.has("--json");

/** Extract the set of dot-namespaced keys from a locale file's source. */
function extractKeys(code) {
  const text = readFileSync(join(LOCALES_DIR, `${code}.ts`), "utf8");
  const keys = [];
  for (const m of text.matchAll(/^\s*"([^"]+)":/gm)) keys.push(m[1]);
  return keys;
}

/** Extract {placeholder} tokens from a translated string. */
function placeholders(value) {
  return (value.match(/\{[a-zA-Z0-9_]+\}/g) || []).sort();
}

const files = readdirSync(LOCALES_DIR)
  .filter((f) => f.endsWith(".ts") && f !== "types.ts")
  .sort();

const baselineKeys = extractKeys(BASELINE);
const baselineSet = new Set(baselineKeys);
const baselinePh = new Map(
  baselineKeys.map((k) => [k, placeholders(readValue(BASELINE, k))])
);

/**
 * Known intentional placeholder deviations. English uses a conditional `{s}`
 * plural marker (StatusBar replaces it with "s" or ""), but languages without
 * English-style plurals — CJK — correctly drop it. Such drops are a no-op at
 * runtime and must not fail the check.
 */
const INTENTIONAL_DRIFT = {
  ja: ["status.torrents"],
  ko: ["status.torrents"],
  zh: ["status.torrents"],
  zhTw: ["status.torrents"],
};

/** Read the raw value for a single key (used for placeholder comparison). */
function readValue(code, key) {
  const text = readFileSync(join(LOCALES_DIR, `${code}.ts`), "utf8");
  const m = text.match(new RegExp(`^\\s*"${escapeRegExp(key)}":\\s*"((?:\\\\.|[^"\\\\])*)"`, "m"));
  return m ? m[1] : null;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const report = { baseline: BASELINE, baselineKeys: baselineKeys.length, locales: [] };
let problemLocales = 0;

for (const file of files) {
  const code = file.replace(/\.ts$/, "");
  if (code === BASELINE) continue;

  const keys = extractKeys(code);
  const keySet = new Set(keys);

  const missing = baselineKeys.filter((k) => !keySet.has(k));
  const extra = keys.filter((k) => !baselineSet.has(k));

  // Placeholder drift on shared keys.
  const phIssues = [];
  const phIntentional = [];
  for (const k of baselineKeys) {
    if (!keySet.has(k)) continue; // already reported as missing
    const a = baselinePh.get(k) || [];
    const b = placeholders(readValue(code, k) ?? "");
    if (a.join("|") === b.join("|")) continue;
    (INTENTIONAL_DRIFT[code] || []).includes(k)
      ? phIntentional.push({ key: k, expected: a, actual: b })
      : phIssues.push({ key: k, expected: a, actual: b });
  }

  const entry = {
    locale: code,
    keys: keys.length,
    missing,
    extra,
    placeholderIssues: phIssues,
    placeholderIntentional: phIntentional,
  };
  report.locales.push(entry);
  if (missing.length || extra.length || phIssues.length) problemLocales++;
}

/* ── Output ─────────────────────────────────────────────────── */

if (asJson) {
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
} else if (quiet) {
  const total = report.locales.length;
  process.stdout.write(
    problemLocales === 0
      ? `OK: ${total} locales × ${report.baselineKeys} keys — parity complete\n`
      : `FAIL: ${problemLocales}/${total} locales have gaps (${report.baselineKeys} keys in ${BASELINE})\n`
  );
} else {
  const pad = (s, n) => String(s).padEnd(n);
  const total = report.locales.length;

  process.stdout.write(
    `Locale parity check — ${total} locales vs ${BASELINE}.ts (${report.baselineKeys} keys)\n\n`
  );
  process.stdout.write(`${pad("locale", 12)}${pad("keys", 7)}${pad("missing", 9)}${pad("extra", 7)}${pad("ph-drift", 10)}status\n`);
  process.stdout.write("─".repeat(58) + "\n");

  for (const e of report.locales) {
    const problems = e.missing.length + e.extra.length + e.placeholderIssues.length;
    const status = problems === 0 ? "✅" : "⚠️  ";
    const intentional = e.placeholderIntentional.length ? " · ℹ️" : "";
    process.stdout.write(
      `${pad(e.locale, 12)}${pad(e.keys, 7)}${pad(e.missing.length, 9)}${pad(e.extra.length, 7)}${pad(e.placeholderIssues.length, 10)}${status}${intentional}\n`
    );
    if (problems > 0) {
      if (e.missing.length) {
        process.stdout.write(`    missing:  ${e.missing.join(", ")}\n`);
      }
      if (e.extra.length) {
        process.stdout.write(`    extra:    ${e.extra.join(", ")}\n`);
      }
      for (const p of e.placeholderIssues) {
        process.stdout.write(
          `    ph-drift: ${p.key} — expected {${p.expected.join("}{")}} got {${p.actual.join("}{")}}\n`
        );
      }
    }
    if (e.placeholderIntentional.length) {
      for (const p of e.placeholderIntentional) {
        process.stdout.write(
          `    ph-ok:    ${p.key} (intentional — {${p.expected.join("}{")}} → {${p.actual.join("}{")}})\n`
        );
      }
    }
  }

  process.stdout.write("\n");
  if (problemLocales === 0) {
    process.stdout.write(`✅ All ${total} locales complete — ${report.baselineKeys} keys each, no placeholder drift.\n`);
  } else {
    process.stdout.write(
      `⚠️  ${problemLocales}/${total} locales have gaps. Missing keys fall back to English at lookup time; placeholder drift breaks t() interpolation.\n`
    );
    process.stdout.write(`(ℹ️ = intentional placeholder deviation, does not count as a failure)\n`);
  }
}

process.exit(problemLocales === 0 ? 0 : 1);
