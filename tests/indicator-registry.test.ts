import assert from "node:assert/strict";
import test from "node:test";
import {
  INDICATORS,
  createDefaultIndicatorSettings,
  getDefaultIndicatorParameters,
  getIndicator,
} from "../lib/analysis/indicator-registry";

const expectedIds = [
  "sma",
  "ema",
  "wma",
  "dema",
  "bollinger",
  "vwap",
  "supertrend",
  "ichimoku",
  "rsi",
  "macd",
  "kdj",
  "stochasticRsi",
  "cci",
  "williamsR",
  "adx",
  "roc",
  "mfi",
  "cmf",
  "atr",
  "obv",
];

test("registers all configurable chart indicators once", () => {
  assert.deepEqual(
    INDICATORS.map((indicator) => indicator.id),
    expectedIds,
  );
  assert.equal(new Set(expectedIds).size, 20);

  for (const indicator of INDICATORS) {
    const keys = indicator.parameters.map((parameter) => parameter.key);
    assert.equal(new Set(keys).size, keys.length);
    for (const parameter of indicator.parameters) {
      assert.ok(Number.isFinite(parameter.defaultValue));
      assert.ok(Number.isFinite(parameter.minimum));
      assert.ok(parameter.step > 0);
      assert.ok(parameter.defaultValue >= parameter.minimum);
    }
  }
});

test("creates independent defaults for every indicator", () => {
  assert.deepEqual(getDefaultIndicatorParameters("sma"), {
    fast: 10,
    slow: 30,
  });
  assert.deepEqual(getDefaultIndicatorParameters("stochasticRsi"), {
    rsiPeriod: 14,
    stochasticPeriod: 14,
    smoothPeriod: 3,
  });
  assert.equal(getIndicator("sma").placement, "overlay");
  assert.equal(getIndicator("macd").placement, "pane");

  const first = createDefaultIndicatorSettings();
  const second = createDefaultIndicatorSettings();
  first.sma.fast = 5;
  assert.equal(second.sma.fast, 10);
});
