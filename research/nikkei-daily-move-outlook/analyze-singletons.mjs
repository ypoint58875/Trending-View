import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { csv, validateBars } from "./lib/core.mjs";
import { analyzeSingletons, summarizeSingletonRows } from "./lib/singletons.mjs";
import { renderSingletonReport } from "./lib/singleton-report.mjs";

const root = path.dirname(fileURLToPath(import.meta.url)), file = (p) => path.join(root, p);
const hash = (s) => createHash("sha256").update(s).digest("hex"), json = (x) => JSON.stringify(x, null, 2) + "\n";
async function atomic(name, content) {
  const target = file(name); await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target + ".tmp", content, "utf8"); await rename(target + ".tmp", target);
}
if (process.argv.length > 2) throw new Error("Usage: node research/nikkei-daily-move-outlook/analyze-singletons.mjs");
const configText = await readFile(file("singleton-config.json"), "utf8"), config = JSON.parse(configText);
const source = await readFile(file("data/processed/nikkei225-daily.csv"), "utf8");
const original = JSON.parse(await readFile(file("output/run-manifest.json"), "utf8"));
if (hash(source) !== original.dataHash) throw new Error("Accepted source hash mismatch");
const bars = source.trim().split(/\r?\n/).slice(1).map((l) => {
  const [date, open, high, low, close] = l.replaceAll('"', "").split(",");
  return { date, open: +open, high: +high, low: +low, close: +close };
});
validateBars(bars, config.maximumBars);
const analysis = analyzeSingletons(bars, config);
const summaries = [], durations = [], amplitudes = [], transitions = [];
for (const period of config.maPeriods) for (const direction of ["up", "down"]) for (const duration of ["one", "two", "long"]) {
  const local = analysis.rows.filter((r) => r.period === period && r.direction === direction && r.duration === duration);
  const total = analysis.totals.find((r) => r.direction === direction).completedRuns;
  durations.push({ period, direction, duration, ...summarizeSingletonRows(local), share: local.length / total });
  for (const group of analysis.groups.filter((g) => g.direction === direction && g.duration === duration)) {
    const selected = local.filter((r) => r.group === group.id);
    amplitudes.push({ period, ...group, ...summarizeSingletonRows(selected), share: selected.length / local.length });
  }
  for (const classification of ["up_internal", "up_turn", "down_internal", "down_turn", "with_trend", "neutral_or_unavailable"]) {
    const selected = local.filter((r) => r.classification === classification);
    summaries.push({ period, direction, duration, classification, ...summarizeSingletonRows(selected),
      shareOfDirectionDuration: local.length ? selected.length / local.length : null });
  }
}
for (const period of config.maPeriods) for (const group of analysis.groups) {
  const local = analysis.rows.filter((r) => r.period === period && r.group === group.id);
  for (const classification of ["up_internal", "up_turn", "down_internal", "down_turn", "with_trend", "neutral_or_unavailable"]) {
    transitions.push({ period, ...group, classification, ...summarizeSingletonRows(local.filter((r) => r.classification === classification)) });
  }
}
const sequences = [];
for (const period of config.maPeriods) for (const direction of ["up", "down"]) {
  const local = analysis.rows.filter((r) => r.period === period && r.direction === direction && r.singleton);
  for (const sequence of [...new Set(local.map((r) => r.observedMaSequence))]) {
    const selected = local.filter((r) => r.observedMaSequence === sequence);
    sequences.push({ period, direction, sequence, classification: selected[0].classification, ...summarizeSingletonRows(selected) });
  }
}
const result = { config, generatedAt: new Date().toISOString(), firstDate: bars.find((b) => b.date >= config.analysisStart).date,
  lastDate: bars.at(-1).date, sourceHash: hash(source), totals: analysis.totals, groups: analysis.groups,
  durations, amplitudes, summaries, transitions, sequences, currentRun: analysis.currentRun,
  examples: config.maPeriods.flatMap((period) => ["up_internal", "up_turn", "down_internal", "down_turn"].map((classification) =>
    analysis.rows.filter((r) => r.period === period && r.classification === classification && r.singleton && !r.transient).at(-1)).filter(Boolean)) };
const copy = JSON.parse(await readFile(file("singleton-copy.zh-CN.json"), "utf8"));
const outputs = [
  ["output/singleton-report.zh-CN.html", renderSingletonReport(result, copy)],
  ["output/singleton-results.json", json(result)], ["output/singleton-duration-summary.csv", csv(durations)],
  ["output/singleton-amplitude-groups.csv", csv(amplitudes)], ["output/singleton-context-summary.csv", csv(summaries)],
  ["output/singleton-group-context.csv", csv(transitions)], ["output/singleton-ma-sequences.csv", csv(sequences)],
  ["output/singleton-all-runs.csv", csv(analysis.rows)],
  ["output/singleton-isolated-days.csv", csv(analysis.rows.filter((r) => r.singleton))],
  ["output/singleton-parent-intervals.csv", csv(analysis.intervalRows)]
];
for (const [name, content] of outputs) await atomic(name, content);
const modules = ["analyze-singletons.mjs", "lib/singletons.mjs", "lib/singleton-report.mjs", "singleton-copy.zh-CN.json", "lib/core.mjs", "lib/intervals.mjs"];
const manifest = { status: "complete", generatedAt: result.generatedAt, configHash: hash(configText), sourceHash: hash(source),
  firstDate: result.firstDate, lastDate: result.lastDate, config,
  artifacts: Object.fromEntries(outputs.map(([name, text]) => [name, hash(text)])),
  codeHashes: Object.fromEntries(await Promise.all(modules.map(async (name) => [name, hash(await readFile(file(name), "utf8"))]))),
  limitations: ["MA turns are local sign changes, not lasting regime predictions.", "Singleton classification requires the following reversal close.",
    "Descriptive amplitude terciles use the full fixed snapshot and are not out-of-sample predictions.",
    "Forward returns start after pattern confirmation, overlap across events, and exclude fees/dividends.",
    "Source snapshot is unchanged through 2026-10-13, not a current-market update."] };
await atomic("output/singleton-manifest.json", json(manifest));
await atomic("data/state/singleton-completion.json", json({ schemaVersion: 1, manifestHash: hash(json(manifest)), sourceHash: hash(source), configHash: manifest.configHash }));
console.log(json({ report: file("output/singleton-report.zh-CN.html"), totals: result.totals,
  durations: durations.filter((r) => r.period === 7), groups: amplitudes.filter((r) => r.period === 7 && r.duration === "one") }));
