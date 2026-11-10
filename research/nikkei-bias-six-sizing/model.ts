import { buildContextCurves, replayContextDirections } from "../../lib/analysis/market-context";
import { SmaPositionOverlay, RANGE_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS, type SmaPositionOverlayState } from "../../lib/analysis/sma-position-overlay";
import { rebalanceAllocationAccount, type AllocationAccountState, type BacktestSettings } from "../../lib/analysis/backtest";
import { strategyCycleSignalDirection, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";
import type { NumericSeries } from "../../lib/analysis/indicators";

export function falling(values: NumericSeries, i: number): boolean {
  return i > 0 && values[i] != null && values[i - 1] != null && values[i]! < values[i - 1]!;
}
export function combined(bias: NumericSeries, slope: NumericSeries, i: number, strict = true): boolean {
  return i >= 3 && [i, i - 1, i - 2].every(j => falling(bias, j)) && falling(slope, i) &&
    (!strict || slope[i - 2] != null && slope[i - 1]! >= slope[i - 2]!);
}
export class Features {
  readonly curves;
  readonly states;
  readonly event;
  readonly broad;
  constructor(readonly bars: MarketBar[]) {
    this.curves = buildContextCurves(bars);
    this.states = replayContextDirections(bars.map(b => b.time), this.curves);
    this.event = bars.map((_, i) => combined(this.curves.bias[0], this.curves.slope[0], i));
    this.broad = bars.map((_, i) => combined(this.curves.bias[0], this.curves.slope[0], i, false));
  }
}
export interface NativePath {
  targets: number[]; vetoes: number[];
  cursor: { index: number; overlay: SmaPositionOverlayState; account: AllocationAccountState; planned: number; previous: number };
}
export function nativeReplay(features: Features, decisions: ReadonlyMap<number, StrategyCycleRecentSignal[]>, start: number,
  settings: BacktestSettings, mode: "baseline" | "same-close-bias" | "combined-add" = "baseline", end = features.bars.length, resume?: NativePath): NativePath {
  const bars = features.bars;
  if (bars.length > 10000 || decisions.size > 2048 || start < 0 || end < start || end > bars.length) throw new Error("Invalid replay bounds");
  const controller = new SmaPositionOverlay(bars, DEFAULT_POSITION_OVERLAY_OPTIONS, 0, mode === "same-close-bias" ? 0 : 1);
  if (resume) controller.restore(resume.cursor.overlay);
  const targets = resume ? [...resume.targets] : bars.map(() => 0), vetoes = resume ? [...resume.vetoes] : [];
  const account = resume ? { ...resume.cursor.account } : { cash: settings.initialCash, units: 0 };
  let planned = resume?.cursor.planned ?? 0, previous = resume?.cursor.previous ?? 0;
  for (let i = resume ? resume.cursor.index + 1 : start; i < end; i++) {
    const before = controller.checkpoint(), signals = decisions.get(i) ?? [], direction = strategyCycleSignalDirection(signals);
    if (direction) controller.request(direction, signals.at(-1)!.targetAllocation, i);
    const wanted = controller.close(i, signals.length > 0), after = controller.checkpoint();
    if (mode === "combined-add" && features.event[i] && before.allocation > 1e-10 && wanted > before.allocation + 1e-10) {
      controller.restore({ ...after, allocation: before.allocation, previousCloseAllocation: before.allocation }); vetoes.push(i);
    }
    const target = controller.allocation;
    const execute = (price: number, allocation: number, atOpen: boolean) => {
      const old = account.units;
      const fill = rebalanceAllocationAccount(account, bars[i], price, allocation, settings.commissionRate, settings.slippageRate, []);
      if (fill) controller.recordExecution(i, old, account.units, price * (account.units > old ? 1 + settings.slippageRate : 1 - settings.slippageRate), settings.commissionRate, atOpen);
    };
    if (Math.abs(previous - planned) > 1e-10) { execute(bars[i].open, previous, true); planned = previous; }
    if (Math.abs(target - previous) > 1e-10 && Math.abs(target - planned) > 1e-10) { execute(bars[i].close, target, false); planned = target; }
    targets[i] = target; previous = target;
  }
  return { targets, vetoes, cursor: { index: end - 1, overlay: controller.checkpoint(), account, planned, previous } };
}
export interface Sleeve { id: string; kind: "native" | "weak" | "event" | "broad"; multiplier: number; transient?: boolean }
export const SLEEVES: Sleeve[] = [
  { id: "baseline", kind: "native", multiplier: 1 },
  ...[.75, .5, .25, 0].map(multiplier => ({ id: `weak-${multiplier}`, kind: "weak" as const, multiplier })),
  ...[.5, 0].flatMap(multiplier => (["event", "broad"] as const).map(kind => ({ id: `${kind}-${multiplier}`, kind, multiplier }))),
  ...[.5, 0].flatMap(multiplier => (["event", "broad"] as const).map(kind => ({ id: `${kind}-transient-${multiplier}`, kind, multiplier, transient: true }))),
];
export function sleeveTargets(features: Features, native: number[], policy: Sleeve, start: number): number[] {
  let scale = 1;
  return native.map((target, i) => {
    if (i < start || policy.kind === "native") return target;
    if (policy.kind === "weak") return target * (features.states[i].confirmed === "down" ? policy.multiplier : 1);
    if (policy.transient) return target * ((policy.kind === "event" ? features.event[i] : features.broad[i]) ? policy.multiplier : 1);
    if (target > (native[i - 1] ?? 0) + 1e-10) scale = 1;
    if ((policy.kind === "event" ? features.event[i] : features.broad[i]) && target > 0) scale = Math.min(scale, policy.multiplier);
    return target * scale;
  });
}
export function regimeSummary(bars: MarketBar[], features: Features, start: number, equity?: { equity: number }[], end = bars.length) {
  const rows = (["up", "down", "unknown"] as const).map(state => {
    const daily: number[] = [], runs: number[] = []; let product = 1, active = false, days = 0;
    for (let i = start + 1; i < end; i++) {
      const match = (features.states[i - 1].confirmed ?? "unknown") === state;
      if (match) {
        const r = equity ? equity[i - start].equity / equity[i - start - 1].equity - 1 : bars[i].close / bars[i - 1].close - 1;
        daily.push(r); product *= 1 + r; active = true; days++;
      } else if (active) { runs.push((product - 1) * 100); active = false; product = 1; }
    }
    if (active) runs.push((product - 1) * 100);
    const sorted = [...runs].sort((a,b) => a-b);
    return { state, days, runs: runs.length, positiveRuns: runs.filter(r => r > 0).length,
      meanDaily: daily.length ? daily.reduce((a,b) => a+b,0) / daily.length * 100 : null,
      compound: (daily.reduce((a,b) => a*(1+b),1)-1)*100,
      meanRun: runs.length ? runs.reduce((a,b) => a+b,0)/runs.length : null,
      medianRun: sorted.length ? (sorted[Math.floor((sorted.length-1)/2)] + sorted[Math.floor(sorted.length/2)])/2 : null,
      worstRun: sorted[0] ?? null, censoredTail: active };
  });
  return rows;
}
