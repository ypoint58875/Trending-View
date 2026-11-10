import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {Features,nativeReplay} from "./model";
import {gateMask,gateReplay,researchController} from "./gate-model";
import {SmaPositionOverlay,RANGE_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS} from "../../lib/analysis/sma-position-overlay";
import type {MarketBar} from "../../lib/market/types";
import type {BacktestSettings} from "../../lib/analysis/backtest";
import type {StrategyCycleRecentSignal} from "../../lib/analysis/strategy-cycle-validation";
const source=new URL("../nikkei-overlay-stability/data/full-screen-6-15/",import.meta.url);
const input=JSON.parse(readFileSync(new URL("input.json",source),"utf8")) as {bars:MarketBar[];settings:BacktestSettings};
const saved=JSON.parse(readFileSync(new URL("signals.json",source),"utf8")) as {rows:{index:number;signals:StrategyCycleRecentSignal[]}[]};
const features=new Features(input.bars),decisions=new Map(saved.rows.map(r=>[r.index,r.signals])),start=input.bars.length-2000;
test("replacement research current and same-close BIAS exactly reproduce native v10",()=>{
  for(const [gate,mode] of [["current","baseline"],["bias","same-close-bias"]] as const)
    assert.deepEqual(gateReplay(features,decisions,start,input.settings,gate).targets,nativeReplay(features,decisions,start,input.settings,mode).targets);
});
test("research mask injection never mutates cached features or other controller instances",()=>{
  const before=nativeReplay(features,decisions,start,input.settings);
  const a=researchController(input.bars,input.bars.map(()=>true)),b=researchController(input.bars,input.bars.map(()=>false));
  const native=new SmaPositionOverlay(input.bars,DEFAULT_POSITION_OVERLAY_OPTIONS);
  const internal=(value:unknown)=>(value as {features:{policy:{holdingAddBlocked:boolean[]}}}).features.policy.holdingAddBlocked;
  assert.ok(internal(a).every(Boolean));assert.ok(internal(b).every(v=>!v));
  assert.ok(internal(native).some(Boolean));assert.ok(internal(native).some(v=>!v));
  assert.deepEqual(nativeReplay(features,decisions,start,input.settings),before);
});
test("AND and OR use same-day conditions and current gate uses previous BIAS day",()=>{
  const bias=gateMask(features,"bias"),slope=gateMask(features,"slope"),both=gateMask(features,"and"),either=gateMask(features,"or"),current=gateMask(features,"current");
  bias.forEach((v,i)=>{assert.equal(both[i],v&&slope[i]);assert.equal(either[i],v||slope[i]);assert.equal(current[i],bias[i-1]??false);});
});
