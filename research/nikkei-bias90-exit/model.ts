import { buildRawContextCurves, buildContextQuantiles, smoothContext } from "../../lib/analysis/market-context";
import { RSI_SHAPE_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS, SmaPositionOverlay, type SmaPositionOverlayState } from "../../lib/analysis/sma-position-overlay";
import { strategyCycleSignalDirection, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";
import type { NumericSeries } from "../../lib/analysis/indicators";
import { ema, sma, wma } from "../../lib/analysis/indicators";

export interface Policy { id: string; mode: "off" | "same-day" | "armed"; bias: "raw" | "smooth"; slope: "raw" | "smooth"; trigger: "decline" | "turn" | "negative";
  confirmation?: "two-day" | "ema7" | "sma20" | "slope60" | "four-down" | "two-day-ema7" | "wma7" | "native-guards"; cap?: number;
  score?: { threshold: number; contextWeight: 0 | 1; scope: "any" | "native-intent" | "executed-reduce" } }
export function policies(): Policy[] {
  const base: Policy = { id: "baseline", mode: "off", bias: "smooth", slope: "smooth", trigger: "decline" };
  const result = [base];
  for (const bias of ["raw", "smooth"] as const) for (const slope of ["raw", "smooth"] as const)
    for (const mode of ["same-day", "armed"] as const) result.push({ id: `${bias}-${slope}-${mode}`, bias, slope, mode, trigger: "decline" });
  for (const mode of ["same-day", "armed"] as const) result.push({ ...base, id: `smooth-smooth-${mode}-turn`, mode, trigger: "turn" });
  result.push({ ...base, id: "smooth-smooth-armed-negative", mode: "armed", trigger: "negative" });
  return result;
}
export function combinedPolicies(): Policy[] {
  const menu = policies(), result = menu.filter((policy) => ["baseline", "raw-raw-armed", "raw-smooth-armed"].includes(policy.id));
  for (const slope of ["raw", "smooth"] as const) {
    const base = menu.find((policy) => policy.id === `raw-${slope}-armed`)!;
    for (const confirmation of ["two-day", "ema7", "sma20", "slope60", "four-down", "two-day-ema7", "wma7", "native-guards"] as const)
      result.push({ ...base, id: `${base.id}-${confirmation}`, confirmation });
    for (const confirmation of ["ema7", "two-day-ema7"] as const)
      result.push({ ...base, id: `${base.id}-${confirmation}-half`, confirmation, cap: .5 });
  }
  return result;
}
export function weightedPolicies(): Policy[] {
  const menu = policies(), result = [menu[0]];
  for (const slope of ["raw", "smooth"] as const) for (const scope of ["any", "native-intent", "executed-reduce"] as const)
    for (const threshold of [3, 4, 5]) for (const contextWeight of [0, 1] as const) {
      const base = menu.find((policy) => policy.id === `raw-${slope}-armed`)!;
      result.push({ ...base, id: `weighted-${slope}-${scope}-T${threshold}-C${contextWeight}`, score: { threshold, contextWeight, scope } });
    }
  return result;
}
export function scoreDecision(context: boolean, nativeIntent: boolean, shortWeakness: boolean, breadth: boolean,
  executedReduce: boolean, originalIncrease: boolean, score: NonNullable<Policy["score"]>) {
  const total = (context ? score.contextWeight : 0) + (nativeIntent ? 2 : 0) + Number(shortWeakness) + Number(breadth);
  const scoped = score.scope === "any" || (score.scope === "native-intent" ? nativeIntent : executedReduce);
  return { total, exit: !originalIncrease && scoped && total >= score.threshold };
}
export class Features {
  readonly bias: Record<"raw" | "smooth", NumericSeries>;
  readonly slope: Record<"raw" | "smooth", NumericSeries>;
  readonly p90: NumericSeries;
  readonly ema7: NumericSeries;
  readonly sma20: NumericSeries;
  readonly wma7: NumericSeries;
  readonly six: NumericSeries[];
  constructor(readonly bars: MarketBar[]) {
    const raw = buildRawContextCurves(bars);
    this.bias = { raw: raw.bias[0], smooth: smoothContext(raw.bias[0]) };
    this.slope = { raw: raw.slope[0], smooth: smoothContext(raw.slope[0]) };
    this.p90 = buildContextQuantiles(bars.map((bar) => bar.time), raw.bias[0])[2];
    const closes = bars.map((bar) => bar.close);
    this.ema7 = ema(closes, 7); this.sma20 = sma(closes, 20); this.wma7 = wma(closes, 7);
    this.six = [...raw.bias, ...raw.slope].map(smoothContext);
  }
  confirms(index: number, policy: Policy): boolean {
    const slopes = this.slope[policy.slope], two = slopes[index - 1] != null && slopes[index - 2] != null && slopes[index - 1]! < slopes[index - 2]!;
    const emaBroken = this.ema7[index] != null && this.bars[index].close < this.ema7[index]!;
    switch (policy.confirmation) {
      case "two-day": return two;
      case "ema7": return emaBroken;
      case "sma20": return this.sma20[index] != null && this.bars[index].close < this.sma20[index]!;
      case "slope60": return this.six[4][index] != null && this.six[4][index - 1] != null && this.six[4][index]! < this.six[4][index - 1]!;
      case "four-down": return this.six.every((curve) => curve[index] != null && curve[index - 1] != null) &&
        this.six.filter((curve) => curve[index]! < curve[index - 1]!).length >= 4;
      case "two-day-ema7": return two && emaBroken;
      case "wma7": return this.wma7[index] != null && this.wma7[index - 1] != null && this.wma7[index]! < this.wma7[index - 1]!;
      default: return true;
    }
  }
}
export function evaluate(bias: number | null, p90: number | null, speed: number | null,
  previous: number | null, before: number | null, policy: Policy, armed: boolean) {
  const hot = bias !== null && p90 !== null && bias > p90;
  const nextArmed = armed || hot;
  const falls = speed !== null && previous !== null && speed < previous;
  const trigger = policy.trigger === "negative" ? speed !== null && speed < 0
    : policy.trigger === "turn" ? falls && before !== null && previous! >= before : falls;
  return { armed: nextArmed, exit: policy.mode !== "off" && (policy.mode === "armed" ? nextArmed : hot) && trigger };
}
export interface Exit { index: number; time: string; before: number; wanted: number; target: number; cancelledEntry: boolean; bias: number; p90: number; speed: number; score?: number; context?: boolean }
export interface Replay { targets: number[]; exits: Exit[]; cursor: { index: number; state: SmaPositionOverlayState; armed: boolean } }
export function replay(features: Features, decisions: ReadonlyMap<number, StrategyCycleRecentSignal[]>, start: number,
  policy: Policy, end = features.bars.length, resume?: Replay): Replay {
  if (start < 0 || end > features.bars.length || end < start) throw new Error("Invalid replay bounds");
  const controller = new SmaPositionOverlay(features.bars, DEFAULT_POSITION_OVERLAY_OPTIONS);
  if (resume) controller.restore(resume.cursor.state);
  const targets = resume ? [...resume.targets] : features.bars.map(() => 0), exits = resume ? [...resume.exits] : [];
  let armed = resume?.cursor.armed ?? false;
  const biases = features.bias[policy.bias], slopes = features.slope[policy.slope];
  for (let index = resume ? resume.cursor.index + 1 : start; index < end; index++) {
    const beforeState = controller.checkpoint(), before = controller.allocation, signals = decisions.get(index) ?? [], direction = strategyCycleSignalDirection(signals);
    if (direction) controller.request(direction, signals.at(-1)!.targetAllocation, index);
    const wanted = controller.close(index, signals.length > 0);
    if (wanted <= 1e-10) armed = false;
    else if (policy.mode !== "off") {
      const signal = evaluate(biases[index], features.p90[index], slopes[index], slopes[index - 1] ?? null, slopes[index - 2] ?? null, policy, armed);
      armed = signal.armed;
      const current = controller.checkpoint();
      const scored = policy.score ? scoreDecision(signal.exit,
        direction === "reduce" || beforeState.pending !== null || current.pending !== null,
        features.confirms(index, { ...policy, confirmation: "ema7" }) && features.confirms(index, { ...policy, confirmation: "wma7" }),
        features.confirms(index, { ...policy, confirmation: "four-down" }),
        wanted < before - 1e-10, direction === "increase" || current.lastIncreaseRequestIndex === index, policy.score) : null;
      if ((scored ? scored.exit : signal.exit) && features.confirms(index, policy) && wanted > (policy.cap ?? 0) + 1e-10) {
        const state = controller.checkpoint();
        const target = policy.cap ?? 0;
        let allowed = true;
        if (policy.confirmation === "native-guards") {
          allowed = state.lastIncreaseRequestIndex !== index && controller.request("reduce", target, index) <= target + 1e-10;
          controller.restore(state);
        }
        if (allowed) {
          controller.restore({ ...state, allocation: target, previousCloseAllocation: target, pending: null,
            lastSupplement: target > 0 ? state.lastSupplement : null,
            entryIndex: target > 0 ? state.entryIndex : null, entryClose: target > 0 ? state.entryClose : 0,
            recoveryTarget: null, flatStart: target > 0 ? null : index, lastClosedIndex: index });
          exits.push({ index, time: features.bars[index].time, before, wanted, target, cancelledEntry: before <= target + 1e-10,
            bias: biases[index]!, p90: features.p90[index]!, speed: slopes[index]!, ...(scored ? { score: scored.total, context: signal.exit } : {}) });
          armed = false;
        }
      }
    }
    targets[index] = controller.allocation;
  }
  return { targets, exits, cursor: { index: end - 1, state: controller.checkpoint(), armed } };
}
