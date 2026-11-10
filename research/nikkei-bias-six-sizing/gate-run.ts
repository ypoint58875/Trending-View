import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile,stat,mkdir,writeFile} from "node:fs/promises";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
import {replaceFileAtomically} from "../../scripts/atomic-file";
import {runStrategyCycleCloseBacktest,type StrategyCycleRecentSignal} from "../../lib/analysis/strategy-cycle-validation";
import {runAllocationBacktest,type BacktestSettings} from "../../lib/analysis/backtest";
import type {MarketBar} from "../../lib/market/types";
import {Features,nativeReplay} from "./model";
import {GATES,gateMask,gateReplay} from "./gate-model";
const root=dirname(fileURLToPath(import.meta.url));
const hash=(s:string)=>createHash("sha256").update(s).digest("hex");
async function load(p:string){assert.ok((await stat(p)).size<=16*1024**2);return readFile(p,"utf8");}
async function atomic(p:string,v:unknown){const s=typeof v==="string"?v:JSON.stringify(v);assert.ok(Buffer.byteLength(s)<=16*1024**2);await mkdir(dirname(p),{recursive:true});await writeFile(`${p}.tmp`,s);await replaceFileAtomically(`${p}.tmp`,p);}
const source=join(root,"../nikkei-overlay-stability/data/full-screen-6-15"),inputText=await load(join(source,"input.json")),signalText=await load(join(source,"signals.json"));
const input=JSON.parse(inputText) as {bars:MarketBar[];settings:BacktestSettings;barsHash:string};
const saved=JSON.parse(signalText) as {sourceHash:string;rows:{index:number;signals:StrategyCycleRecentSignal[]}[]};
assert.equal(hash(JSON.stringify(input)),saved.sourceHash);assert.equal(hash(JSON.stringify(input.bars)),input.barsHash);
const identity=hash([inputText,signalText,...await Promise.all(["gate-model.ts","gate-run.ts","model.ts","../../lib/analysis/sma-position-overlay.ts","../../lib/analysis/market-context.ts","../../lib/analysis/indicators.ts","../../lib/analysis/backtest.ts","../../lib/analysis/strategy-cycle-validation.ts"].map(p=>load(join(root,p))))].join("\n"));
const data=join(root,"data","gates",identity),out=join(root,"output","gates",identity),checkpoint=join(data,"progress.json");
await atomic(join(data,"input.json"),inputText);await atomic(join(data,"signals.json"),signalText);
await atomic(join(data,"source_registry.jsonl"),JSON.stringify({source,accessedAt:new Date().toISOString(),sourceHash:saved.sourceHash,inputHash:hash(inputText),signalHash:hash(signalText),identity})+"\n");
const {bars,settings}=input,start=bars.length-2000,features=new Features(bars),decisions=new Map(saved.rows.map(r=>[r.index,r.signals]));
const baseline=nativeReplay(features,decisions,start,settings);
type Row={id:string;full:number;dd:number;fills:number;turnover:number;train:number;validation:number;final500:number;stress:number;nextOpen:number;nextDD:number;blockedRequests:number;activeDays:number;blocks:number[]};
let rows:Row[]=[],attempts=0,peakMiB=process.memoryUsage().rss/1024**2;
try{const s=JSON.parse(await load(checkpoint));assert.equal(s.identity,identity);rows=s.rows;attempts=s.attempts;assert.ok(rows.length<=8&&rows.every((r,i)=>r.id===GATES[i]));for(const r of rows){const c=JSON.parse(await load(join(out,`${r.id}.json`)));assert.equal(c.identity,identity);assert.deepEqual(c.row,r);}}catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;}
attempts++;const resumed=rows.length,limitAt=process.argv.indexOf("--limit"),limit=limitAt<0?8:Number(process.argv[limitAt+1]);assert.ok(Number.isInteger(limit)&&limit>0);
let interrupted=false;process.on("SIGINT",()=>interrupted=true);process.on("SIGTERM",()=>interrupted=true);
const progress=(status:string,error:string|null=null)=>atomic(checkpoint,{identity,status,attempts,completed:rows.length,pending:8-rows.length,updatedAt:new Date().toISOString(),lastError:error,peakMiB,rows});
await progress("running");
try{for(const gate of GATES.slice(rows.length)){
  const path=gateReplay(features,decisions,start,settings,gate),cut=start+1500,part=gateReplay(features,decisions,start,settings,gate,cut);
  assert.deepEqual(gateReplay(features,decisions,start,settings,gate,bars.length,JSON.parse(JSON.stringify(part))),path);
  assert.deepEqual(gateReplay(new Features(bars.slice(0,cut)),decisions,start,settings,gate).targets,path.targets.slice(0,cut));
  if(gate==="current")assert.deepEqual(path.targets,baseline.targets);
  if(gate==="bias")assert.deepEqual(path.targets,nativeReplay(features,decisions,start,settings,"same-close-bias").targets);
  const result=runStrategyCycleCloseBacktest(bars,path.targets,settings),stress=runStrategyCycleCloseBacktest(bars,path.targets,{...settings,commissionRate:.0018,slippageRate:.0002}),next=runAllocationBacktest(bars,path.targets,{...settings,positionOverlay:undefined,executionPolicy:"next-open"});
  const segment=(a:number,b:number)=>(result.equity[b-1].equity/(a?result.equity[a-1].equity:settings.initialCash)-1)*100;
  const row:Row={id:gate,full:result.totalReturn,dd:result.maxDrawdown,fills:result.rebalances.length,turnover:result.rebalances.reduce((s,f)=>s+Math.abs(f.targetAllocation-f.fromAllocation),0),train:segment(0,1000),validation:segment(1000,1500),final500:segment(1500,2000),stress:stress.totalReturn,nextOpen:next.totalReturn,nextDD:next.maxDrawdown,blockedRequests:path.vetoes.length,activeDays:gateMask(features,gate).slice(start).filter(Boolean).length,blocks:Array.from({length:8},(_,i)=>segment(i*250,(i+1)*250))};
  if(gate==="current")assert.equal(row.full,458.4631387547417);
  await atomic(join(out,`${gate}.json`),{identity,row,path,equity:result.equity,fills:result.rebalances,mask:gateMask(features,gate)});rows.push(row);
  peakMiB=Math.max(peakMiB,process.memoryUsage().rss/1024**2);assert.ok(peakMiB<1536);await progress("running");console.log(JSON.stringify(row));
  if(interrupted||rows.length-resumed>=limit)break;
}await progress(rows.length===8?"complete":"interrupted");}catch(e){await progress("failed",e instanceof Error?e.message:String(e));throw e;}
if(rows.length===8){
  assert.deepEqual(nativeReplay(features,decisions,start,settings),baseline);
  await atomic(join(out,"summary.json"),{identity,rows,sourceHash:saved.sourceHash,peakMiB,startTime:bars[start].time,endTime:bars.at(-1)!.time});
  const f=(v:number)=>v.toFixed(2),table=["| Gate | Net % | MaxDD % | Fills | First1000 % | Next500 % | Final500 % | Next-open % | Stress20bps % | Blocked requests | Active days |","| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",...rows.map(r=>`| ${r.id} | ${f(r.full)} | ${f(r.dd)} | ${r.fills} | ${f(r.train)} | ${f(r.validation)} | ${f(r.final500)} | ${f(r.nextOpen)} | ${f(r.stress)} | ${r.blockedRequests} | ${r.activeDays} |`)].join("\n");
  await atomic(join(root,"GATE_RESULTS.md"),`# Holding-add gate replacement comparison\n\n${bars[start].time}..${bars.at(-1)!.time};2000 daily sessions;current v10;frozen winners;3bps commission+2bps slippage. Identity:${identity}.\n\n${table}\n\nCurrent=previous-session BIAS down3. Bias/slope/AND/OR REPLACE the current gate and act on the current close. Slope means first downturn of SMA3 of SMA20 daily point differences, not negative slope. Off disables only this add gate. Current-plus variants retain the old gate and add same-day restrictions. All gate masks only affect existing invested holding-add requests. Native flat entries,reductions,risk exits and range3 protection remain. Blocked requests counts raw increase requests while invested, not necessarily fills that would otherwise execute.\n\nEight cases pass serialized controller/account recovery and causal prefixes. Current and same-close BIAS match original native paths. Feature injection is per-instance and clone-isolated; shared production cache remains unchanged. No production/account changes. Bounds:10000bars,2048decisions,16MiB/file,1.5GiB RSS;peak${f(peakMiB)}MiB. Atomic per-case state supports --limit2 then resume. Historical final500 is reused,not an untouched holdout. Next-open shifts the same close-generated targets and is only timing sensitivity. Close remains the Nikkei proxy,not actual domestic execution.\n`);
  console.log(JSON.stringify({identity,completed:8,peakMiB}));
}
