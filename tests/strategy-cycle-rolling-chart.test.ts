import assert from "node:assert/strict";
import test from "node:test";
import { buildStrategyCycleRollingChartOption } from "../app/components/StrategyCycleRollingChart";
import type { AllocationRebalance } from "../lib/analysis/backtest";
import type { MarketBar } from "../lib/market/types";
import { buildContextChartAreas, CONTEXT_AREA_COLORS } from "../lib/analysis/context-chart";
import { buildWeeklyMarketContext } from "../lib/analysis/weekly-market-context";
import { VISIBLE_TREND_TABS } from "../lib/analysis/trend-panels";
import type { ContextObservation } from "../lib/analysis/context-replay";

test("context regions inherit confirmation before the evaluation slice and retain disagreement", () => {
  const history: ContextObservation[] = bars.map((bar,index) => ({time:bar.time,direction:index===1?"mixed":index<2?"up":"down",consecutive:index<2?3:index-1,confirmed:index<4?"up":"down",confirmedTime:index<4?bars[0].time:bars[4].time}));
  const regions=buildContextChartAreas(history,bars.slice(1).map(bar=>bar.time));
  assert.equal(regions[0][0].xAxis,bars[1].time);
  assert.equal(regions[0][0].itemStyle.color,CONTEXT_AREA_COLORS.up);
  assert.equal(regions[0][1].xAxis,bars[4].time);
  assert.equal(regions[1][0].itemStyle.color,CONTEXT_AREA_COLORS.down);
  assert.deepEqual(buildContextChartAreas(history,["2026-10-01"]),[]);
  assert.throws(()=>buildContextChartAreas(history,[bars[2].time,bars[1].time]),/Unordered/);
});

test("full weekly history supplies ready regions at an evaluation start and remains prefix causal", () => {
  const history: MarketBar[]=Array.from({length:500},(_,index)=>{const timestamp=Date.UTC(2020,0,6+index+Math.floor(index/5)*2),close=10000+10*index+80*Math.sin(index/9);return {...bars[0],timestamp,time:new Date(timestamp).toISOString().slice(0,10),open:close-1,high:close+2,low:close-2,close};});
  const context=buildWeeklyMarketContext(history).observations;
  const dates=history.slice(350,450).map(bar=>bar.time),regions=buildContextChartAreas(context,dates);
  assert.ok(context[350].confirmed);assert.equal(regions[0][0].itemStyle.color,CONTEXT_AREA_COLORS[context[350].confirmed!]);
  assert.equal(buildWeeklyMarketContext(history.slice(350,450)).observations[0].confirmed,null);
  const prefix=buildWeeklyMarketContext(history.slice(0,450)).observations;
  assert.deepEqual(buildContextChartAreas(prefix,dates),regions);
});

test("adding background regions leaves candles, fills, tooltips and marker positions unchanged", () => {
  const fills=[trade(bars[1].time,0,1),trade(bars[3].time,1,0)],original=JSON.stringify(fills);
  const labels={price:"Price",establish:"Establish",increase:"Increase",reduce:"Reduce",clear:"Clear",targetAllocation:"Target",fillPrice:"Fill"};
  const plain=buildStrategyCycleRollingChartOption(bars,fills,labels);
  const regions=buildContextChartAreas(bars.map(bar=>({time:bar.time,direction:"up",consecutive:3,confirmed:"up",confirmedTime:bars[0].time})),bars.map(bar=>bar.time));
  const withRegions=buildStrategyCycleRollingChartOption(bars,fills,labels,regions);
  const a=plain.series as Array<{data:unknown;markArea?:{data:unknown};tooltip?:{formatter:(value:unknown)=>string}}>,b=withRegions.series as typeof a;
  assert.deepEqual(a[0].data,b[0].data);assert.deepEqual(JSON.parse(JSON.stringify(a.slice(1))),JSON.parse(JSON.stringify(b.slice(1))));for(let i=1;i<a.length;i++)assert.equal(a[i].tooltip?.formatter({dataIndex:0}),b[i].tooltip?.formatter({dataIndex:0}));assert.deepEqual(plain.dataZoom,withRegions.dataZoom);assert.deepEqual(b[0].markArea?.data,regions);assert.equal(JSON.stringify(fills),original);
});

test("the requested single trend tab row contains only the retained eleven options", () => {
  assert.deepEqual([...VISIBLE_TREND_TABS],["six","bias4","bias12","bias40","slope4","slope12","slope40","atr","breadth","vix","spread"]);
});

const bars: MarketBar[] = Array.from({ length: 5 }, (_, index) => ({
  time: `2026-09-0${index + 1}`,
  timestamp: Date.UTC(2026, 8, index + 1),
  open: 100 + index,
  high: 103 + index,
  low: 99 + index,
  close: 102 + index,
  volume: 1_000,
  amount: 100_000,
  amplitude: 1,
  changePercent: 1,
  change: 1,
  turnoverRate: 1,
}));

const trade = (
  time: string,
  fromAllocation: number,
  targetAllocation: number,
): AllocationRebalance => ({
  time,
  fromAllocation,
  targetAllocation,
  fillPrice: 101,
  reason: "strategy",
});

test("full-cycle chart shows every candle and classifies all four rebalance actions", () => {
  const option = buildStrategyCycleRollingChartOption(bars, [
    trade(bars[0]!.time, 0, 0.6),
    trade(bars[1]!.time, 0.6, 1),
    trade(bars[2]!.time, 1, 0.5),
    trade(bars[3]!.time, 0.5, 0),
    trade("2026-09-06", 0, 1),
  ], {
    price: "Price",
    establish: "Establish",
    increase: "Increase",
    reduce: "Reduce",
    clear: "Clear",
    targetAllocation: "Target",
    fillPrice: "Fill",
  });
  const zoom = option.dataZoom as Array<{ id: string; moveOnMouseMove?: boolean; moveOnMouseWheel?: boolean }>;
  assert.equal(zoom.find((row) => row.id === "cycle-rolling-zoom-inside")?.moveOnMouseMove, false);
  assert.equal(zoom.find((row) => row.id === "cycle-rolling-zoom-inside")?.moveOnMouseWheel, false);
  const series = option.series as Array<{
    name?: string;
    data?: Array<number | { value?: [string, number]; symbolRotate?: number }>;
  }>;
  assert.equal(series.find((entry) => entry.name === "Price")?.data?.length, 5);
  const establish = series.find((entry) => entry.name === "Establish")?.data?.[0];
  const increase = series.find((entry) => entry.name === "Increase")?.data?.[0];
  const reduce = series.find((entry) => entry.name === "Reduce")?.data?.[0];
  const clear = series.find((entry) => entry.name === "Clear")?.data?.[0];
  assert.equal(typeof establish === "object" ? establish.value?.[0] : null, bars[0]!.time);
  assert.equal(typeof establish === "object" ? establish.value?.[1] : null, bars[0]!.low);
  assert.equal(typeof establish === "object" ? establish.symbolRotate : null, 0);
  assert.equal(typeof increase === "object" ? increase.value?.[0] : null, bars[1]!.time);
  assert.equal(typeof increase === "object" ? increase.symbolRotate : null, 0);
  assert.equal(typeof reduce === "object" ? reduce.value?.[0] : null, bars[2]!.time);
  assert.equal(typeof reduce === "object" ? reduce.value?.[1] : null, bars[2]!.high);
  assert.equal(typeof reduce === "object" ? reduce.symbolRotate : null, 180);
  assert.equal(typeof clear === "object" ? clear.value?.[0] : null, bars[3]!.time);
  assert.equal(typeof clear === "object" ? clear.symbolRotate : null, 180);
  assert.equal(series.find((entry) => entry.name === "Establish")?.data?.length, 1);
  assert.equal(series.find((entry) => entry.name === "Increase")?.data?.length, 1);
  assert.equal(series.find((entry) => entry.name === "Reduce")?.data?.length, 1);
  assert.equal(series.find((entry) => entry.name === "Clear")?.data?.length, 1);
});
