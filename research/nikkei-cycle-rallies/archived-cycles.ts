import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildStrategyCycleRollingSchedule, buildStrategyCycleRollingReport,
  runStrategyCycleCloseBacktest, resolveStrategyCycleRecentSignals,
  strategyCycleRecentSignals, type StrategyCycleSelectionSnapshot,
} from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";
import { blendTargets, segmentReturn, rallyWindows } from "./analyze";
import { replaceFileAtomically } from "../../scripts/atomic-file";

const base = resolve("research/nikkei-cycle-rallies");
const currentText = await readFile(`${base}/data/input.json`, "utf8");
const archivedText = await readFile("research/nikkei-cycle-conflicts/data/input.json", "utf8");
const current = JSON.parse(currentText);
const archive = JSON.parse(archivedText);
if (JSON.stringify(archive.bars) !== JSON.stringify(current.bars.slice(0, archive.bars.length))) {
  throw new Error("Archived market prefixes differ from the current batch");
}
const bars: MarketBar[] = current.bars.filter((bar: MarketBar) => bar.time <= "2026-06-11");
const start = bars.findIndex(bar => bar.time === "2025-09-04");
const sessions = bars.length - start;
const settings = { ...current.settings, startTime: bars[start]!.time, endTime: bars.at(-1)!.time };
const targets = new Map<string, number[]>();
const coverage: unknown[] = [];
for (const window of [10, 20, 40]) {
  const byIndex = new Map<number, StrategyCycleSelectionSnapshot>();
  const source = window === 10 ? current.snapshots : archive.snapshots;
  for (const snapshot of source) {
    if (snapshot.screeningWindow !== window || snapshot.decisionIndex < start || snapshot.decisionIndex >= bars.length) continue;
    if (window !== 10) {
      const cohort = JSON.parse(snapshot.cohort);
      if (cohort.model !== 4 || cohort.positioning !== 2 || cohort.options.maxCombinationStrategies !== 3 ||
        cohort.options.objective !== "totalReturn" || JSON.stringify(cohort.costs) !== "[0.0003,0.0002]") continue;
    }
    const existing = byIndex.get(snapshot.decisionIndex);
    if (existing && JSON.stringify([existing.plan, existing.fixedRelativeLongStrategy]) !== JSON.stringify([snapshot.plan, snapshot.fixedRelativeLongStrategy])) {
      throw new Error(`Ambiguous archived winners at window ${window}, date ${snapshot.decisionTime}`);
    }
    byIndex.set(snapshot.decisionIndex, snapshot);
  }
  const schedule = buildStrategyCycleRollingSchedule(bars, sessions, window)!;
  const missing = schedule.decisionIndexes.filter(index => !byIndex.has(index));
  coverage.push({ window, expected: schedule.decisionIndexes.length, archived: byIndex.size, missing: missing.map(i => bars[i]!.time),
    rankingModel: window === 10 ? 5 : 4, maxCombinationStrategies: window === 10 ? 5 : 3 });
  if (missing.length) continue;
  const snapshots = [...byIndex.values()].sort((a, b) => a.decisionIndex - b.decisionIndex);
  const target = new Array<number>(bars.length).fill(0);
  let inherited = 0;
  for (let i = start; i < bars.length; i += 1) {
    const snapshot = byIndex.get(i);
    if (snapshot) inherited = resolveStrategyCycleRecentSignals(inherited, strategyCycleRecentSignals(bars, snapshot, i)).targetAllocation;
    target[i] = inherited;
  }
  const official = buildStrategyCycleRollingReport(bars, snapshots, sessions, window, settings);
  const replay = runStrategyCycleCloseBacktest(bars, target, settings);
  if (Math.abs(official.updateReturn - replay.totalReturn) > 1e-9) throw new Error("Archived replay tie-out failed");
  targets.set(`cycle${window}`, target);
}
if (targets.has("cycle20")) targets.set("cycle10-50-cycle20-50", blendTargets(targets.get("cycle10")!, targets.get("cycle20")!, 0.5));
if (targets.has("cycle40")) targets.set("cycle10-50-cycle40-50", blendTargets(targets.get("cycle10")!, targets.get("cycle40")!, 0.5));
targets.set("buy-hold", bars.map((_, i) => i < start ? 0 : 1));
const results = Object.fromEntries([...targets].map(([id, target]) => {
  const r = runStrategyCycleCloseBacktest(bars, target, settings);
  return [id, { totalReturn: r.totalReturn, maxDrawdown: r.maxDrawdown, tradeCount: r.tradeCount,
    segments: rallyWindows.slice(1).map(([from, to]) => ({ from, to, return: segmentReturn(r.equity, from, to) })),
    equity: r.equity, rebalances: r.rebalances }];
}));
const output = { start: settings.startTime, end: settings.endTime, sessions, coverage,
  currentInputHash: createHash("sha256").update(currentText).digest("hex"), archivedInputHash: createHash("sha256").update(archivedText).digest("hex"),
  limitation: "Exploratory only: longer selectors use ranking model 4 / max three strategies; current cycle10 uses model 5 / max five. First rally lacks longer-selector history. Not a matched-config cycle comparison.", results };
const destination = `${base}/output/archived-cycles.json`;
await writeFile(`${destination}.tmp`, `${JSON.stringify(output)}\n`);
await replaceFileAtomically(`${destination}.tmp`, destination);
console.log(JSON.stringify({ ...output, results: Object.fromEntries(Object.entries(results).map(([key, value]) => {
  const { equity, rebalances, ...metrics } = value; return [key, metrics];
})) }, null, 2));
