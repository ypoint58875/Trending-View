import { SmaPositionOverlay, BIAS_ADD_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS, type SmaPositionOverlayState } from "../../lib/analysis/sma-position-overlay";
import { rebalanceAllocationAccount, type AllocationAccountState, type AllocationRebalance, type BacktestSettings } from "../../lib/analysis/backtest";
import { strategyCycleSignalDirection, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import { RiskFeatures, type Episode } from "../nikkei-small-move-exit/model";

export interface Policy { id: string; threshold: number; basePriority: boolean }
export const POLICIES: readonly Policy[] = [
  { id: "baseline", threshold: 0, basePriority: false },
  { id: "range3-all", threshold: 3, basePriority: false },
  { id: "range10-all", threshold: 10, basePriority: false },
  { id: "range3-base-priority", threshold: 3, basePriority: true },
  { id: "range10-base-priority", threshold: 10, basePriority: true },
];
export interface Decision { signals: StrategyCycleRecentSignal[]; selection: string }
export interface Pending { origin: "base" | "controller"; index: number; selection: string | null }
export interface Trace {
  index: number; time: string; signals: StrategyCycleRecentSignal[]; selection: string | null;
  direction: "increase" | "reduce" | null; requestedTarget: number | null;
  before: SmaPositionOverlayState; requested: SmaPositionOverlayState; native: SmaPositionOverlayState; accepted: SmaPositionOverlayState;
  episode: Episode | null; measure: number | null; target: number; wanted: number;
  noOriginal: number; noPending: number; blocked: boolean; risk: boolean;
  exitSource: "risk" | "base-clear" | "base-pending" | "controller" | null;
  pendingBefore: Pending | null; pendingAfter: Pending | null; pendingNecessary: boolean;
}
export interface Replay {
  targets: number[]; events: Trace[]; fills: AllocationRebalance[];
  cursor: { index: number; policy: Policy; model: string; overlay: SmaPositionOverlayState;
    account: AllocationAccountState; planned: number; previousTarget: number; episode: Episode | null; pending: Pending | null };
}

export function pendingLineage(before: SmaPositionOverlayState, requested: SmaPositionOverlayState, native: SmaPositionOverlayState,
  previous: Pending | null, direction: Trace["direction"], target: number | null, index: number, selection: string | null): Pending | null {
  if (native.pending === null) return null;
  const sameRequested = requested.pending !== null && Math.abs(requested.pending - native.pending) < 1e-10;
  if (sameRequested && direction === "reduce" && target !== null && target < before.allocation - 1e-10 &&
    (before.pending === null || requested.pending! < before.pending - 1e-10 || target <= 1e-10))
    return { origin: "base", index, selection };
  if (sameRequested && direction !== "increase" && previous && before.pending !== null &&
    Math.abs(before.pending - native.pending) < 1e-10) return previous;
  return { origin: "controller", index, selection: null };
}

export function replay(features: RiskFeatures, decisions: ReadonlyMap<number, Decision>, start: number, policy: Policy,
  settings: BacktestSettings, end = features.bars.length, resume?: Replay): Replay {
  const bars = features.bars;
  if (!POLICIES.some((row) => JSON.stringify(row) === JSON.stringify(policy)) || !Number.isInteger(start) || start < 0 ||
    !Number.isInteger(end) || end < start || end > bars.length || bars.length > 10000 || end - start > 2000 ||
    decisions.size > 2048 || settings.interval !== "1d") throw new Error("Invalid or oversized integrated replay");
  if (resume && (resume.targets.length !== bars.length || JSON.stringify(resume.cursor.policy) !== JSON.stringify(policy) ||
    resume.cursor.model !== DEFAULT_POSITION_OVERLAY_OPTIONS.model || resume.cursor.index < start - 1 || resume.cursor.index >= end))
    throw new Error("Incompatible integrated replay cursor");
  const controller = new SmaPositionOverlay(bars, DEFAULT_POSITION_OVERLAY_OPTIONS, 0, 1);
  if (resume) controller.restore(resume.cursor.overlay);
  const targets = resume ? [...resume.targets] : bars.map(() => 0), events = resume ? [...resume.events] : [], fills = resume ? [...resume.fills] : [];
  const account = resume ? { ...resume.cursor.account } : { cash: settings.initialCash, units: 0 };
  let episode = resume?.cursor.episode ? { ...resume.cursor.episode } : null, pending = resume?.cursor.pending ?? null;
  let planned = resume?.cursor.planned ?? 0, previousTarget = resume?.cursor.previousTarget ?? 0;
  for (let index = resume ? resume.cursor.index + 1 : start; index < end; index++) {
    if (episode && index > episode.index) episode = { ...episode, high: Math.max(episode.high, bars[index].high), low: Math.min(episode.low, bars[index].low) };
    const observed = episode ? { ...episode } : null, before = controller.checkpoint(), pendingBefore = pending;
    const decision = decisions.get(index), signals = decision?.signals ?? [], selection = decision?.selection ?? null;
    const direction = strategyCycleSignalDirection(signals), requestedTarget = direction ? signals.at(-1)!.targetAllocation : null;
    const probe = (state: SmaPositionOverlayState, inputs: StrategyCycleRecentSignal[]) => {
      controller.restore(state);
      const way = strategyCycleSignalDirection(inputs);
      if (way) controller.request(way, inputs.at(-1)!.targetAllocation, index);
      const requested = controller.checkpoint(); controller.close(index, inputs.length > 0);
      return { requested, closed: controller.checkpoint() };
    };
    const native = probe(before, signals), noOriginal = probe(before, []);
    const noPending = before.pending !== null ? probe({ ...before, pending: null }, signals) : native;
    controller.restore(native.closed);
    const fullExit = before.allocation > 1e-10 && native.closed.allocation <= 1e-10;
    const risk = fullExit && features.hardRisk(index, before, native.closed);
    const pendingNecessary = fullExit && before.pending !== null && noPending.closed.allocation > 1e-10;
    const source: Trace["exitSource"] = !fullExit ? null : risk ? "risk"
      : direction === "reduce" && requestedTarget! <= 1e-10 ? "base-clear"
        : pendingNecessary && pendingBefore?.origin === "base" ? "base-pending" : "controller";
    const measure = observed ? (observed.high - observed.low) / observed.cost * 100 : null;
    const exempt = policy.basePriority && (source === "base-clear" || source === "base-pending");
    const blocked = policy.threshold > 0 && fullExit && !risk && !exempt && measure !== null && measure < policy.threshold - 1e-10;
    pending = pendingLineage(before, native.requested, native.closed, pendingBefore, direction, requestedTarget, index, selection);
    if (blocked) {
      const keep = policy.basePriority && direction === "reduce" && requestedTarget! > 1e-10 &&
        native.requested.allocation > 1e-10 && native.requested.allocation < before.allocation - 1e-10
        ? native.requested.allocation : before.allocation;
      controller.restore({ ...before, allocation: keep, pending: 0, flatStart: null, previousCloseAllocation: keep,
        lastClosedIndex: index, lastIncreaseRequestIndex: native.closed.lastIncreaseRequestIndex });
      pending = source === "base-clear" ? { origin: "base", index, selection }
        : pendingBefore && before.pending !== null && before.pending <= 1e-10 && direction !== "increase" ? pendingBefore
          : { origin: "controller", index, selection: null };
    }
    const accepted = controller.checkpoint(), target = accepted.allocation;
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
    if (Math.abs(target - previousTarget) > 1e-10 && Math.abs(target - planned) > 1e-10) { execute(bars[index].close, target); planned = target; }
    targets[index] = target; previousTarget = target;
    events.push({ index, time: bars[index].time, signals, selection, direction, requestedTarget, before, requested: native.requested,
      native: native.closed, accepted, episode: observed, measure, target, wanted: native.closed.allocation,
      noOriginal: noOriginal.closed.allocation, noPending: noPending.closed.allocation, blocked, risk, exitSource: source,
      pendingBefore, pendingAfter: pending, pendingNecessary });
  }
  return { targets, events, fills, cursor: { index: end - 1, policy, model: DEFAULT_POSITION_OVERLAY_OPTIONS.model!, overlay: controller.checkpoint(),
    account, planned, previousTarget, episode, pending } };
}

export function validateProgress(saved: { identity: string; hash: string; rows: { policy: string }[] }, identity: string, hash: string) {
  if (saved.identity !== identity || saved.hash !== hash || !Array.isArray(saved.rows) || saved.rows.length > POLICIES.length ||
    saved.rows.some((row, i) => row.policy !== POLICIES[i].id)) throw new Error("Incompatible or corrupt integration checkpoint");
}

export { RiskFeatures };
