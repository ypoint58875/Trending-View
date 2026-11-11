import assert from "node:assert/strict";
import test from "node:test";
import {
  SMA11_CLEAR_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS, SAME_CLOSE_POSITION_OVERLAY_OPTIONS, SmaPositionOverlay,
} from "../lib/analysis/sma-position-overlay";
import type { MarketBar } from "../lib/market/types";

const sample = (rise: number): MarketBar[] => Array.from({ length: 30 }, (_, i) => {
  const close = 100 + i * rise;
  return { time: String(i), timestamp: i, open: close, high: close + .001, low: close - .001, close,
    volume: 0, amount: 0, amplitude: 0, change: 0, changePercent: 0, turnoverRate: 0 };
});

test("v12 drops WMA7 only for full clears when SMA11 growth is below the threshold", () => {
  const slow = sample(.01);
  const current = new SmaPositionOverlay(slow, DEFAULT_POSITION_OVERLAY_OPTIONS, 1);
  const archived = new SmaPositionOverlay(slow, SAME_CLOSE_POSITION_OVERLAY_OPTIONS, 1);
  assert.equal(current.request("reduce", 0, 20), 0);
  assert.equal(current.close(20, true), 0);
  assert.equal(archived.request("reduce", 0, 20), 1);
  assert.equal(archived.close(20, true), 1);
  assert.equal(new SmaPositionOverlay(slow, DEFAULT_POSITION_OVERLAY_OPTIONS, 1).request("reduce", .5, 20), 1);
  assert.equal(new SmaPositionOverlay(sample(.2), DEFAULT_POSITION_OVERLAY_OPTIONS, 1).request("reduce", 0, 20), 1);
});

test("v12 still protects narrow ranges and recently supplemented positions", () => {
  const slow = sample(.01);
  for (const protection of [
    { lastSupplement: 19 },
    { rangeEpisode: { index: 19, cost: 100, high: 100.3, low: 100.1, includeEntryBar: false } },
  ]) {
    const current = new SmaPositionOverlay(slow, DEFAULT_POSITION_OVERLAY_OPTIONS, 1);
    current.restore({ ...current.checkpoint(), ...protection });
    current.request("reduce", 0, 20);
    assert.equal(current.close(20, true), 1);
    assert.equal(current.checkpoint().pending, 0);
  }
});
