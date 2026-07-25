import assert from "node:assert/strict";
import test from "node:test";
import { applyDataZoomWindow } from "../app/components/EChart";
import {
  buildIndicatorSeries,
  buildPriceChartLegend,
  buildPriceChartLayout,
  buildPriceDataZoom,
  buildStrategyLineSeries,
  buildTradeMarkerSeries,
  buildTradeMarkerSeriesFromMarkers,
} from "../app/components/PriceChart";
import type { MarketBar } from "../lib/market/types";
import type {
  StrategyPriceLine,
  StrategyPriceLineRole,
} from "../lib/analysis/strategy-visuals";

type ZoomEntry = {
  id?: string;
  type?: string;
  xAxisIndex?: number[];
  start?: number;
  end?: number;
  height?: number;
  handleSize?: string | number;
  brushSelect?: boolean;
  realtime?: boolean;
  zoomLock?: boolean;
};

type MarkerSeries = {
  symbol?: string;
  symbolRotate?: number;
  itemStyle?: {
    color?: string;
    borderColor?: string;
    borderWidth?: number;
  };
  label?: {
    color?: string;
    backgroundColor?: string;
  };
  data?: Array<{
    name?: string;
    label?: {
      formatter?: string;
    };
  }>;
};

type IndicatorSeries = {
  name?: string;
  type?: string;
  data?: Array<number | null>;
  xAxisIndex?: number;
  yAxisIndex?: number;
  showSymbol?: boolean;
  connectNulls?: boolean;
  smooth?: boolean;
  lineStyle?: {
    width?: number;
    color?: string;
    type?: string;
  };
  areaStyle?: unknown;
};

const indicatorLabels = {
  smaFast: "SMA fast",
  smaSlow: "SMA slow",
  emaFast: "EMA fast",
  emaSlow: "EMA slow",
  wmaFast: "WMA fast",
  wmaSlow: "WMA slow",
  demaFast: "DEMA fast",
  demaSlow: "DEMA slow",
  bollMiddle: "BOLL middle",
  bollUpper: "BOLL upper",
  bollLower: "BOLL lower",
  vwap: "VWAP",
  supertrend: "Supertrend",
  ichimokuConversion: "Ichimoku conversion",
  ichimokuBase: "Ichimoku base",
  ichimokuSpanA: "Ichimoku span A",
  ichimokuSpanB: "Ichimoku span B",
  rsi: "RSI",
  macdLine: "MACD line",
  macdSignal: "MACD signal",
  macdHistogram: "MACD histogram",
  kdjK: "KDJ K",
  kdjD: "KDJ D",
  kdjJ: "KDJ J",
  stochRsiK: "Stoch RSI K",
  stochRsiD: "Stoch RSI D",
  cci: "CCI",
  williamsR: "Williams %R",
  adx: "ADX",
  plusDi: "+DI",
  minusDi: "-DI",
  roc: "ROC",
  mfi: "MFI",
  cmf: "CMF",
  atr: "ATR",
  obv: "OBV",
};

const chartBars: MarketBar[] = [1, 2, 3, 4].map((close, index) => ({
  time: `2026-01-0${index + 1}`,
  timestamp: Date.UTC(2026, 0, index + 1),
  open: close,
  high: close + 0.5,
  low: close - 0.5,
  close,
  volume: 100,
  amount: 100,
  amplitude: 0,
  changePercent: 0,
  change: 0,
  turnoverRate: 0,
}));

function entries(barsLength: number, xAxisIndexes: number[]) {
  return buildPriceDataZoom(
    barsLength,
    xAxisIndexes,
  ) as ZoomEntry[];
}

test("builds SMA lines from display parameters", () => {
  const [fast, slow] = buildIndicatorSeries(
    chartBars,
    "sma",
    { fast: 2, slow: 3 },
    indicatorLabels,
    0,
    0,
  ) as unknown as IndicatorSeries[];

  assert.deepEqual(fast.data, [null, 1.5, 2.5, 3.5]);
  assert.deepEqual(slow.data, [null, null, 2, 3]);
  assert.equal(fast.name, "SMA fast (2)");
  assert.equal(slow.name, "SMA slow (3)");
  assert.equal(fast.xAxisIndex, 0);
  assert.equal(fast.yAxisIndex, 0);
});

test("names every configurable indicator from its actual parameters", () => {
  const names = (
    indicator: Parameters<typeof buildIndicatorSeries>[1],
    parameters: Parameters<typeof buildIndicatorSeries>[2],
  ) =>
    (
      buildIndicatorSeries(
        chartBars,
        indicator,
        parameters,
        indicatorLabels,
        0,
        0,
      ) as unknown as IndicatorSeries[]
    ).map((series) => series.name);

  assert.deepEqual(names("ema", { fast: 3, slow: 4 }), [
    "EMA fast (3)",
    "EMA slow (4)",
  ]);
  assert.deepEqual(names("wma", { fast: 2, slow: 4 }), [
    "WMA fast (2)",
    "WMA slow (4)",
  ]);
  assert.deepEqual(names("dema", { fast: 2, slow: 4 }), [
    "DEMA fast (2)",
    "DEMA slow (4)",
  ]);
  assert.deepEqual(names("bollinger", { period: 3, width: 1.5 }), [
    "BOLL middle (3/1.5)",
    "BOLL upper (3/1.5)",
    "BOLL lower (3/1.5)",
  ]);
  assert.deepEqual(names("supertrend", { period: 3, multiplier: 1.5 }), [
    "Supertrend (3/1.5)",
  ]);
  assert.deepEqual(
    names("ichimoku", {
      conversionPeriod: 2,
      basePeriod: 3,
      spanPeriod: 4,
    }),
    [
      "Ichimoku conversion (2/3/4)",
      "Ichimoku base (2/3/4)",
      "Ichimoku span A (2/3/4)",
      "Ichimoku span B (2/3/4)",
    ],
  );
  assert.deepEqual(names("rsi", { period: 2 }), ["RSI (2)"]);
  assert.deepEqual(names("kdj", { period: 3 }), [
    "KDJ K (3)",
    "KDJ D (3)",
    "KDJ J (3)",
  ]);
  assert.deepEqual(names("cci", { period: 3 }), ["CCI (3)"]);
  assert.deepEqual(names("williamsR", { period: 3 }), [
    "Williams %R (3)",
  ]);
  assert.deepEqual(names("adx", { period: 3 }), [
    "ADX (3)",
    "+DI (3)",
    "-DI (3)",
  ]);
  assert.deepEqual(names("roc", { period: 3 }), ["ROC (3)"]);
  assert.deepEqual(names("mfi", { period: 3 }), ["MFI (3)"]);
  assert.deepEqual(names("cmf", { period: 3 }), ["CMF (3)"]);
  assert.deepEqual(names("atr", { period: 3 }), ["ATR (3)"]);
  assert.deepEqual(names("macd", { fast: 2, slow: 3, signal: 4 }), [
    "MACD line (2/3/4)",
    "MACD signal (2/3/4)",
    "MACD histogram (2/3/4)",
  ]);
  assert.deepEqual(
    names("stochasticRsi", {
      rsiPeriod: 2,
      stochasticPeriod: 3,
      smoothPeriod: 4,
    }),
    ["Stoch RSI K (2/3/4)", "Stoch RSI D (2/3/4)"],
  );
  assert.deepEqual(names("vwap", {}), ["VWAP"]);
  assert.deepEqual(names("obv", {}), ["OBV"]);
});

test("keeps independent indicator legend labels distinct", () => {
  const [smaLine] = buildIndicatorSeries(
    chartBars,
    "sma",
    { fast: 2, slow: 3 },
    indicatorLabels,
    0,
    0,
  ) as unknown as IndicatorSeries[];
  const [emaLine] = buildIndicatorSeries(
    chartBars,
    "ema",
    { fast: 2, slow: 3 },
    indicatorLabels,
    0,
    0,
  ) as unknown as IndicatorSeries[];

  assert.equal(smaLine.name, "SMA fast (2)");
  assert.equal(emaLine.name, "EMA fast (2)");
  assert.notEqual(smaLine.name, emaLine.name);
});

test("passes custom periods and explicit axes to lower-pane indicators", () => {
  const [strength] = buildIndicatorSeries(
    chartBars,
    "rsi",
    { period: 2 },
    indicatorLabels,
    4,
    4,
  ) as unknown as IndicatorSeries[];

  assert.equal(strength.xAxisIndex, 4);
  assert.equal(strength.yAxisIndex, 4);
  assert.equal(strength.data?.[2], 100);
});

test("passes explicit axes to every MACD series", () => {
  const series = buildIndicatorSeries(
    chartBars,
    "macd",
    { fast: 2, slow: 3, signal: 2 },
    indicatorLabels,
    5,
    6,
  ) as unknown as IndicatorSeries[];

  assert.equal(series.length, 3);
  for (const item of series) {
    assert.equal(item.xAxisIndex, 5);
    assert.equal(item.yAxisIndex, 6);
  }
});

test("uses dedicated high-contrast colors for trade markers", () => {
  const [buy, sell, rangeExit] = buildTradeMarkerSeries([], {
    openPosition: "Open",
    closePosition: "Close",
    shortBuy: "Short buy",
    shortSell: "Short sell",
    rangeExit: "Range exit",
  }) as unknown as MarkerSeries[];

  assert.equal(buy.symbol, "triangle");
  assert.equal(buy.symbolRotate, undefined);
  assert.equal(buy.itemStyle?.color, "#38bdf8");
  assert.equal(buy.itemStyle?.borderColor, "#e0f2fe");
  assert.equal(buy.itemStyle?.borderWidth, 1.5);
  assert.equal(buy.label?.color, "#e0f2fe");
  assert.equal(buy.label?.backgroundColor, "rgba(7, 15, 22, 0.82)");

  assert.equal(sell.symbol, "triangle");
  assert.equal(sell.symbolRotate, 180);
  assert.equal(sell.itemStyle?.color, "#fb923c");
  assert.equal(sell.itemStyle?.borderColor, "#ffedd5");
  assert.equal(sell.itemStyle?.borderWidth, 1.5);
  assert.equal(sell.label?.color, "#ffedd5");
  assert.equal(sell.label?.backgroundColor, "rgba(7, 15, 22, 0.82)");

  assert.equal(rangeExit.itemStyle?.color, "#94a3b8");
});

test("labels allocation markers by long and short strategy actions", () => {
  const [buy, sell] = buildTradeMarkerSeriesFromMarkers(
    {
      buys: [
        {
          time: "2026-01-02",
          price: 100,
          event: "entry",
          action: "short-buy",
          signals: ["short-entry"],
        },
      ],
      sells: [
        {
          time: "2026-01-03",
          price: 99,
          event: "exit",
          action: "close",
          signals: ["long-exit", "short-exit"],
        },
      ],
      rangeExits: [],
    },
    {
      openPosition: "Open",
      closePosition: "Close",
      shortBuy: "Short buy",
      shortSell: "Short sell",
      rangeExit: "Range exit",
    },
  ) as unknown as MarkerSeries[];

  assert.equal(buy.data?.[0].name, "Short buy");
  assert.equal(buy.data?.[0].label?.formatter, "Short buy");
  assert.equal(sell.data?.[0].name, "Close");
  assert.equal(sell.data?.[0].label?.formatter, "Close");
});

test("makes the selected price-chart zoom window directly draggable", () => {
  const dataZoom = entries(1_000, [0, 1, 2, 3]);
  const slider = dataZoom.find((entry) => entry.type === "slider");

  assert.ok(slider);
  assert.equal(slider.id, "price-zoom-slider");
  assert.equal(slider.brushSelect, false);
  assert.equal(slider.realtime, true);
  assert.equal(slider.zoomLock, false);
  assert.equal(slider.height, 22);
  assert.equal(slider.handleSize, "125%");
  assert.deepEqual(slider.xAxisIndex, [0, 1, 2, 3]);
});

test("links price zoom across every requested grid and starts with recent bars", () => {
  const multiplePaneZoom = entries(1_000, [0, 1, 2, 3, 4]);
  const overlayOnlyZoom = entries(1_000, [0, 1]);

  for (const entry of multiplePaneZoom) {
    assert.equal(entry.start, 88);
    assert.equal(entry.end, 100);
    assert.deepEqual(entry.xAxisIndex, [0, 1, 2, 3, 4]);
  }
  for (const entry of overlayOnlyZoom) {
    assert.deepEqual(entry.xAxisIndex, [0, 1]);
  }
  for (const entry of entries(80, [0, 1, 2])) {
    assert.equal(entry.start, 0);
    assert.equal(entry.end, 100);
  }
});

test("builds readable zero, one, and multiple-pane chart layouts", () => {
  const empty = buildPriceChartLayout(["2026-01-01"], 0);
  const single = buildPriceChartLayout(["2026-01-01"], 1);
  const multiple = buildPriceChartLayout(["2026-01-01"], 3);

  assert.equal(empty.grids.length, 2);
  assert.equal(empty.xAxes.length, 2);
  assert.equal(empty.yAxes.length, 2);
  assert.deepEqual(empty.xAxisIndexes, [0, 1]);
  assert.equal(empty.xAxes[0].axisLabel?.show, false);
  assert.equal(empty.xAxes[1].axisLabel?.show, true);
  assert.ok(Number(empty.grids[0].top) >= 50);

  assert.equal(single.grids.length, 3);
  assert.equal(single.xAxes.length, 3);
  assert.equal(single.yAxes.length, 3);
  assert.deepEqual(single.xAxisIndexes, [0, 1, 2]);
  assert.equal(single.xAxes[1].axisLabel?.show, false);
  assert.equal(single.xAxes[2].axisLabel?.show, true);

  assert.equal(multiple.grids.length, 5);
  assert.equal(multiple.xAxes.length, 5);
  assert.equal(multiple.yAxes.length, 5);
  assert.deepEqual(multiple.xAxisIndexes, [0, 1, 2, 3, 4]);
  assert.ok(multiple.height > single.height);
  assert.ok(single.height > empty.height);
  for (const axis of multiple.xAxes.slice(0, -1)) {
    assert.equal(axis.axisLabel?.show, false);
  }
  assert.equal(multiple.xAxes.at(-1)?.axisLabel?.show, true);
});

test("uses a scrolling legend above the reserved price-plot area", () => {
  const legend = buildPriceChartLegend() as {
    type?: string;
    top?: number;
    left?: number;
    right?: number;
    selectedMode?: boolean;
  };
  const layout = buildPriceChartLayout(["2026-01-01"], 0);

  assert.equal(legend.type, "scroll");
  assert.equal(legend.selectedMode, false);
  assert.equal(legend.left, 8);
  assert.equal(legend.right, 8);
  assert.ok(Number(layout.grids[0].top) > Number(legend.top));
  assert.ok(Number(layout.grids[0].top) - Number(legend.top) >= 44);
});

test("renders strategy price lines on the main axes with semantic dashed styles", () => {
  const roles = Object.fromEntries(
    [
      "entry",
      "exit",
      "fast",
      "slow",
      "middle",
      "upper",
      "lower",
      "trend",
      "conversion",
      "base",
      "span-a",
      "span-b",
      "reference",
    ].map((role) => [role, `Localized ${role}`]),
  ) as Record<StrategyPriceLineRole, string>;

  const [entry, exit, fast, slow, upper, lower] =
    buildStrategyLineSeries(
      [
        { id: "test:entry", role: "entry", data: [null, 10] },
        { id: "test:exit", role: "exit", data: [null, 8] },
        { id: "test:fast", role: "fast", data: [9, 10] },
        { id: "test:slow", role: "slow", data: [8, 9] },
        { id: "test:upper", role: "upper", data: [11, 12] },
        { id: "test:lower", role: "lower", data: [7, 8] },
      ] satisfies StrategyPriceLine[],
      { prefix: "Localized strategy", roles },
    ) as unknown as IndicatorSeries[];

  for (const item of [entry, exit, fast, slow, upper, lower]) {
    assert.equal(item.type, "line");
    assert.match(item.name ?? "", /^Localized strategy · Localized /);
    assert.equal(item.xAxisIndex, 0);
    assert.equal(item.yAxisIndex, 0);
    assert.equal(item.showSymbol, false);
    assert.equal(item.connectNulls, false);
    assert.equal(item.smooth, false);
    assert.equal(item.areaStyle, undefined);
    assert.equal(item.lineStyle?.type, "dashed");
    assert.ok((item.lineStyle?.width ?? 0) > 1.5);
  }
  assert.notEqual(entry.lineStyle?.color, exit.lineStyle?.color);
  assert.notEqual(fast.lineStyle?.color, slow.lineStyle?.color);
  assert.notEqual(upper.lineStyle?.color, lower.lineStyle?.color);
});

test("restores a dragged zoom window after chart options change", () => {
  const original = {
    dataZoom: buildPriceDataZoom(1_000, [0, 1, 2, 3]),
    series: [],
  };
  const restored = applyDataZoomWindow(original, {
    start: 42,
    end: 68,
  });
  const dataZoom = restored.dataZoom as ZoomEntry[];

  assert.notEqual(restored, original);
  assert.ok(dataZoom.length > 0);
  for (const entry of dataZoom) {
    assert.equal(entry.start, 42);
    assert.equal(entry.end, 68);
  }
  for (const entry of original.dataZoom as ZoomEntry[]) {
    assert.equal(entry.start, 88);
    assert.equal(entry.end, 100);
  }
});
