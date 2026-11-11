import { SmaPositionOverlay, SAME_CLOSE_POSITION_OVERLAY_OPTIONS, type SmaPositionOverlayState } from "../../lib/analysis/sma-position-overlay";
import { rebalanceAllocationAccount, type AllocationAccountState, type AllocationRebalance, type BacktestSettings } from "../../lib/analysis/backtest";
import { strategyCycleSignalDirection, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";

export interface State {
  index: number; overlay: SmaPositionOverlayState; account: AllocationAccountState;
  target: number; planned: number; planKey: string | null;
}
export interface Outcome { state: State; fills: AllocationRebalance[] }
export class Stepper {
  private readonly overlay: SmaPositionOverlay;
  constructor(private readonly bars: MarketBar[], private readonly settings: BacktestSettings,
    configureOverlay?: (overlay: SmaPositionOverlay) => void) {
    if (bars.length > 10_000) throw new Error("Bar bound exceeded");
    this.overlay = new SmaPositionOverlay(bars, SAME_CLOSE_POSITION_OVERLAY_OPTIONS, 0, 1);
    configureOverlay?.(this.overlay);
  }
  initial(start: number): State {
    return { index: start - 1, overlay: this.overlay.checkpoint(),
      account: { cash: this.settings.initialCash, units: 0 }, target: 0, planned: 0, planKey: null };
  }
  step(before: State, index: number, signals: readonly StrategyCycleRecentSignal[], planKey = before.planKey,
    forceClear = false): Outcome {
    if (index !== before.index + 1 || !this.bars[index]) throw new Error("Noncontiguous step");
    this.overlay.restore(before.overlay);
    const account = { ...before.account }, fills: AllocationRebalance[] = [];
    const direction = strategyCycleSignalDirection(signals);
    if (direction) this.overlay.request(direction, signals.at(-1)!.targetAllocation, index);
    let target = this.overlay.close(index, signals.length > 0);
    // Research override: keep native risk exits, but bypass sell guards for this close.
    if (forceClear && before.account.units > 1e-10 && target > 1e-10) {
      this.overlay.restore({ ...this.overlay.checkpoint(), allocation: 0, previousCloseAllocation: 0,
        pending: null, lastSupplement: null, entryIndex: null, entryClose: 0, recoveryTarget: null, flatStart: index });
      target = 0;
    }
    const trade = (price: number, allocation: number, atOpen: boolean) => {
      const old = account.units;
      const fill = rebalanceAllocationAccount(account, this.bars[index], price, allocation,
        this.settings.commissionRate, this.settings.slippageRate, [], "strategy", true);
      if (fill) this.overlay.recordExecution(index, old, account.units,
        price * (account.units > old ? 1 + this.settings.slippageRate : 1 - this.settings.slippageRate),
        this.settings.commissionRate, atOpen);
      if (fill && fill !== true) fills.push(fill);
    };
    let planned = before.planned;
    if (Math.abs(before.target - planned) > 1e-10) { trade(this.bars[index].open, before.target, true); planned = before.target; }
    if (Math.abs(target - before.target) > 1e-10 && Math.abs(target - planned) > 1e-10) {
      trade(this.bars[index].close, target, false); planned = target;
    }
    return { state: { index, overlay: this.overlay.checkpoint(), account, target, planned, planKey }, fills };
  }
}
export function same(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b); }
export function compare(a: Outcome, b: Outcome) {
  const fields = Object.keys(a.state.overlay).filter(key => !same(
    a.state.overlay[key as keyof SmaPositionOverlayState], b.state.overlay[key as keyof SmaPositionOverlayState]));
  const accountEqual = same(a.state.account, b.state.account);
  const fillsEqual = same(a.fills, b.fills), targetEqual = a.state.target === b.state.target && a.state.planned === b.state.planned;
  const planEqual = a.state.planKey === b.state.planKey;
  return { fillsEqual, accountEqual, targetEqual, overlayEqual: fields.length === 0, planEqual,
    changedOverlayFields: fields, fullEqual: fillsEqual && accountEqual && targetEqual && !fields.length && planEqual };
}
export const WITNESSES: ReadonlyArray<{ name: string; signals: StrategyCycleRecentSignal[] }> = [
  { name: "quiet", signals: [] },
  ...[0, .25, .5, .75, 1].flatMap(targetAllocation => (["increase", "reduce"] as const)
    .filter(direction => direction === "increase" ? targetAllocation > 0 : targetAllocation < 1)
    .map(direction => ({ name: `${direction}-${targetAllocation}`, signals: [{ direction, targetAllocation, signals: [] }] }))),
  { name: "reduce-increase-hold", signals: [
    { direction: "reduce", targetAllocation: 0, signals: [] }, { direction: "increase", targetAllocation: 1, signals: [] }] },
];
