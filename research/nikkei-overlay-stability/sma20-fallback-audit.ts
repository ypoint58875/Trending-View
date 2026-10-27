import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { atomic, root } from "./analyze";
import { FallbackAccount, FallbackContext, fallbackBaseline, fallbackMenu, fallbackMetrics, type FallbackPolicy } from "./sma20-fallback";
import { runStrategyCycleCloseBacktest, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import { runAllocationBacktest, type BacktestSettings, type AllocationBacktestResult } from "../../lib/analysis/backtest";
import { replaceFileAtomically } from "../../scripts/atomic-file";
import type { MarketBar } from "../../lib/market/types";

export function backgroundAuditMenu(): FallbackPolicy[] {
  return fallbackMenu().filter(policy => policy.kind === "hybrid" || (policy.kind === "fallback" && policy.scope === "below" && policy.confirmation === "trend"))
    .map(policy => ({ ...policy, id: `${policy.id}-decline3`, decline: 0.03 }));
}
export function drawdownDates(result: AllocationBacktestResult, cash: number, from = 0) {
  const points = result.equity;
  let peak = from === 0 ? cash : points[from - 1]!.equity;
  let peakTime = from === 0 ? "initial-cash" : points[from - 1]!.time;
  let drawdown = 0, fromTime = peakTime, throughTime = peakTime;
  for (let offset = from; offset < points.length; offset++) {
    const point = points[offset]!;
    if (point.equity > peak) { peak = point.equity; peakTime = point.time; }
    const value = (point.equity / peak - 1) * 100;
    if (value < drawdown) { drawdown = value; fromTime = peakTime; throughTime = point.time; }
  }
  return { drawdown, peak: fromTime, trough: throughTime };
}
async function main() {
  const output = join(root, "output/sma20-fallback-audit"), priorOutput = join(root, "output/sma20-fallback");
  for (const path of ["input.json", "signals.json"])
    assert.ok((await stat(join(root, "data/full-screen-6-15", path))).size <= 16 * 1024 ** 2);
  const input = JSON.parse(await readFile(join(root, "data/full-screen-6-15/input.json"), "utf8")) as {
    bars: MarketBar[]; settings: BacktestSettings;
  };
  const saved = JSON.parse(await readFile(join(root, "data/full-screen-6-15/signals.json"), "utf8")) as {
    sourceHash: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[];
  };
  const prior = JSON.parse(await readFile(join(priorOutput, "summary.json"), "utf8"));
  const sha = (value: string) => createHash("sha256").update(value).digest("hex");
  assert.equal(sha(JSON.stringify(input)), saved.sourceHash); assert.equal(prior.sourceHash, saved.sourceHash);
  const context = new FallbackContext(input.bars), start = input.bars.length - 2000;
  assert.ok(input.bars.length <= 10000 && saved.rows.length <= 2048);
  const cutoff = input.bars.findIndex(bar => bar.time === "2026-07-21"), boundary = cutoff - start + 1;
  const decisions = new Map(saved.rows.map(row => [row.index, row.signals]));
  let stopping = false;
  process.on("SIGINT", () => { stopping = true; }); process.on("SIGTERM", () => { stopping = true; });
  const run = (policy: FallbackPolicy, use: (index: number) => boolean = () => true) => {
    if (stopping || process.memoryUsage().rss > 1.5 * 1024 ** 3) throw new Error("Stopped safely; rerun finite fallback audit");
    let current = start;
    const view = new Proxy(policy, { get: (target, property) => property === "kind" && !use(current) ? "baseline" : Reflect.get(target, property) });
    const account = new FallbackAccount(context, view, start), targets = input.bars.map(() => 0), entries = [];
    for (current = start; current < input.bars.length; current++) {
      const state = account.step(current, decisions.get(current) ?? []); targets[current] = state.target;
      if (state.entered) entries.push({ time: input.bars[current]!.time, kind: state.kind, added: state.added });
    }
    const result = runStrategyCycleCloseBacktest(input.bars, targets, input.settings);
    return { targets, entries, result, metrics: fallbackMetrics(result, input.settings.initialCash, boundary),
      fullDrawdown: drawdownDates(result, input.settings.initialCash), recentDrawdown: drawdownDates(result, input.settings.initialCash, boundary) };
  };
  const baseline = run(fallbackBaseline), candidate = fallbackMenu().find(policy => policy.id === "hybrid-x4")!;
  const candidatePath = run(candidate);
  assert.equal(candidatePath.metrics.totalReturn, prior.rows.find((row: { policy: FallbackPolicy }) => row.policy.id === candidate.id).totalReturn);
  const originalPaths = [];
  for (const policy of fallbackMenu()) {
    const outcome = run(policy), previous = prior.rows.find((row: { policy: FallbackPolicy }) => row.policy.id === policy.id);
    assert.equal(sha(JSON.stringify(outcome.targets)), previous.targetHash);
    originalPaths.push(policy.id);
  }
  const additional = [];
  for (const policy of backgroundAuditMenu()) {
    const outcome = run(policy), common = run(policy, index => index > cutoff);
    assert.deepEqual(common.targets.slice(0, cutoff + 1), baseline.targets.slice(0, cutoff + 1));
    const twice = runStrategyCycleCloseBacktest(input.bars, outcome.targets, { ...input.settings,
      commissionRate: input.settings.commissionRate * 2, slippageRate: input.settings.slippageRate * 2 });
    const next = runAllocationBacktest(input.bars, outcome.targets, { ...input.settings, executionPolicy: "next-open" });
    const row = { policy, ...outcome.metrics, commonState: common.metrics,
      doubleCost: fallbackMetrics(twice, input.settings.initialCash, boundary), nextOpen: fallbackMetrics(next, input.settings.initialCash, boundary),
      added: outcome.entries.filter(entry => entry.added).length,
      recentEntries: outcome.entries.filter(entry => entry.time > "2026-07-21"),
      fullDrawdown: outcome.fullDrawdown, recentDrawdown: outcome.recentDrawdown };
    additional.push(row);
    await atomic(join(output, `${policy.id}.json`), { ...row, targets: outcome.targets, result: outcome.result });
  }
  const diagnostics = JSON.parse(await readFile(join(priorOutput, "diagnostics.json"), "utf8"));
  assert.ok(diagnostics.blockedTurns.length <= 2000);
  const individualUnlocks = diagnostics.blockedTurns.filter((event: { enteredByOtherRule: boolean }) => !event.enteredByOtherRule).map((event: { time: string }) => {
    const index = input.bars.findIndex(bar => bar.time === event.time);
    const result = run(fallbackMenu().find(policy => policy.id === "replace-none")!, cursor => cursor === index);
    const unlock = { time: event.time, ...result.metrics, fullDelta: result.metrics.totalReturn - baseline.metrics.totalReturn,
      recentDelta: result.metrics.recent.totalReturn - baseline.metrics.recent.totalReturn };
    return unlock;
  });
  const candidateLedger = JSON.parse(await readFile(join(priorOutput, "hybrid-x4.json"), "utf8"));
  const omissions = [];
  for (const episode of candidateLedger.episodes) {
    const from = input.bars.findIndex(bar => bar.time === episode.entry);
    const through = episode.exit === null ? input.bars.length : input.bars.findIndex(bar => bar.time === episode.exit) + 1;
    const outcome = run(candidate, index => index < from || index >= through);
    omissions.push({ entry: episode.entry, originalExit: episode.exit, ...outcome.metrics,
      fullDeltaFromCandidate: outcome.metrics.totalReturn - candidatePath.metrics.totalReturn });
  }
  const auditHash = sha((await Promise.all(["sma20-fallback-audit.ts", "sma20-fallback.ts", "SMA20_FALLBACK_DESIGN.md"]
    .map(path => readFile(join(root, path), "utf8")))).join("\n"));
  const summary = { sourceHash: prior.sourceHash, implementationHash: prior.implementationHash, auditHash,
    generatedAt: new Date().toISOString(), originalPathsVerified: originalPaths.length, additional,
    baseline: { ...baseline.metrics, fullDrawdown: baseline.fullDrawdown, recentDrawdown: baseline.recentDrawdown },
    candidate: { ...candidatePath.metrics, fullDrawdown: candidatePath.fullDrawdown, recentDrawdown: candidatePath.recentDrawdown },
    individualUnlocks, omissions,
    limitation: "Six weaker-background cases and event counterfactuals are post-result diagnostics, not independent validation. Episode exclusions replay actual inherited account state, are nonadditive and are not live rules." };
  await atomic(join(output, "summary.json"), summary);
  const table = additional.map(row => `| ${row.policy.id} | ${row.totalReturn.toFixed(3)} | ${row.maxDrawdown.toFixed(3)} | ${row.recent.totalReturn.toFixed(3)} | ${row.recent.maxDrawdown.toFixed(3)} | ${row.commonState.recent.totalReturn.toFixed(3)} | ${row.added} |`).join("\n");
  const recent = individualUnlocks.filter((row: { time: string }) => row.time > "2026-07-21")
    .map((row: { time: string; recent: { totalReturn: number; maxDrawdown: number }; recentDelta: number }) =>
      `| ${row.time} | ${row.recent.totalReturn.toFixed(3)} | ${row.recent.maxDrawdown.toFixed(3)} | ${row.recentDelta.toFixed(3)} |`).join("\n");
  const omissionTable = omissions.map(row => `| ${row.entry} | ${row.totalReturn.toFixed(3)} | ${row.fullDeltaFromCandidate.toFixed(3)} |`).join("\n");
  const report = `# SMA20 fallback attribution and background audit\n\nVerify all20 original target hashes. Six explicitly post-result3%-decline cases; source and base implementation identities are in summary.json.\n\n## Weaker background\n\n| Policy | Full % | DD % | Recent % | Recent DD % | Common recent % | Added |\n|---|---:|---:|---:|---:|---:|---:|\n${table}\n\n## Remove only one recent day's SMA20 barrier\n\nOther dates use baseline; native exits/stops/holding still run. This is event attribution, not a date-based live proposal.\n\n| Unlocked turn | Recent % | Recent DD % | Recent delta pp |\n|---|---:|---:|---:|\n${recent}\n\n## Omit one hybrid-x4 added episode and replay the inherited account\n\nCandidate full:${candidatePath.metrics.totalReturn.toFixed(3)}%, baseline:${baseline.metrics.totalReturn.toFixed(3)}%. Native entries are never vetoed; only added relaxations in each retrospective episode are suppressed.\n\n| Omitted entry | Full % | Delta from candidate pp |\n|---|---:|---:|\n${omissionTable}\n\nCandidate full DD:${JSON.stringify(candidatePath.fullDrawdown)}; recent:${JSON.stringify(candidatePath.recentDrawdown)}. Baseline full:${JSON.stringify(baseline.fullDrawdown)}; recent:${JSON.stringify(baseline.recentDrawdown)}.\n\n${summary.limitation}\n`;
  await writeFile(join(output, "REPORT.md.tmp"), report); await replaceFileAtomically(join(output, "REPORT.md.tmp"), join(output, "REPORT.md"));
  console.log(JSON.stringify({ originalPathsVerified: originalPaths.length, additional: additional.map(row => ({ id: row.policy.id,
    full: row.totalReturn, dd: row.maxDrawdown, recent: row.recent })), recentUnlocks: individualUnlocks.filter((row: { time: string }) => row.time > "2026-07-21"),
    omissions, fullDrawdown: candidatePath.fullDrawdown, recentDrawdown: candidatePath.recentDrawdown }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
