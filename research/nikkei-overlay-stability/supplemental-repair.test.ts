import assert from "node:assert/strict";
import { test } from "node:test";
import { RepairContext, RepairAccount, explicitMode, repairMenu, repairReplay, mainFrames, validateRepairProgress, type RepairPolicy, type RepairPoint } from "./supplemental-repair";
import { omitSleeveEpisode } from "./supplemental-repair-audit";
import type { MarketBar } from "../../lib/market/types";
import type { StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";

const policy: RepairPolicy = { id: "test", mode: "none", trigger: "queued", allocation: 0.5, stop: "percent", maxAge: 10, exit: "wma" };
const sell: StrategyCycleRecentSignal[] = [{ direction: "reduce", targetAllocation: 0, signals: ["long-exit"] }];
function bar(index: number, close = 100): MarketBar {
  return { time: new Date(Date.UTC(2020, 0, index + 1)).toISOString().slice(0, 10), open: close, close, high: close + 1, low: close - 1 } as MarketBar;
}
function controlled(patch: Partial<RepairPolicy> = {}) {
  const context = new RepairContext(Array.from({ length: 90 }, (_, index) => bar(index)));
  context.gates.fill(true); context.atr.fill(2); context.inner.e7.fill(99);
  context.points.forEach(point => { point.d2 = 0; });
  context.inner.features.get("EMA", 7).sign.fill(1); context.inner.features.get("EMA", 7).turns.fill(false);
  context.inner.features.get("EMA", 7).turns[65] = true; context.inner.features.get("WMA", 7).sign.fill(1);
  const main = context.bars.map(() => ({ target: 0, blockedUntil: 0 }));
  return { context, main, account: new RepairAccount(context, { ...policy, ...patch }, main) };
}
test("explicit range mode confirms entry, applies next bar and has minimum-residence exits", () => {
  const points: RepairPoint[] = Array.from({ length: 12 }, (_, index) => ({ d1: index >= 3 ? 0.2 : 0.01,
    d2: 0, er20: index >= 3 ? 0.5 : 0.1, er5: 0.2, rank: 0.8, move5: 0.2, shock: false }));
  const mode = explicitMode(points, false);
  assert.equal(mode[1]!.activeAtClose, false); assert.equal(mode[2]!.reason, "entry-confirm3");
  assert.equal(mode[2]!.effective, false); assert.equal(mode[3]!.effective, true);
  assert.equal(mode[6]!.activeAtClose, true); assert.equal(mode[7]!.reason, "trend-exit");
  assert.equal(mode[8]!.effective, false);
  const shocked = points.map(point => ({ ...point })); shocked[3]!.shock = true;
  assert.equal(explicitMode(shocked, false)[3]!.reason, "shock-exit");
});
test("wide mode has explicit volatility exit and unknown-input behavior", () => {
  const points: RepairPoint[] = Array.from({ length: 12 }, (_, index) => ({ d1: 0.01, d2: 0, er20: 0.1,
    er5: 0.2, rank: index >= 3 ? 0.3 : 0.8, move5: 0.2, shock: false }));
  assert.equal(explicitMode(points, true)[7]!.reason, "volatility-exit");
  const unknown = points.map(point => ({ ...point })); unknown[4]!.rank = null;
  assert.equal(explicitMode(unknown, true)[4]!.reason, "unknown-input");
});
test("queued entries wait for price gates and ordinary reductions cancel intent", () => {
  const first = controlled(); first.context.gates[65] = false;
  assert.equal(first.account.step(65, []).target, 0); assert.equal(first.account.step(66, []).target, 0.5);
  const cancelled = controlled(); cancelled.context.gates[65] = false;
  cancelled.account.step(65, []); cancelled.account.step(66, sell);
  assert.equal(cancelled.account.step(67, []).target, 0);
  const expired = controlled(); expired.context.gates.fill(false);
  for (let index = 65; index <= 67; index++) expired.account.step(index, []);
  expired.context.gates[68] = true; assert.equal(expired.account.step(68, []).target, 0);
});
test("one real target preserves main authority over existing sleeve and local cooldown", () => {
  const { context, main, account } = controlled(); account.step(65, []);
  main[66]!.target = 0.4;
  const state = account.step(66, []); assert.equal(state.target, 0.4); assert.equal(state.sleeveTarget, 0);
  assert.equal(state.reason, "main-priority");
  const stopped = controlled(); stopped.account.step(65, []); stopped.context.bars[66]!.close = 95;
  assert.equal(stopped.account.step(66, []).reason, "hard-stop"); assert.equal(stopped.account.blockedUntil, 72);
  stopped.main[67]!.target = 1; assert.equal(stopped.account.step(67, []).target, 1);
  context.gates[67] = false;
});
test("pending WMA and curvature exits require their actual confirmations", () => {
  const wma = controlled(); wma.account.step(65, []); assert.equal(wma.account.step(66, sell).target, 0.5);
  wma.context.inner.features.get("WMA", 7).sign[67] = -1;
  assert.equal(wma.account.step(67, []).reason, "pending-wma");
  const curvature = controlled({ exit: "curvature" }); curvature.account.step(65, []);
  curvature.context.points[66]!.d2 = -0.01; curvature.account.step(66, sell);
  curvature.context.points[67]!.d2 = -0.01; curvature.context.bars[67]!.close = 99.5;
  assert.equal(curvature.account.step(67, []).reason, "pending-curvature");
  const unrequested = controlled({ exit: "curvature" }); unrequested.account.step(65, []);
  unrequested.context.points[66]!.d2 = -0.01; unrequested.account.step(66, []);
  unrequested.context.points[67]!.d2 = -0.01; unrequested.context.bars[67]!.close = 99.5;
  assert.equal(unrequested.account.step(67, []).target, 0.5);
});
test("time limits, ATR hard stops and profit giveback use observed close conditions", () => {
  const timed = controlled(); timed.account.step(65, []);
  for (let index = 66; index < 75; index++) assert.equal(timed.account.step(index, []).target, 0.5);
  assert.equal(timed.account.step(75, []).reason, "time-limit");
  const stopped = controlled({ stop: "atr" }); stopped.account.step(65, []); stopped.context.bars[66]!.close = 97;
  assert.equal(stopped.account.step(66, []).reason, "hard-stop");
  const trailing = controlled({ exit: "atr" }); trailing.account.step(65, []);
  trailing.context.bars[66]!.close = 103; trailing.account.step(66, []);
  trailing.context.bars[67]!.close = 99.5; trailing.context.inner.e7[67] = 100;
  assert.equal(trailing.account.step(67, []).reason, "atr-giveback");
});
test("exits disarm repeated breakout buys until common gates become false again", () => {
  const state = controlled({ trigger: "breakout", exit: "original" });
  state.context.bars[65] = bar(65, 102); assert.equal(state.account.step(65, []).target, 0.5);
  assert.equal(state.account.step(66, sell).target, 0);
  state.context.bars[67] = bar(67, 104); assert.equal(state.account.step(67, []).target, 0);
  state.context.gates[68] = false; state.account.step(68, []);
  state.context.bars[69] = bar(69, 107); assert.equal(state.account.step(69, []).target, 0.5);
});
test("all577 policies preserve prefix causality and positive main targets exactly", () => {
  const source = Array.from({ length: 360 }, (_, index) => bar(index, 100 + Math.sin(index * 0.4) * 5));
  const fullContext = new RepairContext(source), prefixContext = new RepairContext(source.slice(0, 333));
  const decisions = new Map<number, StrategyCycleRecentSignal[]>([
    [285, [{ direction: "increase", targetAllocation: 0.6, signals: ["long-entry"] }]], [295, sell],
  ]);
  const fullMain = mainFrames(fullContext, decisions, 280), prefixMain = mainFrames(prefixContext, decisions, 280);
  assert.deepEqual(fullMain.slice(0, 333), prefixMain);
  const menu = repairMenu(); assert.equal(menu.length, 577); assert.equal(new Set(menu.map(row => row.id)).size, 577);
  for (const row of menu) {
    const full = repairReplay(fullContext, decisions, fullMain, 280, row, true);
    const prefix = repairReplay(prefixContext, decisions, prefixMain, 280, row, true);
    assert.deepEqual(full.targets.slice(0, 333), prefix.targets); assert.deepEqual(full.daily.slice(0, 53), prefix.daily);
    for (let index = 280; index < fullMain.length; index++) if (fullMain[index]!.target > 0) assert.equal(full.targets[index], fullMain[index]!.target);
  }
});
test("repair checkpoint rejects source, code, policy-order and configuration drift", () => {
  const menu = repairMenu(), saved = { sourceHash: "source", implementationHash: "code", rows: menu.slice(0, 20).map(policy => ({ policy })) };
  validateRepairProgress(saved, "source", "code", menu);
  assert.throws(() => validateRepairProgress(saved, "other", "code", menu));
  assert.throws(() => validateRepairProgress(saved, "source", "other", menu));
  assert.throws(() => validateRepairProgress({ ...saved, rows: [...saved.rows].reverse() }, "source", "code", menu));
  const changed = { ...saved, rows: [{ policy: { ...menu[0]!, allocation: 1 } }] };
  assert.throws(() => validateRepairProgress(changed, "source", "code", menu));
});
test("episode attribution removes only the selected sleeve span without mutating main or other targets", () => {
  const targets = [0, 0.5, 0.5, 0.6, 0, 0.5], main = targets.map((_, index) => ({ target: index === 3 ? 0.6 : 0, blockedUntil: 0 }));
  assert.deepEqual(omitSleeveEpisode(targets, main, 1, 4), [0, 0, 0, 0.6, 0, 0.5]);
  assert.deepEqual(targets, [0, 0.5, 0.5, 0.6, 0, 0.5]); assert.equal(main[3]!.target, 0.6);
  assert.throws(() => omitSleeveEpisode(targets, main, -1, 4));
  assert.throws(() => omitSleeveEpisode(targets, main, 4, 4));
});
