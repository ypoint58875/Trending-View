import assert from "node:assert/strict";
import test from "node:test";
import {
  ECHART_REPLACE_MERGE_COMPONENTS,
  applyDataZoomWindow,
  chartReplaceMergeComponents,
  panDataZoomWindow,
} from "../app/components/EChart";
import {
  buildIndicatorSeries,
  buildPriceChartLegend,
  buildPriceChartLayout,
  buildPriceDataZoom,
  buildStrategyLineSeries,
  buildTradeMarkerSeries,
  buildTradeMarkerSeriesFromMarkers,
  buildVisiblePriceAxisRange,
  formatPriceAxisValue,
  formatPriceChartTime,
  formatPriceChartTooltipValue,
  priceDataZoomWindowForTimeRange,
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
  zoomOnMouseWheel?: boolean;
  moveOnMouseMove?: boolean;
  moveOnMouseWheel?: boolean;
  preventDefaultMouseMove?: boolean;
  throttle?: number;
  minValueSpan?: number;
};

type MarkerSeries = {
  symbol?: string;
  symbolRotate?: number;
  symbolOffset?: [number, number];
  silent?: boolean;
  clip?: boolean;
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
    value?: [string, number];
    tradePrice?: number;
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
  silent?: boolean;
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
  sma: "SMA",
  smaFast: "SMA fast",
  smaSlow: "SMA slow",
  ema: "EMA",
  emaFast: "EMA fast",
  emaSlow: "EMA slow",
  wma: "WMA",
  wmaFast: "WMA fast",
  wmaSlow: "WMA slow",
  dema: "DEMA",
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
  supportLevel: "Support",
  resistanceLevel: "Resistance",
  bullishBreak: "Bullish break",
  bearishBreak: "Bearish break",
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

function entries(
  barsLength: number,
  xAxisIndexes: number[],
  interval: "1d" | "1m" = "1d",
) {
  return buildPriceDataZoom(
    barsLength,
    xAxisIndexes,
    interval,
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

test("collapses equal moving-average periods into one chart series", () => {
  for (const indicator of ["sma", "ema", "wma", "dema"] as const) {
    const series = buildIndicatorSeries(
      chartBars,
      indicator,
      { fast: 2, slow: 2 },
      indicatorLabels,
      0,
      0,
    ) as unknown as IndicatorSeries[];

    assert.equal(series.length, 1, indicator);
    assert.equal(series[0].name, `${indicator.toUpperCase()} (2)`);
  }
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
  assert.deepEqual(names("kdj", { period: 3, smoothK: 2, smoothD: 4 }), [
    "KDJ K (3/2/4)",
    "KDJ D (3/2/4)",
    "KDJ J (3/2/4)",
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
    carryPosition: "Opening position",
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
  assert.deepEqual(buy.symbolOffset, [0, 16]);
  assert.equal(buy.silent, true);
  assert.equal(buy.clip, false);

  assert.equal(sell.symbol, "triangle");
  assert.equal(sell.symbolRotate, 180);
  assert.equal(sell.itemStyle?.color, "#fb923c");
  assert.equal(sell.itemStyle?.borderColor, "#ffedd5");
  assert.equal(sell.itemStyle?.borderWidth, 1.5);
  assert.equal(sell.label?.color, "#ffedd5");
  assert.equal(sell.label?.backgroundColor, "rgba(7, 15, 22, 0.82)");
  assert.deepEqual(sell.symbolOffset, [0, -16]);
  assert.equal(sell.silent, true);
  assert.equal(sell.clip, false);

  assert.equal(rangeExit.itemStyle?.color, "#94a3b8");
  assert.deepEqual(rangeExit.symbolOffset, [0, -14]);
  assert.equal(rangeExit.silent, true);
  assert.equal(rangeExit.clip, false);
});

test("places allocation markers outside candles without intercepting chart drag", () => {
  const markerBars: MarketBar[] = [
    {
      ...chartBars[1],
      time: "2026-01-02",
      open: 101,
      high: 105,
      low: 98,
      close: 103,
      volume: 1_000,
    },
    {
      ...chartBars[2],
      time: "2026-01-03",
      open: 103,
      high: 106,
      low: 97,
      close: 100,
      volume: 1_100,
    },
  ];
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
      carryPosition: "Opening position",
      closePosition: "Close",
      shortBuy: "Short buy",
      shortSell: "Short sell",
      rangeExit: "Range exit",
    },
    markerBars,
  ) as unknown as MarkerSeries[];

  assert.equal(buy.data?.[0].name, "Short buy");
  assert.equal(buy.data?.[0].label?.formatter, "Short buy");
  assert.deepEqual(buy.data?.[0].value, ["2026-01-02", 98]);
  assert.equal(buy.data?.[0].tradePrice, 100);
  assert.equal(buy.silent, true);
  assert.equal(sell.data?.[0].name, "Close");
  assert.equal(sell.data?.[0].label?.formatter, "Close");
  assert.deepEqual(sell.data?.[0].value, ["2026-01-03", 106]);
  assert.equal(sell.data?.[0].tradePrice, 99);
  assert.equal(sell.silent, true);
});

test("renders intraday chart times in Asia/Shanghai without moving daily labels", () => {
  const intradayBar: MarketBar = {
    ...chartBars[0],
    time: "2026-08-14 10:26",
    timestamp: Date.UTC(2026, 7, 14, 1, 26),
  };

  assert.equal(formatPriceChartTime(intradayBar, "1m"), "2026-08-14 09:26");
  assert.equal(formatPriceChartTime(intradayBar, "1d"), intradayBar.time);

  const [buy] = buildTradeMarkerSeriesFromMarkers(
    {
      buys: [
        {
          time: intradayBar.time,
          price: intradayBar.close,
          event: "entry",
          action: "open",
          signals: ["long-entry"],
        },
      ],
      sells: [],
      rangeExits: [],
    },
    {
      openPosition: "Open",
      carryPosition: "Opening position",
      closePosition: "Close",
      shortBuy: "Short buy",
      shortSell: "Short sell",
      rangeExit: "Range exit",
    },
    [intradayBar],
    "1m",
  ) as unknown as MarkerSeries[];

  assert.deepEqual(buy.data?.[0].value, ["2026-08-14 09:26", 0.5]);
});

test("makes the selected price-chart zoom window directly draggable", () => {
  const dataZoom = entries(1_000, [0, 1, 2, 3]);
  const inside = dataZoom.find((entry) => entry.type === "inside");
  const slider = dataZoom.find((entry) => entry.type === "slider");

  assert.ok(inside);
  assert.equal(inside.zoomLock, false);
  assert.equal(inside.zoomOnMouseWheel, true);
  assert.equal(inside.moveOnMouseMove, false);
  assert.equal(inside.moveOnMouseWheel, false);
  assert.equal(inside.preventDefaultMouseMove, true);
  assert.equal(inside.throttle, 16);
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
    assert.equal(entry.start, 94);
    assert.equal(entry.end, 100);
    assert.deepEqual(entry.xAxisIndex, [0, 1, 2, 3, 4]);
  }
  for (const entry of overlayOnlyZoom) {
    assert.deepEqual(entry.xAxisIndex, [0, 1]);
  }
  for (const entry of entries(80, [0, 1, 2])) {
    assert.equal(entry.start, 25);
    assert.equal(entry.end, 100);
  }
  for (const entry of entries(40, [0, 1, 2])) {
    assert.equal(entry.start, 0);
    assert.equal(entry.end, 100);
  }

  for (const entry of entries(2_500, [0, 1], "1m")) {
    assert.equal(entry.minValueSpan, 120);
  }
  for (const entry of entries(2_500, [0, 1], "1d")) {
    assert.equal(entry.minValueSpan, undefined);
  }
});

test("pans the visible time window horizontally without changing its span", () => {
  assert.deepEqual(panDataZoomWindow({ start: 80, end: 100 }, 100, 1_000), {
    start: 78,
    end: 98,
  });
  assert.deepEqual(panDataZoomWindow({ start: 10, end: 30 }, -5_000, 1_000), {
    start: 80,
    end: 100,
  });
  assert.deepEqual(panDataZoomWindow({ start: 10, end: 30 }, 5_000, 1_000), {
    start: 0,
    end: 20,
  });
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

test("renders confirmed support, resistance, and break markers without backpainting", () => {
  const bars = [
    { high: 10, low: 8, close: 9 },
    { high: 12, low: 9, close: 11 },
    { high: 11, low: 7, close: 8 },
    { high: 10, low: 6, close: 7 },
    { high: 11, low: 7, close: 10 },
    { high: 13, low: 9, close: 13 },
    { high: 10, low: 5, close: 5 },
    { high: 11, low: 7, close: 9 },
    { high: 12, low: 8, close: 10 },
  ].map((value, index) => ({
    ...chartBars[0],
    ...value,
    open: value.close,
    volume: 2 ** index,
    time: `2026-02-0${index + 1}`,
    timestamp: Date.UTC(2026, 1, index + 1),
  }));
  const [support, resistance, bullishBreak, bearishBreak] =
    buildIndicatorSeries(
      bars,
      "supportResistanceBreaks",
      { leftBars: 1, rightBars: 1, volumeThreshold: 0 },
      indicatorLabels,
      2,
      2,
    ) as unknown as IndicatorSeries[];

  assert.deepEqual(support.data, [null, null, null, null, 6, 6, 6, null, 5]);
  assert.deepEqual(resistance.data, [null, null, 12, 12, 12, 12, null, 13, 13]);
  assert.deepEqual(bullishBreak.data, [
    null,
    null,
    null,
    null,
    null,
    13,
    null,
    null,
    null,
  ]);
  assert.deepEqual(bearishBreak.data, [
    null,
    null,
    null,
    null,
    null,
    null,
    5,
    null,
    null,
  ]);
  assert.equal(support.name, "Support (1/1/0)");
  assert.equal(support.connectNulls, false);
  assert.equal(support.lineStyle?.color, "#22c55e");
  assert.equal(resistance.connectNulls, false);
  assert.equal(bullishBreak.type, "scatter");
  assert.equal(bearishBreak.xAxisIndex, 2);
  assert.equal(bearishBreak.yAxisIndex, 2);
});

test("renders only useful strategy price lines with matching thin dashed legend styles", () => {
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

  const rendered = buildStrategyLineSeries(
      [
        { id: "test:entry", role: "entry", data: [null, 10] },
        { id: "test:exit", role: "exit", data: [null, 8] },
        { id: "test:fast", role: "fast", data: [9, 10] },
        { id: "test:slow", role: "slow", data: [8, 9] },
        { id: "test:upper", role: "upper", data: [11, 12] },
        { id: "test:lower", role: "lower", data: [7, 8] },
        { id: "test:unused", role: "reference", data: [null, null] },
      ] satisfies StrategyPriceLine[],
      {
        prefix: "Localized strategy",
        roles,
        actionRoles: { entry: "Open", exit: "Light" },
      },
    ) as unknown as IndicatorSeries[];
  const [entry, exit, fast, slow, upper, lower] = rendered;

  assert.equal(rendered.length, 6);
  assert.equal(entry.name, "Open");
  assert.equal(exit.name, "Light");
  for (const item of [entry, exit, fast, slow, upper, lower]) {
    assert.equal(item.type, "line");
    assert.equal(item.xAxisIndex, 0);
    assert.equal(item.yAxisIndex, 0);
    assert.equal(item.showSymbol, false);
    assert.equal(item.silent, true);
    assert.equal(item.connectNulls, false);
    assert.equal(item.smooth, false);
    assert.equal(item.areaStyle, undefined);
    assert.equal(item.lineStyle?.type, "dashed");
    assert.equal(item.lineStyle?.width, 1.5);
  }
  for (const item of [fast, slow, upper, lower]) {
    assert.match(item.name ?? "", /^Localized strategy · Localized /);
  }
  assert.notEqual(entry.lineStyle?.color, exit.lineStyle?.color);
  assert.notEqual(fast.lineStyle?.color, slow.lineStyle?.color);
  assert.notEqual(upper.lineStyle?.color, lower.lineStyle?.color);
});

test("formats K-line tooltip values with one decimal place", () => {
  assert.equal(formatPriceChartTooltipValue(12.345), "12.3");
  assert.equal(
    formatPriceChartTooltipValue([12.345, 9.94]),
    "12.3 / 9.9",
  );
  assert.equal(formatPriceChartTooltipValue(null), "—");

  const priceAxis = buildPriceChartLayout(["2026-01-01"], 0).yAxes[0];
  const formatter = priceAxis.axisPointer?.label?.formatter;
  assert.equal(typeof formatter, "function");
  if (typeof formatter === "function") {
    assert.equal(
      formatter({
        value: 66_254.87,
        axisDimension: "y",
        axisIndex: 0,
        seriesData: [],
      }),
      "66,254.9",
    );
  }
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
    assert.equal(entry.start, 94);
    assert.equal(entry.end, 100);
  }
});

test("focuses the price chart on the applied screening window", () => {
  const bars = Array.from({ length: 10 }, (_, index) => ({
    time: `2026-01-${String(index + 1).padStart(2, "0")}`,
  })) as MarketBar[];

  assert.deepEqual(
    priceDataZoomWindowForTimeRange(
      bars,
      "2026-01-03",
      "2026-01-06",
    ),
    { start: 20, end: 60 },
  );
  const focusedZoom = buildPriceDataZoom(10, [0, 1], "1d", {
    start: 20,
    end: 60,
  }) as Array<{ start?: number; end?: number }>;
  assert.ok(focusedZoom.length > 0);
  assert.ok(
    focusedZoom.every(
      (component) => component.start === 20 && component.end === 60,
    ),
  );
});

test("derives the price axis only from the visible OHLC window", () => {
  const bars: MarketBar[] = Array.from({ length: 10 }, (_, index) => ({
    time: `2026-01-${String(index + 1).padStart(2, "0")}`,
    timestamp: Date.UTC(2026, 0, index + 1),
    open: index + 10,
    high: index + 12,
    low: index + 8,
    close: index + 11,
    volume: 1_000,
    amount: 1_000,
    amplitude: 0,
    changePercent: 0,
    change: 0,
    turnoverRate: 0,
  }));
  const range = buildVisiblePriceAxisRange(bars, {
    start: 50,
    end: 100,
  });

  assert.ok(range);
  assert.ok(range.minimum < 13);
  assert.ok(range.maximum > 21);
  assert.ok(range.minimum > 8);
  assert.equal(Number.isInteger(range.minimum), true);
  assert.equal(Number.isInteger(range.maximum), true);
  assert.equal(range.precision, 0);
  assert.equal(buildVisiblePriceAxisRange([], { start: 0, end: 100 }), null);
});

test("uses at most two decimals on the price axis for low-priced instruments", () => {
  const bars: MarketBar[] = [
    {
      time: "2026-01-01",
      timestamp: Date.UTC(2026, 0, 1),
      open: 9.81,
      high: 10.03,
      low: 9.72,
      close: 9.98,
      volume: 1_000,
      amount: 10_000,
      amplitude: 0,
      changePercent: 0,
      change: 0,
      turnoverRate: 0,
    },
  ];
  const range = buildVisiblePriceAxisRange(bars, { start: 0, end: 100 });
  assert.ok(range);
  assert.equal(range.precision, 2);
  assert.ok(
    Math.abs(range.minimum * 100 - Math.round(range.minimum * 100)) < 1e-9,
  );
  assert.ok(
    Math.abs(range.maximum * 100 - Math.round(range.maximum * 100)) < 1e-9,
  );
  assert.equal(formatPriceAxisValue(9.876, 2), "9.88");
  assert.equal(formatPriceAxisValue(9.8, 2), "9.8");

  const axis = buildPriceChartLayout(["2026-01-01"], 0, 2).yAxes[0];
  const formatter = axis.axisLabel?.formatter;
  assert.equal(typeof formatter, "function");
  if (typeof formatter === "function") {
    assert.equal(
      (formatter as (value: number, index: number, extra: unknown) => string)(
        9.876,
        0,
        null,
      ),
      "9.88",
    );
  }
});

test("replaces variable chart components without recreating interaction state", () => {
  assert.deepEqual(ECHART_REPLACE_MERGE_COMPONENTS, [
    "grid",
    "xAxis",
    "yAxis",
    "dataZoom",
    "series",
  ]);
  const replacedComponents = new Set<string>(
    ECHART_REPLACE_MERGE_COMPONENTS,
  );
  assert.equal(replacedComponents.has("tooltip"), false);
  assert.equal(replacedComponents.has("axisPointer"), false);
  assert.deepEqual(
    chartReplaceMergeComponents(true, false, { start: 42, end: 68 }),
    ["grid", "xAxis", "yAxis", "series"],
  );
  assert.deepEqual(
    chartReplaceMergeComponents(true, true, { start: 42, end: 68 }),
    ECHART_REPLACE_MERGE_COMPONENTS,
  );
  assert.deepEqual(
    chartReplaceMergeComponents(false, false, { start: 42, end: 68 }),
    ECHART_REPLACE_MERGE_COMPONENTS,
  );
});
