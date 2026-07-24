import assert from "node:assert/strict";
import test from "node:test";
import { applyDataZoomWindow } from "../app/components/EChart";
import {
  buildIndicatorSeries,
  buildPriceChartLayout,
  buildPriceDataZoom,
  buildStrategyLineSeries,
  buildTradeMarkerSeries,
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
  rsi: "RSI",
  macdLine: "MACD",
  macdSignal: "Signal",
  macdHistogram: "Histogram",
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
  assert.equal(fast.xAxisIndex, 0);
  assert.equal(fast.yAxisIndex, 0);
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
    buy: "Buy",
    sell: "Sell",
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
