import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadStudy, root } from "./ma-type";
import { SmaPositionOverlay, MIXED_POSITION_OVERLAY_MODEL } from "../../lib/analysis/sma-position-overlay";
import { runStrategyCycleCloseBacktest, strategyCycleSignalDirection } from "../../lib/analysis/strategy-cycle-validation";

const { bars, decisions, start, settings } = await loadStudy();
const account = new SmaPositionOverlay(bars, { model: MIXED_POSITION_OVERLAY_MODEL, supplementalEntry: true, exitGuard: true, entrySlopeGate: true });
const target = bars.map(() => 0);
for (let i = start; i < bars.length; i++) {
  const signals = decisions.get(i) ?? [], direction = strategyCycleSignalDirection(signals);
  if (direction) account.request(direction, signals.at(-1)!.targetAllocation, i);
  target[i] = account.close(i, signals.length > 0);
}
const result = runStrategyCycleCloseBacktest(bars, target, settings);
const expected = JSON.parse(await readFile(join(root, "output/ma-threshold-grid/leaders/EMA7-SMA11-WMA14-t0.00125.json"), "utf8"));
assert.deepEqual(result.rebalances, expected.rebalances);
assert.equal(result.totalReturn, expected.totalReturn);
assert.equal(result.maxDrawdown, expected.maxDrawdown);
console.log(JSON.stringify({ totalReturn: result.totalReturn, maxDrawdown: result.maxDrawdown, rebalances: result.rebalances.length, reconciled: true }));
