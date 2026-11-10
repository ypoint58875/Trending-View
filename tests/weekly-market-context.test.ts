import assert from "node:assert/strict";
import test from "node:test";
import { buildWeeklyMarketContext, buildRawWeeklyContext, smoothWeeklyContext } from "../lib/analysis/weekly-market-context";
import { buildTrendPanels, alignPriorTrendSeries, weeklyTrendCandles, SIX_TREND_TABS, OTHER_TREND_TABS } from "../lib/analysis/trend-panels";
import { preferWorkspaceSeries, WORKSPACE_DEFAULT_INSTRUMENT } from "../lib/market/workspace-series";
import type { MarketBar, MarketSeries } from "../lib/market/types";

function bars(count=400):MarketBar[]{return Array.from({length:count},(_,i)=>{const timestamp=Date.UTC(2020,0,6+i+Math.floor(i/5)*2),close=20000+10*i+150*Math.sin(i/8);return {time:new Date(timestamp).toISOString().slice(0,10),timestamp,open:close-1,high:close+10,low:close-10,close,volume:100,amount:0,amplitude:0,change:0,changePercent:0,turnoverRate:0};});}
test("weekly periods use prior completed weeks and today's close, with daily smoothing",()=>{
 const input=bars(),raw=buildRawWeeklyContext(input);
 for(const index of [205,206,239,399])for(const [slot,p]of [4,12,40].entries()){
  const current=Math.floor(index/5),previousCloses=Array.from({length:current},(_,i)=>input[i*5+4].close);
  const mean=(previousCloses.slice(-(p-1)).reduce((a,b)=>a+b,0)+input[index].close)/p;
  const previous=previousCloses.slice(-p).reduce((a,b)=>a+b,0)/p;
  assert.equal(raw.means[index][slot],mean);assert.equal(raw.bias[slot][index],100*(input[index].close/mean-1));assert.equal(raw.slope[slot][index],mean-previous);
 }
 assert.deepEqual(smoothWeeklyContext([null,1,2,3,4]),[null,null,null,2,3]);
 assert.deepEqual(buildWeeklyMarketContext(input).curves.bias,raw.bias.map(smoothWeeklyContext));
});
test("holiday weeks and incomplete leading week do not invent a weekly close",()=>{
 const input=bars().slice(1).filter((_,i)=>i!==13&&i!==14),raw=buildRawWeeklyContext(input);
 assert.equal(raw.means[0][0],null);
 const prefix=buildRawWeeklyContext(input.slice(0,220));assert.deepEqual(prefix.means,raw.means.slice(0,220));
 assert.throws(()=>buildRawWeeklyContext([{...input[0],time:"2020-01-11"}]),/weekday/);
});
test("prefix restart and future perturbation preserve every existing weekly signal",()=>{
 const input=bars(600),full=buildWeeklyMarketContext(input);
 for(const cut of [202,219,333,599]){
  const prefix=buildWeeklyMarketContext(JSON.parse(JSON.stringify(input.slice(0,cut))));
  assert.deepEqual(prefix.observations,full.observations.slice(0,cut));assert.deepEqual(prefix.curves.bias,full.curves.bias.map(c=>c.slice(0,cut)));
 }
 const changed=input.map((b,i)=>i<300?b:{...b,close:b.close*2});assert.deepEqual(buildWeeklyMarketContext(changed).observations.slice(0,300),full.observations.slice(0,300));
});
test("auxiliary joins exclude same date, expire, and retain signed yields",()=>{
 const rows=[{date:"2020-01-06",value:-.1},{date:"2020-01-07",value:0}];
 assert.deepEqual(alignPriorTrendSeries(["2020-01-06","2020-01-07","2020-01-08","2020-01-16"],rows),[null,-.1,0,null]);
 assert.throws(()=>alignPriorTrendSeries(["2020-01-08"],[rows[1],rows[0]]),/Invalid/);
});
test("all18 tabs align; absent auxiliary data never changes original state",()=>{
 const input=bars(),result=buildTrendPanels(input);
 assert.equal(SIX_TREND_TABS.length+OTHER_TREND_TABS.length,18);
 for(const lines of Object.values(result.panels))for(const line of lines)assert.equal(line.values.length,input.length);
 assert.ok(result.panels.breadth.every(line=>line.values.every(v=>v===null)));
 assert.deepEqual(result.context.observations,buildWeeklyMarketContext(input).observations);
 assert.equal(result.panels.roc[0].values[30],100*(input[30].close-input[20].close)/input[20].close);
});
test("weekly candle OHLC uses observed sessions and preserves completed weeks",()=>{
 const input=bars(12),candles=weeklyTrendCandles(input);
 assert.deepEqual(candles[0],["-","-","-","-"]);
 assert.deepEqual(candles[4],[input[0].open,input[4].close,Math.min(...input.slice(0,5).map(b=>b.low)),Math.max(...input.slice(0,5).map(b=>b.high))]);
 assert.deepEqual(weeklyTrendCandles(input.slice(0,8)).slice(0,5),candles.slice(0,5));
});
test("shared feed refuses shortened or older snapshots and bounds memory",()=>{
 const current:MarketSeries={instrument:WORKSPACE_DEFAULT_INSTRUMENT,interval:"1d",priceAdjustment:"raw",previousClose:1,bars:bars(),source:"yahoo",latestBarStatus:"complete",fetchedAt:"2026-11-10T08:00:00Z"};
 assert.equal(preferWorkspaceSeries(current,{...current,bars:current.bars.slice(0,300)}),current);
 assert.equal(preferWorkspaceSeries(current,{...current,fetchedAt:"2026-11-09T08:00:00Z"}),current);
 assert.throws(()=>preferWorkspaceSeries(current,{...current,bars:bars(10001)}),/Invalid/);
 const input=bars(10000),before=process.memoryUsage().heapUsed,result=buildWeeklyMarketContext(input);assert.equal(result.observations.length,10000);assert.ok(process.memoryUsage().heapUsed-before<128*1024**2);
 assert.throws(()=>buildWeeklyMarketContext(bars(10001)),/limit/);
});
