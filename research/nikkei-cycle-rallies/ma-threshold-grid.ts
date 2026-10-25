import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { averageTargets, averageTypes, atomic, loadStudy, metrics, root, sha, type AverageType } from "./ma-type";
import { runStrategyCycleCloseBacktest } from "../../lib/analysis/strategy-cycle-validation";
import { runAllocationBacktest, type AllocationBacktestResult } from "../../lib/analysis/backtest";

export type GridRow = ReturnType<typeof metrics> & { id: string; types: [AverageType, AverageType, AverageType]; periods: [number, number, number]; threshold: number };
export const thresholds = [0.00025, 0.0005, 0.00075, 0.001, 0.00125, 0.0015, 0.00175, 0.002];
const rank = (a: GridRow, b: GridRow) => b.totalReturn - a.totalReturn || a.id.localeCompare(b.id);
export function validateChunk(rows: GridRow[], types: readonly AverageType[], threshold: number) {
  const expected = new Set<string>();
  for (let a = 7; a <= 15; a++) for (let b = 7; b <= 15; b++) for (let c = 7; c <= 15; c++) expected.add(`${types[0]}${a}-${types[1]}${b}-${types[2]}${c}-t${threshold}`);
  if (!Array.isArray(rows) || rows.length !== expected.size || rows.some(r => !expected.delete(r.id) ||
    r.threshold !== threshold || r.types.join() !== types.join() ||
    r.id !== `${r.types[0]}${r.periods[0]}-${r.types[1]}${r.periods[1]}-${r.types[2]}${r.periods[2]}-t${threshold}` ||
    !Number.isFinite(r.totalReturn) || !Number.isFinite(r.maxDrawdown)) || expected.size) throw new Error("Invalid grid chunk");
}
async function main() {
  const { bars, settings, start, sourceHash, decisions } = await loadStudy();
  const designHash = sha((await Promise.all(["MA_THRESHOLD_GRID_DESIGN.md", "MA_TYPE_DESIGN.md", "ma-type.ts", "ma-threshold-grid.ts"].map(p => readFile(join(root, p), "utf8")))).join("\n"));
  const baseline = runStrategyCycleCloseBacktest(bars, averageTargets(bars, decisions, start, ["SMA", "SMA", "SMA"]).target, settings);
  const previous = JSON.parse(await readFile(join(root, "output/entry-slope-gate/cycle10-sma12-guard-gate11.json"), "utf8")) as AllocationBacktestResult;
  if (Math.abs(baseline.totalReturn - previous.totalReturn) > 1e-9 || JSON.stringify(baseline.rebalances) !== JSON.stringify(previous.rebalances)) throw new Error("Baseline ledger mismatch");
  const leaders: GridRow[] = [], controls: GridRow[] = [], uniformLeaders: GridRow[] = [], thresholdLeaders: GridRow[] = [];
  for (const threshold of thresholds) {
    const rows: GridRow[] = [];
    for (const a of averageTypes) for (const b of averageTypes) for (const c of averageTypes) {
      const types: [AverageType, AverageType, AverageType] = [a, b, c];
      const chunkPath = join(root, `output/ma-threshold-grid/t${threshold}/chunk-${types.join("-")}.json`);
      let chunk: GridRow[];
      const exists = await stat(chunkPath).then(() => true, e => { if (e.code === "ENOENT") return false; throw e; });
      if (exists) {
        const saved = JSON.parse(await readFile(chunkPath, "utf8"));
        if (saved.sourceHash !== sourceHash || saved.designHash !== designHash) throw new Error("Incompatible grid chunk");
        validateChunk(saved.rows, types, threshold); chunk = saved.rows;
      } else {
        chunk = [];
        for (let entry = 7; entry <= 15; entry++) for (let exit = 7; exit <= 15; exit++) for (let gate = 7; gate <= 15; gate++) {
          const periods: [number, number, number] = [entry, exit, gate], id = `${a}${entry}-${b}${exit}-${c}${gate}-t${threshold}`;
          const replay = averageTargets(bars, decisions, start, types, periods, threshold);
          const result = runStrategyCycleCloseBacktest(bars, replay.target, settings);
          chunk.push({ id, types, periods, threshold, ...metrics(bars, start, result) });
        }
        validateChunk(chunk, types, threshold);
        await atomic(chunkPath, { sourceHash, designHash, rows: chunk });
      }
      rows.push(...chunk);
      console.log(`Threshold ${threshold}: ${rows.length}/19683`);
    }
    const ranked = [...rows].sort(rank);
    leaders.push(...ranked.slice(0, 20)); thresholdLeaders.push(ranked[0]!);
    uniformLeaders.push(...averageTypes.map(t => ranked.find(r => r.types.every(v => v === t))!));
    controls.push(...rows.filter(r => r.periods.join() === "12,12,11"));
    await atomic(join(root, `output/ma-threshold-grid/summary-t${threshold}.json`), { sourceHash, designHash, count: rows.length, threshold, rows });
  }
  const ranked = leaders.sort(rank);
  const bestUniform = averageTypes.map(t => uniformLeaders.filter(r => r.types.every(v => v === t)).sort(rank)[0]!);
  const selected = [...new Map([...ranked.slice(0, 20), ...bestUniform, ...thresholdLeaders,
    ...controls.filter(r => r.threshold === 0.002)].map(r => [r.id, r])).values()];
  const diagnostics = [];
  for (const row of selected) {
    const replay = averageTargets(bars, decisions, start, row.types, row.periods, row.threshold);
    const result = runStrategyCycleCloseBacktest(bars, replay.target, settings);
    const next = runAllocationBacktest(bars, replay.target, { ...settings, executionPolicy: "next-open" });
    diagnostics.push({ id: row.id, nextOpenReturn: next.totalReturn, nextOpenMaxDrawdown: next.maxDrawdown });
    await atomic(join(root, `output/ma-threshold-grid/leaders/${row.id}.json`), { sourceHash, designHash, ...result, events: replay.events });
  }
  const holding = metrics(bars, start, runStrategyCycleCloseBacktest(bars, bars.map((_, i) => i >= start ? 1 : 0), settings));
  await atomic(join(root, "output/ma-threshold-grid-summary.json"), { sourceHash, designHash, start: settings.startTime, end: settings.endTime,
    settings, baselineReconciled: true, count: 19683 * thresholds.length, holding, leaders: ranked.slice(0, 20),
    thresholdLeaders, uniformLeaders: bestUniform, controls, diagnostics });
  console.log(JSON.stringify({ best: ranked[0], uniformLeaders: bestUniform }, null, 2));
}
if (process.argv[1]?.endsWith("ma-threshold-grid.ts")) main().catch(error => { console.error(error); process.exitCode = 1; });
