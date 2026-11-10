import { SmaPositionOverlay, DEFAULT_POSITION_OVERLAY_OPTIONS, type SmaPositionOverlayState } from "../../lib/analysis/sma-position-overlay";
import { rebalanceAllocationAccount, type AllocationAccountState, type AllocationRebalance, type BacktestSettings } from "../../lib/analysis/backtest";
import { shouldScreenStrategyCycleAtIndex, strategyCycleSignalDirection, strategyCycleTrendAngle,
  type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";

export const POLICIES = ["baseline", "holding-downtrend", "down-entry-run", "bearish-entry-run"] as const;
export type Policy = typeof POLICIES[number];
export interface SignalRow { index: number; signals: StrategyCycleRecentSignal[] }
export interface Episode { index: number; downEntry: boolean; bearishEntry: boolean; uninterrupted: boolean; uninterruptedBearish: boolean }
export interface Day {
  index: number; time: string; regular: boolean; skippedDown: boolean; held: boolean;
  episode: Episode | null; checked: boolean; observed: StrategyCycleRecentSignal[];
  direction: ReturnType<typeof strategyCycleSignalDirection>; before: number; target: number;
  pendingBefore: number | null; pendingAfter: number | null; stopped: boolean;
  noRequestTarget: number; requestChangedTarget: boolean;
  actualReduction: boolean; actualClear: boolean; cash: number; units: number; equity: number;
}
export interface Path {
  days: Day[]; fills: AllocationRebalance[];
  cursor: { index: number; overlay: SmaPositionOverlayState; account: AllocationAccountState;
    previous: number; planned: number; episode: Episode | null };
}
export function skippedDown(bars: MarketBar[], index: number): boolean {
  return !shouldScreenStrategyCycleAtIndex(bars, index) && (strategyCycleTrendAngle(bars, index) ?? 0) <= -30;
}
export function replay(bars: MarketBar[], regular: ReadonlyMap<number, StrategyCycleRecentSignal[]>,
  extras: ReadonlyMap<number, StrategyCycleRecentSignal[]>, start: number, settings: BacktestSettings,
  policy: Policy, end = bars.length, resume?: Path): Path {
  if (bars.length > 10_000 || regular.size > 2_048 || !POLICIES.includes(policy) ||
    start < 0 || end > bars.length || end <= start) throw new Error("Invalid replay bounds");
  if (resume && (resume.cursor.index < start || resume.cursor.index >= end)) throw new Error("Invalid resume cursor");
  const controller = new SmaPositionOverlay(bars, DEFAULT_POSITION_OVERLAY_OPTIONS, 0, 1);
  const probe = new SmaPositionOverlay(bars, DEFAULT_POSITION_OVERLAY_OPTIONS, 0, 1);
  if (resume) controller.restore(resume.cursor.overlay);
  const days = resume ? [...resume.days] : [], fills = resume ? [...resume.fills] : [];
  const account = resume ? { ...resume.cursor.account } : { cash: settings.initialCash, units: 0 };
  let previous = resume?.cursor.previous ?? 0, planned = resume?.cursor.planned ?? 0;
  let episode = resume?.cursor.episode ? { ...resume.cursor.episode } : null;
  for (let index = resume ? resume.cursor.index + 1 : start; index < end; index++) {
    if (process.memoryUsage().rss > 1.5 * 1024 ** 3) throw new Error("Replay RSS bound reached");
    const bar = bars[index]!, before = controller.checkpoint(), held = account.units > 1e-10;
    if (episode && index > episode.index && bar.close >= bars[index - 1]!.close) episode.uninterrupted = false;
    if (episode && index > episode.index && bar.close >= bar.open) episode.uninterruptedBearish = false;
    const priorEpisode = episode ? { ...episode } : null;
    const regularDay = regular.has(index), down = !regularDay && skippedDown(bars, index);
    const observed = down ? extras.get(index) ?? [] : [];
    const checked = down && held && (policy === "holding-downtrend" ||
      policy === "down-entry-run" && !!episode?.downEntry && episode.uninterrupted ||
      policy === "bearish-entry-run" && !!episode?.bearishEntry && episode.uninterruptedBearish);
    const signals = regularDay ? regular.get(index)! : checked ? observed : [];
    let noRequestTarget = before.allocation;
    if (checked) { probe.restore(before); noRequestTarget = probe.close(index, false); }
    const direction = strategyCycleSignalDirection(signals);
    if (direction) controller.request(direction, signals.at(-1)!.targetAllocation, index);
    const target = controller.close(index, signals.length > 0);
    let actualReduction = false, actualClear = false;
    const trade = (price: number, allocation: number, atOpen: boolean) => {
      const oldUnits = account.units;
      const fill = rebalanceAllocationAccount(account, bar, price, allocation, settings.commissionRate,
        settings.slippageRate, [], "strategy", true);
      if (fill) controller.recordExecution(index, oldUnits, account.units,
        price * (account.units > oldUnits ? 1 + settings.slippageRate : 1 - settings.slippageRate), settings.commissionRate, atOpen);
      if (fill && fill !== true) fills.push(fill);
      if (oldUnits > account.units + 1e-10) actualReduction = true;
      if (oldUnits > 1e-10 && account.units <= 1e-10) { actualClear = true; episode = null; }
      if (oldUnits <= 1e-10 && account.units > 1e-10) episode = { index,
        downEntry: index > 0 && bar.close < bars[index - 1]!.close,
        bearishEntry: bar.close < bar.open, uninterrupted: true, uninterruptedBearish: true };
    };
    if (Math.abs(previous - planned) > 1e-10) { trade(bar.open, previous, true); planned = previous; }
    if (Math.abs(target - previous) > 1e-10 && Math.abs(target - planned) > 1e-10) {
      trade(bar.close, target, false); planned = target;
    }
    const after = controller.checkpoint();
    days.push({ index, time: bar.time, regular: regularDay, skippedDown: down, held, episode: priorEpisode,
      checked, observed, direction: strategyCycleSignalDirection(regularDay ? signals : observed),
      before: before.allocation, target, pendingBefore: before.pending, pendingAfter: after.pending,
      stopped: after.stoppedAt === index, actualReduction, actualClear,
      noRequestTarget, requestChangedTarget: checked && Math.abs(target - noRequestTarget) > 1e-10,
      cash: account.cash, units: account.units, equity: account.cash + account.units * bar.close });
    previous = target;
  }
  return { days, fills, cursor: { index: end - 1, overlay: controller.checkpoint(), account,
    previous, planned, episode } };
}

export function metrics(path: Path, initialCash: number) {
  let peak = initialCash, drawdown = 0;
  for (const day of path.days) { peak = Math.max(peak, day.equity); drawdown = Math.max(drawdown, (1 - day.equity / peak) * 100); }
  const segment = (start: number, end: number) => (path.days[end - 1]!.equity /
    (start ? path.days[start - 1]!.equity : initialCash) - 1) * 100;
  return { net: segment(0, path.days.length), maxDrawdown: drawdown, fills: path.fills.length,
    first1000: segment(0, 1000), next500: segment(1000, 1500), final500: segment(1500, 2000),
    extraCheckedDays: path.days.filter(day => day.checked).length,
    extraSignalDays: path.days.filter(day => day.checked && day.observed.length).length,
    extraReduceDays: path.days.filter(day => day.checked && day.direction === "reduce").length,
    extraIncreaseDays: path.days.filter(day => day.checked && day.direction === "increase").length,
    extraReductionFills: path.days.filter(day => day.checked && day.actualReduction).length,
    extraClearFills: path.days.filter(day => day.checked && day.actualClear).length,
    extraRequestChangedTargets: path.days.filter(day => day.requestChangedTarget).length,
    extraRequestCausedReductions: path.days.filter(day => day.requestChangedTarget && day.target < day.noRequestTarget - 1e-10).length,
    extraRequestCausedClears: path.days.filter(day => day.requestChangedTarget && day.target <= 1e-10 && day.noRequestTarget > 1e-10).length };
}
