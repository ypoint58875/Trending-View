import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { MarketBar } from "../../lib/market/types";
import { buildRawContextCurves, buildContextQuantiles } from "../../lib/analysis/market-context";
import { HORIZONS, METRICS, STUDY_MODEL, comparePolicies, eventOutcome, multipleLineBreakEvents, researchContext, separatedEvents, wilson } from "./study";

const root = dirname(fileURLToPath(import.meta.url));
const source = resolve(process.argv[2] ?? "../BIAS/data/processed/nikkei225.csv");
const dataDirectory = join(root, "data");
const outputDirectory = join(root, "output");
await mkdir(dataDirectory, { recursive: true });
await mkdir(outputDirectory, { recursive: true });
const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const atomicWrite = async (path: string, text: string | Buffer) => {
  const temporary = `${path}.tmp`;
  await writeFile(temporary, text);
  await rename(temporary, path);
};
if ((await stat(source)).size > 4 * 1024 * 1024) throw new Error("Source exceeds 4 MiB limit");
const raw = await readFile(source);
const sourceHash = hash(raw);
const lines = raw.toString("utf8").trim().split(/\r?\n/);
const columns = lines.shift()!.split(",");
const column = (name: string) => {
  const index = columns.indexOf(name);
  if (index < 0) throw new Error(`Missing CSV column: ${name}`);
  return index;
};
const indexes = Object.fromEntries(["date", "open", "high", "low", "close", "volume", "amount"].map((name) => [name, column(name)]));
if (!lines.length || lines.length > 10000) throw new Error("Source must contain 1..10000 bars");
const bars: MarketBar[] = lines.map((line) => {
  const cells = line.split(",");
  const time = cells[indexes.date];
  const numeric = (name: string) => {
    const value = Number(cells[indexes[name]]);
    if (!Number.isFinite(value)) throw new Error(`Invalid source ${name} at ${time}`);
    return value;
  };
  return { time, timestamp: Date.parse(time), open: numeric("open"), high: numeric("high"), low: numeric("low"),
    close: numeric("close"), volume: numeric("volume"), amount: numeric("amount"),
    amplitude: 0, changePercent: 0, change: 0, turnoverRate: 0 };
});
if (bars.some((bar, index) => !Number.isFinite(bar.timestamp) || bar.open <= 0 || bar.close <= 0 || (index && bar.time <= bars[index - 1].time))) throw new Error("Invalid or unordered source bars");
const sourceRecord = { source, accessedAt: new Date().toISOString(), sha256: sourceHash, bytes: raw.length,
  firstDate: bars[0].time, lastDate: bars.at(-1)!.time, rows: bars.length, mode: "read-only-local-snapshot" };
const manifestPath = join(outputDirectory, "manifest.json");
await atomicWrite(manifestPath, JSON.stringify({ status: "running", source: sourceRecord, model: STUDY_MODEL, startedAt: new Date().toISOString() }, null, 2));
await atomicWrite(join(dataDirectory, "raw.csv"), raw);
await atomicWrite(join(dataDirectory, "bars.json"), JSON.stringify(bars));
const registryPath = join(dataDirectory, "source_registry.jsonl");
let registry = "";
try {
  if ((await stat(registryPath)).size > 128 * 1024) throw new Error("Research source registry exceeds 128 KiB limit");
  registry = await readFile(registryPath, "utf8");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
const nextRegistry = `${registry}${JSON.stringify(sourceRecord)}\n`;
if (Buffer.byteLength(nextRegistry) > 128 * 1024) throw new Error("Research source registry exceeds 128 KiB limit");
await atomicWrite(registryPath, nextRegistry);
const { states, events, curves } = researchContext(bars);
const multipleEvents = multipleLineBreakEvents(bars.map((bar) => bar.time), curves);
const split = (time: string) => time < "2015" ? "2000-2014" : time < "2021" ? "2015-2020" : "2021-2026";
const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >>> 1;
  return sorted.length ? sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2 : null;
};
type AggregateRow = {
  cohort: string; period: string; kind: string; side: string; metric: string;
  horizon: number; events: number; eligible: number;
} & Record<"meanCloseReturn" | "medianCloseReturn" | "meanNextOpenReturn" | "directionHitRate" |
  "hitLower95" | "hitUpper95" | "restoredRate" | "reconfirmedRate" | "reversedRate" |
  "oppositeUnanimityRate" | "restoredFirstRate" | "opposedFirstRate" | "neitherRate" | "medianRestoreDays", number | null>;
const rows: AggregateRow[] = [];
for (const cohort of ["all-events", "spaced-20"] as const) {
  const selected = cohort === "all-events" ? events : separatedEvents(events, 20);
  for (const period of ["all", "2000-2014", "2015-2020", "2021-2026"] as const)
    for (const kind of ["opposite", "flat"] as const)
      for (const side of ["up", "down"] as const)
        for (const metric of ["all", ...METRICS] as const)
          for (const horizon of HORIZONS) {
            const matching = selected.filter((event) => event.kind === kind && event.previousDirection === side &&
              (metric === "all" || event.metric === metric) && (period === "all" || split(event.time) === period));
            const eligible = matching.filter((event) => event.index + horizon < bars.length &&
              (period === "all" || split(bars[event.index + horizon].time) === period));
            const outcomes = eligible.map((event) => eventOutcome(bars, states, event, horizon)!);
            const percentage = (predicate: (row: typeof outcomes[number]) => boolean) => outcomes.length ? outcomes.filter(predicate).length / outcomes.length * 100 : null;
            const hits = outcomes.filter((row) => row.previousDirectionHit).length;
            const interval = wilson(hits, outcomes.length);
            rows.push({ cohort, period, kind, side, metric, horizon, events: matching.length, eligible: outcomes.length,
              meanCloseReturn: mean(outcomes.map((row) => row.closeReturn)), medianCloseReturn: median(outcomes.map((row) => row.closeReturn)),
              meanNextOpenReturn: mean(outcomes.map((row) => row.nextOpenReturn)), directionHitRate: percentage((row) => row.previousDirectionHit),
              hitLower95: interval?.[0] ?? null, hitUpper95: interval?.[1] ?? null,
              restoredRate: percentage((row) => row.restored), reconfirmedRate: percentage((row) => row.reconfirmed), reversedRate: percentage((row) => row.reversed),
              oppositeUnanimityRate: percentage((row) => row.oppositeUnanimity),
              restoredFirstRate: percentage((row) => row.firstUnanimity === "restored"), opposedFirstRate: percentage((row) => row.firstUnanimity === "opposed"),
              neitherRate: percentage((row) => row.firstUnanimity === "neither"),
              medianRestoreDays: median(outcomes.flatMap((row) => row.restoreDays === null ? [] : [row.restoreDays])) });
          }
}
const policyRows = [];
const multipleRows: Array<{
  mode: string; cohort: string; period: string; side: string; reversed: number; events: number; eligible: number; horizon: number;
  meanCloseReturn: number | null; meanNextOpenReturn: number | null; priorDirectionHitRate: number | null;
  restoredRate: number | null; reconfirmedRate: number | null; oppositeUnanimityRate: number | null; reversedRate: number | null;
  hitLower95: number | null; hitUpper95: number | null;
}> = [];
for (const mode of ["initial", "stage-first"] as const)
  for (const cohort of ["all-events", "spaced-20"] as const)
    for (const side of ["up", "down"] as const)
      for (const reversed of [1, 2, 3, 4, 5, 6]) {
        const matching = multipleEvents.filter((event) => event.mode === mode && event.previousDirection === side && event.reversed === reversed && event.flat === 0);
        const selected = cohort === "all-events" ? matching : separatedEvents(matching, 20);
        for (const period of ["all", "2000-2014", "2015-2020", "2021-2026"] as const)
          for (const horizon of HORIZONS) {
            const periodEvents = selected.filter((event) => period === "all" || split(event.time) === period);
            const eligible = periodEvents.filter((event) => event.index + horizon < bars.length && (period === "all" || split(bars[event.index + horizon].time) === period));
            const outcomes = eligible.map((event) => eventOutcome(bars, states, event, horizon)!);
            const percentage = (predicate: (row: typeof outcomes[number]) => boolean) => outcomes.length ? outcomes.filter(predicate).length / outcomes.length * 100 : null;
            const interval = wilson(outcomes.filter((row) => row.previousDirectionHit).length, outcomes.length);
            multipleRows.push({ mode, cohort, period, side, reversed, horizon, events: periodEvents.length, eligible: outcomes.length,
              meanCloseReturn: mean(outcomes.map((row) => row.closeReturn)), meanNextOpenReturn: mean(outcomes.map((row) => row.nextOpenReturn)),
              priorDirectionHitRate: percentage((row) => row.previousDirectionHit), restoredRate: percentage((row) => row.restored),
              reconfirmedRate: percentage((row) => row.reconfirmed), oppositeUnanimityRate: percentage((row) => row.oppositeUnanimity),
              reversedRate: percentage((row) => row.reversed), hitLower95: interval?.[0] ?? null, hitUpper95: interval?.[1] ?? null });
          }
      }
const thresholdPolicyRows = [];
for (const period of ["all", "2000-2014", "2015-2020", "2021-2026"] as const) {
  const start = period === "all" ? 0 : bars.findIndex((bar) => split(bar.time) === period);
  if (start < 0) continue;
  const last = period === "all" ? bars.length : bars.findLastIndex((bar) => split(bar.time) === period) + 1;
  const segmentBars = bars.slice(start, last), segmentStates = states.slice(start, last);
  const segmentEvents = events.filter((event) => event.index >= start && event.index < last).map((event) => ({ ...event, index: event.index - start }));
  for (const cost of [0, 5, 20]) for (const result of comparePolicies(segmentBars, segmentStates, segmentEvents, cost)) {
    const { policy, costBps, totalReturn, maxDrawdown, trades } = result;
    policyRows.push({ period, policy, costBps, totalReturn, maxDrawdown, trades });
  }
  for (const threshold of [1, 2, 3, 4, 5, 6]) {
    const thresholdEvents = multipleEvents.filter((event) => event.mode === "stage-first" && event.reversed >= threshold && event.index >= start && event.index < last)
      .map((event) => ({ index: event.index - start }));
    const { totalReturn, maxDrawdown, trades } = comparePolicies(segmentBars, segmentStates, thresholdEvents, 5)[1];
    thresholdPolicyRows.push({ period, threshold, costBps: 5, totalReturn, maxDrawdown, trades });
  }
}
const csv = <T extends object>(values: T[]) => {
  if (!values.length) return "";
  const keys = Object.keys(values[0]);
  return [keys.join(","), ...values.map((row) => keys.map((key) => row[key as keyof T] ?? "").join(","))].join("\n") + "\n";
};
const summary = { source: { sha256: sourceHash, firstDate: bars[0].time, lastDate: bars.at(-1)!.time, rows: bars.length },
  model: STUDY_MODEL, events: events.length, latestMonitoring: states.at(-1), rows, policyRows, multipleRows, thresholdPolicyRows };
await atomicWrite(join(outputDirectory, "events.csv"), csv(events));
await atomicWrite(join(outputDirectory, "cohorts.csv"), csv(rows));
await atomicWrite(join(outputDirectory, "policies.csv"), csv(policyRows));
await atomicWrite(join(outputDirectory, "multiple-events.csv"), csv(multipleEvents));
await atomicWrite(join(outputDirectory, "multiple-cohorts.csv"), csv(multipleRows));
await atomicWrite(join(outputDirectory, "threshold-policies.csv"), csv(thresholdPolicyRows));
await atomicWrite(join(outputDirectory, "summary.json"), JSON.stringify(summary, null, 2));
const rawCurves = buildRawContextCurves(bars);
const chartReference = rawCurves.bias.map((bias, slot) => {
  const quantiles = buildContextQuantiles(bars.map((bar) => bar.time), bias);
  return { period: [20, 60, 200][slot], rows: bars.slice(-5).map((bar, offset) => {
    const index = bars.length - 5 + offset;
    return { time: bar.time, rawBias: bias[index], smoothBias: curves.bias[slot][index], rawSlope: rawCurves.slope[slot][index],
      smoothSlope: curves.slope[slot][index], quantiles: quantiles.map((values) => values[index]) };
  }) };
});
await atomicWrite(join(outputDirectory, "chart-reference.json"), JSON.stringify(chartReference, null, 2));
const fmt = (value: number | null) => value === null ? "n/a" : value.toFixed(2);
const table = (filter: (row: typeof rows[number]) => boolean) => [
  "| Side | Metric | Days | N | Mean close return % | Prior-direction hit % | Restored % | Reconfirmed % | Opposite confirmation % |",
  "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ...rows.filter(filter).map((row) => `| ${row.side} | ${row.metric} | ${row.horizon} | ${row.eligible} | ${fmt(row.meanCloseReturn)} | ${fmt(row.directionHitRate)} | ${fmt(row.restoredRate)} | ${fmt(row.reconfirmedRate)} | ${fmt(row.reversedRate)} |`),
].join("\n");
const report = `# Single-line disagreement results\n\nInput: ${bars[0].time} through ${bars.at(-1)!.time}; ${bars.length} bars.\nSHA-256: ${sourceHash}.\n\nEvent definition, bounds and causal execution: see README.md.\nThere are ${events.length} qualifying first-departure events, including ${events.filter((event) => event.kind === "flat").length} flat events.\nRaw and smoothed curves use production functions. No parameters are fitted.\n\n## All opposite-direction events\n\n${table((row) => row.cohort === "all-events" && row.period === "all" && row.kind === "opposite" && row.metric === "all")}\n\n## 2021 onward\n\n${table((row) => row.cohort === "all-events" && row.period === "2021-2026" && row.kind === "opposite" && row.metric === "all" && row.horizon >= 5)}\n\n## Per-curve 10-session outcomes\n\n${table((row) => row.cohort === "all-events" && row.period === "all" && row.kind === "opposite" && row.metric !== "all" && row.horizon === 10)}\n\n## More than 20-session spaced sensitivity\n\n${table((row) => row.cohort === "spaced-20" && row.period === "all" && row.kind === "opposite" && row.metric === "all" && row.horizon >= 5)}\n\n## Interpretation limits\n\nSingle-line disagreement resets the candidate count but does not reverse the retained confirmation. Reversal requires three unanimous opposite days. Restored and reversed rates can overlap; exclusive first-outcome columns are in output/cohorts.csv. Event windows overlap in the primary table; use the spaced cohort as a sensitivity check. Wilson intervals are descriptive and do not correct dependence or multiple comparisons. The last observations are censored by horizon. Research is retrospective, including repeated prior inspection of this dataset.\n\n## Illustrative long/cash policies (5 bps per side)\n\n| Period | Policy | Total return % | Max drawdown % | Executed sides |\n| --- | --- | ---: | ---: | ---: |\n${policyRows.filter((row) => row.costBps === 5).map((row) => `| ${row.period} | ${row.policy} | ${fmt(row.totalReturn)} | ${fmt(row.maxDrawdown)} | ${row.trades} |`).join("\n")}\n\nEvery segment starts in cash; decisions use the current close and execute no earlier than the next open. Terminal holdings are marked at close. These policies do not alter the application or constitute a validated deployment recommendation.\n`;
const multipleTable = (mode: string, period: string) => [
  "| Prior state | Reversed curves | N (10d) | 10d mean price change % | Prior-direction hit % | Original unanimity restored % | Opposite confirmed % |",
  "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  ...multipleRows.filter((row) => row.mode === mode && row.period === period && row.cohort === "all-events" && row.horizon === 10)
    .map((row) => `| ${row.side} | ${row.reversed} | ${row.eligible} | ${fmt(row.meanCloseReturn)} | ${fmt(row.priorDirectionHitRate)} | ${fmt(row.restoredRate)} | ${fmt(row.reversedRate)} |`),
].join("\n");
await atomicWrite(join(root, "RESULTS.md"), `${report}\n## Multiple reversals: initial departure\n\n${multipleTable("initial", "all")}\n\n## Multiple reversals: first visit to each count in an episode\n\n${multipleTable("stage-first", "all")}\n\n## Initial departure, 2021 onward\n\n${multipleTable("initial", "2021-2026")}\n\n## Threshold early-exit policy sensitivity (5 bps/side)\n\n| Period | Exit at least N reversed curves | Total return % | Max drawdown % | Executed sides |\n| --- | ---: | ---: | ---: | ---: |\n${thresholdPolicyRows.map((row) => `| ${row.period} | ${row.threshold} | ${fmt(row.totalReturn)} | ${fmt(row.maxDrawdown)} | ${row.trades} |`).join("\n")}\n\nThe multiple-count tables exclude flat components; every raw event retains flat counts in multiple-events.csv. Initial departures and later stage visits are distinct cohorts. A stage visit is counted once per exact reversal count per episode. Episodes end only at a fresh three-day confirmation in either direction. Observations with six reversals are still the first opposite-unanimous day; the opposite confirmation requires two further unanimous days. Counts are correlated and are not six independent experiments.\n`);
const outputs = {} as Record<string, string>;
for (const name of ["events.csv", "cohorts.csv", "policies.csv", "multiple-events.csv", "multiple-cohorts.csv", "threshold-policies.csv", "chart-reference.json", "summary.json"]) outputs[name] = hash(await readFile(join(outputDirectory, name)));
await atomicWrite(manifestPath, JSON.stringify({ status: "complete", source: sourceRecord, model: STUDY_MODEL, completedAt: new Date().toISOString(), outputs }, null, 2));
console.log(JSON.stringify({ events: events.length, source: summary.source, primary: rows.filter((row) => row.cohort === "all-events" && row.period === "all" && row.kind === "opposite" && row.metric === "all"), policies: policyRows.filter((row) => row.costBps === 5) }));
