import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename, appendFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mean, quantile, summarize, validateBars, features, forward, outlook, evaluate, runs, waves, csv } from "./lib/core.mjs";
import { renderReport, fanSvg, historySvg } from "./lib/report.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = JSON.parse(await readFile(path.join(ROOT, "config.json"), "utf8"));
const COPY = JSON.parse(await readFile(path.join(ROOT, "report-copy.zh-CN.json"), "utf8"));
const OFFLINE = process.argv.includes("--offline");
const REFRESH = process.argv.includes("--refresh");
const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { console.error(`Interrupted by ${signal}; committed data can be reused with --offline.`); controller.abort(); process.exitCode = 130; });
const hash = (text) => createHash("sha256").update(text).digest("hex");
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const file = (...parts) => path.join(ROOT, ...parts);
async function atomic(target, text) {
  controller.signal.throwIfAborted();
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, text, "utf8");
  await rename(temporary, target);
}
async function readJson(target) {
  try { return JSON.parse(await readFile(target, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
function parseCsv(text) {
  return text.trim().split(/\r?\n/).slice(1).map((line) => {
    const [date, open, high, low, close] = line.replaceAll('"', "").split(",");
    return { date, open: Number(open), high: Number(high), low: Number(low), close: Number(close) };
  });
}
function completeDate(date) {
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const get = (key) => parts.find((p) => p.type === key)?.value;
  const today = `${get("year")}-${get("month")}-${get("day")}`;
  return date < today || (date === today && Number(get("hour")) * 60 + Number(get("minute")) >= 15 * 60 + 45);
}
async function fetchText(url, accept) {
  const response = await fetch(url, { headers: { Accept: accept, "User-Agent": "Independent-Nikkei-Daily-Research/1.0" }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
  let bytes = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > CONFIG.maximumResponseBytes) throw new Error("Response exceeds configured byte limit");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
async function record(entry) {
  await appendFile(file("data", "source_registry.jsonl"), `${JSON.stringify(entry)}\n`, "utf8");
}

async function acquire() {
  const configHash = hash(json(CONFIG));
  let state = await readJson(file("data", "state", "sync.json"));
  if (state && (state.schemaVersion !== CONFIG.schemaVersion || state.configHash !== configHash)) throw new Error("Incompatible sync state: preserve this folder and use a separate folder for a changed configuration");
  let seedMetadata;
  if (!state) {
    const seedText = await readFile(path.resolve(ROOT, CONFIG.seedPath), "utf8");
    const seedManifest = await readJson(path.resolve(ROOT, CONFIG.seedManifestPath));
    if (!seedManifest?.data?.fetchedAt) throw new Error("Seed acquisition provenance is missing");
    const bars = parseCsv(seedText);
    validateBars(bars, CONFIG.maximumBars);
    seedMetadata = { source: "read-only copy of existing Yahoo ^N225 normalized history", sourcePath: CONFIG.seedPath,
      copiedAt: new Date().toISOString(), originalFetchedAt: seedManifest.data.fetchedAt,
      originalManifest: CONFIG.seedManifestPath, sha256: hash(seedText), rows: bars.length, lastDate: bars.at(-1).date };
    await atomic(file("data", "raw", "seed-normalized.csv"), seedText);
    await atomic(file("data", "raw", "seed-provenance.json"), json(seedMetadata));
    state = { schemaVersion: CONFIG.schemaVersion, configHash, bars, seedMetadata, fetchedAt: null };
    await record({ ...seedMetadata, type: "seed_copy" });
  }
  const fresh = state.fetchedAt && Date.now() - Date.parse(state.fetchedAt) < CONFIG.sourceTtlHours * 3600000;
  if (!OFFLINE && (!fresh || REFRESH)) {
    const overlapStart = new Date(`${state.bars.at(-1).date}T00:00:00Z`).getTime() - 14 * 86400000;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/%5EN225?period1=${Math.floor(overlapStart / 1000)}&period2=${Math.floor(Date.now() / 1000) + 86400}&interval=1d&events=history`;
    const raw = await fetchText(url, "application/json"), payload = JSON.parse(raw);
    const series = payload?.chart?.result?.[0], quote = series?.indicators?.quote?.[0];
    if (series?.meta?.symbol !== CONFIG.symbol || series?.meta?.instrumentType !== "INDEX" || !quote || !series.timestamp?.length) throw new Error("Unexpected Yahoo series identity or empty response");
    const accepted = [], rejected = [];
    for (let i = 0; i < series.timestamp.length; i++) {
      const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date(series.timestamp[i] * 1000));
      const values = [quote.open?.[i], quote.high?.[i], quote.low?.[i], quote.close?.[i]];
      if (!values.every((x) => typeof x === "number" && Number.isFinite(x) && x > 0) || !completeDate(date)) { rejected.push(date); continue; }
      accepted.push({ date, open: values[0], high: values[1], low: values[2], close: values[3] });
    }
    validateBars(accepted, CONFIG.maximumBars);
    const merged = new Map(state.bars.map((b) => [b.date, b])), revisions = [];
    for (const bar of accepted) {
      const old = merged.get(bar.date);
      if (old && ["open", "high", "low", "close"].some((key) => Math.abs(old[key] - bar[key]) > 0.02)) revisions.push({ date: bar.date, old, new: bar });
      // Existing accepted prices stay locked; revisions are disclosed rather than silently spliced.
      if (!old) merged.set(bar.date, bar);
    }
    state.bars = [...merged.values()].sort((a, b) => a.date.localeCompare(b.date));
    validateBars(state.bars, CONFIG.maximumBars);
    const accessedAt = new Date().toISOString(), digest = hash(raw);
    const rawPath = `data/raw/yahoo-${digest.slice(0, 16)}.json`;
    await atomic(file(rawPath), raw);
    state.yahoo = { url, accessedAt, rawPath, sha256: digest, acceptedRows: accepted.length, rejectedDates: rejected, revisions, providerLastDate: accepted.at(-1).date };
    state.fetchedAt = accessedAt;
    await record({ type: "yahoo_incremental", ...state.yahoo });
  }
  if (!OFFLINE && (!fresh || REFRESH || !state.official)) {
    const url = "https://indexes.nikkei.co.jp/nkave/historical/nikkei_stock_average_daily_en.csv";
    const accessedAt = new Date().toISOString();
    try {
      const text = await fetchText(url, "text/csv");
      if (!text.replace(/^\uFEFF/, "").startsWith("Date of Data,Close,Open,High,Low")) throw new Error("Unexpected official CSV header");
      const official = text.split(/\r?\n/).slice(1).map((line) => line.replaceAll('"', "").split(",")).filter(([date, close]) => /^\d{4}\/\d{2}\/\d{2}$/.test(date) && Number(close) > 0).map(([date, close]) => ({ date: date.replaceAll("/", "-"), close: Number(close) })).filter((b) => completeDate(b.date)).sort((a, b) => a.date.localeCompare(b.date));
      const map = new Map(state.bars.map((b) => [b.date, b.close]));
      const errors = official.filter((b) => map.has(b.date)).map((b) => Math.abs(map.get(b.date) / b.close - 1) * 100);
      if (!errors.length || Math.max(...errors) > 0.05) throw new Error("Official overlap is empty or exceeds 0.05 percent tolerance");
      state.official = { status: "ok", url, accessedAt, firstDate: official[0].date, lastDate: official.at(-1).date,
        overlapDates: errors.length, meanAbsoluteCloseErrorPct: mean(errors), maxAbsoluteCloseErrorPct: Math.max(...errors), rawStored: false };
    } catch (error) {
      controller.signal.throwIfAborted();
      state.official = { status: "failed", url, accessedAt, error: error.message, rawStored: false };
      console.error(`Official validation failed: ${error.message}`);
    }
    await record({ type: "official_validation", ...state.official });
  }
  if (!state.fetchedAt) state.fetchedAt = state.seedMetadata.originalFetchedAt;
  state.dataHash = hash(csv(state.bars));
  state.lastAcceptedDate = state.bars.at(-1).date;
  await atomic(file("data", "state", "sync.json"), json(state));
  await atomic(file("data", "processed", "nikkei225-daily.csv"), csv(state.bars));
  return state;
}

function compute(state) {
  const fs = features(state.bars, CONFIG.dailyBoundariesPct), start = fs.findIndex((f) => f.date >= CONFIG.analysisStart);
  const bars = state.bars.slice(start), main = fs.slice(start), daily = main.map((f) => f.daily);
  const periods = [{ label: "all", ...summarize(daily) }, { label: "recent", ...summarize(daily.slice(-1260)) },
    ...[["2000-2009", "2000", "2010"], ["2010-2019", "2010", "2020"], ["2020+", "2020", "9999"]].map(([label, lo, hi]) => ({ label, ...summarize(main.filter((f) => f.date >= lo && f.date < hi).map((f) => f.daily)) }))];
  const predictions = CONFIG.horizons.map((h) => outlook(state.bars, fs, fs.length - 1, h, CONFIG));
  const labels = ["< -3%", "[-3%, -2%)", "[-2%, -1%)", "[-1%, 0%)", "[0%, 1%)", "[1%, 2%)", "[2%, 3%)", ">= 3%"];
  const bucketSummary = labels.map((label, b) => {
    const indices = main.map((f, i) => f.bucket === b ? i + start : null).filter((i) => i !== null);
    const values = (h) => indices.map((i) => forward(state.bars, i, h)?.terminal).filter((v) => v !== undefined);
    return { label, n: indices.length, mean1: mean(values(1)), mean5: mean(values(5)), mean20: mean(values(20)), probability20: mean(values(20).map((x) => Number(x > 0))), n1: values(1).length, n5: values(5).length, n20: values(20).length };
  });
  const runData = runs(bars), waveData = CONFIG.waveThresholdsPct.map((threshold) => waves(bars, threshold));
  const summary = (rows, direction) => {
    const chosen = rows.filter((r) => r.direction === direction);
    return { direction, ...summarize(chosen.map((r) => r.move)), absQ90: quantile(chosen.map((r) => Math.abs(r.move)), 0.9), durationMedian: quantile(chosen.map((r) => r.sessions), 0.5), lag: quantile(chosen.map((r) => r.confirmationLag).filter(Number.isFinite), 0.5) };
  };
  return { generatedAt: new Date().toISOString(), offline: OFFLINE, firstDate: main[0].date, barCount: main.length, current: main.at(-1), features: main,
    periods, outlook: predictions, bucketSummary, runSummary: ["up", "down"].map((d) => summary(runData.completed, d)),
    waveSummary: waveData.flatMap((w, i) => ["up", "down"].map((d) => ({ thresholdPct: CONFIG.waveThresholdsPct[i], ...summary(w.completed, d) }))),
    currentWaves: waveData.map((w) => w.current), confirmedWaves: waveData.flatMap((w) => w.completed), completedRuns: runData.completed,
    evaluation: evaluate(state.bars, fs, CONFIG), sources: { seed: state.seedMetadata, yahoo: state.yahoo, official: state.official } };
}

async function main() {
  if (process.argv.includes("--help")) { console.log("Usage: node research/nikkei-daily-move-outlook/analyze.mjs [--offline | --refresh]\nAll writes are confined to this study directory; no application imports or server."); return; }
  if (process.argv.some((arg, i) => i > 1 && !["--offline", "--refresh"].includes(arg))) throw new Error("Unknown option");
  if (OFFLINE && REFRESH) throw new Error("Choose either --offline or --refresh");
  await mkdir(file("data"), { recursive: true });
  // Cleanup is limited to interrupted atomic-write temporary files; raw backups are retained.
  for (const dir of [file("data", "state"), file("output")]) {
    for (const name of await readdir(dir).catch((e) => { if (e.code === "ENOENT") return []; throw e; })) if (name.endsWith(".tmp")) await unlink(path.join(dir, name));
  }
  console.log("Acquiring and validating independent Nikkei daily snapshot...");
  const state = await acquire();
  console.log(`Accepted ${state.bars.length} bars through ${state.lastAcceptedDate}; calculating fixed-rule distributions and chronological evaluation.`);
  const result = compute(state);
  controller.signal.throwIfAborted();
  const artifacts = [
    ["data/processed/daily-features.csv", csv(result.features)], ["output/outlook.csv", csv(result.outlook)],
    ["output/daily-distribution.csv", csv(result.periods)], ["output/conditional-buckets.csv", csv(result.bucketSummary)],
    ["output/confirmed-waves.csv", csv(result.confirmedWaves)], ["output/completed-runs.csv", csv(result.completedRuns)],
    ["output/wave-summary.csv", csv(result.waveSummary)], ["output/evaluation-summary.csv", csv(result.evaluation.rows)],
    ["output/evaluation-predictions.csv", csv(result.evaluation.predictions)],
    ["output/outcome-ranges.svg", fanSvg(result.outlook, COPY)], ["output/recent-history.svg", historySvg(result.features, COPY)],
    ["output/report.zh-CN.html", renderReport(result, COPY)]
  ];
  for (const [name, content] of artifacts) await atomic(file(name), content);
  const manifest = { study: "nikkei-daily-move-outlook", status: "complete", generatedAt: result.generatedAt, schemaVersion: CONFIG.schemaVersion,
    config: CONFIG, configHash: hash(json(CONFIG)), dataHash: state.dataHash, sources: result.sources,
    analysis: { firstDate: result.firstDate, lastDate: result.current.date, bars: result.barCount, current: result.current },
    offline: OFFLINE, runtime: { node: process.version, peakRssBytes: process.resourceUsage().maxRSS * 1024 },
    validation: result.evaluation.rows, artifactHashes: Object.fromEntries(artifacts.map(([name, content]) => [name, hash(content)])),
    limitations: ["Exploratory chronological evaluation, not an untouched holdout", "Training outcomes overlap", "Empirical outcome ranges are not confidence intervals", "Close-anchored price-index returns are not executable strategy profits", "Official raw CSV not retained", "Existing accepted prices are locked; any provider revisions are recorded"] };
  await atomic(file("output", "run-manifest.json"), json(manifest));
  await atomic(file("data", "state", "completion.json"), json({ schemaVersion: CONFIG.schemaVersion, configHash: manifest.configHash, dataHash: state.dataHash, generatedAt: result.generatedAt, lastDate: result.current.date, manifestHash: hash(json(manifest)) }));
  console.log(json({ report: file("output", "report.zh-CN.html"), lastDate: result.current.date, close: result.current.close, dailyStats: result.periods[0], outlook: result.outlook.map(({ baseline, ...r }) => ({ ...r, baselineProbability: baseline.upProbability })), evaluation: result.evaluation.rows }));
}
main().catch((error) => { console.error(error.stack ?? error); process.exitCode = controller.signal.aborted ? 130 : 1; });
