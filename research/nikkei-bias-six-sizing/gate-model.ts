import { SmaPositionOverlay, RANGE_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS } from "../../lib/analysis/sma-position-overlay";
import { rebalanceAllocationAccount, type BacktestSettings } from "../../lib/analysis/backtest";
import { strategyCycleSignalDirection, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import { Features, falling, type NativePath } from "./model";
import type { MarketBar } from "../../lib/market/types";

export const GATES = ["current", "off", "bias", "slope", "and", "or", "current-plus-slope", "current-plus-and"] as const;
export type Gate = typeof GATES[number];
export function gateMask(features: Features, gate: Gate): boolean[] {
  const bias = features.bars.map((_, i) => i >= 3 && [i,i-1,i-2].every(j => falling(features.curves.bias[0],j)));
  const slope = features.bars.map((_, i) => falling(features.curves.slope[0],i) && features.curves.slope[0][i-2] != null &&
    features.curves.slope[0][i-1]! >= features.curves.slope[0][i-2]!);
  return bias.map((value,i) => gate === "off" ? false : gate === "current" ? (bias[i-1] ?? false) : gate === "bias" ? value :
    gate === "slope" ? slope[i] : gate === "and" ? value && slope[i] : gate === "or" ? value || slope[i] :
      gate === "current-plus-slope" ? (bias[i-1] ?? false) || slope[i] : (bias[i-1] ?? false) || (value && slope[i]));
}

/** Research-only seam: detach cached features before replacing the derived gate.
 * Production has no configurable gate. Keep actual v10 range/risk/entry logic,
 * assert its internal shape, and never mutate shared WeakMap feature objects.
 */
export function researchController(bars: MarketBar[], mask: readonly boolean[]): SmaPositionOverlay {
  if(mask.length !== bars.length || mask.some(v=>typeof v!=="boolean"))throw new Error("Invalid research gate mask");
  const controller = new SmaPositionOverlay(bars,DEFAULT_POSITION_OVERLAY_OPTIONS,0,0);
  const seam=controller as unknown as {features: {policy?: {holdingAddBlocked: boolean[]}; [key:string]:unknown}};
  if(!seam.features.policy || !Array.isArray(seam.features.policy.holdingAddBlocked) || seam.features.policy.holdingAddBlocked.length!==bars.length)
    throw new Error("Production derived-feature seam changed; stop research rather than approximate v10");
  seam.features={...seam.features,policy:{...seam.features.policy,holdingAddBlocked:[...mask]}};
  return controller;
}

export function gateReplay(features: Features, decisions: ReadonlyMap<number, StrategyCycleRecentSignal[]>, start: number,
  settings: BacktestSettings, gate: Gate, end=features.bars.length, resume?: NativePath): NativePath {
  const bars=features.bars,mask=gateMask(features,gate);
  if(bars.length>10000 || decisions.size>2048 || start<0 || end<start || end>bars.length)throw new Error("Invalid gate replay bounds");
  const controller=researchController(bars,mask);
  if(resume)controller.restore(resume.cursor.overlay);
  const targets=resume?[...resume.targets]:bars.map(()=>0),vetoes=resume?[...resume.vetoes]:[];
  const account=resume?{...resume.cursor.account}:{cash:settings.initialCash,units:0};
  let planned=resume?.cursor.planned??0,previous=resume?.cursor.previous??0;
  for(let i=resume?resume.cursor.index+1:start;i<end;i++) {
    const before=controller.checkpoint(),signals=decisions.get(i)??[],direction=strategyCycleSignalDirection(signals);
    if(mask[i] && before.allocation>1e-10 && direction==="increase" && signals.at(-1)!.targetAllocation>before.allocation+1e-10)vetoes.push(i);
    if(direction)controller.request(direction,signals.at(-1)!.targetAllocation,i);
    const target=controller.close(i,signals.length>0);
    const execute=(price:number,allocation:number,atOpen:boolean)=>{
      const old=account.units,fill=rebalanceAllocationAccount(account,bars[i],price,allocation,settings.commissionRate,settings.slippageRate,[]);
      if(fill)controller.recordExecution(i,old,account.units,price*(account.units>old?1+settings.slippageRate:1-settings.slippageRate),settings.commissionRate,atOpen);
    };
    if(Math.abs(previous-planned)>1e-10){execute(bars[i].open,previous,true);planned=previous;}
    if(Math.abs(target-previous)>1e-10 && Math.abs(target-planned)>1e-10){execute(bars[i].close,target,false);planned=target;}
    targets[i]=target;previous=target;
  }
  return {targets,vetoes,cursor:{index:end-1,overlay:controller.checkpoint(),account,planned,previous}};
}
