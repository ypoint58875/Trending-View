import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { replaceFileAtomically } from "../../scripts/atomic-file";
import { BIAS_ADD_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS } from "../../lib/analysis/sma-position-overlay";
import { buildStrategyCycleRollingReport, runStrategyCycleCloseBacktest,
  type StrategyCycleRecentSignal, type StrategyCycleSelectionSnapshot } from "../../lib/analysis/strategy-cycle-validation";
import { runAllocationBacktest, type BacktestSettings, type AllocationRebalance } from "../../lib/analysis/backtest";
import type { MarketBar } from "../../lib/market/types";
import { segment } from "../nikkei-switch-turnover/run";
import { replay as priorReplay, policies as priorPolicies } from "../nikkei-small-move-exit/model";
import { replay, POLICIES, RiskFeatures, validateProgress, type Policy, type Replay } from "./model";
import { diagnose } from "./report";

const root = dirname(fileURLToPath(import.meta.url));
const sha = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
async function bounded(path: string) {
  if ((await stat(path)).size > 16 * 1024 ** 2) throw new Error(`JSON exceeds16MiB: ${path}`);
  return readFile(path, "utf8");
}
async function atomic(path: string, value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (Buffer.byteLength(text) > 16 * 1024 ** 2) throw new Error(`Output exceeds16MiB: ${path}`);
  await mkdir(dirname(path), { recursive: true }); await writeFile(`${path}.tmp`, text);
  await replaceFileAtomically(`${path}.tmp`, path);
}
type Metrics = ReturnType<typeof segment>;
interface Row {
  policy: string; threshold: number; basePriority: boolean;
  full: Metrics; train: Metrics; validation: Metrics; audit: Metrics; gross: Metrics; stress: Metrics;
  nextOpen: Metrics; nextOpenAudit: Metrics; blocks250: Metrics[]; targetHash: string;
  blocked: number; spells: number; baseClearVetoes: number; basePendingVetoes: number;
  undonePartials: number; preservedPartials: number; riskInsideBand: number;
  deferredPost5LossSpells: number; worstDeferredEntryLoss: number;
}
const economic = (fills: AllocationRebalance[]) => fills.map(({ time, fromAllocation, targetAllocation, fillPrice, reason }) =>
  ({ time, fromAllocation, targetAllocation, fillPrice, reason }));

async function main() {
  const source = join(root, "../nikkei-overlay-stability/data/full-screen-6-15");
  const inputText = await bounded(join(source, "input.json")), signalsText = await bounded(join(source, "signals.json"));
  const input = JSON.parse(inputText) as { bars: MarketBar[]; barsHash: string; settings: BacktestSettings; snapshots: StrategyCycleSelectionSnapshot[] };
  const saved = JSON.parse(signalsText) as { sourceHash: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[] };
  const { bars, settings } = input, start = bars.length - 2000, sourceHash = sha(input);
  assert.equal(sourceHash, saved.sourceHash); assert.equal(sha(bars), input.barsHash);
  assert.ok(start >= 0 && bars.length <= 10000 && saved.rows.length <= 2048);
  assert.deepEqual(saved.rows.map((row) => row.index), input.snapshots.map((row) => row.decisionIndex));
  assert.ok(input.snapshots.every((row, i) => row.decisionTime === bars[row.decisionIndex].time && row.screeningWindow === 10 &&
    (!i || row.decisionIndex > input.snapshots[i - 1].decisionIndex)));
  const files = ["DESIGN.md", "model.ts", "report.ts", "run.ts", "../nikkei-small-move-exit/model.ts", "../nikkei-chop-filter/model.ts",
    "../nikkei-switch-turnover/run.ts", "../nikkei-switch-turnover/model.ts", "../../scripts/atomic-file.ts",
    "../../lib/analysis/sma-position-overlay.ts", "../../lib/analysis/indicators.ts", "../../lib/analysis/backtest.ts",
    "../../lib/analysis/strategy-cycle-validation.ts", "../../lib/analysis/strategy-combinations.ts"];
  const implementationHash = sha(await Promise.all(files.map((file) => bounded(join(root, file)))));
  const identity = sha({ sourceHash, implementationHash, model: DEFAULT_POSITION_OVERLAY_OPTIONS.model, lag: 1 });
  const data = join(root, "data", identity), output = join(root, "output", identity), checkpoint = join(data, "progress.json");
  let rows: Row[] = [], attempts = 0, peakMiB = process.memoryUsage().rss / 1024 ** 2;
  try {
    const progress = JSON.parse(await bounded(checkpoint)); validateProgress(progress, identity, sha(progress.rows));
    rows = progress.rows; attempts = progress.attempts; peakMiB = Math.max(peakMiB, progress.peakMiB ?? 0);
    for (const row of rows) { const completed = JSON.parse(await bounded(join(output, `${row.policy}.json`)));
      assert.equal(completed.identity, identity); assert.deepEqual(completed.row, row); }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    if (rows.length) throw new Error("Missing completed integration case; preserve and repair local research state"); }
  const resumed = rows.length; attempts++;
  await atomic(join(data, "input.json"), inputText); await atomic(join(data, "signals.json"), signalsText);
  await atomic(join(data, "source_registry.jsonl"), JSON.stringify({ accessedAt: new Date().toISOString(), source: resolve(source), sourceHash,
    inputFileHash: sha(inputText), signalsFileHash: sha(signalsText), barsHash: input.barsHash, implementationHash, model: DEFAULT_POSITION_OVERLAY_OPTIONS.model, lag: 1 }) + "\n");
  const labels = new Map(input.snapshots.map((row) => [row.decisionIndex, row.label]));
  const decisions = new Map(saved.rows.map((row) => [row.index, { signals: row.signals, selection: labels.get(row.index)! }]));
  const originals = new Map(saved.rows.map((row) => [row.index, row.signals])), features = new RiskFeatures(bars);
  const measure = (path: Replay, mode = "actual") => mode === "next-open"
    ? runAllocationBacktest(bars, path.targets, { ...settings, positionOverlay: undefined, executionPolicy: "hybrid" })
    : runStrategyCycleCloseBacktest(bars, path.targets, mode === "gross" ? { ...settings, commissionRate: 0, slippageRate: 0 }
      : mode === "stress" ? { ...settings, commissionRate: .0018, slippageRate: .0002 } : settings);
  const metrics = (result: ReturnType<typeof measure>, from = 0, to = 2000) => segment(result, from, to, settings.initialCash);
  const buildRow = (policy: Policy, path: Replay): Row => {
    const actual = measure(path), next = measure(path, "next-open"), diagnostics = diagnose(bars, path);
    assert.deepEqual(path.fills, actual.rebalances); assert.equal(path.events.length, 2000);
    assert.ok(Math.abs(path.cursor.account.cash + path.cursor.account.units * bars.at(-1)!.close - actual.finalEquity) < 1e-7);
    for (const event of path.events) {
      if (event.risk) assert.equal(event.blocked, false);
      if (event.blocked) {
        assert.ok(event.wanted <= 1e-10 && event.measure !== null && event.measure < policy.threshold && !event.risk);
        const partial = policy.basePriority && event.direction === "reduce" && event.requestedTarget! > 1e-10 &&
          event.requested.allocation > 0 && event.requested.allocation < event.before.allocation - 1e-10;
        assert.equal(event.target, partial ? event.requested.allocation : event.before.allocation);
        assert.equal(event.accepted.entryIndex, event.before.entryIndex); assert.equal(event.accepted.pending, 0);
        if (policy.basePriority) assert.ok(event.exitSource !== "base-clear" && event.exitSource !== "base-pending");
      } else assert.deepEqual(event.accepted, event.native);
      if (event.native.allocation > 1e-10 && event.native.allocation < event.before.allocation - 1e-10) assert.equal(event.blocked, false);
    }
    const partialAttempts = path.events.filter((event) => event.blocked && event.direction === "reduce" && event.requestedTarget! > 0 &&
      event.requested.allocation > 0 && event.requested.allocation < event.before.allocation - 1e-10);
    return { policy: policy.id, threshold: policy.threshold, basePriority: policy.basePriority,
      full: metrics(actual), train: metrics(actual, 0, 1000), validation: metrics(actual, 1000, 1500), audit: metrics(actual, 1500, 2000),
      gross: metrics(measure(path, "gross")), stress: metrics(measure(path, "stress")), nextOpen: metrics(next), nextOpenAudit: metrics(next, 1500, 2000),
      blocks250: Array.from({ length: 8 }, (_, i) => metrics(actual, i * 250, (i + 1) * 250)), targetHash: sha(path.targets),
      blocked: diagnostics.blockedAttempts, spells: diagnostics.spells.length,
      baseClearVetoes: path.events.filter((event) => event.blocked && event.exitSource === "base-clear").length,
      basePendingVetoes: path.events.filter((event) => event.blocked && event.exitSource === "base-pending").length,
      undonePartials: partialAttempts.filter((event) => event.target === event.before.allocation).length,
      preservedPartials: partialAttempts.filter((event) => event.target === event.requested.allocation).length,
      riskInsideBand: path.events.filter((event) => event.risk && event.measure !== null && event.measure < policy.threshold).length,
      deferredPost5LossSpells: diagnostics.postEarlyLossSpells, worstDeferredEntryLoss: diagnostics.worstDeferredEntryLoss };
  };
  let interrupted = false; process.on("SIGINT", () => { interrupted = true; }); process.on("SIGTERM", () => { interrupted = true; });
  const limitIndex = process.argv.indexOf("--limit"), limit = limitIndex < 0 ? Infinity : Number(process.argv[limitIndex + 1]);
  assert.ok(limit > 0 && (limit === Infinity || Number.isInteger(limit)));
  const progress = async (status: string, lastError: string | null = null) => atomic(checkpoint, { identity, hash: sha(rows), status, attempts,
    completed: rows.length, pending: POLICIES.length - rows.length, updatedAt: new Date().toISOString(), lastError, peakMiB, rows });
  try {
    for (const policy of POLICIES.slice(rows.length)) {
      peakMiB = Math.max(peakMiB, process.memoryUsage().rss / 1024 ** 2);
      if (peakMiB > 1536) throw new Error("RSS exceeds1.5GiB");
      if (interrupted || rows.length - resumed >= limit) { await progress("partial", "Stopped at safe policy boundary; rerun to resume");
        console.log(JSON.stringify({ status: "partial", identity, completed: rows.length, resumed, peakMiB })); return; }
      const path = replay(features, decisions, start, policy, settings), row = buildRow(policy, path);
      if (!policy.basePriority) {
        const previousPolicy = priorPolicies().find((candidate) => policy.threshold ? candidate.kind === "range" && candidate.threshold === policy.threshold : candidate.kind === "baseline")!;
        const previous = priorReplay(features, originals, start, previousPolicy, settings, bars.length, undefined, DEFAULT_POSITION_OVERLAY_OPTIONS);
        assert.deepEqual(path.targets, previous.targets); assert.deepEqual(path.cursor.overlay, previous.cursor.overlay);
        assert.deepEqual(path.fills, previous.fills);
      }
      await atomic(join(output, `${policy.id}.json`), { identity, row, events: path.events, fills: path.fills, cursor: path.cursor, diagnostics: diagnose(bars, path) });
      rows.push(row); await progress("running"); console.log(JSON.stringify(row));
      await new Promise<void>((done) => setImmediate(done));
    }
    for (let i = 0; i < POLICIES.length; i++) {
      const policy = POLICIES[i], fresh = replay(features, decisions, start, policy, settings); assert.deepEqual(buildRow(policy, fresh), rows[i]);
      for (const offset of [700, 1499]) {
        const end = start + offset, partial = replay(features, decisions, start, policy, settings, end);
        assert.deepEqual(replay(features, decisions, start, policy, settings, bars.length, JSON.parse(JSON.stringify(partial))), fresh);
        const prefix = replay(new RiskFeatures(bars.slice(0, end)), decisions, start, policy, settings);
        assert.deepEqual(prefix.targets, fresh.targets.slice(0, end)); assert.deepEqual(prefix.cursor, partial.cursor);
      }
    }
    const report = buildStrategyCycleRollingReport(bars, input.snapshots, 2000, 10,
      { ...settings, positionOverlay: DEFAULT_POSITION_OVERLAY_OPTIONS });
    const nativePath = replay(features, decisions, start, POLICIES[0], settings);
    assert.ok(Math.abs(report.updateReturn - 445.34209325762885) < 1e-8);
    assert.equal(report.updateReturn, rows[0].full.totalReturn); assert.deepEqual(economic(report.rebalances), economic(nativePath.fills));
    peakMiB = Math.max(peakMiB, process.memoryUsage().rss / 1024 ** 2); if (peakMiB > 1536) throw new Error("RSS exceeds1.5GiB during audit");
    const summary = { identity, sourceHash, implementationHash, model: DEFAULT_POSITION_OVERLAY_OPTIONS.model, lag: 1,
      start: bars[start].time, end: bars.at(-1)!.time, resumed, attempts, peakMiB, rows,
      productionReport: { totalReturn: report.updateReturn, fills: report.rebalances.length, economicParity: true } };
    await atomic(join(output, "summary.json"), summary);
    const table = ["| Policy | Full net | MaxDD | Fills | Train net | Validation net | Final500 | Blocked attempts/spells | Base clears/pending vetoed | Undone/preserved partials |",
      "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
      ...rows.map((row) => `| ${row.policy} | ${row.full.totalReturn.toFixed(2)}% | ${row.full.maxDrawdown.toFixed(2)}% | ${row.full.fills} | ${row.train.totalReturn.toFixed(2)}% | ${row.validation.totalReturn.toFixed(2)}% | ${row.audit.totalReturn.toFixed(2)}% | ${row.blocked}/${row.spells} | ${row.baseClearVetoes}/${row.basePendingVetoes} | ${row.undonePartials}/${row.preservedPartials} |`)];
    const costs = ["| Policy | Gross | Actual net | Stress20bps | Next-open net | Next-open maxDD | Next-open final500 | Risk exits inside band | Deferred spells losing>=4% after age5 |",
      "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |", ...rows.map((row) => `| ${row.policy} | ${row.gross.totalReturn.toFixed(2)}% | ${row.full.totalReturn.toFixed(2)}% | ${row.stress.totalReturn.toFixed(2)}% | ${row.nextOpen.totalReturn.toFixed(2)}% | ${row.nextOpen.maxDrawdown.toFixed(2)}% | ${row.nextOpenAudit.totalReturn.toFixed(2)}% | ${row.riskInsideBand} | ${row.deferredPost5LossSpells} |`)];
    const details = [];
    for (const policy of POLICIES.slice(1)) {
      const savedCase = JSON.parse(await bounded(join(output, `${policy.id}.json`)));
      details.push(`## Deferred spells: ${policy.id}\n\nNative source totals:${JSON.stringify(savedCase.diagnostics.bySource)}\n\n| First veto | Resolved/end | Sessions | Attempts | Source | Outcome | First age | Price change | MAE | Worst entry loss | Post-age5 loss days |\n| --- | --- | ---: | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: |\n` +
        savedCase.diagnostics.spells.map((spell: ReturnType<typeof diagnose>["spells"][number]) => `| ${spell.first} | ${spell.end} | ${spell.sessions} | ${spell.blockedAttempts} | ${spell.source} | ${spell.outcome} | ${spell.entryAge} | ${spell.closeChange.toFixed(2)}% | ${spell.mae.toFixed(2)}% | ${spell.worstEntryLoss.toFixed(2)}% | ${spell.postEarlyLossDays} |`).join("\n"));
    }
    await atomic(join(root, "RESULTS.md"), `# Range3/range10 integration rerun\n\n${summary.start}..${summary.end};2000 sessions;1293 frozen decisions;current v9 cycle lag1;3bps commission+2bps slippage per side.\nIdentity:${identity}. Source:${sourceHash}.\n\n${table.join("\n")}\n\nAll-ordinary variants reproduce the previous study's full targets/state/fills. Base-priority controls preserve explicit original full clears, necessary original pending clears, and already accepted original partial reductions; only extra controller ordinary full exits are protected. Native holding/MA guards, early4%/ATR, cooldown and incoming-winner rules remain active. No parameter adoption.\n\n${costs.join("\n")}\n\n${details.join("\n\n")}\n\n## Verification and interpretation\n\nReal production cycle report exactly matches baseline${report.updateReturn}% and all economic fills. Five fresh metric audits,10 causal prefixes and10 serialized controller/episode/lineage/cash resumes pass. Same-state probes never replace the accepted account. Deferred spell price changes/MAE are descriptive, can overlap and are not summed portfolio impacts. Stop4% retains its original first5-session age coverage. Gross/net includes compounding. Next-open reuses the SAME cycle-lag1 controller/episode path at different fill prices, not an execution-specific redesigned policy.\n\nFrozen data ends2026-10-26 and is not the newer browser account ending2026-11-05. Winners/overlay/sample have been repeatedly studied; final500 is conditional historical audit, not untouched holdout. Main Nikkei close is a proxy, real China-product execution untested. Peak observed RSS:${peakMiB.toFixed(1)}MiB below1536MiB. Raw/derived/checkpoint files stay separate and ignored. Production/account/archive files unchanged.\n`);
    await atomic(join(output, "manifest.json"), { identity, status: "complete", completed: 5, pending: 0, updatedAt: new Date().toISOString(),
      summaryHash: sha(summary), nativeReportParity: true, priorPathParity: 3, freshAudits: 5, causalPrefixes: 10, serializedResumes: 10, peakMiB });
    await progress("complete"); await atomic(join(root, "output/latest.json"), { identity, summary: `output/${identity}/summary.json` });
    console.log(JSON.stringify({ status: "complete", identity, resumed, peakMiB, baseline: report.updateReturn }));
  } catch (error) { await progress("failed", error instanceof Error ? error.message : String(error)); throw error; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error); process.exitCode = 1; });
