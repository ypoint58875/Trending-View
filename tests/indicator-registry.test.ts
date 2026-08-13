import assert from "node:assert/strict";
import test from "node:test";
import {
  INDICATORS,
  createDefaultIndicatorWorkspacePreferences,
  createDefaultIndicatorSettings,
  createIndicatorConfigurations,
  getDefaultIndicatorParameters,
  getIndicator,
  indicatorConfigurationsEqual,
  parseIndicatorConfigurations,
  parseIndicatorWorkspacePreferences,
} from "../lib/analysis/indicator-registry";
import {
  buildStrategyLinkedPaneIndicators,
  mergeChartIndicatorConfigurations,
} from "../lib/analysis/strategy-indicators";

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
  "supportResistanceBreaks",
  "adaptiveRegressionBreakout",
  "autoAtrTrendTracker",
  "fractionalEmaKalman",
  "nadarayaWatsonTrend",
  "rsiDivergenceEngine",
  "squeezeMomentum",
  "supportResistanceSignals",
  "trendlineBreaks",
  "waveTrend",
];

test("registers all configurable chart indicators once", () => {
  assert.deepEqual(
    INDICATORS.map((indicator) => indicator.id),
    expectedIds,
  );
  assert.equal(new Set(expectedIds).size, 30);

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
  assert.deepEqual(getDefaultIndicatorParameters("kdj"), {
    period: 9,
    smoothK: 3,
    smoothD: 3,
  });
  assert.equal(getIndicator("sma").placement, "overlay");
  assert.equal(getIndicator("macd").placement, "pane");

  const first = createDefaultIndicatorSettings();
  const second = createDefaultIndicatorSettings();
  first.sma.fast = 5;
  assert.equal(second.sma.fast, 10);
});

test("keeps indicators hidden by default and validates persisted preferences", () => {
  const defaults = createDefaultIndicatorWorkspacePreferences();
  assert.equal(defaults.focusedIndicator, "sma");
  assert.deepEqual(defaults.visibleIndicatorIds, []);
  assert.deepEqual(defaults.favoriteIndicatorIds, [
    "supportResistanceBreaks",
  ]);

  defaults.settings.sma = { fast: 5, slow: 20 };
  const restored = parseIndicatorWorkspacePreferences({
    focusedIndicator: "sma",
    visibleIndicatorIds: ["sma", "rsi"],
    settings: defaults.settings,
  });
  assert.deepEqual(restored?.visibleIndicatorIds, ["sma", "rsi"]);
  assert.deepEqual(restored?.favoriteIndicatorIds, [
    "supportResistanceBreaks",
  ]);
  assert.deepEqual(restored?.settings.sma, { fast: 5, slow: 20 });
  const legacyKdj = parseIndicatorConfigurations([
    { id: "kdj", parameters: { period: 9 } },
  ]);
  assert.deepEqual(legacyKdj, [
    {
      id: "kdj",
      parameters: { period: 9, smoothK: 3, smoothD: 3 },
    },
  ]);
  assert.equal(
    parseIndicatorWorkspacePreferences({
      focusedIndicator: "sma",
      visibleIndicatorIds: ["sma", "sma"],
      settings: defaults.settings,
    }),
    null,
  );
});

test("creates and compares validated visible indicator snapshots", () => {
  const settings = createDefaultIndicatorSettings();
  settings.sma = { fast: 5, slow: 20 };
  const configurations = createIndicatorConfigurations(
    ["sma", "macd"],
    settings,
  );

  assert.deepEqual(parseIndicatorConfigurations(configurations), configurations);
  assert.equal(
    indicatorConfigurationsEqual(configurations, [
      { id: "sma", parameters: { slow: 20, fast: 5 } },
      { id: "macd", parameters: { fast: 12, slow: 26, signal: 9 } },
    ]),
    true,
  );
  assert.equal(
    indicatorConfigurationsEqual(configurations, [...configurations].reverse()),
    false,
  );
  assert.equal(
    parseIndicatorConfigurations([
      { id: "sma", parameters: { fast: 0, slow: 20 } },
    ]),
    null,
  );
});

test("projects applied strategy indicators into panes without changing manual settings", () => {
  const linked = buildStrategyLinkedPaneIndicators({
    strategyA: {
      strategyId: "kdj-reversal",
      parameters: { period: 12, entry: 30, exit: 70 },
    },
    strategyB: null,
    strategyAAllocation: 1,
    strategyBAllocation: 0,
  });
  assert.deepEqual(linked, [
    {
      id: "kdj",
      parameters: { period: 12, smoothK: 3, smoothD: 3 },
    },
  ]);

  const manual = [
    {
      id: "kdj" as const,
      parameters: { period: 12, smoothK: 3, smoothD: 3 },
    },
  ];
  assert.deepEqual(
    mergeChartIndicatorConfigurations(manual, linked),
    manual,
  );
  assert.deepEqual(
    buildStrategyLinkedPaneIndicators({
      strategyA: {
        strategyId: "sma-cross",
        parameters: { fast: 10, slow: 30 },
      },
      strategyB: null,
      strategyAAllocation: 1,
      strategyBAllocation: 0,
    }),
    [],
  );
});
