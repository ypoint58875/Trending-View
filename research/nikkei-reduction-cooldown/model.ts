import { SmaPositionOverlay, RSI_SHAPE_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS, type SmaPositionOverlayState } from "../../lib/analysis/sma-position-overlay";
import { rebalanceAllocationAccount, type AllocationAccountState, type AllocationRebalance, type BacktestSettings } from "../../lib/analysis/backtest";
import { strategyCycleSignalDirection, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";

export const DAYS = [0, 1, 2, 3, 5, 7, 10] as const;
export interface Event {
  index: number; time: string; from: number; wanted: number; target: number;
  blocked: boolean; flat: boolean; risk: boolean; sold: boolean;
  lastReduction: number | null; blockedThrough: number | null;
}
export interface Cursor {
  index: number; days: number; overlay: SmaPositionOverlayState; account: AllocationAccountState;
  planned: number; previousTarget: number; lastReduction: number | null;
}
export interface Replay { targets: number[]; events: Event[]; fills: AllocationRebalance[]; cursor: Cursor }

export function isCooling(index: number, lastReduction: number | null, days: number) {
  return days > 0 && lastReduction !== null && index > lastReduction && index <= lastReduction + days;
}

export function replay(bars: MarketBar[], decisions: ReadonlyMap<number, StrategyCycleRecentSignal[]>, start: number,
  days: number, settings: BacktestSettings, end = bars.length, resume?: Replay): Replay {
  if (!Number.isInteger(days) || days < 0 || days > 10 || !Number.isInteger(start) || start < 0 ||
    !Number.isInteger(end) || end < start || end > bars.length || bars.length > 10000 || decisions.size > 2048 || settings.interval !== "1d")
    throw new Error("Invalid or oversized cooldown replay");
  if (resume && (resume.targets.length !== bars.length || resume.cursor.days !== days ||
    resume.cursor.index < start - 1 || resume.cursor.index >= end)) throw new Error("Incompatible replay cursor");
  const controller = new SmaPositionOverlay(bars, DEFAULT_POSITION_OVERLAY_OPTIONS);
  if (resume) controller.restore(resume.cursor.overlay);
  const targets = resume ? [...resume.targets] : bars.map(() => 0), events = resume ? [...resume.events] : [];
  const fills = resume ? [...resume.fills] : [], account = resume ? { ...resume.cursor.account } : { cash: settings.initialCash, units: 0 };
  let planned = resume?.cursor.planned ?? 0, previousTarget = resume?.cursor.previousTarget ?? 0;
  let lastReduction = resume?.cursor.lastReduction ?? null;
  for (let index = resume ? resume.cursor.index + 1 : start; index < end; index++) {
    const before = controller.checkpoint(), signals = decisions.get(index) ?? [], direction = strategyCycleSignalDirection(signals);
    if (direction) controller.request(direction, signals.at(-1)!.targetAllocation, index);
    const wanted = controller.close(index, signals.length > 0), after = controller.checkpoint();
    const blocked = isCooling(index, lastReduction, days) && wanted > before.allocation + 1e-10;
    if (blocked) {
      // Restore real holding/entry/recovery state; retain native buy cancellation and occupancy semantics.
      controller.restore({ ...before, pending: direction === "increase" ? null : before.pending,
        flatStart: before.allocation > 1e-10 ? null : before.flatStart ?? index,
        previousCloseAllocation: before.allocation, lastClosedIndex: index,
        lastIncreaseRequestIndex: after.lastIncreaseRequestIndex });
    }
    const target = controller.allocation, priorReduction = lastReduction;
    let sold = false;
    const execute = (price: number, allocation: number) => {
      const fill = rebalanceAllocationAccount(account, bars[index], price, allocation,
        settings.commissionRate, settings.slippageRate, []);
      if (fill && fill !== true) {
        fills.push(fill);
        if (fill.targetAllocation < fill.fromAllocation - 1e-10) { sold = true; lastReduction = index; }
      }
    };
    // Mirror the existing close-proxy ledger's next-open reconciliation, including tiny target changes.
    if (Math.abs(previousTarget - planned) > 1e-10) { execute(bars[index].open, previousTarget); planned = previousTarget; }
    if (Math.abs(target - previousTarget) > 1e-10 && Math.abs(target - planned) > 1e-10) {
      execute(bars[index].close, target); planned = target;
    }
    targets[index] = target; previousTarget = target;
    const risk = before.allocation > 1e-10 && after.stoppedAt === index;
    if (Math.abs(target - before.allocation) > 1e-10 || blocked || sold) events.push({ index, time: bars[index].time,
      from: before.allocation, wanted, target, blocked, flat: before.allocation <= 1e-10, risk, sold,
      lastReduction: priorReduction, blockedThrough: priorReduction === null ? null : priorReduction + days });
  }
  return { targets, events, fills, cursor: { index: end - 1, days, overlay: controller.checkpoint(), account, planned, previousTarget, lastReduction } };
}

export function validateProgress(saved: { identity: string; rows: { days: number; policy: string }[]; hash: string }, identity: string, hash: string) {
  if (saved.identity !== identity || saved.hash !== hash || !Array.isArray(saved.rows) || saved.rows.length > DAYS.length ||
    saved.rows.some((row, i) => row.days !== DAYS[i] || row.policy !== `X${DAYS[i]}`)) throw new Error("Incompatible or corrupt cooldown checkpoint");
}
