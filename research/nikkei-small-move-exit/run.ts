import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { replaceFileAtomically } from "../../scripts/atomic-file";
import { SmaPositionOverlay, BIAS_ADD_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS, RSI_SHAPE_POSITION_OVERLAY_OPTIONS } from "../../lib/analysis/sma-position-overlay";
import { runStrategyCycleCloseBacktest, strategyCycleSignalDirection, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import { runAllocationBacktest, type BacktestSettings } from "../../lib/analysis/backtest";
import type { MarketBar } from "../../lib/market/types";
import { segment } from "../nikkei-switch-turnover/run";
import { policies, replay, validateProgress, RiskFeatures, type Replay, type Policy } from "./model";

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
  policy: string; kind: Policy["kind"]; threshold: number; full: Metrics; train: Metrics; validation: Metrics; audit: Metrics;
  gross: Metrics; stress: Metrics; nextOpen: Metrics; nextOpenAudit: Metrics; blocks250: Metrics[];
  blockedExits: number; riskSales: number; targetHash: string; sellBuyWithin7: number; missedUpBlocks: number;
}
function qualifies(row: Row, base: Row) {
  return row.kind !== "baseline" && row.train.totalReturn >= base.train.totalReturn - 3 - 1e-8 &&
    row.train.maxDrawdown >= base.train.maxDrawdown - 2 - 1e-8 && row.validation.totalReturn >= base.validation.totalReturn - 1e-8 &&
    row.validation.maxDrawdown >= base.validation.maxDrawdown - 1 - 1e-8 &&
    row.train.turnover <= base.train.turnover * .95 && row.validation.turnover <= base.validation.turnover * .95;
}

async function main() {
  const current = process.argv.includes("--current"), overlayOptions = current ? DEFAULT_POSITION_OVERLAY_OPTIONS : RSI_SHAPE_POSITION_OVERLAY_OPTIONS;
  const baselineReturn = current ? 445.34209325762885 : 440.9807031454993, version = current ? "v9" : "v8";
  const source = join(root, "../nikkei-overlay-stability/data/full-screen-6-15");
  const inputText = await bounded(join(source, "input.json")), signalsText = await bounded(join(source, "signals.json"));
  const input = JSON.parse(inputText) as { bars: MarketBar[]; barsHash: string; settings: BacktestSettings; snapshots: { decisionIndex: number; decisionTime: string }[] };
  const saved = JSON.parse(signalsText) as { sourceHash: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[] };
  const { bars, settings } = input, start = bars.length - 2000, sourceHash = sha(input);
  assert.equal(sourceHash, saved.sourceHash); assert.equal(sha(bars), input.barsHash);
  assert.ok(start >= 0 && bars.length <= 10000 && saved.rows.length <= 2048);
  assert.deepEqual(saved.rows.map((row) => row.index), input.snapshots.map((row) => row.decisionIndex));
  assert.ok(input.snapshots.every((row, i) => row.decisionTime === bars[row.decisionIndex].time && (!i || row.decisionIndex > input.snapshots[i - 1].decisionIndex)));
  const files = ["DESIGN.md", "model.ts", "run.ts", "../nikkei-chop-filter/model.ts", "../nikkei-switch-turnover/run.ts", "../nikkei-switch-turnover/model.ts",
    "../../scripts/atomic-file.ts", "../../lib/analysis/sma-position-overlay.ts", "../../lib/analysis/indicators.ts", "../../lib/analysis/backtest.ts",
    "../../lib/analysis/strategy-cycle-validation.ts"];
  const implementationHash = sha(await Promise.all(files.map((file) => bounded(join(root, file))))), identity = sha({ sourceHash, implementationHash, model: overlayOptions.model });
  const data = join(root, "data", identity), output = join(root, "output", identity), checkpoint = join(data, "progress.json"), menu = policies();
  assert.equal(menu.length, 21);
  let rows: Row[] = [], attempts = 0, peakMiB = process.memoryUsage().rss / 1024 ** 2;
  try {
    const savedProgress = JSON.parse(await bounded(checkpoint)); validateProgress(savedProgress, identity, sha(savedProgress.rows));
    rows = savedProgress.rows; attempts = savedProgress.attempts; peakMiB = Math.max(peakMiB, savedProgress.peakMiB ?? 0);
    for (const row of rows) { const completed = JSON.parse(await bounded(join(output, `${row.policy}.json`)));
      assert.equal(completed.identity, identity); assert.deepEqual(completed.row, row); }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    if (rows.length) throw new Error("Checkpoint references missing completed output; preserve and repair research state"); }
  const resumed = rows.length; attempts++;
  await atomic(join(data, "input.json"), inputText); await atomic(join(data, "signals.json"), signalsText);
  await atomic(join(data, "source_registry.jsonl"), JSON.stringify({ source: resolve(source), accessedAt: new Date().toISOString(),
    sourceHash, inputFileHash: sha(inputText), signalsFileHash: sha(signalsText), barsHash: input.barsHash, implementationHash }) + "\n");
  const decisions = new Map(saved.rows.map((row) => [row.index, row.signals])), features = new RiskFeatures(bars);
  const baseline = replay(features, decisions, start, menu[0], settings, bars.length, undefined, overlayOptions), native = new SmaPositionOverlay(bars, overlayOptions, 0, 1), reference = bars.map(() => 0);
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
  const baselineResult = measure(baseline); assert.ok(Math.abs(baselineResult.totalReturn - baselineReturn) < 1e-8, "Pinned execution-version baseline differs");
  const metrics = (result: ReturnType<typeof measure>, from = 0, to = 2000) => segment(result, from, to, settings.initialCash);
  const indexByTime = new Map(bars.map((bar, i) => [bar.time, i]));
  const pairs = (path: Replay) => path.fills.slice(1).flatMap((buy, i) => {
    const sell = path.fills[i];
    if (sell.targetAllocation >= sell.fromAllocation - 1e-10 || buy.targetAllocation <= buy.fromAllocation + 1e-10) return [];
    const sessions = indexByTime.get(buy.time)! - indexByTime.get(sell.time)!;
    return sessions > 7 ? [] : [{ sell: sell.time, buy: buy.time, sessions }];
  });
  const buildRow = (policy: Policy, path: Replay): Row => {
    const result = measure(path), next = measure(path, "next-open");
    assert.deepEqual(path.fills, result.rebalances, "Episode ledger must match all actual close-proxy fills");
    assert.ok(Math.abs(path.cursor.account.cash + path.cursor.account.units * bars.at(-1)!.close - result.finalEquity) < 1e-7);
    assert.ok(path.events.filter((event) => event.blocked).every((event) => event.from > 0 && event.target === event.from &&
      event.wanted <= 1e-10 && !event.risk && event.measure !== null && event.measure < policy.threshold));
    let missedUpBlocks = 0;
    for (let from = 0; from + 20 <= 2000; from += 20) {
      const priceReturn = bars[start + from + 19].close / bars[start + Math.max(0, from - 1)].close - 1;
      if (priceReturn >= .05 && metrics(result, from, from + 20).totalReturn < metrics(baselineResult, from, from + 20).totalReturn - 1e-8) missedUpBlocks++;
    }
    return { policy: policy.id, kind: policy.kind, threshold: policy.threshold,
      full: metrics(result), train: metrics(result, 0, 1000), validation: metrics(result, 1000, 1500), audit: metrics(result, 1500, 2000),
      gross: metrics(measure(path, "gross")), stress: metrics(measure(path, "stress")), nextOpen: metrics(next), nextOpenAudit: metrics(next, 1500, 2000),
      blocks250: Array.from({ length: 8 }, (_, i) => metrics(result, i * 250, (i + 1) * 250)),
      blockedExits: path.events.filter((event) => event.blocked).length, riskSales: path.events.filter((event) => event.risk).length,
      targetHash: sha(path.targets), sellBuyWithin7: pairs(path).length, missedUpBlocks };
  };
  let interrupted = false; process.on("SIGINT", () => { interrupted = true; }); process.on("SIGTERM", () => { interrupted = true; });
  const limitIndex = process.argv.indexOf("--limit"), limit = limitIndex < 0 ? Infinity : Number(process.argv[limitIndex + 1]);
  assert.ok(limit > 0 && (limit === Infinity || Number.isInteger(limit)));
  const progress = async (status: string, lastError: string | null = null) => atomic(checkpoint, { identity, hash: sha(rows), status, attempts,
    completed: rows.length, pending: menu.length - rows.length, updatedAt: new Date().toISOString(), lastError, peakMiB, rows });
  try {
    for (const policy of menu.slice(rows.length)) {
      peakMiB = Math.max(peakMiB, process.memoryUsage().rss / 1024 ** 2);
      if (peakMiB > 1536) throw new Error("RSS exceeds1.5GiB");
      if (interrupted || rows.length - resumed >= limit) { await progress("partial", "Stopped at safe case boundary; rerun to resume");
        console.log(JSON.stringify({ status: "partial", identity, completed: rows.length, resumed, peakMiB })); return; }
      const path = replay(features, decisions, start, policy, settings, bars.length, undefined, overlayOptions), row = buildRow(policy, path);
      await atomic(join(output, `${row.policy}.json`), { identity, row, events: path.events, fills: path.fills, cursor: path.cursor, sellBuyPairs: pairs(path) });
      rows.push(row); await progress("running");
      console.log(JSON.stringify({ policy: row.policy, full: row.full, final500: row.audit.totalReturn, blocked: row.blockedExits }));
      await new Promise<void>((done) => setImmediate(done));
    }
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i], policy = menu[i], fresh = replay(features, decisions, start, policy, settings, bars.length, undefined, overlayOptions); assert.deepEqual(buildRow(policy, fresh), row);
      for (const offset of [700, 1499]) {
        const end = start + offset, partial = replay(features, decisions, start, policy, settings, end, undefined, overlayOptions);
        assert.deepEqual(replay(features, decisions, start, policy, settings, bars.length, JSON.parse(JSON.stringify(partial)), overlayOptions), fresh);
        const prefix = replay(new RiskFeatures(bars.slice(0, end)), decisions, start, policy, settings, end, undefined, overlayOptions);
        assert.deepEqual(prefix.targets, fresh.targets.slice(0, end)); assert.deepEqual(prefix.cursor, partial.cursor);
      }
    }
    peakMiB = Math.max(peakMiB, process.memoryUsage().rss / 1024 ** 2); if (peakMiB > 1536) throw new Error("RSS exceeds1.5GiB during audit");
    const qualified = rows.filter((row) => qualifies(row, rows[0])).sort((a, b) => b.validation.totalReturn - a.validation.totalReturn || a.policy.localeCompare(b.policy));
    const summary = { identity, version, overlayModel: overlayOptions.model, holdingAddDecisionLag: 1, sourceHash, implementationHash, start: bars[start].time, end: bars.at(-1)!.time, resumed, attempts, peakMiB,
      selected: qualified[0]?.policy ?? "baseline", qualified: qualified.map((row) => row.policy), rows };
    await atomic(join(output, "summary.json"), summary);
    const table = ["| Policy | Full net | MaxDD | Fills | Turnover | Train net | Validation net | Final500 | Blocked full-exit attempts | Sell-buy <=7 |",
      "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
      ...rows.map((row) => `| ${row.policy} | ${row.full.totalReturn.toFixed(2)}% | ${row.full.maxDrawdown.toFixed(2)}% | ${row.full.fills} | ${row.full.turnover.toFixed(2)} | ${row.train.totalReturn.toFixed(2)}% | ${row.validation.totalReturn.toFixed(2)}% | ${row.audit.totalReturn.toFixed(2)}% | ${row.blockedExits} | ${row.sellBuyWithin7} |`)];
    const costs = ["| Policy | Gross | Actual net | Stress20bps | Next-open net | Next-open maxDD | Next-open final500 | Missed up blocks |",
      "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |", ...rows.map((row) => `| ${row.policy} | ${row.gross.totalReturn.toFixed(2)}% | ${row.full.totalReturn.toFixed(2)}% | ${row.stress.totalReturn.toFixed(2)}% | ${row.nextOpen.totalReturn.toFixed(2)}% | ${row.nextOpen.maxDrawdown.toFixed(2)}% | ${row.nextOpenAudit.totalReturn.toFixed(2)}% | ${row.missedUpBlocks} |`)];
    await atomic(join(root, current ? "RESULTS_V9.md" : "RESULTS.md"), `# Small-move ordinary full-exit protection results (${version})\n\n${summary.start}..${summary.end};2000 sessions;${version};1293 frozen decisions.\nSource:${sourceHash}. Identity:${identity}.\n\nCost=absolute current-close distance from actual first-entry unit cost (including fees/slippage). Range=post-entry high-low divided by first-entry cost. Adds/partial sales retain the reference; full flat resets. Entry-day pre-entry extrema excluded. Ordinary FULL exits only; partial sales and early4%/ATR hard exits pass. No reduction cooldown is combined. Native holding-add flag uses the cycle page's next-session lag1.\n\n${table.join("\n")}\n\nQualified:${summary.qualified.join(", ") || "none"}. Selected:${summary.selected}. Qualification uses first1000 and next500 only; final500 is reused conditional historical audit. No automatic adoption.\n\n## Cost and timing sensitivity\n\n${costs.join("\n")}\n\nActual3bps commission+2bps slippage per side; stress20bps total per side. Gross/net differences include compounding, not fee cash sums. Next-open uses the SAME close-derived controller/cost/range path with different execution prices, not a fill-aware redesign. Main Nikkei-close proxy is not a real China-product quote.\n\n## Verification and limitations\n\nBaseline target/final controller/fill identity and${baselineReturn}% return match pinned ${version} cycle execution. All21 cases freshly audited;42 truncated prefixes and42 serialized controller/episode/cash resumes match. Every fill and final cash equity match the shared backtester. All protected exits satisfy the declared live criterion and exclude hard risk. Peak observed RSS:${peakMiB.toFixed(1)}MiB below1536MiB.\n\nBlocked attempts can repeat and are not independent avoided sales. Consecutive sell-buy pairs can overlap. Fixed20-session price-up>=5% underperformance blocks are descriptive. The native4% stop retains its original early-entry age coverage; it is not a lifetime4% stop. Dataset, winners and overlay rules have been repeatedly inspected; this is conditional historical evidence, not untouched holdout or significance. Product rules/accounts/archives remain unchanged by this task. DESIGN/README document deterministic atomic recovery; detailed ledgers remain ignored in output/${identity}/.\n`);
    await atomic(join(output, "manifest.json"), { identity, status: "complete", completed: 21, pending: 0, updatedAt: new Date().toISOString(),
      summaryHash: sha(summary), nativeBaselineParity: true, freshAudits: 21, causalPrefixes: 42, serializedResumes: 42, peakMiB });
    await progress("complete"); await atomic(join(root, current ? "output/latest-v9.json" : "output/latest.json"), { identity, summary: `output/${identity}/summary.json` });
    console.log(JSON.stringify({ status: "complete", identity, selected: summary.selected, qualified: summary.qualified, resumed, peakMiB }));
  } catch (error) { await progress("failed", error instanceof Error ? error.message : String(error)); throw error; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error); process.exitCode = 1; });
