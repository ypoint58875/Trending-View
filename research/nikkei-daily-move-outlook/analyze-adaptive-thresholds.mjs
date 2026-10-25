import { createHash } from "node:crypto";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { csv, validateBars, quantile, mean } from "./lib/core.mjs";
import { movingAverageIntervals, intervalSummary } from "./lib/intervals.mjs";
import { adjacentPairs, amplitudeBucket } from "./lib/relative-intervals.mjs";
import { learnPartitions, fitAdaptiveCandidates, candidateEvidence, optimizeAdaptiveFamilies } from "./lib/adaptive-thresholds.mjs";
import { renderAdaptiveReport } from "./lib/adaptive-report.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const file = (name) => path.join(root, name), hash = (text) => createHash("sha256").update(text).digest("hex");
const json = (value) => JSON.stringify(value, null, 2) + "\n";
async function atomic(name, text) {
  const target = file(name); await mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.tmp`; await writeFile(temp, text, "utf8"); await rename(temp, target);
}
if (process.argv.length > 2) throw new Error("Usage: node research/nikkei-daily-move-outlook/analyze-adaptive-thresholds.mjs");
const configText = await readFile(file("adaptive-config.json"), "utf8"), config = JSON.parse(configText);
const source = await readFile(file("data/processed/nikkei225-daily.csv"), "utf8");
const sourceManifest = JSON.parse(await readFile(file("output/run-manifest.json"), "utf8"));
if (hash(source) !== sourceManifest.dataHash) throw new Error("Source snapshot hash mismatch");
const bars = source.trim().split(/\r?\n/).slice(1).map((line) => {
  const [date, open, high, low, close] = line.replaceAll('"', "").split(",");
  return { date, open: +open, high: +high, low: +low, close: +close };
});
validateBars(bars, config.maximumBars);
const datasets = config.maPeriods.map((period) => movingAverageIntervals(bars, period));
const paired = datasets.map((d) => adjacentPairs(d, config.analysisStart));
const pairs = paired.flatMap((r) => r.pairs), excluded = paired.flatMap((r) => r.excluded);
const partitions = learnPartitions(pairs, config), candidates = fitAdaptiveCandidates(pairs, partitions, config);
const { events, statistics } = candidateEvidence(bars, pairs, partitions, candidates, config, bars.at(-1).date);
const policies = datasets.map((dataset) => optimizeAdaptiveFamilies(bars, dataset, pairs, partitions, candidates, config, statistics));
const census = datasets.flatMap((d) => intervalSummary(d.completed.filter((r) => r.startDate >= config.analysisStart), d.period));
const groupStatistics = partitions.flatMap((bin) => [
  { sample: "training", start: config.analysisStart, end: config.trainingEnd },
  { sample: "validation", start: config.validationStart, end: config.validationEnd },
  { sample: "evaluation", start: config.evaluationStart, end: bars.at(-1).date }
].map((window) => {
  const bins = partitions.filter((b) => b.period === bin.period && b.direction === bin.direction);
  const local = pairs.filter((p) => p.period === bin.period && p.direction === bin.direction &&
    p.startDate >= window.start && p.confirmedDate && p.confirmedDate <= window.end && amplitudeBucket(p.scalePct, bins) === bin.id);
  return { ...bin, sample: window.sample, n: local.length, previousMedianPct: quantile(local.map((p) => p.scalePct), .5),
    nextMedianSignedPct: quantile(local.map((p) => p.movePct), .5), nextAlignedProbability: local.length ? local.filter((p) => p.finalRatio > 0).length / local.length : null,
    finalRatioMedian: quantile(local.map((p) => p.finalRatio), .5) };
}));
const cohorts = policies.flatMap((policy) => (policy.thresholds ?? []).map((threshold) => {
  const trades = policy.run.trades.filter((t) => (threshold.direction === "up" ? t.entryBucket : t.exitBucket) === threshold.bucket);
  return { period: policy.period, bucket: threshold.bucket, direction: threshold.direction, n: trades.length,
    winProbability: trades.length ? trades.filter((t) => t.netReturnPct > 0).length / trades.length : null,
    meanNetTradePct: mean(trades.map((t) => t.netReturnPct)) };
}));
const current = config.maPeriods.map((period) => {
  const pair = pairs.find((p) => p.period === period && p.status === "unfinished" && p.endIndex === bars.length - 1);
  if (!pair) return { period, available: false };
  const bins = partitions.filter((b) => b.period === period && b.direction === pair.direction);
  const bucket = amplitudeBucket(pair.scalePct, bins);
  const threshold = policies.find((p) => p.period === period).thresholds?.find((c) => c.bucket === bucket);
  return { ...pair, available: true, bucket, threshold: threshold?.ratio ?? null,
    observedRatio: pair.sign * pair.movePct / pair.scalePct,
    triggerPrice: threshold ? pair.anchorClose * (1 + pair.sign * threshold.ratio * pair.scalePct / 100) : null };
});
const result = { generatedAt: new Date().toISOString(), config, sourceDataHash: hash(source), lastDate: bars.at(-1).date,
  firstDate: bars.find((b) => b.date >= config.analysisStart).date, lastClose: bars.at(-1).close,
  partitions, candidates, statistics, groupStatistics, census, cohorts, current,
  policies: policies.map(({ run, accuracyRun, benchmarkEquity, grid, ...rest }) => rest),
  chart: policies.filter((p) => p.run).map((p) => ({ period: p.period,
    rows: p.run.equity.filter((_, i, a) => i % 10 === 0 || i === a.length - 1).map((e) => ({ ...e,
      buyHold: p.benchmarkEquity.find((b) => b.date === e.date).value })) })) };
const copy = JSON.parse(await readFile(file("adaptive-copy.zh-CN.json"), "utf8"));
const outputs = [
  ["output/adaptive-report.zh-CN.html", renderAdaptiveReport(result, copy)],
  ["output/adaptive-results.json", json(result)],
  ["output/adaptive-partitions.csv", csv(partitions)],
  ["output/adaptive-interval-census.csv", csv(census)],
  ["output/adaptive-group-statistics.csv", csv(groupStatistics)],
  ["output/adaptive-candidates.csv", csv(candidates)],
  ["output/adaptive-pairs.csv", csv(pairs)], ["output/adaptive-excluded.csv", csv(excluded)],
  ["output/adaptive-first-crossings.csv", csv(events)],
  ["output/adaptive-prediction-evidence.csv", csv(statistics)],
  ["output/adaptive-validation-search.json", json(policies.flatMap((p) => p.grid))],
  ["output/adaptive-trades.csv", csv(policies.flatMap((p) => p.run?.trades ?? []))],
  ["output/adaptive-accuracy-trades.csv", csv(policies.flatMap((p) => p.accuracyRun?.trades ?? []))],
  ["output/adaptive-signals.csv", csv(policies.flatMap((p) => (p.run?.signals ?? []).map((s) => ({ period: p.period, ...s }))))],
  ["output/adaptive-equity.csv", csv(policies.flatMap((p) => (p.run?.equity ?? []).map((e, i) => ({ period: p.period, ...e, buyHold: p.benchmarkEquity[i].value }))))],
  ["output/adaptive-annual.csv", csv(policies.flatMap((p) => (p.annual ?? []).map((r) => ({ period: p.period, ...r }))))],
  ["output/adaptive-cost-sensitivity.csv", csv(policies.flatMap((p) => p.sensitivity ?? []))],
  ["output/adaptive-filtering-comparison.json", json(policies.map((p) => ({ period: p.period, comparisons: p.filteringComparisons })))],
  ["output/adaptive-trade-cohorts.csv", csv(cohorts)]
];
for (const [name, content] of outputs) await atomic(name, content);
const manifest = { study: "distribution-partitioned-relative-thresholds-vs-buy-and-hold", status: "complete",
  generatedAt: result.generatedAt, sourceDataHash: hash(source), configHash: hash(configText), config,
  artifacts: Object.fromEntries(outputs.map(([name, content]) => [name, hash(content)])),
  limitations: ["Historical dates already inspected in prior studies: later evaluation is exploratory, not an untouched holdout.",
    "Price-index proxy excludes dividends; not ETF total return or a tradable fill series.",
    "Coordinate search is bounded and local, not a proof of global optimality.",
    "Group-dependent thresholds optimize validation portfolio return; prediction accuracy is measured separately.",
    "First-crossing outcomes are conditional on an MA-defined opposite interval, not an intrasegment trading trigger."] };
manifest.codeHashes = Object.fromEntries(await Promise.all([
  "analyze-adaptive-thresholds.mjs", "adaptive-copy.zh-CN.json", "lib/adaptive-thresholds.mjs", "lib/adaptive-report.mjs",
  "lib/relative-exits.mjs", "lib/relative-intervals.mjs", "lib/intervals.mjs", "lib/core.mjs"
].map(async (name) => [name, hash(await readFile(file(name), "utf8"))])));
await atomic("output/adaptive-manifest.json", json(manifest));
await atomic("data/state/adaptive-completion.json", json({ schemaVersion: 1, sourceDataHash: manifest.sourceDataHash,
  configHash: manifest.configHash, manifestHash: hash(json(manifest)), completedAt: result.generatedAt }));
console.log(json({ report: file("output/adaptive-report.zh-CN.html"), asOf: result.lastDate, partitions,
  policies: result.policies.map((p) => ({ period: p.period, status: p.status, thresholds: p.thresholds,
    validationCagr: p.validation?.cagrPct, validationBuyHold: p.validationBuyHold?.cagrPct,
    evaluation: p.evaluation, buyHold: p.buyHold, positiveExcessYears: p.annual?.filter((r) => r.excessPct > 0).length })), current }));
