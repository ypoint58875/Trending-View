import { buildWeeklyMarketContext, WEEKLY_CONTEXT_PERIODS } from "../lib/analysis/weekly-market-context";
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildContextCurves, buildRawContextCurves, buildContextQuantiles, buildNikkeiContextMonitor, replayContextDirections, smoothContext } from "../lib/analysis/market-context";
import { MarketContextMonitor, ValidatedCycleShortcuts, contextObservationLabel } from "../app/components/ValidatedCycleShortcuts";
import { createValidatedCycleStrategy } from "../lib/analysis/validated-cycle-strategy";
import { buildStrategyCycleRollingSchedule } from "../lib/analysis/strategy-cycle-validation";
import { DEFAULT_POSITION_OVERLAY_OPTIONS } from "../lib/analysis/sma-position-overlay";
import { buildIndicatorSeries, buildPriceChartLayout, buildPriceChartLegends, PriceChart, CONTEXT_CHART_TABS } from "../app/components/PriceChart";
import { zhCN } from "../app/i18n/zh-CN";
import type { MarketSeries } from "../lib/market/types";

function market(count = 260): MarketSeries {
  return { instrument: { secid: "^N225", code: "^N225", name: "Nikkei", exchange: "JPX", assetType: "index", provider: "yahoo" },
    interval: "1d", priceAdjustment: "raw", source: "yahoo", previousClose: 100,
    latestBarStatus: "complete", fetchedAt: "2026-11-05T08:00:00Z",
    bars: Array.from({ length: count }, (_, index) => {
      const timestamp = Date.UTC(2000, 0, 3 + index + Math.floor(index / 5) * 2);
      const close = 1000 + index + Math.sin(index / 7) * 40;
      return { timestamp, time: new Date(timestamp).toISOString().slice(0, 10), close, open: close,
        high: close + 1, low: close - 1, volume: 100, amount: 0, amplitude: 0, changePercent: 0, change: 0, turnoverRate: 0 };
    }) };
}

test("the research chart exposes an initially enabled context switch for the supplied full series", () => {
  const input=market();
  const html=renderToStaticMarkup(createElement(PriceChart,{bars:input.bars,contextSeries:input,interval:"1d",chartType:"candlestick",dataKey:"context-toggle",ariaLabel:"Chart",
    labels:{price:"Price",close:"Close",volume:"Volume",openPosition:"Buy",carryPosition:"Carry",closePosition:"Sell",shortBuy:"Add",shortSell:"Reduce",rangeExit:"Range",series:zhCN.chart.series}}));
  assert.match(html,/role="switch" aria-checked="true"/);
  assert.ok(html.includes(zhCN.marketContext.regionsToggle));
});

test("context curves match independent window formulas with full causal warmup", () => {
  const bars = market().bars;
  const actual = buildContextCurves(bars);
  [20, 60, 200].forEach((period, slot) => {
    const mean = (i: number) => bars.slice(i - period + 1, i + 1).reduce((sum, bar) => sum + bar.close, 0) / period;
    assert.equal(actual.bias[slot][period], null);
    assert.equal(actual.slope[slot][period + 1], null);
    for (let i = period + 2; i < bars.length; i++) {
      const expectedBias = [i - 2, i - 1, i].reduce((sum, j) => sum + (bars[j].close / mean(j) - 1) * 100, 0) / 3;
      const expectedSlope = (mean(i) - mean(i - 3)) / 3;
      assert.ok(Math.abs(actual.bias[slot][i]! - expectedBias) < 1e-9);
      assert.ok(Math.abs(actual.slope[slot][i]! - expectedSlope) < 1e-9);
    }
  });
  assert.deepEqual(smoothContext([null, 1, 2, 3, null, 5, 6, 7]), [null, null, null, 2, null, null, null, 6]);
  const rows = replayContextDirections(bars.map((bar) => bar.time), actual);
  assert.equal(rows[202].direction, "warmup");
  assert.notEqual(rows[203].direction, "warmup");
});

test("six daily directions reset on flat/mixed, preserve confirmation and reverse only on day three", () => {
  // Positive values can weaken; negative values can strengthen.
  const values = [100, 80, 60, 40, 20, 0, -20, -40, -30, -20, -10, -10, 0, 10, 20];
  const curves = Array.from({ length: 6 }, () => [...values]);
  curves[5][4] = 41; // one opposing curve resets an established down streak
  const times = values.map((_, i) => String(i).padStart(3, "0"));
  const rows = replayContextDirections(times, { bias: curves.slice(0, 3), slope: curves.slice(3) });
  assert.equal(rows[1].direction, "down");
  assert.equal(rows[1].consecutive, 1);
  assert.equal(rows[2].confirmed, null);
  assert.equal(rows[3].confirmed, "down");
  assert.equal(rows[4].direction, "mixed");
  assert.equal(rows[4].consecutive, 0);
  assert.equal(rows[4].confirmed, "down");
  assert.equal(contextObservationLabel(rows[4]), `${zhCN.marketContext.previous.down}，${zhCN.marketContext.disagreement}`);
  assert.equal(rows[8].direction, "up");
  assert.equal(rows[8].consecutive, 1);
  assert.equal(rows[9].confirmed, "down");
  assert.equal(rows[10].confirmed, "up");
  assert.equal(rows[10].confirmedTime, times[10]);
  assert.equal(rows[11].direction, "mixed");
  assert.equal(rows[11].consecutive, 0);
  assert.equal(rows[14].consecutive, 3);
  assert.equal(rows[14].confirmedTime, times[10]);
});

test("replay after interruption is identical, prefixes never see future data", () => {
  const input = market();
  for (const length of [203, 204, 205, 230, 260]) {
    const prefix = { ...input, bars: input.bars.slice(0, length) };
    const full = buildWeeklyMarketContext(input.bars).observations;
    assert.deepEqual(buildNikkeiContextMonitor(prefix), full[length - 1]);
    assert.deepEqual(buildNikkeiContextMonitor(structuredClone(prefix)), full[length - 1]);
  }
});

test("Nikkei monitoring excludes unfinished/future closes and survives same-date provisional replacement", () => {
  const input = market();
  const today = "2026-11-05";
  input.bars.at(-1)!.time = today;
  input.latestBarStatus = "in-progress";
  const before = buildNikkeiContextMonitor(input, new Date("2026-11-05T06:00:00Z"));
  assert.equal(before?.time, input.bars.at(-2)!.time);
  input.bars.at(-1)!.close = 80000;
  assert.deepEqual(buildNikkeiContextMonitor(input, new Date("2026-11-05T06:00:00Z")), before);
  assert.deepEqual(buildNikkeiContextMonitor(input, new Date("2026-11-05T08:00:00Z")), before);
  input.latestBarStatus = "complete";
  assert.equal(buildNikkeiContextMonitor(input, new Date("2026-11-05T08:00:00Z"))?.time, today);
  input.bars.at(-1)!.time = "2026-11-06";
  assert.deepEqual(buildNikkeiContextMonitor(input, new Date("2026-11-05T08:00:00Z")), before);
});

test("bounded 10000-bar replay is deterministic and rejects invalid or oversized data", () => {
  const input = market(10000);
  assert.ok(buildNikkeiContextMonitor(input));
  const quantiles = buildContextQuantiles(input.bars.map((bar) => bar.time), buildRawContextCurves(input.bars).bias[2]);
  assert.equal(quantiles.length, 4);
  assert.ok(quantiles.every((curve) => curve.length === 10000 && Number.isFinite(curve.at(-1))));
  assert.deepEqual(buildNikkeiContextMonitor(input), buildNikkeiContextMonitor(structuredClone(input)));
  assert.throws(() => buildContextCurves(market(10001).bars), /limit/);
  input.bars[1].close = NaN;
  assert.throws(() => buildContextCurves(input.bars), /finite/);
});

test("registered context charts share pane axes, and UI exposes tabs and dated monitoring", () => {
  const input = market();
  for (const id of ["biasContext", "smaSlopeContext"] as const) {
    const series = buildIndicatorSeries(input.bars, id, {}, zhCN.chart.series, 2, 2);
    const perPane = id === "biasContext" ? 6 : 2;
    assert.equal(series.length, perPane * 3);
    [2, 3, 4].forEach((axis) => assert.equal(series.filter((item) => "xAxisIndex" in item && item.xAxisIndex === axis && item.yAxisIndex === axis).length, perPane));
    const layout = buildPriceChartLayout(input.bars.map((bar) => bar.time), 3);
    const legends = buildPriceChartLegends(series, layout.grids);
    assert.equal(legends.length, 4);
    assert.equal(legends[0].data, undefined);
    assert.equal(legends[1].data?.length, perPane);
    assert.ok(Number(legends[1].top) >= 489);
    assert.ok(Number(legends[1].top) < Number(layout.grids[2].top));
  }
  for (const tab of CONTEXT_CHART_TABS) {
    const series = buildIndicatorSeries(input.bars, tab.id, {}, zhCN.chart.series, 2, 2, false, tab.period);
    assert.equal(series.length, tab.id === "biasContext" ? 6 : 2);
    assert.ok(series.every((item) => "xAxisIndex" in item && item.xAxisIndex === 2 && item.yAxisIndex === 2));
    assert.ok(series.every((item) => String(item.name).includes(String(WEEKLY_CONTEXT_PERIODS[[20,60,200].indexOf(tab.period)]))));
  }
  const html = renderToStaticMarkup(createElement(MarketContextMonitor, { series: input }));
  assert.ok(html.includes(zhCN.marketContext.title));
  assert.ok(html.includes(input.bars.at(-1)!.time));
  const chart = renderToStaticMarkup(createElement(PriceChart, { bars: input.bars, interval: "1d", chartType: "candlestick", dataKey: "context-test", ariaLabel: "Chart",
    labels: { price: "Price", close: "Close", volume: "Volume", openPosition: "Buy", carryPosition: "Carry", closePosition: "Sell", shortBuy: "Add", shortSell: "Reduce", rangeExit: "Range", series: zhCN.chart.series } }));
  assert.equal(CONTEXT_CHART_TABS.length, 6);
  for (const tab of CONTEXT_CHART_TABS) assert.ok(chart.includes(zhCN.marketContext.tabs[tab.key]));
  assert.equal((chart.match(/aria-selected="true"/g) ?? []).length, 1);
});

test("raw context and three-year percentiles exclude today's value and preserve leap-day boundaries", () => {
  const input = market(1600);
  const raw = buildRawContextCurves(input.bars);
  const smoothed = buildContextCurves(input.bars);
  assert.equal(raw.bias[2][198], null);
  assert.equal(raw.slope[2][199], null);
  assert.notEqual(raw.bias[2][199], null);
  assert.notEqual(raw.slope[2][200], null);
  assert.deepEqual(smoothed.bias[2], smoothContext(raw.bias[2]));
  const times = input.bars.map((bar) => bar.time);
  const values = input.bars.map((_, index) => index % 17 === 0 ? null : index / 10);
  const quantiles = buildContextQuantiles(times, values);
  for (const index of [250, 270, 451, 1096, 1520, 1599]) {
    const [year, month, day] = times[index].split("-").map(Number);
    const cutoff = `${year - 3}-${String(month).padStart(2, "0")}-${String(Math.min(day, new Date(Date.UTC(year - 3, month, 0)).getUTCDate())).padStart(2, "0")}`;
    const historical = values.slice(0, index).filter((value, position): value is number => value !== null && times[position] >= cutoff).sort((a, b) => a - b);
    [0.05, 0.10, 0.90, 0.95].forEach((p, slot) => {
      if (historical.length < 252) assert.equal(quantiles[slot][index], null);
      else {
        const rank = (historical.length - 1) * p;
        const expected = historical[Math.floor(rank)] + (historical[Math.ceil(rank)] - historical[Math.floor(rank)]) * (rank % 1);
        assert.equal(quantiles[slot][index], expected);
      }
    });
  }
  const replaced = [...values]; replaced[1599] = 1000000;
  assert.deepEqual(buildContextQuantiles(times, replaced).map((row) => row[1599]), quantiles.map((row) => row[1599]));
  const prefix = buildContextQuantiles(times.slice(0, 800), values.slice(0, 800));
  assert.deepEqual(prefix, quantiles.map((curve) => curve.slice(0, 800)));
  assert.throws(() => buildContextQuantiles([times[1], times[0]], [1, 2]), /ordered/);
});

test("one independent market-context card precedes multiple validation windows for one instrument", () => {
  const input = market();
  const records = [10, 20].map((screeningWindow) => {
    const schedule = buildStrategyCycleRollingSchedule(input.bars, 14, screeningWindow)!;
    return createValidatedCycleStrategy(input, schedule.decisionIndexes.map((index) => ({
      decisionIndex: index, decisionTime: input.bars[index].time, screeningWindow,
      plan: { strategyA: { strategyId: "roc-momentum", parameters: { period: 1, entry: 1, exit: -1 } },
        strategyB: null, strategyAAllocation: 1, strategyBAllocation: 0 }, fixedRelativeLongStrategy: null, label: "Test winner",
    })), 14, screeningWindow, { interval: "1d", initialCash: 100000, commissionRate: 0, slippageRate: 0,
      executionPolicy: "hybrid", positionOverlay: DEFAULT_POSITION_OVERLAY_OPTIONS });
  });
  const html = renderToStaticMarkup(createElement(ValidatedCycleShortcuts, { records, error: false, embedded: true, onOpen: () => {} }));
  assert.equal((html.match(/class="market-context-card"/g) ?? []).length, 1);
  assert.ok(html.indexOf('class="market-context-card"') < html.indexOf("<button"));
  assert.ok(html.includes(`10${zhCN.validatedCycle.nameSuffix}`));
  assert.ok(html.includes(`20${zhCN.validatedCycle.nameSuffix}`));
  assert.ok(!/<button[^>]*>[\s\S]*?market-context-monitor[\s\S]*?<\/button>/.test(html));
});
