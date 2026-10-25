import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { averageTargets, averageTypes, atomic, loadStudy, metrics, root, sha, type AverageType } from "./ma-type";
import { runStrategyCycleCloseBacktest } from "../../lib/analysis/strategy-cycle-validation";
import { runAllocationBacktest, type AllocationBacktestResult } from "../../lib/analysis/backtest";

type Row = ReturnType<typeof metrics> & { id: string; types: [AverageType, AverageType, AverageType]; periods: [number, number, number] };
async function main() {
  const { bars, settings, start, sourceHash, decisions } = await loadStudy();
  const designHash = sha((await readFile(join(root, "MA_PERIOD_GRID_DESIGN.md"), "utf8")) +
    await readFile(join(root, "MA_TYPE_DESIGN.md"), "utf8") + await readFile(join(root, "ma-type.ts"), "utf8") +
    await readFile(join(root, "ma-period-grid.ts"), "utf8"));
  const baseline = runStrategyCycleCloseBacktest(bars, averageTargets(bars, decisions, start, ["SMA", "SMA", "SMA"]).target, settings);
  const previous = JSON.parse(await readFile(join(root, "output/entry-slope-gate/cycle10-sma12-guard-gate11.json"), "utf8")) as AllocationBacktestResult;
  if (Math.abs(baseline.totalReturn - previous.totalReturn) > 1e-9 || JSON.stringify(baseline.rebalances) !== JSON.stringify(previous.rebalances)) throw new Error("Baseline ledger mismatch");
  const rows: Row[] = [];
  for (const a of averageTypes) for (const b of averageTypes) for (const c of averageTypes) {
    const types: [AverageType, AverageType, AverageType] = [a, b, c], chunkPath = join(root, `output/ma-period-grid-7-15/chunk-${types.join("-")}.json`);
    let chunk: Row[];
    const exists = await stat(chunkPath).then(() => true, e => { if (e.code === "ENOENT") return false; throw e; });
    if (exists) {
      const saved = JSON.parse(await readFile(chunkPath, "utf8"));
      if (saved.sourceHash !== sourceHash || saved.designHash !== designHash || saved.rows.length !== 729 ||
        new Set(saved.rows.map((r: Row) => r.id)).size !== 729) throw new Error("Incompatible grid chunk");
      chunk = saved.rows;
    } else {
      chunk = [];
      for (let entry = 7; entry <= 15; entry++) for (let exit = 7; exit <= 15; exit++) for (let gate = 7; gate <= 15; gate++) {
        const periods: [number, number, number] = [entry, exit, gate], id = `${a}${entry}-${b}${exit}-${c}${gate}`;
        const replay = averageTargets(bars, decisions, start, types, periods);
        const result = runStrategyCycleCloseBacktest(bars, replay.target, settings);
        chunk.push({ id, types, periods, ...metrics(bars, start, result) });
      }
      await atomic(chunkPath, { sourceHash, designHash, rows: chunk });
    }
    rows.push(...chunk);
    console.log(`Completed ${rows.length}/19683: ${types.join("-")}`);
  }
  const ranked = [...rows].sort((a, b) => b.totalReturn - a.totalReturn || a.id.localeCompare(b.id));
  const uniformLeaders = averageTypes.map(t => ranked.find(r => r.types.every(v => v === t))!);
  const fixed = rows.filter(r => r.periods.join("-") === "12-12-11");
  const selected = [...new Map([...ranked.slice(0, 10), ...uniformLeaders, ...fixed].map(r => [r.id, r])).values()];
  const diagnostics = [];
  for (const row of selected) {
    const replay = averageTargets(bars, decisions, start, row.types, row.periods);
    const result = runStrategyCycleCloseBacktest(bars, replay.target, settings);
    const next = runAllocationBacktest(bars, replay.target, { ...settings, executionPolicy: "next-open" });
    diagnostics.push({ id: row.id, nextOpenReturn: next.totalReturn, nextOpenMaxDrawdown: next.maxDrawdown });
    await atomic(join(root, `output/ma-period-grid-7-15/leaders/${row.id}.json`), { sourceHash, designHash, ...result, events: replay.events });
  }
  const holding = metrics(bars, start, runStrategyCycleCloseBacktest(bars, bars.map((_, i) => i >= start ? 1 : 0), settings));
  await atomic(join(root, "output/ma-period-grid-7-15-summary.json"), { sourceHash, designHash, start: settings.startTime, end: settings.endTime,
    settings, baselineReconciled: true, count: rows.length, holding, uniformLeaders: uniformLeaders.map(r => r.id), diagnostics, rows });
  console.log(JSON.stringify({ leaders: ranked.slice(0, 10), uniformLeaders }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
