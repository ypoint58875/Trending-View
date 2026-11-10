import { buildContextCurves, replayContextDirections, type ContextCurves, type ContextObservation } from "../../lib/analysis/market-context";
import { DAILY_HISTORY_LIMIT } from "../../lib/market/history";
import type { MarketBar } from "../../lib/market/types";

export const METRICS = ["bias20", "bias60", "bias200", "slope20", "slope60", "slope200"] as const;
export const HORIZONS = [1, 3, 5, 10, 20] as const;
export const STUDY_MODEL = "context-disagreement-v2";
export interface BreakEvent {
  index: number;
  time: string;
  previousDirection: "up" | "down";
  previousStreak: number;
  metric: typeof METRICS[number];
  kind: "opposite" | "flat";
}

export function singleLineBreakEvents(times: string[], curves: ContextCurves): BreakEvent[] {
  const states = replayContextDirections(times, curves);
  const all = [...curves.bias, ...curves.slope];
  const events: BreakEvent[] = [];
  for (let index = 1; index < times.length; index++) {
    const previous = states[index - 1];
    if (previous.consecutive < 3 || (previous.direction !== "up" && previous.direction !== "down")) continue;
    const side = previous.direction === "up" ? 1 : -1;
    const changes = all.map((curve) => {
      const current = curve[index], before = curve[index - 1];
      return current == null || before == null ? null : Math.sign(current - before);
    });
    if (changes.some((value) => value === null)) continue;
    const departures = changes.flatMap((value, metric) => value !== side ? [metric] : []);
    if (departures.length !== 1) continue;
    const metric = departures[0];
    events.push({ index, time: times[index], previousDirection: previous.direction,
      previousStreak: previous.consecutive, metric: METRICS[metric], kind: changes[metric] === 0 ? "flat" : "opposite" });
  }
  return events;
}

export function eventOutcome(bars: readonly MarketBar[], states: ContextObservation[], event: Pick<BreakEvent, "index" | "previousDirection">, horizon: number) {
  if (!Number.isInteger(horizon) || horizon < 1) throw new Error("Invalid event horizon");
  const end = event.index + horizon;
  if (end >= bars.length) return null;
  const after = states.slice(event.index + 1, end + 1);
  const opposite = event.previousDirection === "up" ? "down" : "up";
  const restored = after.findIndex((row) => row.direction === event.previousDirection);
  const reconfirmed = after.findIndex((row) => row.direction === event.previousDirection && row.consecutive >= 3);
  const opposed = after.findIndex((row) => row.direction === opposite);
  const reversed = after.findIndex((row) => row.confirmed === opposite);
  const side = event.previousDirection === "up" ? 1 : -1;
  const closeReturn = (bars[end].close / bars[event.index].close - 1) * 100;
  const nextOpenReturn = (bars[end].close / bars[event.index + 1].open - 1) * 100;
  return { horizon, closeReturn, nextOpenReturn, previousDirectionHit: closeReturn * side > 0,
    firstUnanimity: restored < 0 && opposed < 0 ? "neither" : restored >= 0 && (opposed < 0 || restored < opposed) ? "restored" : "opposed",
    oppositeUnanimity: opposed >= 0,
    restored: restored >= 0, reconfirmed: reconfirmed >= 0, reversed: reversed >= 0,
    restoreDays: restored < 0 ? null : restored + 1, reverseDays: reversed < 0 ? null : reversed + 1 };
}

export function separatedEvents<T extends { index: number }>(events: readonly T[], gap: number): T[] {
  const selected: T[] = [];
  for (const event of events) if (!selected.length || event.index - selected.at(-1)!.index > gap) selected.push(event);
  return selected;
}

export function wilson(successes: number, count: number): [number, number] | null {
  if (!count) return null;
  const z = 1.959963984540054;
  const p = successes / count;
  const denominator = 1 + z * z / count;
  const centre = (p + z * z / (2 * count)) / denominator;
  const half = z * Math.sqrt(p * (1 - p) / count + z * z / (4 * count * count)) / denominator;
  return [100 * (centre - half), 100 * (centre + half)];
}

export function researchContext(bars: readonly MarketBar[]) {
  if (bars.length > DAILY_HISTORY_LIMIT) throw new Error("Research exceeds daily history limit");
  const times = bars.map((bar) => bar.time);
  const curves = buildContextCurves(bars);
  return { curves, states: replayContextDirections(times, curves), events: singleLineBreakEvents(times, curves) };
}

export interface MultipleBreakEvent {
  index: number;
  time: string;
  episode: string;
  mode: "initial" | "stage-first";
  previousDirection: "up" | "down";
  reversed: number;
  flat: number;
  unchanged: number;
}

/** Each episode starts after >=3 unanimous days and ends at a fresh confirmation. */
export function multipleLineBreakEvents(times: string[], curves: ContextCurves): MultipleBreakEvent[] {
  const states = replayContextDirections(times, curves);
  const all = [...curves.bias, ...curves.slope];
  const result: MultipleBreakEvent[] = [];
  let episode: { time: string; direction: "up" | "down"; seen: Set<number> } | null = null;
  for (let index = 1; index < times.length; index++) {
    const previous = states[index - 1], current = states[index];
    let initial = false;
    if (!episode && previous.consecutive >= 3 && (previous.direction === "up" || previous.direction === "down") && current.direction !== previous.direction) {
      episode = { time: times[index], direction: previous.direction, seen: new Set() };
      initial = true;
    }
    if (!episode) continue;
    const side = episode.direction === "up" ? 1 : -1;
    const changes = all.map((curve) => curve[index] == null || curve[index - 1] == null ? null : Math.sign(curve[index]! - curve[index - 1]!));
    if (changes.some((value) => value === null)) { episode = null; continue; }
    const reversed = changes.filter((value) => value === -side).length;
    const flat = changes.filter((value) => value === 0).length;
    const event = { index, time: times[index], episode: episode.time, previousDirection: episode.direction,
      reversed, flat, unchanged: 6 - reversed - flat };
    if (initial) result.push({ ...event, mode: "initial" });
    if (reversed > 0 && !episode.seen.has(reversed)) {
      result.push({ ...event, mode: "stage-first" });
      episode.seen.add(reversed);
    }
    if (current.consecutive >= 3) episode = null;
  }
  return result;
}

/** Illustrative long/cash policies; close decisions always execute next open. */
export function comparePolicies(bars: readonly MarketBar[], states: ContextObservation[], events: readonly Pick<BreakEvent, "index">[], costBps = 5) {
  const breakIndexes = new Set(events.map((event) => event.index));
  return (["retain-confirmation", "exit-on-single-break"] as const).map((policy) => {
    let cash = 1, shares = 0, pending = false, suspended = false, peak = 1, drawdown = 0, trades = 0;
    const equity: number[] = [];
    for (let index = 0; index < bars.length; index++) {
      const bar = bars[index];
      if (!Number.isFinite(bar.open) || bar.open <= 0) throw new Error("Policy comparison requires positive opens");
      if (pending && !shares) { shares = cash / (bar.open * (1 + costBps / 10000)); cash = 0; trades++; }
      else if (!pending && shares) { cash = shares * bar.open * (1 - costBps / 10000); shares = 0; trades++; }
      const current = cash + shares * bar.close;
      equity.push(current);
      peak = Math.max(peak, current);
      drawdown = Math.min(drawdown, (current / peak - 1) * 100);
      const row = states[index];
      if (policy === "exit-on-single-break") {
        if (breakIndexes.has(index)) suspended = true;
        if (row.direction === "up" && row.consecutive >= 3) suspended = false;
      }
      pending = row.confirmed === "up" && !suspended;
    }
    return { policy, costBps, totalReturn: ((equity.at(-1) ?? 1) - 1) * 100, maxDrawdown: drawdown, trades, equity };
  });
}
