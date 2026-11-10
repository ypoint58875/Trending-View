import { ema, sma, wma } from "../../lib/analysis/indicators";
import { SmaPositionOverlay, RSI_SHAPE_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS, type SmaPositionOverlayState } from "../../lib/analysis/sma-position-overlay";
import { strategyCycleSignalDirection, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";

export interface Policy { id: string; gate: "below" | "above" | "any" | "off"; rises: number;
  priorHigh: boolean; smaRising: boolean; wma14: boolean }
export function policies(): Policy[] {
  const base: Policy = { id: "current-below-ema3", gate: "below", rises: 3, priorHigh: false, smaRising: false, wma14: false };
  return [base, { ...base, id: "disable-rebound", gate: "off" }, { ...base, id: "above-ema3", gate: "above" },
    { ...base, id: "any-ema3", gate: "any" }, { ...base, id: "below-prior-high", priorHigh: true },
    { ...base, id: "below-sma20-nondecreasing", smaRising: true }, { ...base, id: "below-ema4", rises: 4 },
    { ...base, id: "above-prior-high", gate: "above", priorHigh: true }, { ...base, id: "below-wma14-extra", wma14: true }];
}
export class Context {
  readonly ema7; readonly sma20; readonly wma7; readonly wma14;
  constructor(readonly bars: MarketBar[]) {
    if (bars.length > 10000) throw new Error("Rebound study exceeds10000-bar bound");
    const close = bars.map((bar) => bar.close);
    this.ema7 = ema(close, 7); this.sma20 = sma(close, 20); this.wma7 = wma(close, 7); this.wma14 = wma(close, 14);
  }
  ready(index: number, flatStart: number, policy: Policy): boolean {
    if (policy.gate === "off" || index < Math.max(19, policy.rises + 6)) return false;
    const close = this.bars[index].close, average = this.sma20[index];
    if (average == null || (policy.gate === "below" && close > average) || (policy.gate === "above" && close <= average)) return false;
    for (let offset = 0; offset < policy.rises; offset++)
      if (this.ema7[index - offset] == null || this.ema7[index - offset - 1] == null || this.ema7[index - offset]! <= this.ema7[index - offset - 1]!) return false;
    if (this.wma7[index] == null || this.wma7[index - 1] == null || this.wma7[index]! < this.wma7[index - 1]!) return false;
    if (policy.wma14 && (this.wma14[index] == null || this.wma14[index - 1] == null || this.wma14[index]! < this.wma14[index - 1]!)) return false;
    if (policy.priorHigh && close <= this.bars[index - 1].high) return false;
    if (policy.smaRising && (this.sma20[index - 1] == null || average < this.sma20[index - 1]!)) return false;
    const from = Math.max(0, flatStart, index - 10);
    if (from >= index) return false;
    let lowIndex = from;
    for (let cursor = from + 1; cursor < index; cursor++) if (this.bars[cursor].close <= this.bars[lowIndex].close) lowIndex = cursor;
    if (!lowIndex) return false;
    let peak = 0;
    for (let cursor = Math.max(0, lowIndex - 10); cursor < lowIndex; cursor++) peak = Math.max(peak, this.bars[cursor].close);
    const low = this.bars[lowIndex].close;
    return peak > 0 && low > 0 && 1 - low / peak >= .05 && close / low - 1 >= .04;
  }
}
export interface Cursor { index: number; state: SmaPositionOverlayState }
export function replay(context: Context, decisions: ReadonlyMap<number, StrategyCycleRecentSignal[]>, start: number,
  policy: Policy, end = context.bars.length, resume?: { cursor: Cursor; targets: number[]; entries: number[] }) {
  const controller = new SmaPositionOverlay(context.bars, DEFAULT_POSITION_OVERLAY_OPTIONS);
  if (resume) controller.restore(resume.cursor.state);
  const targets = resume ? [...resume.targets] : context.bars.map(() => 0), entries = resume ? [...resume.entries] : [];
  for (let index = resume ? resume.cursor.index + 1 : start; index < end; index++) {
    const before = controller.checkpoint(), signals = decisions.get(index) ?? [], direction = strategyCycleSignalDirection(signals);
    if (direction) controller.request(direction, signals.at(-1)!.targetAllocation, index);
    const actualFlatStart = before.flatStart ?? index;
    if (before.allocation <= 1e-10) controller.restore({ ...controller.checkpoint(), flatStart: index });
    controller.close(index, signals.length > 0);
    let state = controller.checkpoint();
    if (state.allocation <= 1e-10 && before.allocation <= 1e-10) {
      state = { ...state, flatStart: actualFlatStart };
      controller.restore(state);
    }
    if (before.allocation <= 1e-10 && controller.allocation <= 1e-10 && !signals.length && state.pending === null &&
      index >= state.blockedUntil && context.ready(index, actualFlatStart, policy)) {
      controller.restore({ ...state, allocation: 1, previousCloseAllocation: 1, pending: null, lastSupplement: index,
        flatStart: null, entryIndex: index, entryClose: context.bars[index].close, recoveryTarget: null, lastClosedIndex: index });
      entries.push(index);
    }
    targets[index] = controller.allocation;
  }
  return { targets, entries, cursor: { index: end - 1, state: controller.checkpoint() } };
}
