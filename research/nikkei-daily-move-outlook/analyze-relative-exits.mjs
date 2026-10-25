import { createHash } from "node:crypto";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { csv, validateBars, mean, quantile } from "./lib/core.mjs";
import { movingAverageIntervals } from "./lib/intervals.mjs";
import { adjacentPairs, summarizePairs, fitRelativeCandidates, relativeCrossings, summarizeRelativeCrossings, amplitudeBucket } from "./lib/relative-intervals.mjs";
import { evaluateExitGrid } from "./lib/relative-exits.mjs";
import { renderRelativeReport } from "./lib/relative-report.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const file = (p) => path.join(ROOT, p), hash = (s) => createHash("sha256").update(s).digest("hex");
const json = (x) => `${JSON.stringify(x, null, 2)}\n`;
async function atomic(name, content) {
  const target = file(name); await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, content, "utf8"); await rename(temporary, target);
}
if (process.argv.includes("--help")) {
  console.log("Usage: node research/nikkei-daily-move-outlook/analyze-relative-exits.mjs\nLocal snapshot only. No live orders, account access, or application changes.");
} else {
  if (process.argv.length > 2) throw new Error("Unknown option");
  const configText = await readFile(file("relative-config.json"), "utf8"), config = JSON.parse(configText);
  const sourceText = await readFile(file("data/processed/nikkei225-daily.csv"), "utf8");
  const sourceManifestText = await readFile(file("output/run-manifest.json"), "utf8"), sourceManifest = JSON.parse(sourceManifestText);
  if (hash(sourceText) !== sourceManifest.dataHash) throw new Error("Source snapshot hash mismatch");
  const bars = sourceText.trim().split(/\r?\n/).slice(1).map((line) => {
    const [date, open, high, low, close] = line.replaceAll('"', "").split(",");
    return { date, open: Number(open), high: Number(high), low: Number(low), close: Number(close) };
  });
  validateBars(bars, config.maximumBars);
  const datasets = config.maPeriods.map((period) => movingAverageIntervals(bars, period));
  const paired = datasets.map((d) => adjacentPairs(d, config.analysisStart));
  const pairs = paired.flatMap((r) => r.pairs), excluded = paired.flatMap((r) => r.excluded);
  const candidates = fitRelativeCandidates(pairs, config);
  const crossings = relativeCrossings(bars, pairs, candidates, config.previousAmplitudeBins);
  const groups = [
    { sample: "all", start: config.analysisStart, end: bars.at(-1).date },
    { sample: "training", start: config.analysisStart, end: config.trainingEnd },
    { sample: "validation", start: config.validationStart, end: config.validationEnd },
    { sample: "evaluation", start: config.evaluationStart, end: bars.at(-1).date }
  ];
  const statistics = [], crossingSummary = [];
  for (const group of groups) {
    for (const period of config.maPeriods) for (const direction of ["up", "down"]) for (const bucket of ["all", ...config.previousAmplitudeBins.map((b) => b.id)]) {
      statistics.push({ sample: group.sample, period, direction, bucket, ...summarizePairs(pairs.filter((p) => p.period === period &&
        p.direction === direction && (bucket === "all" || amplitudeBucket(p.scalePct, config.previousAmplitudeBins) === bucket) &&
        p.startDate >= group.start && p.confirmedDate && p.confirmedDate <= group.end)) });
    }
    for (const candidate of candidates) {
      const selected = crossings.filter((r) => r.period === candidate.period && r.direction === candidate.direction &&
        r.bucket === candidate.bucket && r.quantileRank === candidate.quantileRank && r.triggerDate >= group.start && r.triggerDate <= group.end)
        .map((r) => r.confirmedDate && r.confirmedDate <= group.end ? r : { ...r, pairStatus: "unfinished" });
      crossingSummary.push({ sample: group.sample, ...candidate, ...summarizeRelativeCrossings(selected) });
    }
  }
  const policy = evaluateExitGrid(bars, datasets, pairs, candidates, config);
  const operationCohorts = config.maPeriods.flatMap((period) => ["entry", "exit"].flatMap((side) => config.previousAmplitudeBins.map((bin) => {
    const trades = policy.selectedRuns.filter((r) => r.period === period).flatMap((r) => r.trades).filter((t) => t[side + "Bucket"] === bin.id);
    return { period, side, bucket: bin.id, n: trades.length, winProbability: trades.length ? trades.filter((t) => t.netReturnPct > 0).length / trades.length : null,
      meanNetTradePct: mean(trades.map((t) => t.netReturnPct)), medianNetTradePct: quantile(trades.map((t) => t.netReturnPct), 0.5) };
  })));
  const result = { config, generatedAt: new Date().toISOString(), firstDate: bars.find((b) => b.date >= config.analysisStart).date,
    lastDate: bars.at(-1).date, lastClose: bars.at(-1).close, source: sourceManifest.sources,
    statistics, crossingSummary, candidates, selected: policy.selected, benchmarks: policy.benchmarks,
    sensitivity: policy.sensitivity, grid: policy.grid, operationCohorts,
    current: config.maPeriods.map((period) => pairs.find((p) => p.period === period && p.status === "unfinished" && p.endIndex === bars.length - 1) ?? null),
    recentPairs: pairs.filter((p) => p.status === "completed").slice(-30) };
  const copy = JSON.parse(await readFile(file("relative-copy.zh-CN.json"), "utf8"));
  const outputs = [
    ["output/relative-report.zh-CN.html", renderRelativeReport(result, copy)],
    ["output/relative-pairs.csv", csv(pairs)], ["output/relative-excluded.csv", csv(excluded)],
    ["output/relative-pair-statistics.csv", csv(statistics)], ["output/relative-ratio-candidates.csv", csv(candidates)],
    ["output/relative-crossings.csv", csv(crossings)], ["output/relative-crossing-summary.csv", csv(crossingSummary)],
    ["output/relative-exit-grid.csv", csv(policy.grid)], ["output/relative-benchmarks.csv", csv(policy.benchmarks)],
    ["output/relative-cost-sensitivity.csv", csv(policy.sensitivity)],
    ["output/relative-selected.json", json(policy.selected)],
    ["output/relative-operation-cohorts.csv", csv(operationCohorts)],
    ["output/relative-evaluation-trades.csv", csv(policy.selectedRuns.flatMap((r) => r.trades))],
    ["output/relative-evaluation-equity.csv", csv(policy.selectedRuns.flatMap((r) => r.equity.map((e) => ({ period: r.period, ...e }))))],
    ["output/relative-evaluation-signals.csv", csv(policy.selectedRuns.flatMap((r) => r.signals.map((s) => ({ period: r.period, ...s }))))]
  ];
  for (const [name, content] of outputs) await atomic(name, content);
  const manifest = { study: "adjacent-ma-interval-relative-risk-exits", status: "complete", config, configHash: hash(configText),
    generatedAt: result.generatedAt, firstDate: result.firstDate, lastDate: result.lastDate,
    sourceDataHash: hash(sourceText), sourceManifestHash: hash(sourceManifestText), source: sourceManifest.sources,
    pairs: pairs.length, excluded: excluded.length, crossings: crossings.length,
    artifactHashes: Object.fromEntries(outputs.map(([name, content]) => [name, hash(content)])),
    posture: "research-only long/flat; bucket-conditioned rebound threshold buys and retracement threshold sells; later evaluation is exploratory",
    limitations: ["Index proxy is not an execution instrument", "Percentage-return ratios differ from point retracement", "Close-confirmed trigger prices are not guaranteed next-open fills", "No same-bar execution or future final-interval amplitude", "No stable optimum claim without defined later-period checks", "Exposure and entry participation differ across policies"] };
  await atomic("output/relative-manifest.json", json(manifest));
  await atomic("data/state/relative-completion.json", json({ configHash: manifest.configHash, sourceDataHash: manifest.sourceDataHash, manifestHash: hash(json(manifest)), generatedAt: result.generatedAt }));
  console.log(json({ report: file("output/relative-report.zh-CN.html"), asOf: result.lastDate,
    pairStats: statistics.filter((r) => r.sample === "all"), selected: policy.selected, current: result.current }));
}
