import assert from "node:assert/strict";
import {existsSync,readFileSync} from "node:fs";
import test from "node:test";
import {SmaPositionOverlay,DEFAULT_POSITION_OVERLAY_OPTIONS,RANGE_POSITION_OVERLAY_OPTIONS,normalizeSmaPositionOverlay} from "../lib/analysis/sma-position-overlay";
import {buildContextCurves} from "../lib/analysis/market-context";
import {buildCheckpointIdentity} from "../lib/analysis/screening-worker-client";
import {parseStrategyAllocationPlan} from "../lib/analysis/saved-backtests";
import {runAllocationBacktest,type BacktestSettings} from "../lib/analysis/backtest";
import {buildStrategyCycleRollingReport,runStrategyCycleCloseBacktest,type StrategyCycleSelectionSnapshot,type StrategyCycleRecentSignal} from "../lib/analysis/strategy-cycle-validation";
import {Features,nativeReplay} from "../research/nikkei-bias-six-sizing/model";
import type {MarketBar} from "../lib/market/types";
const sample=Array.from({length:110},(_,i)=>{
  const close=i<40?100+i:i<65?140-(i-40)*1.2:110+(i-65)*3,timestamp=Date.UTC(2024,0,i+1);
  return {timestamp,time:new Date(timestamp).toISOString().slice(0,10),open:close,close,high:close+1,low:close-1,volume:1000,amount:close*1000,amplitude:0,change:0,changePercent:0,turnoverRate:0};
});
const curve=buildContextCurves(sample).bias[0],gate=curve.map((v,i)=>v!=null&&curve[i-3]!=null&&v<curve[i-1]!&&curve[i-1]!<curve[i-2]!&&curve[i-2]!<curve[i-3]!);
test("v11 has a distinct checkpoint identity and archived v10 saved plans keep their model",()=>{
  const signature=(positionOverlay:typeof DEFAULT_POSITION_OVERLAY_OPTIONS)=>buildCheckpointIdentity([],{initialCash:100000,commissionRate:0,slippageRate:0,interval:"1d",positionOverlay},{mode:"sample",periods:[{sessions:10,weight:100}]},{objective:"totalReturn"}).signature;
  assert.notEqual(signature(DEFAULT_POSITION_OVERLAY_OPTIONS),signature(RANGE_POSITION_OVERLAY_OPTIONS));
  for(const options of [DEFAULT_POSITION_OVERLAY_OPTIONS,RANGE_POSITION_OVERLAY_OPTIONS]){
    assert.deepEqual(normalizeSmaPositionOverlay(options),options);
    assert.equal(parseStrategyAllocationPlan({strategyA:{strategyId:"sma-cross",parameters:{fast:7,slow:20}},strategyB:null,strategyAAllocation:1,strategyBAllocation:0,positionOverlay:options})?.positionOverlay?.model,options.model);
  }
});
test("current completed-close A gate starts and releases on the same day even with cycle lag context",()=>{
  for(let i=0;i<sample.length;i++)for(const lag of [0,1] as const){
    assert.equal(new SmaPositionOverlay(sample,DEFAULT_POSITION_OVERLAY_OPTIONS,.3,lag).request("increase",1,i),gate[i]?.3:1);
    assert.equal(new SmaPositionOverlay(sample,RANGE_POSITION_OVERLAY_OPTIONS,.3,lag).request("increase",1,i),gate[i-lag]?.3:1);
  }
  const onset=gate.findIndex(Boolean),release=gate.findIndex((v,i)=>i>onset&&!v);
  assert.ok(onset>0&&release>onset);
  assert.equal(new SmaPositionOverlay(sample,DEFAULT_POSITION_OVERLAY_OPTIONS,.3,1).request("increase",1,onset),.3);
  assert.equal(new SmaPositionOverlay(sample,DEFAULT_POSITION_OVERLAY_OPTIONS,.3,1).request("increase",1,release),1);
});
test("only holding adds change; flat entries, pending cancellation, holding age and risk/exit behavior persist",()=>{
  for(let i=25;i<sample.length;i++){
    const current=new SmaPositionOverlay(sample,DEFAULT_POSITION_OVERLAY_OPTIONS,0,1),old=new SmaPositionOverlay(sample,RANGE_POSITION_OVERLAY_OPTIONS,0,1);
    assert.equal(current.request("increase",1,i),old.request("increase",1,i));
  }
  const i=gate.findIndex(Boolean),current=new SmaPositionOverlay(sample,DEFAULT_POSITION_OVERLAY_OPTIONS,.3,1);
  current.restore({...current.checkpoint(),entryIndex:i-10,entryClose:sample[i-10].close,pending:.1});
  current.request("increase",1,i);assert.equal(current.allocation,.3);assert.equal(current.checkpoint().pending,null);assert.equal(current.checkpoint().entryIndex,i-10);
  const restored=new SmaPositionOverlay(sample,DEFAULT_POSITION_OVERLAY_OPTIONS,0,1);restored.restore(JSON.parse(JSON.stringify(current.checkpoint())));assert.deepEqual(restored.checkpoint(),current.checkpoint());
  const old=new SmaPositionOverlay(sample,RANGE_POSITION_OVERLAY_OPTIONS,0,1);old.restore(restored.checkpoint());
  assert.equal(restored.request("reduce",0,i+1),old.request("reduce",0,i+1));assert.equal(restored.close(i+1,true),old.close(i+1,true));
});
test("ordinary next-open fills remain causal and match v10 without a second gate lag",()=>{
  const i=gate.findIndex(Boolean),targets=sample.map((_,j)=>j<i-2?0:j<i?.3:1),settings:BacktestSettings={initialCash:100000,commissionRate:.0003,slippageRate:.0002,interval:"1d",startTime:sample[i-2].time,endTime:sample[i+2].time,executionPolicy:"next-open"};
  const current=runAllocationBacktest(sample,targets,{...settings,positionOverlay:DEFAULT_POSITION_OVERLAY_OPTIONS});
  const old=runAllocationBacktest(sample,targets,{...settings,positionOverlay:RANGE_POSITION_OVERLAY_OPTIONS});
  assert.deepEqual(current.rebalances,old.rebalances);assert.deepEqual(current.equity,old.equity);
  assert.ok(!current.rebalances.some(f=>f.time===sample[i+1].time&&f.targetAllocation>.3));
});
const source=new URL("../research/nikkei-overlay-stability/data/full-screen-6-15/",import.meta.url),available=["input.json","signals.json"].every(n=>existsSync(new URL(n,source)));
test("real v11 cycle report reproduces same-close research and resumes without changing saved winners",{skip:available?false:"Local research fixtures unavailable"},()=>{
  const input=JSON.parse(readFileSync(new URL("input.json",source),"utf8")) as {bars:MarketBar[];settings:BacktestSettings;snapshots:StrategyCycleSelectionSnapshot[]};
  const saved=JSON.parse(readFileSync(new URL("signals.json",source),"utf8")) as {rows:{index:number;signals:StrategyCycleRecentSignal[]}[]};
  const {bars}=input,start=bars.length-2000,decisions=new Map(saved.rows.map(r=>[r.index,r.signals]));
  const expected=nativeReplay(new Features(bars),decisions,start,input.settings,"same-close-bias"),settings={...input.settings,positionOverlay:DEFAULT_POSITION_OVERLAY_OPTIONS};
  const report=buildStrategyCycleRollingReport(bars,input.snapshots,2000,10,settings),backtest=runStrategyCycleCloseBacktest(bars,expected.targets,input.settings);
  assert.equal(report.updateReturn,463.0922799282711);assert.equal(report.rebalances.length,128);
  const economic=(fills:typeof report.rebalances)=>fills.map(({time,fromAllocation,targetAllocation,fillPrice,reason})=>({time,fromAllocation,targetAllocation,fillPrice,reason}));
  assert.deepEqual(economic(report.rebalances),economic(backtest.rebalances));assert.equal(report.updateReturn,backtest.totalReturn);
  const cut=start+1500,prefix=buildStrategyCycleRollingReport(bars.slice(0,cut),input.snapshots.filter(s=>s.decisionIndex<cut),1500,10,settings);
  const resumed=buildStrategyCycleRollingReport(bars,input.snapshots,2000,10,settings,undefined,JSON.parse(JSON.stringify(prefix)));
  assert.deepEqual(resumed,report);assert.equal(buildStrategyCycleRollingReport(bars,input.snapshots,2000,10,settings,undefined,report),report);
});
