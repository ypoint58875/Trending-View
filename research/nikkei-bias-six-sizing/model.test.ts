import assert from "node:assert/strict";
import test from "node:test";
import { combined, Features, sleeveTargets, regimeSummary } from "./model";
import type { MarketBar } from "../../lib/market/types";
test("strict slope turn differs from falling and negative slope",()=>{
  const bias=[5,4,3,2,1];
  assert.equal(combined(bias,[2,3,4,3,2],3),true);
  assert.equal(combined(bias,[2,3,4,3,2],4),false);
  assert.equal(combined(bias,[2,3,4,3,2],4,false),true);
  assert.equal(combined([null,4,3,2],[2,3,4,3],3),false);
});
const bars=Array.from({length:400},(_,i)=>({time:new Date(Date.UTC(2000,0,i+1)).toISOString().slice(0,10),open:100+i,high:102+i,low:99+i,close:101+i,volume:0} as MarketBar));
test("event sleeve stays reduced until native increase and never compounds repeated halving",()=>{
  const features=new Features(bars); features.event.fill(false); features.event[220]=true;features.event[221]=true;
  const targets=bars.map((_,i)=>i<210?0:i<230?.5:1);
  const scaled=sleeveTargets(features,targets,{id:"test",kind:"event",multiplier:.5},205);
  assert.equal(scaled[220],.25);assert.equal(scaled[221],.25);assert.equal(scaled[229],.25);assert.equal(scaled[230],1);
});
test("weak sleeve uses retained state and does not apply new state to past returns",()=>{
  const features=new Features(bars); features.states.forEach((s,i)=>s.confirmed=i<220?"up":"down");
  const targets=sleeveTargets(features,bars.map(()=>1),{id:"weak",kind:"weak",multiplier:.5},210);
  assert.equal(targets[219],1);assert.equal(targets[220],.5);
  const summary=regimeSummary(bars,features,210);
  assert.equal(summary.find(s=>s.state==="up")!.days,10);
  assert.equal(summary.find(s=>s.state==="down")!.days,179);
});
test("context features are causal on a truncated input",()=>{
  const full=new Features(bars),prefix=new Features(bars.slice(0,300));
  assert.deepEqual(prefix.event,full.event.slice(0,300));assert.deepEqual(prefix.states,full.states.slice(0,300));
});
test("transient sleeve restores native target when the condition clears",()=>{
  const features=new Features(bars);features.event.fill(false);features.event[220]=true;
  const scaled=sleeveTargets(features,bars.map(()=>1),{id:"temporary",kind:"event",multiplier:.5,transient:true},210);
  assert.equal(scaled[219],1);assert.equal(scaled[220],.5);assert.equal(scaled[221],1);
});
