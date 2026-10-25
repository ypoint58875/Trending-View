import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { csv, validateBars } from "./lib/core.mjs";
import { movingAverageIntervals, intervalSummary, deriveThresholds, thresholdEvents, analyzeThresholds } from "./lib/intervals.mjs";
import { renderIntervalReport } from "./lib/interval-report.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const file = (name) => path.join(ROOT, name);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
async function atomic(name, content) {
  const destination = file(name);
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, destination);
}
const configText = await readFile(file("interval-config.json"), "utf8");
const config = JSON.parse(configText);
if (process.argv.includes("--help")) {
  console.log("Usage: node research/nikkei-daily-move-outlook/analyze-intervals.mjs\nReads the existing accepted snapshot only; no network or parent application writes.");
} else {
  if (process.argv.length > 2) throw new Error("Unknown option");
  const text = await readFile(file("data/processed/nikkei225-daily.csv"), "utf8");
  const previousManifest = JSON.parse(await readFile(file("output/run-manifest.json"), "utf8"));
  if (digest(text) !== previousManifest.dataHash) throw new Error("Accepted data hash differs from the source run manifest");
  const bars = text.trim().split(/\r?\n/).slice(1).map((line) => {
    const [date, open, high, low, close] = line.replaceAll('"', "").split(",");
    return { date, open: Number(open), high: Number(high), low: Number(low), close: Number(close) };
  });
  validateBars(bars, config.maximumBars);
  const datasets = config.maPeriods.map((period) => movingAverageIntervals(bars, period));
  const completed = datasets.flatMap((d) => d.completed).filter((r) => r.startDate >= config.analysisStart);
  const active = datasets.map((d) => d.current).filter(Boolean);
  const candidates = deriveThresholds(completed, config);
  const events = thresholdEvents(bars, [...completed, ...active], candidates, config.analysisStart);
  const statistics = [
    { sample: "all", start: config.analysisStart, end: bars.at(-1).date },
    { sample: "calibration", start: config.analysisStart, end: config.calibrationEnd },
    { sample: "evaluation", start: config.evaluationStart, end: bars.at(-1).date }
  ].flatMap((group) => config.maPeriods.flatMap((period) => intervalSummary(completed.filter((r) => r.period === period &&
    r.startDate >= group.start && r.confirmedDate <= group.end), period).map((r) => ({ sample: group.sample, ...r }))));
  const { summaries, outcomes } = analyzeThresholds(bars, events, candidates, config);
  const sourceHash = digest(text), generatedAt = new Date().toISOString();
  const result = { config, generatedAt, sourceHash, sourceManifest: "run-manifest.json", source: previousManifest.sources,
    firstDate: bars.find((b) => b.date >= config.analysisStart).date, lastDate: bars.at(-1).date,
    barCount: bars.filter((b) => b.date >= config.analysisStart).length, completed, active, candidates, events, statistics, summaries,
    charts: datasets.map((d) => ({ period: d.period, bars: bars.slice(-config.chartSessions),
      ma: d.labels.slice(-config.chartSessions), intervals: [...d.completed, d.current].filter((r) => r && r.endDate >= bars.at(-config.chartSessions).date) })) };
  const copy = JSON.parse(await readFile(file("interval-copy.zh-CN.json"), "utf8"));
  const html = renderIntervalReport(result, copy);
  const artifacts = [
    ["output/ma-interval-report.zh-CN.html", html],
    ["output/ma-interval-statistics.csv", csv(statistics)],
    ["output/ma-interval-completed.csv", csv(completed)],
    ["output/ma-interval-current.csv", csv(active)],
    ["output/ma-interval-thresholds.csv", csv(candidates)],
    ["output/ma-interval-events.csv", csv(events)],
    ["output/ma-interval-event-outcomes.csv", csv(outcomes)],
    ["output/ma-interval-reversal-summary.csv", csv(summaries)]
  ];
  for (const [name, contents] of artifacts) await atomic(name, contents);
  const manifest = { study: "ma-direction-intervals-then-amplitude-thresholds", status: "complete", schemaVersion: config.schemaVersion,
    config, configHash: digest(configText), generatedAt, sourceDataHash: sourceHash,
    sourceRunManifestHash: digest(await readFile(file("output/run-manifest.json"), "utf8")),
    firstDate: result.firstDate, lastDate: result.lastDate, barCount: result.barCount,
    source: previousManifest.sources, completedIntervalCount: completed.length, activeIntervalCount: active.length,
    thresholdCandidateCount: candidates.length, eventCount: events.length,
    artifactHashes: Object.fromEntries(artifacts.map(([name, contents]) => [name, digest(contents)])),
    interpretation: ["Intervals use SMA direction only, never a percentage reversal threshold", "Thresholds are derived after interval statistics from direction-aligned completed intervals confirmed by 2015 end", "Post-2015 event outcomes use frozen numeric thresholds", "Events include eventual direction-disagreeing and unfinished intervals", "One first crossing per interval and threshold", "Terminal opposite-direction probability is not eventual reversal probability", "Outcome windows may overlap; thinned sensitivity is reported", "Exploratory frequencies are not calibrated forecasts or trading returns"] };
  await atomic("output/ma-interval-manifest.json", json(manifest));
  await atomic("data/state/ma-interval-completion.json", json({ schemaVersion: config.schemaVersion, configHash: manifest.configHash, sourceDataHash: sourceHash, manifestHash: digest(json(manifest)), generatedAt }));
  console.log(json({ report: file("output/ma-interval-report.zh-CN.html"), asOf: result.lastDate,
    intervals: statistics.filter((r) => r.sample === "all" && r.direction !== "flat"),
    candidates, evaluation20: summaries.filter((r) => r.sample === "evaluation" && r.horizon === 20), active }));
}
