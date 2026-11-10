import { SmaPositionOverlay, RSI_SHAPE_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS, type SmaPositionOverlayState } from "../../lib/analysis/sma-position-overlay";
import { strategyCycleSignalDirection, strategyCycleSignalsOppose, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";

export const POLICIES = ["baseline", "old-on-conflict", "consensus-both", "consensus-reduce", "consensus-increase", "small-switch-10pp", "small-switch-25pp"] as const;
export type Policy = typeof POLICIES[number];
export interface Decision {
  index: number; changed: boolean; current: StrategyCycleRecentSignal[]; previous: StrategyCycleRecentSignal[];
}
export interface PendingOrigin { index: number; switchSensitive: boolean }
export interface Event {
  index: number; time: string; from: number; target: number; changed: boolean; conflict: boolean;
  currentDirection: string | null; previousDirection: string | null;
  oldTarget: number; noRequestTarget: number; origin: string; veto: boolean; risk: boolean;
  pendingOrigin: PendingOrigin | null;
}
export interface Replay {
  targets: number[]; events: Event[]; vetoes: number; replacements: number; conflicts: number;
  cursor: { index: number; overlay: SmaPositionOverlayState; pending: PendingOrigin | null };
}

export function choose(policy: Policy, decision: Decision, allocation: number): { signals: StrategyCycleRecentSignal[]; veto: boolean } {
  const current = decision.current, direction = strategyCycleSignalDirection(current);
  if (!decision.changed) return { signals: current, veto: false };
  if (policy === "old-on-conflict" && strategyCycleSignalsOppose(current, decision.previous))
    return { signals: decision.previous, veto: false };
  if (!direction) return { signals: current, veto: false };
  const scope = policy === "consensus-both" || policy === `consensus-${direction}`;
  const threshold = policy === "small-switch-10pp" ? .1 : policy === "small-switch-25pp" ? .25 : 0;
  const delta = direction === "increase" ? Math.max(0, current.at(-1)!.targetAllocation - allocation)
    : Math.max(0, allocation - current.at(-1)!.targetAllocation);
  const veto = scope && strategyCycleSignalDirection(decision.previous) !== direction ||
    threshold > 0 && delta > 1e-10 && delta < threshold - 1e-10;
  return { signals: veto ? [] : current, veto };
}

function advance(account: SmaPositionOverlay, signals: StrategyCycleRecentSignal[], index: number, occupied = signals.length > 0) {
  const direction = strategyCycleSignalDirection(signals);
  if (direction) account.request(direction, signals.at(-1)!.targetAllocation, index);
  account.close(index, occupied);
  return account.checkpoint();
}

export function replay(bars: MarketBar[], decisions: ReadonlyMap<number, Decision>, start: number,
  policy: Policy, until = bars.length, resume?: Replay): Replay {
  if (!Number.isInteger(start) || start < 0 || until < start || until > bars.length || bars.length > 10000)
    throw new Error("Invalid or oversized replay bounds");
  if (!POLICIES.includes(policy)) throw new Error("Unknown policy");
  if (resume && (resume.targets.length !== bars.length || resume.cursor.index < start - 1 || resume.cursor.index >= until))
    throw new Error("Invalid resume cursor");
  const account = new SmaPositionOverlay(bars, DEFAULT_POSITION_OVERLAY_OPTIONS);
  if (resume) account.restore(resume.cursor.overlay);
  const targets = resume ? [...resume.targets] : bars.map(() => 0), events = resume ? [...resume.events] : [];
  let pending = resume?.cursor.pending ?? null, vetoes = resume?.vetoes ?? 0;
  let replacements = resume?.replacements ?? 0, conflicts = resume?.conflicts ?? 0;
  for (let index = resume ? resume.cursor.index + 1 : start; index < until; index++) {
    const before = account.checkpoint(), decision = decisions.get(index);
    const current = decision?.current ?? [], previous = decision?.previous ?? [], changed = decision?.changed ?? false;
    const conflict = changed && strategyCycleSignalsOppose(current, previous);
    if (changed) replacements++;
    if (conflict) conflicts++;
    const selected = decision ? choose(policy, decision, before.allocation) : { signals: [], veto: false };
    if (selected.veto) vetoes++;
    const probe = (signals: StrategyCycleRecentSignal[], state = before) => {
      account.restore(state);
      const result = advance(account, signals, index);
      account.restore(before);
      return result;
    };
    const noRequest = probe([]), old = changed ? probe(previous) : noRequest;
    const withoutPending = pending && before.pending !== null ? probe(selected.signals, { ...before, pending: null }) : null;
    // Request vetoes preserve the signal-occupied day; old substitution uses the old flag.
    const occupied = selected.veto ? current.length > 0 : selected.signals.length > 0;
    const after = advance(account, selected.signals, index, occupied);
    const moved = Math.abs(after.allocation - before.allocation) > 1e-10;
    const risk = before.allocation > 1e-10 && after.stoppedAt === index;
    let origin = "controller";
    if (changed && Math.abs(after.allocation - old.allocation) > 1e-10) origin = "switch-current";
    else if (pending?.switchSensitive && withoutPending && Math.abs(after.allocation - withoutPending.allocation) > 1e-10) origin = "switch-pending";
    else if (Math.abs(after.allocation - noRequest.allocation) > 1e-10) origin = "native-request";
    if (risk) origin = "risk";
    const usedPending = pending;
    if (after.pending === null) pending = null;
    else if (after.pending !== before.pending) pending = { index, switchSensitive: changed && after.pending !== old.pending };
    targets[index] = after.allocation;
    if (moved || selected.veto) events.push({ index, time: bars[index].time, from: before.allocation,
      target: after.allocation, changed, conflict, currentDirection: strategyCycleSignalDirection(current),
      previousDirection: strategyCycleSignalDirection(previous), oldTarget: old.allocation,
      noRequestTarget: noRequest.allocation, origin, veto: selected.veto, risk, pendingOrigin: usedPending });
  }
  return { targets, events, vetoes, replacements, conflicts,
    cursor: { index: until - 1, overlay: account.checkpoint(), pending } };
}

export function validateProgress<T extends { policy: Policy }>(saved: { identity: string; rows: T[] }, identity: string) {
  if (saved.identity !== identity || !Array.isArray(saved.rows) || saved.rows.length > POLICIES.length ||
    saved.rows.some((row, index) => row.policy !== POLICIES[index])) throw new Error("Incompatible or corrupt policy checkpoint");
}
