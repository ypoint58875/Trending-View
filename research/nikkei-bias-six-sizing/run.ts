import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { replaceFileAtomically } from "../../scripts/atomic-file";
import { runStrategyCycleCloseBacktest, buildStrategyCycleRollingReport, type StrategyCycleRecentSignal, type StrategyCycleSelectionSnapshot } from "../../lib/analysis/strategy-cycle-validation";
import { runAllocationBacktest, type BacktestSettings } from "../../lib/analysis/backtest";
import { RANGE_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS } from "../../lib/analysis/sma-position-overlay";
import type { MarketBar } from "../../lib/market/types";
import { Features, nativeReplay, sleeveTargets, regimeSummary, SLEEVES } from "./model";

const root = dirname(fileURLToPath(import.meta.url));
const sha = (v: string) => createHash("sha256").update(v).digest("hex");
async function load(path: string) { assert.ok((await stat(path)).size <= 16*1024**2); return readFile(path,"utf8"); }
async function atomic(path: string, value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  assert.ok(Buffer.byteLength(text) <= 16*1024**2);
  await mkdir(dirname(path),{recursive:true}); await writeFile(`${path}.tmp`,text); await replaceFileAtomically(`${path}.tmp`,path);
}
const source = join(root,"../nikkei-overlay-stability/data/full-screen-6-15");
const inputText = await load(join(source,"input.json")), signalText = await load(join(source,"signals.json"));
const input = JSON.parse(inputText) as {bars: MarketBar[]; barsHash: string; settings: BacktestSettings; snapshots: StrategyCycleSelectionSnapshot[]};
const saved = JSON.parse(signalText) as {sourceHash: string; rows:{index:number; signals:StrategyCycleRecentSignal[]}[]};
assert.equal(sha(JSON.stringify(input)),saved.sourceHash); assert.equal(sha(JSON.stringify(input.bars)),input.barsHash);
const identity = sha([inputText,signalText,...await Promise.all(["model.ts","run.ts","../../lib/analysis/sma-position-overlay.ts","../../lib/analysis/market-context.ts","../../lib/analysis/indicators.ts","../../lib/analysis/backtest.ts","../../lib/analysis/strategy-cycle-validation.ts"].map(p=>load(join(root,p))))].join("\n"));
const data = join(root,"data",identity), output = join(root,"output",identity), checkpoint = join(data,"progress.json");
await atomic(join(data,"input.json"),inputText); await atomic(join(data,"signals.json"),signalText);
await atomic(join(data,"source_registry.jsonl"),JSON.stringify({source,sourceHash:saved.sourceHash,inputHash:sha(inputText),signalsHash:sha(signalText),accessedAt:new Date().toISOString(),identity})+"\n");
const {bars,settings} = input, start = bars.length-2000, features = new Features(bars), decisions = new Map(saved.rows.map(r=>[r.index,r.signals]));
assert.ok(start>=0 && bars.length<=10000 && saved.rows.length<=2048);
const native = nativeReplay(features,decisions,start,settings);
const report = buildStrategyCycleRollingReport(bars,input.snapshots,2000,10,{...settings,positionOverlay:DEFAULT_POSITION_OVERLAY_OPTIONS});
const base = runStrategyCycleCloseBacktest(bars,native.targets,settings);
assert.equal(base.totalReturn,458.4631387547417); assert.equal(report.updateReturn,base.totalReturn);
assert.equal(report.rebalances.length,base.rebalances.length);
const cut = start+1500, partial = nativeReplay(features,decisions,start,settings,"baseline",cut);
assert.deepEqual(nativeReplay(features,decisions,start,settings,"baseline",bars.length,JSON.parse(JSON.stringify(partial))),native);
assert.deepEqual(nativeReplay(new Features(bars.slice(0,cut)),decisions,start,settings).targets,native.targets.slice(0,cut));
for(const mode of ["same-close-bias","combined-add"] as const) {
  const full=nativeReplay(features,decisions,start,settings,mode), part=nativeReplay(features,decisions,start,settings,mode,cut);
  assert.deepEqual(nativeReplay(features,decisions,start,settings,mode,bars.length,JSON.parse(JSON.stringify(part))),full);
  assert.deepEqual(nativeReplay(new Features(bars.slice(0,cut)),decisions,start,settings,mode).targets,full.targets.slice(0,cut));
}
for(const policy of SLEEVES) {
  const prefixFeatures=new Features(bars.slice(0,cut));
  assert.deepEqual(sleeveTargets(prefixFeatures,native.targets.slice(0,cut),policy,start),sleeveTargets(features,native.targets,policy,start).slice(0,cut));
}
const cases = [...SLEEVES.map(policy=>({id:policy.id,targets:sleeveTargets(features,native.targets,policy,start),vetoes:0})),
  ...(["same-close-bias","combined-add"] as const).map(mode=>{const path=nativeReplay(features,decisions,start,settings,mode); return {id:mode,targets:path.targets,vetoes:path.vetoes.length};})];
type Row = {id:string; full:number; dd:number; fills:number; train:number; validation:number; final500:number; nextOpen:number; nextDD:number; stress:number; vetoes:number; blocks:number[]};
let rows:Row[] = [], attempts=0;
try { const state=JSON.parse(await load(checkpoint)); assert.equal(state.identity,identity); rows=state.rows; attempts=state.attempts;
  assert.ok(rows.length<=cases.length && rows.every((r,i)=>r.id===cases[i].id));
  for(const row of rows) { const result=JSON.parse(await load(join(output,`${row.id}.json`))); assert.deepEqual(result.row,row); assert.equal(result.identity,identity); }
} catch(error) {if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
const resumed=rows.length; attempts++;
let interrupted=false; process.on("SIGINT",()=>{interrupted=true;}); process.on("SIGTERM",()=>{interrupted=true;});
const limitAt=process.argv.indexOf("--limit"),limit=limitAt<0?cases.length:Number(process.argv[limitAt+1]); assert.ok(Number.isInteger(limit)&&limit>0);
let peakMiB=process.memoryUsage().rss/1024**2;
const progress = (status:string,lastError:string|null=null)=>atomic(checkpoint,{identity,status,attempts,completed:rows.length,pending:cases.length-rows.length,updatedAt:new Date().toISOString(),lastError,peakMiB,rows});
await progress("running");
try {
for(const item of cases.slice(rows.length)) {
  const actual=runStrategyCycleCloseBacktest(bars,item.targets,settings);
  const next=runAllocationBacktest(bars,item.targets,{...settings,positionOverlay:undefined,executionPolicy:"next-open"});
  const stress=runStrategyCycleCloseBacktest(bars,item.targets,{...settings,commissionRate:.0018,slippageRate:.0002});
  const period=(a:number,b:number)=>(actual.equity[b-1].equity/(a?actual.equity[a-1].equity:settings.initialCash)-1)*100;
  assert.equal(actual.equity.length,2000);
  const row:Row={id:item.id,full:actual.totalReturn,dd:actual.maxDrawdown,fills:actual.rebalances.length,train:period(0,1000),validation:period(1000,1500),final500:period(1500,2000),nextOpen:next.totalReturn,nextDD:next.maxDrawdown,stress:stress.totalReturn,vetoes:item.vetoes,blocks:Array.from({length:8},(_,i)=>period(i*250,(i+1)*250))};
  await atomic(join(output,`${item.id}.json`),{identity,row,targets:item.targets,fills:actual.rebalances,equity:actual.equity});
  rows.push(row); peakMiB=Math.max(peakMiB,process.memoryUsage().rss/1024**2); assert.ok(peakMiB<1536); await progress("running");
  console.log(JSON.stringify(row)); if(interrupted||rows.length-resumed>=limit)break;
}
await progress(rows.length===cases.length?"complete":"interrupted");
}catch(error){await progress("failed",error instanceof Error?error.message:String(error));throw error;}
if(rows.length!==cases.length)process.exit(0);
const longText = await load(join(root,"../nikkei-context-disagreement/data/bars.json"));
const longBars = JSON.parse(longText) as MarketBar[], longFeatures=new Features(longBars);
await atomic(join(data,"long-bars.json"),longText);
await atomic(join(data,"long-source.json"),{source:join(root,"../nikkei-context-disagreement/data/bars.json"),hash:sha(longText),accessedAt:new Date().toISOString()});
await atomic(join(output,"context.json"),{cycle:{curves:features.curves,states:features.states,event:features.event},long:{curves:longFeatures.curves,states:longFeatures.states}});
const first2015=longBars.findIndex(b=>b.time>="2015"),first2021=longBars.findIndex(b=>b.time>="2021");
const regime={cycleMarket:regimeSummary(bars,features,start),cycleStrategy:regimeSummary(bars,features,start,base.equity),longMarket:regimeSummary(longBars,longFeatures,203),
  market2000to2014:regimeSummary(longBars,longFeatures,203,undefined,first2015),market2015to2020:regimeSummary(longBars,longFeatures,first2015-1,undefined,first2021),market2021onward:regimeSummary(longBars,longFeatures,first2021-1)};
const events = bars.flatMap((b,i)=>i>=start&&features.event[i]?[{time:b.time,held:native.targets[i]>0,allocation:native.targets[i],forward5:i+5<bars.length?(bars[i+5].close/b.close-1)*100:null,forward20:i+20<bars.length?(bars[i+20].close/b.close-1)*100:null}]:[]);
await atomic(join(output,"summary.json"),{identity,sourceHash:saved.sourceHash,rows,regime,events,peakMiB});
const f=(n:number|null)=>n===null?"n/a":n.toFixed(2);
const table=["| Policy | Net % | MaxDD % | Fills | First1000 % | Next500 % | Final500 % | Next-open % | Stress20bps % |","| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",...rows.map(r=>`| ${r.id} | ${f(r.full)} | ${f(r.dd)} | ${r.fills} | ${f(r.train)} | ${f(r.validation)} | ${f(r.final500)} | ${f(r.nextOpen)} | ${f(r.stress)} |`)].join("\n");
const regimes=Object.entries(regime).map(([name,entries])=>`## ${name}\n\n| State | Days | Runs | Positive runs | Mean daily % | Compound % | Mean run % | Median run % | Worst run % |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n${entries.map(r=>`| ${r.state} | ${r.days} | ${r.runs} | ${r.positiveRuns} | ${f(r.meanDaily)} | ${f(r.compound)} | ${f(r.meanRun)} | ${f(r.medianRun)} | ${f(r.worstRun)} |`).join("\n")}`).join("\n\n");
await atomic(join(root,"RESULTS.md"),`# BIAS and six-curve sizing results\n\n${bars[start].time}..${bars.at(-1)!.time};2000 sessions;current v10 native458.4631387547417% exactly reproduced against real cycle report. Commission3bps+slippage2bps per side. Frozen winners; no rescreen. Identity:${identity}.\n\n${table}\n\nPrimary strict-turn events:${events.length}; invested events:${events.filter(e=>e.held).length}. Combined-add is an ADDITIONAL veto on current next-session gate, not a replacement. Same-close-bias changes only that gate's lag. Event/broad sleeves reset on native target increase, event takes priority on the same day. Zero sleeve cannot reenter without a native increase. Weak sleeves restore native exposure on strong confirmation.\n\n${regimes}\n\nStates label subsequent returns only. First close-to-close observation before cycle start is excluded. Partial initial/final regime runs are included; tail censor flag is in JSON. Regime compound figures stitch disjoint state days and are not annualized or stand-alone executable strategies. Current-strategy regime attribution uses prior-close state; state-change-day costs consequently belong to prior state. Long price sample:${longBars[0].time}..${longBars.at(-1)!.time},${longBars.length} bars; strategy and long price samples are distinct.\n\nSleeves preserve a shadow native controller and its original risk/range history; they do not simulate state feedback of a production integration. Next-open is identical signals shifted to next open, not a redesigned next-open strategy; it omits last-close trades with no next bar. Causal prefix and serialized native replay agree. Fixed case atomic checkpoint supports stop/resume. Peak RSS:${f(peakMiB)}MiB. This reused historical sample and proxy fill do not establish future superiority. Production unchanged.\n`);
console.log(JSON.stringify({identity,regime,eventCount:events.length,heldEvents:events.filter(e=>e.held).length,peakMiB}));
