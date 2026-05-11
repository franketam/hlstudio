#!/usr/bin/env node
/**
 * Auditoría Lighthouse mobile para HLstudio.
 *
 * Corre Lighthouse contra dos URLs (landing y paso 1 del flow de reserva)
 * emulando un dispositivo móvil de gama media (Moto G4 — el preset estándar
 * de Lighthouse mobile). Reporta scores a stdout, guarda JSON crudo en
 * ./lighthouse-reports/ y devuelve exit code 1 si alguna categoría queda
 * por debajo del umbral configurado.
 *
 * Uso:
 *   node scripts/lighthouse-audit.mjs
 *   BASE=https://staging.hlstudio.com.ar node scripts/lighthouse-audit.mjs
 *
 * Requiere: lighthouse + chrome-launcher (devDeps).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

const BASE = (process.env.BASE ?? "https://hlstudio.com.ar").replace(/\/$/, "");
const IS_LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)/i.test(BASE);

const TARGETS = [
  { name: "landing", url: `${BASE}/` },
  { name: "reservar-paso1", url: `${BASE}/reservar` },
];

// Umbrales mínimos (% × 100). Performance/Accessibility/Best-practices son KPI,
// SEO lo medimos como observable pero no es bloqueante.
//
// En localhost, performance se afloja a 85: `next start` no aplica compresión
// agresiva ni caché del optimizador de imágenes (cada cold start regenera
// thumbs), así que el score local subestima al de producción ~3-5 puntos.
// El criterio del brief (>=90 mobile) se mide contra producción.
const THRESHOLDS = {
  performance: IS_LOCAL ? 85 : 90,
  accessibility: 90,
  "best-practices": 90,
  seo: 80,
};

const REPORTS_DIR = path.join(PROJECT_ROOT, "lighthouse-reports");

/** @param {number | null | undefined} score 0..1 */
function pct(score) {
  if (score == null) return 0;
  return Math.round(score * 100);
}

/** Coloreo simple para terminal sin deps. */
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
};

function colorForScore(score, threshold) {
  if (score >= threshold) return c.green;
  if (score >= threshold - 10) return c.yellow;
  return c.red;
}

/**
 * Corre Lighthouse contra una URL. Devuelve { categories, audits } del LHR.
 * @param {string} url
 * @param {number} port puerto de Chrome ya lanzado
 */
async function runOne(url, port) {
  const options = {
    logLevel: "error",
    output: "json",
    onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
    port,
    // Preset mobile (Moto G4, throttling 4G simulado). Coincide con cómo
    // PageSpeed Insights reporta su nota mobile pública.
    formFactor: "mobile",
    screenEmulation: {
      mobile: true,
      width: 412,
      height: 823,
      deviceScaleFactor: 1.75,
      disabled: false,
    },
    emulatedUserAgent:
      "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    throttling: {
      rttMs: 150,
      throughputKbps: 1638.4,
      cpuSlowdownMultiplier: 4,
      requestLatencyMs: 0,
      downloadThroughputKbps: 0,
      uploadThroughputKbps: 0,
    },
  };

  const runnerResult = await lighthouse(url, options);
  if (!runnerResult) throw new Error(`Lighthouse no devolvió resultado para ${url}`);
  return runnerResult;
}

function printSummary(name, url, lhr) {
  const cats = lhr.categories;
  console.log(`\n${c.bold}${c.cyan}── ${name}${c.reset}  ${c.dim}${url}${c.reset}`);
  const rows = [
    ["Performance", pct(cats.performance?.score), THRESHOLDS.performance],
    ["Accessibility", pct(cats.accessibility?.score), THRESHOLDS.accessibility],
    ["Best Practices", pct(cats["best-practices"]?.score), THRESHOLDS["best-practices"]],
    ["SEO", pct(cats.seo?.score), THRESHOLDS.seo],
  ];
  for (const [label, score, thr] of rows) {
    const col = colorForScore(score, thr);
    const mark = score >= thr ? "✓" : "✗";
    console.log(`  ${col}${mark} ${label.padEnd(16)} ${String(score).padStart(3)}/100${c.reset}  ${c.dim}(min ${thr})${c.reset}`);
  }

  // Métricas web vitals clave
  const audits = lhr.audits;
  const m = (key) => audits[key]?.displayValue ?? "—";
  console.log(`  ${c.dim}LCP: ${m("largest-contentful-paint")} · CLS: ${m("cumulative-layout-shift")} · TBT: ${m("total-blocking-time")}${c.reset}`);

  // Top 3 oportunidades de performance (si las hay)
  const opportunities = Object.values(audits)
    .filter((a) => a.details?.type === "opportunity" && (a.score ?? 1) < 0.9)
    .sort((a, b) => (b.numericValue ?? 0) - (a.numericValue ?? 0))
    .slice(0, 3);
  if (opportunities.length > 0) {
    console.log(`  ${c.dim}Top opportunities:${c.reset}`);
    for (const op of opportunities) {
      const savings = op.details?.overallSavingsMs ? ` (-${Math.round(op.details.overallSavingsMs)}ms)` : "";
      console.log(`    ${c.dim}· ${op.title}${savings}${c.reset}`);
    }
  }

  // Failed a11y audits
  const a11yFails = Object.values(audits)
    .filter((a) => a.scoreDisplayMode === "binary" && a.score === 0)
    .filter((a) => cats.accessibility?.auditRefs.some((r) => r.id === a.id))
    .slice(0, 5);
  if (a11yFails.length > 0) {
    console.log(`  ${c.dim}A11y fails:${c.reset}`);
    for (const a of a11yFails) {
      console.log(`    ${c.dim}· ${a.title}${c.reset}`);
    }
  }
}

async function main() {
  await fs.mkdir(REPORTS_DIR, { recursive: true });

  console.log(`${c.bold}Lighthouse audit — mobile${c.reset}  ${c.dim}base=${BASE}${c.reset}`);

  const chrome = await chromeLauncher.launch({
    chromeFlags: [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
    ],
  });

  const summaries = [];
  let anyBelowThreshold = false;

  try {
    for (const target of TARGETS) {
      console.log(`\n${c.dim}→ corriendo ${target.url}${c.reset}`);
      const result = await runOne(target.url, chrome.port);
      const lhr = result.lhr;

      // Guardar JSON crudo
      const reportPath = path.join(REPORTS_DIR, `${target.name}.json`);
      await fs.writeFile(reportPath, JSON.stringify(lhr, null, 2), "utf8");

      printSummary(target.name, target.url, lhr);

      const scores = {
        performance: pct(lhr.categories.performance?.score),
        accessibility: pct(lhr.categories.accessibility?.score),
        "best-practices": pct(lhr.categories["best-practices"]?.score),
        seo: pct(lhr.categories.seo?.score),
      };
      summaries.push({ name: target.name, url: target.url, scores });

      for (const [key, threshold] of Object.entries(THRESHOLDS)) {
        if (scores[key] < threshold) {
          anyBelowThreshold = true;
        }
      }
    }
  } finally {
    await chrome.kill();
  }

  // Resumen final
  console.log(`\n${c.bold}── Resumen${c.reset}`);
  for (const s of summaries) {
    console.log(
      `  ${s.name.padEnd(22)} perf ${s.scores.performance} · a11y ${s.scores.accessibility} · bp ${s.scores["best-practices"]} · seo ${s.scores.seo}`
    );
  }
  console.log(`\nReportes JSON: ${c.dim}${REPORTS_DIR}${c.reset}`);

  if (anyBelowThreshold) {
    console.log(`\n${c.red}${c.bold}✗ FAIL${c.reset} — al menos una categoría debajo del umbral.`);
    process.exit(1);
  }
  console.log(`\n${c.green}${c.bold}✓ OK${c.reset} — todas las categorías cumplen el umbral.`);
}

main().catch((err) => {
  console.error("\nError en lighthouse-audit:", err);
  process.exit(2);
});
