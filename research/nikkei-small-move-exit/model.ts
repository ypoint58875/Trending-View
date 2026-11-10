import { SmaPositionOverlay, RSI_SHAPE_POSITION_OVERLAY_OPTIONS, type SmaPositionOverlayState, type SmaPositionOverlayOptions } from "../../lib/analysis/sma-position-overlay";
import { rebalanceAllocationAccount, type AllocationAccountState, type AllocationRebalance, type BacktestSettings } from "../../lib/analysis/backtest";
import { strategyCycleSignalDirection, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import { Features as RiskFeatures } from "../nikkei-chop-filter/model";

export interface Policy { id: string; kind: "baseline" | "cost" | "range"; threshold: number }
export function policies(): Policy[] {
  const result: Policy[] = [{ id: "baseline", kind: "baseline", threshold: 0 }];
  for (const kind of ["cost", "range"] as const) for (const threshold of [.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10])
    result.push({ id: `${kind}-${threshold}`, kind, threshold });
  return result;
}
export interface Episode { index: number; cost: number; high: number; low: number }
export function amplitude(episode: Episode, close: number, kind: Policy["kind"]): number {
  return kind === "range" ? (episode.high - episode.low) / episode.cost * 100 : Math.abs(close / episode.cost - 1) * 100;
}
export interface Event {
  index: number; time: string; from: number; wanted: number; target: number;
  blocked: boolean; risk: boolean; measure: number | null; episode: Episode | null;
}
export interface Cursor {
  index: number; policy: Policy; overlayModel: string; overlay: SmaPositionOverlayState; account: AllocationAccountState;
  planned: number; previousTarget: number; episode: Episode | null;
}
export interface Replay { targets: number[]; events: Event[]; fills: AllocationRebalance[]; cursor: Cursor }

export function replay(features: RiskFeatures, decisions: ReadonlyMap<number, StrategyCycleRecentSignal[]>, start: number,
  policy: Policy, settings: BacktestSettings, end = features.bars.length, resume?: Replay,
  options: Readonly<SmaPositionOverlayOptions> = RSI_SHAPE_POSITION_OVERLAY_OPTIONS): Replay {
  const bars = features.bars;
  if (!policies().some((row) => row.id === policy.id && row.kind === policy.kind && row.threshold === policy.threshold) ||
    !Number.isInteger(start) || start < 0 || !Number.isInteger(end) || end < start || end > bars.length || bars.length > 10000 ||
    decisions.size > 2048 || settings.interval !== "1d") throw new Error("Invalid or oversized small-move replay");
  if (resume && (resume.targets.length !== bars.length || JSON.stringify(resume.cursor.policy) !== JSON.stringify(policy) ||
    resume.cursor.overlayModel !== options.model || resume.cursor.index < start - 1 || resume.cursor.index >= end)) throw new Error("Incompatible replay cursor");
  const controller = new SmaPositionOverlay(bars, options, 0, 1);
  if (resume) controller.restore(resume.cursor.overlay);
  const targets = resume ? [...resume.targets] : bars.map(() => 0), events = resume ? [...resume.events] : [], fills = resume ? [...resume.fills] : [];
  const account = resume ? { ...resume.cursor.account } : { cash: settings.initialCash, units: 0 };
  let planned = resume?.cursor.planned ?? 0, previousTarget = resume?.cursor.previousTarget ?? 0;
  let episode = resume?.cursor.episode ? { ...resume.cursor.episode } : null;
  for (let index = resume ? resume.cursor.index + 1 : start; index < end; index++) {
    if (episode && index > episode.index) episode = { ...episode, high: Math.max(episode.high, bars[index].high), low: Math.min(episode.low, bars[index].low) };
    const observed = episode ? { ...episode } : null, before = controller.checkpoint();
    const signals = decisions.get(index) ?? [], direction = strategyCycleSignalDirection(signals);
    if (direction) controller.request(direction, signals.at(-1)!.targetAllocation, index);
    const wanted = controller.close(index, signals.length > 0), after = controller.checkpoint();
    const fullExit = before.allocation > 1e-10 && wanted <= 1e-10;
    const risk = fullExit && features.hardRisk(index, before, after);
    const measure = observed ? amplitude(observed, bars[index].close, policy.kind) : null;
    const blocked = policy.kind !== "baseline" && fullExit && !risk && measure !== null && measure < policy.threshold - 1e-10;
    if (blocked) controller.restore({ ...before, pending: 0,
      previousCloseAllocation: before.allocation, flatStart: null, lastClosedIndex: index,
      lastIncreaseRequestIndex: after.lastIncreaseRequestIndex });
    const target = controller.allocation;
    const execute = (price: number, allocation: number) => {
      const wasFlat = account.units <= 1e-10;
      const fill = rebalanceAllocationAccount(account, bars[index], price, allocation,
        settings.commissionRate, settings.slippageRate, []);
      if (fill && fill !== true) {
        fills.push(fill);
        if (wasFlat && account.units > 1e-10) episode = { index, cost: fill.fillPrice * (1 + settings.commissionRate), high: fill.fillPrice, low: fill.fillPrice };
        if (allocation <= 1e-10 && account.units <= 1e-10) episode = null;
      }
    };
    if (Math.abs(previousTarget - planned) > 1e-10) { execute(bars[index].open, previousTarget); planned = previousTarget; }
    if (Math.abs(target - previousTarget) > 1e-10 && Math.abs(target - planned) > 1e-10) {
      execute(bars[index].close, target); planned = target;
    }
    targets[index] = target; previousTarget = target;
    if (Math.abs(target - before.allocation) > 1e-10 || blocked) events.push({ index, time: bars[index].time, from: before.allocation,
      wanted, target, blocked, risk, measure, episode: observed });
  }
  return { targets, events, fills, cursor: { index: end - 1, policy, overlayModel: options.model!, overlay: controller.checkpoint(), account, planned, previousTarget, episode } };
}

export function validateProgress(saved: { identity: string; hash: string; rows: { policy: string }[] }, identity: string, hash: string) {
  if (saved.identity !== identity || saved.hash !== hash || !Array.isArray(saved.rows) || saved.rows.length > policies().length ||
    saved.rows.some((row, index) => row.policy !== policies()[index].id)) throw new Error("Incompatible or corrupt small-move checkpoint");
}

export { RiskFeatures };
