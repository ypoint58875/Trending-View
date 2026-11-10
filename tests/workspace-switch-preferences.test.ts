import assert from "node:assert/strict";
import test from "node:test";
import { parseWorkspaceSwitchPreferences, setContextRegionsPreference, setEntrySwitchPreference, workspaceSwitchSnapshot, subscribeWorkspaceSwitchPreferences, WORKSPACE_SWITCH_STORAGE_KEY } from "../lib/analysis/workspace-switch-preferences";

test("switch parsing preserves false, validates associated filters and ignores tab selections", () => {
  const value=parseWorkspaceSwitchPreferences(JSON.stringify({version:1,contextRegions:false,tab:"macd",entryFilters:{A:{enabled:true,movingAverageType:"wma",period:11,minimumSlopePercent:.4},B:{enabled:false,movingAverageType:"ema",period:7,minimumSlopePercent:0},C:{enabled:true,movingAverageType:"bad",period:0,minimumSlopePercent:0}}}));
  assert.equal(value.contextRegions,false);assert.deepEqual(value.entryFilters.A,{enabled:true,movingAverageType:"wma",period:11,minimumSlopePercent:.4});assert.equal(value.entryFilters.B?.enabled,false);assert.equal(value.entryFilters.C,undefined);assert.equal("tab" in value,false);
});
test("malformed, oversized or incompatible switch state recovers to bounded defaults",()=>{
  for(const text of [null,"{",JSON.stringify({version:2,contextRegions:false}),"x".repeat(4097)])assert.deepEqual(parseWorkspaceSwitchPreferences(text),{version:1,contextRegions:true,entryFilters:{}});
});
test("switch writes survive reconstruction, merge independent keys and unsubscribe cleanly",()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,"window"),data=new Map<string,string>(),events=new EventTarget();
  Object.defineProperty(globalThis,"window",{configurable:true,value:{localStorage:{getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>data.set(key,value)},addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events)}});
  try{
    let updates=0;const unsubscribe=subscribeWorkspaceSwitchPreferences(()=>updates++);
    setContextRegionsPreference(false);setEntrySwitchPreference("A",{enabled:true,movingAverageType:"sma",period:20,minimumSlopePercent:.2});
    const restored=parseWorkspaceSwitchPreferences(data.get(WORKSPACE_SWITCH_STORAGE_KEY)!);
    assert.equal(restored.contextRegions,false);assert.equal(restored.entryFilters.A?.enabled,true);assert.equal(workspaceSwitchSnapshot(),data.get(WORKSPACE_SWITCH_STORAGE_KEY));assert.equal(updates,2);
    unsubscribe();setContextRegionsPreference(true);assert.equal(updates,2);
  }finally{if(previous)Object.defineProperty(globalThis,"window",previous);else Reflect.deleteProperty(globalThis,"window");}
});
