import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { atomic, root } from "./analyze";
import { fallbackMetrics } from "./sma20-fallback";
import { rsi } from "../../lib/analysis/indicators";
import { SmaPositionOverlay, DEFAULT_POSITION_OVERLAY_OPTIONS } from "../../lib/analysis/sma-position-overlay";
import { strategyCycleSignalDirection, runStrategyCycleCloseBacktest,
  type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import { runAllocationBacktest, type BacktestSettings } from "../../lib/analysis/backtest";
import type { MarketBar } from "../../lib/market/types";

export interface PullbackPolicy {
  threshold: number; trigger: "rsi-fall" | "price-fall" | "cross-back";
  scope: "market" | "held"; priority: "guarded" | "no-signal-force" | "risk-first";
}
export class FirstPullback {
  private armed = false;
  constructor(readonly policy: Pick<PullbackPolicy, "threshold" | "trigger" | "scope">) {}
  next(current: number | null, previous: number | null, close: number, priorClose: number, held: boolean) {
    if (current == null || previous == null || (this.policy.scope === "held" && !held)) {
      this.armed = false; return false;
    }
    if (current > this.policy.threshold && previous <= this.policy.threshold) this.armed = true;
    const fire = this.armed && (this.policy.trigger === "rsi-fall" ? current < previous
      : this.policy.trigger === "price-fall" ? close < priorClose
      : previous > this.policy.threshold && current <= this.policy.threshold);
    if (fire) this.armed = false;
    return fire;
  }
}
interface State {
  allocation: number; pending: number | null; lastSupplement: number | null; entryIndex: number | null;
  entryClose: number; recoveryTarget: number | null; stoppedAt: number; blockedUntil: number;
  flatStart: number | null; previousCloseAllocation: number;
}
export function replayPullback(bars: MarketBar[], decisions: ReadonlyMap<number, StrategyCycleRecentSignal[]>,
  start: number, policy?: PullbackPolicy, omitted = new Set<number>()) {
  const account = new SmaPositionOverlay(bars, DEFAULT_POSITION_OVERLAY_OPTIONS), state = account as unknown as State;
  const strength = rsi(bars.map((bar) => bar.close), 10), targets = bars.map(() => 0);
  const detector = policy ? new FirstPullback(policy) : null;
  const events: { index: number; time: string; rsi: number; previousRsi: number; before: number;
    target: number; requested: boolean; forced: boolean; nativeSignals: number }[] = [];
  let triggers = 0;
  for (let index = start; index < bars.length; index += 1) {
    const before = account.allocation, signals = decisions.get(index) ?? [], direction = strategyCycleSignalDirection(signals);
    const fire = detector?.next(strength[index] ?? null, strength[index - 1] ?? null,
      bars[index]!.close, bars[index - 1]?.close ?? bars[index]!.close, before > 1e-10) ?? false;
    if (fire) triggers += 1;
    if (direction) account.request(direction, signals.at(-1)!.targetAllocation, index);
    const eligible = fire && before > 1e-10 && !omitted.has(index);
    const requested = eligible && policy?.priority === "guarded" && direction !== "increase";
    if (requested) account.request("reduce", 0, index);
    account.close(index, signals.length > 0 || requested);
    const forced = eligible && account.allocation > 1e-10 && (policy?.priority === "risk-first" ||
      (policy?.priority === "no-signal-force" && signals.length === 0));
    if (forced) {
      state.allocation = 0; state.pending = null; state.lastSupplement = null;
      state.entryIndex = null; state.entryClose = 0; state.recoveryTarget = null;
      state.stoppedAt = index; state.blockedUntil = Math.max(state.blockedUntil, index + 1);
      state.flatStart = index; state.previousCloseAllocation = 0;
    }
    targets[index] = account.allocation;
    if (eligible) events.push({ index, time: bars[index]!.time, rsi: strength[index]!, previousRsi: strength[index - 1]!,
      before, target: account.allocation, requested, forced, nativeSignals: signals.length });
  }
  return { targets, events, triggers };
}
const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function bounded(path: string) {
  assert.ok((await stat(path)).size <= 16 * 1024 ** 2);
  return JSON.parse(await readFile(path, "utf8"));
}
async function main() {
  const input = await bounded(join(root, "data/full-screen-6-15/input.json")) as {
    bars: MarketBar[]; barsHash: string; settings: BacktestSettings; snapshots: { decisionIndex: number }[];
  };
  const saved = await bounded(join(root, "data/full-screen-6-15/signals.json")) as {
    sourceHash: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[];
  };
  assert.equal(sha(input), saved.sourceHash); assert.equal(sha(input.bars), input.barsHash);
  assert.deepEqual(saved.rows.map((row) => row.index), input.snapshots.map((row) => row.decisionIndex));
  assert.ok(input.bars.length <= 10000);
  const { bars, settings } = input, start = bars.length - 2000;
  const decisions = new Map(saved.rows.map((row) => [row.index, row.signals]));
  const measure = (targets: number[], nextOpen = false) => {
    const result = nextOpen ? runAllocationBacktest(bars, targets,
      { ...settings, positionOverlay: undefined, executionPolicy: "hybrid" })
      : runStrategyCycleCloseBacktest(bars, targets, settings);
    const metrics = fallbackMetrics(result, settings.initialCash, bars.findIndex((bar) => bar.time === "2026-07-21") - start + 1);
    return { total: metrics.totalReturn, last500: metrics.final500.totalReturn, drawdown: -metrics.maxDrawdown,
      blocks: metrics.blocks.map((block) => block.totalReturn), trades: metrics.fills };
  };
  const baseline = replayPullback(bars, decisions, start);
  assert.equal(sha(baseline.targets), "e3253ec7105fa8ce5959aad68f9e6da09ee9d4c417cfba51ef2f49d90849b7f5");
  const run = (policy?: PullbackPolicy, omitted?: Set<number>) => {
    const path = replayPullback(bars, decisions, start, policy, omitted);
    const marginal = path.events.filter((event) => Math.abs(path.targets[event.index]! - baseline.targets[event.index]!) > 1e-10);
    return { policy, targetHash: sha(path.targets), metrics: measure(path.targets), nextOpen: measure(path.targets, true),
      triggers: path.triggers, events: path.events, marginal,
      executions: path.events.filter((event) => event.forced).map((event) => ({ ...event,
        forward5: event.index + 5 < bars.length ? (bars[event.index + 5]!.close / bars[event.index]!.close - 1) * 100 : null,
        forward10: event.index + 10 < bars.length ? (bars[event.index + 10]!.close / bars[event.index]!.close - 1) * 100 : null })),
      changedBars: path.targets.filter((target, index) => Math.abs(target - baseline.targets[index]!) > 1e-10).length };
  };
  const rows = [run()];
  for (const threshold of [65, 70, 75]) for (const trigger of ["rsi-fall", "price-fall", "cross-back"] as const)
    for (const scope of ["market", "held"] as const)
      for (const priority of ["guarded", "no-signal-force", "risk-first"] as const)
        rows.push(run({ threshold, trigger, scope, priority }));
  assert.equal(rows.length, 55);
  const audits = rows.filter((row) => row.policy?.threshold === 70 && row.policy.scope === "market").map((row) => ({
    policy: row.policy, omissions: row.events.filter((event) => event.requested || event.forced).map((event) => ({ time: event.time,
      metrics: run(row.policy, new Set([event.index])).metrics })) }));
  const implementationHash = sha(await Promise.all(["rsi-first-pullback.ts", "RSI_FIRST_PULLBACK_DESIGN.md",
    "../../lib/analysis/sma-position-overlay.ts", "../../lib/analysis/indicators.ts", "../../lib/analysis/backtest.ts",
    "../../lib/analysis/strategy-cycle-validation.ts"].map((path) => readFile(join(root, path), "utf8"))));
  await atomic(join(root, "output/rsi-first-pullback/summary.json"), { sourceHash: saved.sourceHash,
    implementationHash, model: DEFAULT_POSITION_OVERLAY_OPTIONS.model, start: bars[start]!.time,
    end: bars.at(-1)!.time, rows, audits });
  console.log(JSON.stringify({ baseline: rows[0]!.metrics, primary: rows.filter((row) => row.policy?.threshold === 70 &&
    row.policy.trigger === "rsi-fall").map(({ policy, metrics, nextOpen, triggers, events, marginal }) =>
    ({ policy, metrics, nextOpen, triggers, heldTriggers: events.length, marginal: marginal.length })),
    double: rows.filter((row) => row.metrics.total > rows[0]!.metrics.total + 1e-9 &&
      row.metrics.last500 > rows[0]!.metrics.last500 + 1e-9).map(({ policy, metrics }) => ({ policy, metrics })) }, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
