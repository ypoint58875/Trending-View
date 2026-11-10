import { buildRawContextCurves, smoothContext } from "../../lib/analysis/market-context";
import { SmaPositionOverlay, RSI_SHAPE_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS, type SmaPositionOverlayState } from "../../lib/analysis/sma-position-overlay";
import { strategyCycleSignalDirection, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";
import type { NumericSeries } from "../../lib/analysis/indicators";

export interface Policy { id: string; condition: "off" | "bias-down" | "speed-down" | "speed-negative" | "speed-turn" | "six-down";
  period: number; smoothing: "raw" | "smooth"; days: number; scope: "entry" | "add" | "all" }
export function policies(): Policy[] {
  const base: Policy = { id: "baseline", condition: "off", period: 20, smoothing: "smooth", days: 1, scope: "all" }, result = [base];
  for (const period of [20, 60, 200]) for (const smoothing of ["raw", "smooth"] as const)
    for (const condition of ["bias-down", "speed-down", "speed-negative", "speed-turn"] as const)
      for (const days of condition === "speed-turn" ? [1] : [1, 2, 3]) for (const scope of ["entry", "add", "all"] as const)
        result.push({ id: `${period}-${smoothing}-${condition}-D${days}-${scope}`, period, smoothing, condition, days, scope });
  for (const days of [1, 2, 3]) for (const scope of ["entry", "add", "all"] as const)
    result.push({ ...base, id: `six-down-D${days}-${scope}`, condition: "six-down", days, scope });
  return result;
}
export function falling(values: NumericSeries, index: number) {
  return values[index] != null && values[index - 1] != null && values[index]! < values[index - 1]!;
}
export function turning(values: NumericSeries, index: number) {
  return falling(values, index) && values[index - 2] != null && values[index - 1]! >= values[index - 2]!;
}
export class Features {
  readonly raw: { bias: NumericSeries[]; slope: NumericSeries[] };
  readonly smooth: { bias: NumericSeries[]; slope: NumericSeries[] };
  constructor(readonly bars: MarketBar[]) {
    this.raw = buildRawContextCurves(bars);
    this.smooth = { bias: this.raw.bias.map(smoothContext), slope: this.raw.slope.map(smoothContext) };
  }
  blocked(index: number, policy: Policy) {
    if (policy.condition === "off") return false;
    const curves = this[policy.smoothing], slot = [20, 60, 200].indexOf(policy.period);
    for (let i = index - policy.days + 1; i <= index; i++) {
      const down = policy.condition === "six-down" ? [...this.smooth.bias, ...this.smooth.slope].every((curve) => falling(curve, i))
        : policy.condition === "bias-down" ? falling(curves.bias[slot], i)
        : policy.condition === "speed-down" ? falling(curves.slope[slot], i)
        : policy.condition === "speed-turn" ? turning(curves.slope[slot], i)
        : curves.slope[slot][i] != null && curves.slope[slot][i]! < 0;
      if (!down) return false;
    }
    return true;
  }
}
export interface Replay { targets: number[]; events: { index: number; time: string; before: number; wanted: number; actual: number }[];
  cursor: { index: number; state: SmaPositionOverlayState } }
export function replay(features: Features, decisions: ReadonlyMap<number, StrategyCycleRecentSignal[]>, start: number,
  policy: Policy, end = features.bars.length, resume?: Replay): Replay {
  if (start < 0 || end > features.bars.length || end < start) throw new Error("Invalid replay bounds");
  const controller = new SmaPositionOverlay(features.bars, DEFAULT_POSITION_OVERLAY_OPTIONS);
  if (resume) controller.restore(resume.cursor.state);
  const targets = resume ? [...resume.targets] : features.bars.map(() => 0), events = resume ? [...resume.events] : [];
  for (let i = resume ? resume.cursor.index + 1 : start; i < end; i++) {
    const before = controller.checkpoint(), signals = decisions.get(i) ?? [], direction = strategyCycleSignalDirection(signals);
    if (direction) controller.request(direction, signals.at(-1)!.targetAllocation, i);
    const wanted = controller.close(i, signals.length > 0), after = controller.checkpoint();
    const inScope = policy.scope === "all" || (policy.scope === "entry" ? before.allocation <= 1e-10 : before.allocation > 1e-10);
    if (wanted > before.allocation + 1e-10 && inScope && features.blocked(i, policy)) {
      controller.restore({ ...before, pending: direction === "increase" ? null : before.pending,
        flatStart: before.allocation > 1e-10 ? null : before.flatStart ?? i,
        previousCloseAllocation: before.allocation, lastClosedIndex: i, lastIncreaseRequestIndex: after.lastIncreaseRequestIndex });
      events.push({ index: i, time: features.bars[i].time, before: before.allocation, wanted, actual: controller.allocation });
    }
    targets[i] = controller.allocation;
  }
  return { targets, events, cursor: { index: end - 1, state: controller.checkpoint() } };
}
