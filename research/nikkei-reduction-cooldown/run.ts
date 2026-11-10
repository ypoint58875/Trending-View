import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { replaceFileAtomically } from "../../scripts/atomic-file";
import { SmaPositionOverlay, RSI_SHAPE_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS } from "../../lib/analysis/sma-position-overlay";
import { runStrategyCycleCloseBacktest, strategyCycleSignalDirection, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import { runAllocationBacktest, type BacktestSettings } from "../../lib/analysis/backtest";
import type { MarketBar } from "../../lib/market/types";
import { segment } from "../nikkei-switch-turnover/run";
import { DAYS, replay, validateProgress, type Replay } from "./model";

const root = dirname(fileURLToPath(import.meta.url));
const sha = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
async function bounded(path: string) {
  if ((await stat(path)).size > 16 * 1024 ** 2) throw new Error(`JSON exceeds16MiB: ${path}`);
  return readFile(path, "utf8");
}
async function atomic(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, typeof value === "string" ? value : JSON.stringify(value));
  await replaceFileAtomically(`${path}.tmp`, path);
}
type Metrics = ReturnType<typeof segment>;
interface Row {
  policy: string; days: number; full: Metrics; train: Metrics; validation: Metrics; audit: Metrics;
  gross: Metrics; stress: Metrics; nextOpen: Metrics; nextOpenAudit: Metrics; blocks250: Metrics[];
  blocked: number; blockedEntries: number; blockedAdds: number; riskDays: number; sales: number;
  targetHash: string; sellBuyWithin7: number; missedUpBlocks: number;
}
function qualifies(row: Row, base: Row) {
  return row.days > 0 && row.train.totalReturn >= base.train.totalReturn - 3 - 1e-8 &&
    row.train.maxDrawdown >= base.train.maxDrawdown - 2 - 1e-8 && row.validation.totalReturn >= base.validation.totalReturn - 1e-8 &&
    row.validation.maxDrawdown >= base.validation.maxDrawdown - 1 - 1e-8 &&
    row.train.turnover <= base.train.turnover * .95 && row.validation.turnover <= base.validation.turnover * .95;
}

async function main() {
  const source = join(root, "../nikkei-overlay-stability/data/full-screen-6-15");
  const inputText = await bounded(join(source, "input.json")), signalsText = await bounded(join(source, "signals.json"));
  const input = JSON.parse(inputText) as { bars: MarketBar[]; barsHash: string; settings: BacktestSettings; snapshots: { decisionIndex: number; decisionTime: string }[] };
  const saved = JSON.parse(signalsText) as { sourceHash: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[] };
  const { bars, settings } = input, start = bars.length - 2000, sourceHash = sha(input);
  assert.equal(sourceHash, saved.sourceHash); assert.equal(sha(bars), input.barsHash);
  assert.ok(start >= 0 && bars.length <= 10000 && saved.rows.length <= 2048);
  assert.ok(bars.every((bar, i) => bar.close > 0 && Number.isFinite(bar.close) && (!i || bar.time > bars[i - 1].time)));
  assert.deepEqual(saved.rows.map((row) => row.index), input.snapshots.map((row) => row.decisionIndex));
  assert.ok(input.snapshots.every((row, i) => row.decisionTime === bars[row.decisionIndex].time && (!i || row.decisionIndex > input.snapshots[i - 1].decisionIndex)));
  const files = ["DESIGN.md", "model.ts", "run.ts", "../nikkei-switch-turnover/run.ts", "../../scripts/atomic-file.ts",
    "../../lib/analysis/sma-position-overlay.ts", "../../lib/analysis/indicators.ts", "../../lib/analysis/backtest.ts", "../../lib/analysis/strategy-cycle-validation.ts"];
  const implementationHash = sha(await Promise.all(files.map((file) => bounded(join(root, file))))), identity = sha({ sourceHash, implementationHash });
  const data = join(root, "data", identity), output = join(root, "output", identity), checkpoint = join(data, "progress.json");
  let rows: Row[] = [], attempts = 0, peakMiB = process.memoryUsage().rss / 1024 ** 2;
  try {
    const savedProgress = JSON.parse(await bounded(checkpoint)); validateProgress(savedProgress, identity, sha(savedProgress.rows));
    rows = savedProgress.rows; attempts = savedProgress.attempts; peakMiB = Math.max(peakMiB, savedProgress.peakMiB ?? 0);
    for (const row of rows) { const completed = JSON.parse(await bounded(join(output, `${row.policy}.json`)));
      assert.equal(completed.identity, identity); assert.deepEqual(completed.row, row); }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    if (rows.length) throw new Error("Checkpoint references a missing completed case; preserve and repair research output"); }
  const resumed = rows.length; attempts++;
  await atomic(join(data, "input.json"), inputText); await atomic(join(data, "signals.json"), signalsText);
  await atomic(join(data, "source_registry.jsonl"), JSON.stringify({ source: resolve(source), accessedAt: new Date().toISOString(),
    sourceHash, inputFileHash: sha(inputText), signalsFileHash: sha(signalsText), barsHash: input.barsHash, implementationHash }) + "\n");
  const decisions = new Map(saved.rows.map((row) => [row.index, row.signals]));
  const baseline = replay(bars, decisions, start, 0, settings), native = new SmaPositionOverlay(bars, DEFAULT_POSITION_OVERLAY_OPTIONS), reference = bars.map(() => 0);
  for (let i = start; i < bars.length; i++) {
    const signals = decisions.get(i) ?? [], direction = strategyCycleSignalDirection(signals);
    if (direction) native.request(direction, signals.at(-1)!.targetAllocation, i);
    reference[i] = native.close(i, signals.length > 0);
  }
  assert.deepEqual(baseline.targets, reference); assert.deepEqual(baseline.cursor.overlay, native.checkpoint());
  const measure = (path: Replay, mode = "actual") => mode === "next-open"
    ? runAllocationBacktest(bars, path.targets, { ...settings, positionOverlay: undefined, executionPolicy: "hybrid" })
    : runStrategyCycleCloseBacktest(bars, path.targets, mode === "gross" ? { ...settings, commissionRate: 0, slippageRate: 0 }
      : mode === "stress" ? { ...settings, commissionRate: .0018, slippageRate: .0002 } : settings);
  const baselineResult = measure(baseline); assert.equal(baselineResult.totalReturn, 440.9807031454993);
  const metrics = (result: ReturnType<typeof measure>, from = 0, to = 2000) => segment(result, from, to, settings.initialCash);
  const indexByTime = new Map(bars.map((bar, i) => [bar.time, i]));
  const pairs = (path: Replay) => path.fills.slice(1).flatMap((buy, i) => {
    const sell = path.fills[i];
    if (sell.targetAllocation >= sell.fromAllocation - 1e-10 || buy.targetAllocation <= buy.fromAllocation + 1e-10) return [];
    const sessions = indexByTime.get(buy.time)! - indexByTime.get(sell.time)!;
    return sessions > 7 ? [] : [{ sell: sell.time, buy: buy.time, sessions }];
  });
  const buildRow = (days: number, path: Replay): Row => {
    const result = measure(path), next = measure(path, "next-open"), blocked = path.events.filter((event) => event.blocked);
    assert.deepEqual(path.fills, result.rebalances, "Research economic clock must match all actual close-proxy fills");
    assert.ok(Math.abs(path.cursor.account.cash + path.cursor.account.units * bars.at(-1)!.close - result.finalEquity) < 1e-7);
    for (const fill of path.fills) if (fill.targetAllocation > fill.fromAllocation + 1e-10 && days > 0) {
      const index = indexByTime.get(fill.time)!;
      const priorSales = path.fills.filter((prior) => prior.time < fill.time && prior.targetAllocation < prior.fromAllocation - 1e-10);
      const prior = priorSales.at(-1);
      assert.ok(!prior || index - indexByTime.get(prior.time)! > days, `Economic buy violates cooldown X${days} at${fill.time}`);
    }
    let missedUpBlocks = 0;
    for (let from = 0; from + 20 <= 2000; from += 20) {
      const priceReturn = bars[start + from + 19].close / bars[start + Math.max(0, from - 1)].close - 1;
      if (priceReturn >= .05 && metrics(result, from, from + 20).totalReturn < metrics(baselineResult, from, from + 20).totalReturn - 1e-8) missedUpBlocks++;
    }
    return { policy: `X${days}`, days, full: metrics(result), train: metrics(result, 0, 1000), validation: metrics(result, 1000, 1500), audit: metrics(result, 1500, 2000),
      gross: metrics(measure(path, "gross")), stress: metrics(measure(path, "stress")), nextOpen: metrics(next), nextOpenAudit: metrics(next, 1500, 2000),
      blocks250: Array.from({ length: 8 }, (_, i) => metrics(result, i * 250, (i + 1) * 250)), blocked: blocked.length,
      blockedEntries: blocked.filter((event) => event.flat).length, blockedAdds: blocked.filter((event) => !event.flat).length,
      riskDays: path.events.filter((event) => event.risk).length, sales: path.events.filter((event) => event.sold).length,
      targetHash: sha(path.targets), sellBuyWithin7: pairs(path).length, missedUpBlocks };
  };
  let interrupted = false; process.on("SIGINT", () => { interrupted = true; }); process.on("SIGTERM", () => { interrupted = true; });
  const limitIndex = process.argv.indexOf("--limit"), limit = limitIndex < 0 ? Infinity : Number(process.argv[limitIndex + 1]);
  assert.ok(limit > 0 && (limit === Infinity || Number.isInteger(limit)));
  const progress = async (status: string, lastError: string | null = null) => atomic(checkpoint, { identity, hash: sha(rows), status, attempts,
    completed: rows.length, pending: DAYS.length - rows.length, updatedAt: new Date().toISOString(), lastError, peakMiB, rows });
  try {
    for (const days of DAYS.slice(rows.length)) {
      peakMiB = Math.max(peakMiB, process.memoryUsage().rss / 1024 ** 2);
      if (peakMiB > 1536) throw new Error("RSS exceeds1.5GiB");
      if (interrupted || rows.length - resumed >= limit) { await progress("partial", "Stopped at safe case boundary; rerun to resume");
        console.log(JSON.stringify({ status: "partial", identity, completed: rows.length, resumed, peakMiB })); return; }
      const path = replay(bars, decisions, start, days, settings), row = buildRow(days, path);
      await atomic(join(output, `${row.policy}.json`), { identity, row, events: path.events, fills: path.fills, cursor: path.cursor, sellBuyPairs: pairs(path) });
      rows.push(row); await progress("running"); console.log(JSON.stringify(row));
      await new Promise<void>((done) => setImmediate(done));
    }
    for (const row of rows) {
      const fresh = replay(bars, decisions, start, row.days, settings); assert.deepEqual(buildRow(row.days, fresh), row);
      for (const offset of [700, 1499]) {
        const end = start + offset, partial = replay(bars, decisions, start, row.days, settings, end);
        assert.deepEqual(replay(bars, decisions, start, row.days, settings, bars.length, JSON.parse(JSON.stringify(partial))), fresh);
        const prefix = replay(bars.slice(0, end), decisions, start, row.days, settings);
        assert.deepEqual(prefix.targets, fresh.targets.slice(0, end)); assert.deepEqual(prefix.cursor, partial.cursor);
      }
    }
    peakMiB = Math.max(peakMiB, process.memoryUsage().rss / 1024 ** 2); if (peakMiB > 1536) throw new Error("RSS exceeds1.5GiB during audit");
    const qualified = rows.filter((row) => qualifies(row, rows[0])).sort((a, b) => b.validation.totalReturn - a.validation.totalReturn || a.days - b.days);
    const summary = { identity, sourceHash, implementationHash, start: bars[start].time, end: bars.at(-1)!.time, resumed, attempts, peakMiB,
      selected: qualified[0]?.policy ?? "X0", qualified: qualified.map((row) => row.policy), rows };
    await atomic(join(output, "summary.json"), summary);
    const table = ["| X sessions | Full net | MaxDD | Fills | Turnover | Train net | Validation net | Final500 | Blocked entry/add | Sell-buy <=7 | Missed up blocks |",
      "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
      ...rows.map((row) => `| ${row.days} | ${row.full.totalReturn.toFixed(2)}% | ${row.full.maxDrawdown.toFixed(2)}% | ${row.full.fills} | ${row.full.turnover.toFixed(2)} | ${row.train.totalReturn.toFixed(2)}% | ${row.validation.totalReturn.toFixed(2)}% | ${row.audit.totalReturn.toFixed(2)}% | ${row.blockedEntries}/${row.blockedAdds} | ${row.sellBuyWithin7} | ${row.missedUpBlocks} |`)];
    const costs = ["| X | Gross | Actual net | Stress20bps | Next-open net | Next-open maxDD | Next-open final500 |",
      "| --- | ---: | ---: | ---: | ---: | ---: | ---: |", ...rows.map((row) => `| ${row.days} | ${row.gross.totalReturn.toFixed(2)}% | ${row.full.totalReturn.toFixed(2)}% | ${row.stress.totalReturn.toFixed(2)}% | ${row.nextOpen.totalReturn.toFixed(2)}% | ${row.nextOpen.maxDrawdown.toFixed(2)}% | ${row.nextOpenAudit.totalReturn.toFixed(2)}% |`)];
    await atomic(join(root, "RESULTS.md"), `# Post-reduction increase cooldown results\n\n${summary.start}..${summary.end};2000 sessions;current v8;1293 frozen screening decisions.\nSource:${sourceHash}. Identity:${identity}.\n\nActual sales, including partial/full/risk exits, block ALL increases on the NEXT X completed trading sessions. New sales reset the clock. No delayed order queue or automatic refill. Existing risk exits/cooldown stay active.\n\n${table.join("\n")}\n\nQualified:${summary.qualified.join(", ") || "none"}. Selected:${summary.selected}. Selection uses development1000 and validation500 only. Final500 is reused conditional historical audit. No production adoption.\n\n## Cost and timing sensitivity\n\n${costs.join("\n")}\n\nActual3bps commission+2bps slippage per side; stress20bps total per side. Gross/net differences include compounding, not just fee cash. Next-open sensitivity applies different fills to the SAME controller/cooldown path; it is not a fill-aware next-open policy. Main timing is the existing Nikkei index-close proxy, not China-product execution.\n\n## Verification and interpretation\n\nX0 matches every production target, final controller state, actual fill and440.9807031454993% return. All7 cases freshly audited;14 truncated prefixes and14 serialized controller+clock+cash resumes match. Every buy is later than its applicable actual-sale deadline. Economic clock fills exactly match the shared backtester. Peak observed RSS:${peakMiB.toFixed(1)}MiB below1536MiB. Source/design/code-keyed raw backup/checkpoints and full event/fill ledgers remain local in data/output.\n\nBlocked entries/adds count attempted decisions, not independent trades. Consecutive sell-buy pairs can overlap. Missed up blocks are fixed nonoverlapping20-session blocks with>=5% raw price gain in which policy return is below baseline. Zero missed blocks does not establish no lost upside. Sample/winners/v8 have been repeatedly examined; these are historical comparisons, not untouched validation or significance claims. No production or saved-account changes.\n`);
    await atomic(join(output, "manifest.json"), { identity, status: "complete", completed: 7, pending: 0, updatedAt: new Date().toISOString(),
      summaryHash: sha(summary), nativeBaselineParity: true, freshAudits: 7, causalPrefixes: 14, serializedResumes: 14, peakMiB });
    await progress("complete"); await atomic(join(root, "output/latest.json"), { identity, summary: `output/${identity}/summary.json` });
    console.log(JSON.stringify({ status: "complete", identity, selected: summary.selected, qualified: summary.qualified, resumed, peakMiB }));
  } catch (error) { await progress("failed", error instanceof Error ? error.message : String(error)); throw error; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error); process.exitCode = 1; });
