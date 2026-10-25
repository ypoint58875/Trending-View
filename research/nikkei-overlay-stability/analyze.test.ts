import assert from "node:assert/strict";
import { test } from "node:test";
import { Account, Features, current, menu, targets, calibrationScore, choose, pathMetrics, validateIdentity } from "./analyze";
import { SmaPositionOverlay, MIXED_POSITION_OVERLAY_MODEL } from "../../lib/analysis/sma-position-overlay";
import type { MarketBar } from "../../lib/market/types";
import type { StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";

const bars = Array.from({ length: 100 }, (_, i) => ({ time: `2020-${String(1 + Math.floor(i / 28)).padStart(2, "0")}-${String(1 + i % 28).padStart(2, "0")}`,
  timestamp: i, open: 100 + i / 5, close: 100 + i / 5 + 5 * Math.sin(i / 4), high: 110 + i / 5, low: 90 + i / 5,
  volume: 1, amount: 1, amplitude: 0, changePercent: 0, change: 0, turnoverRate: 0 })) as MarketBar[];
const signal = (direction: "increase" | "reduce", targetAllocation: number): StrategyCycleRecentSignal => ({ direction, targetAllocation, signals: [direction === "increase" ? "long-entry" : "long-exit"] } as StrategyCycleRecentSignal);

test("declared menu is complete and unique", () => {
  const rows = menu(); assert.equal(rows.length, 5839);
  assert.equal(new Set(rows.map(p => JSON.stringify(p))).size, rows.length);
});
test("research account matches production on every flag and does not use future prices", () => {
  const decisions = new Map<number, StrategyCycleRecentSignal[]>([[20, [signal("increase", 0.6)]], [26, [signal("reduce", 0)]],
    [31, [signal("increase", 1)]], [42, [signal("reduce", 0.3)]], [52, [signal("reduce", 0)]]]);
  for (let flags = 0; flags < 8; flags++) {
    const p = { ...current, flags }, expected = new SmaPositionOverlay(bars, { model: MIXED_POSITION_OVERLAY_MODEL,
      supplementalEntry: !!(flags & 1), exitGuard: !!(flags & 2), entrySlopeGate: !!(flags & 4) });
    const actual = targets(bars, decisions, 16, p), prefix = targets(bars.slice(0, 60), decisions, 16, p);
    assert.deepEqual(actual.slice(0, 60), prefix);
    for (let i = 16; i < bars.length; i++) {
      const signals = decisions.get(i) ?? [];
      if (signals.length) expected.request(signals[0]!.direction, signals[0]!.targetAllocation, i);
      assert.equal(actual[i], expected.close(i, signals.length > 0));
    }
  }
});
test("calibration excludes the deployment day and all future returns", () => {
  const first = Float64Array.from([0, 0.01, 0.02, 0.03, 0.04, -1000]);
  const second = Float64Array.from([0, -0.01, -0.02, -0.03, -0.04, 1000]);
  for (const method of ["return", "stability"] as const) {
    assert.equal(choose([first, second], [current, { ...current, entry: 8 }], 4, 4, method), 0);
    assert.equal(calibrationScore(first, 4, 4, method), 0.04);
  }
  assert.throws(() => calibrationScore(first, 2, 4, "return"), /boundary/);
});
test("parameter changes preserve an inherited pending reduction until guard release", () => {
  const f = new Features(bars), account = new Account(); account.allocation = 1; account.pending = 0.2;
  const protectedIndex = bars.findIndex((_, i) => i > 20 && f.get("SMA", 11).slope[i]! > 0.00125);
  assert.ok(protectedIndex > 20);
  assert.equal(account.step(protectedIndex, [], current, f), 1);
  assert.equal(account.pending, 0.2);
  assert.equal(account.step(protectedIndex + 1, [], { ...current, flags: 0 }, f), 0.2);
  assert.equal(account.pending, null);
});
test("segment metrics compound and capture an immediate loss from starting capital", () => {
  const p = Float64Array.from([0, Math.log(0.9), Math.log(1.1), Math.log(1.21)]);
  assert.ok(Math.abs((1 + pathMetrics(p, 0, 2).totalReturn / 100) * (1 + pathMetrics(p, 2, 3).totalReturn / 100) - 1.21) < 1e-12);
  assert.ok(Math.abs(pathMetrics(p, 0, 3).maxDrawdown + 10) < 1e-10);
  assert.throws(() => validateIdentity({ sourceHash: "old", designHash: "same" }, "new", "same"), /Incompatible/);
});
