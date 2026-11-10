import { atr, ema, sma } from "../../lib/analysis/indicators";
import { RSI_SHAPE_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS, EARLY_POSITION_STOP_BARS, EARLY_POSITION_STOP_FRACTION, SmaPositionOverlay,
  type SmaPositionOverlayState } from "../../lib/analysis/sma-position-overlay";
import { strategyCycleSignalDirection, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";

export interface Policy {
  id: string; family: "baseline" | "regime" | "er-only" | "buffer";
  period: number; erCeiling: number; widthCeiling: number; confirmation: number;
  scope: "entry" | "both"; buffer: number;
}
export function policies(): Policy[] {
  const base: Policy = { id: "baseline", family: "baseline", period: 20, erCeiling: 0, widthCeiling: 0,
    confirmation: 1, scope: "both", buffer: 0 };
  const result = [base];
  for (const period of [10, 20, 30]) for (const erCeiling of [.15, .25, .35])
    for (const widthCeiling of [.2, .35, .5, 1]) for (const confirmation of [2, 3]) for (const scope of ["entry", "both"] as const) {
      const family = widthCeiling === 1 ? "er-only" : "regime";
      result.push({ ...base, id: `${family}-ER${period}-${erCeiling}-BW${widthCeiling}-D${confirmation}-${scope}`,
        family, period, erCeiling, widthCeiling, confirmation, scope });
    }
  for (const buffer of [.25, .5, 1, 1.5]) for (const scope of ["entry", "both"] as const)
    result.push({ ...base, id: `buffer-ATR${buffer}-${scope}`, family: "buffer", scope, buffer });
  return result;
}

export class Features {
  readonly atr: (number | null)[];
  readonly ema7: (number | null)[];
  readonly widthRank: (number | null)[];
  readonly er = new Map<number, (number | null)[]>();
  readonly high: (number | null)[];
  readonly low: (number | null)[];
  constructor(readonly bars: MarketBar[]) {
    if (bars.length > 10000 || bars.some((bar, i) => bar.close <= 0 || !Number.isFinite(bar.close) || (i > 0 && bar.time <= bars[i - 1].time))) throw new Error("Invalid or oversized bars");
    const closes = bars.map((bar) => bar.close), mean = sma(closes, 20);
    this.atr = atr(bars, 14); this.ema7 = ema(closes, 7);
    for (const period of [10, 20, 30]) this.er.set(period, closes.map((value, index) => {
      if (index < period) return null;
      let path = 0;
      for (let i = index - period + 1; i <= index; i++) path += Math.abs(closes[i] - closes[i - 1]);
      return path > 0 ? Math.abs(value - closes[index - period]) / path : 0;
    }));
    const width = closes.map((_, index) => {
      if (mean[index] === null) return null;
      let squares = 0;
      for (let i = index - 19; i <= index; i++) squares += (closes[i] - mean[index]!) ** 2;
      return 4 * Math.sqrt(squares / 20) / mean[index]!;
    });
    this.widthRank = width.map((value, index) => {
      const previous = width.slice(Math.max(0, index - 252), index);
      return value === null || previous.length !== 252 || previous.some((v) => v === null)
        ? null : previous.filter((v) => v! <= value).length / 252;
    });
    this.high = bars.map((_, i) => i < 20 ? null : Math.max(...bars.slice(i - 20, i).map((bar) => bar.high)));
    this.low = bars.map((_, i) => i < 20 ? null : Math.min(...bars.slice(i - 20, i).map((bar) => bar.low)));
  }
  regime(index: number, policy: Policy): boolean {
    const er = this.er.get(policy.period)?.[index];
    if (er == null || er > policy.erCeiling) return false;
    return policy.family === "er-only" || this.widthRank[index] != null && this.widthRank[index]! <= policy.widthCeiling;
  }
  hardRisk(index: number, before: SmaPositionOverlayState, after: SmaPositionOverlayState): boolean {
    if (before.allocation <= 1e-10) return false;
    if (after.stoppedAt === index) return true;
    const early = before.entryIndex !== null && index - before.entryIndex <= EARLY_POSITION_STOP_BARS && before.entryClose > 0 &&
      this.bars[index].close <= before.entryClose * (1 - EARLY_POSITION_STOP_FRACTION);
    const shock = this.ema7[index] != null && this.bars[index].close < this.ema7[index]! && this.atr[index - 1] != null &&
      this.bars[index - 1].close - this.bars[index].close >= 2 * this.atr[index - 1]!;
    return early || shock;
  }
}
interface Waiting { direction: "increase" | "reduce"; count: number; anchor: number; atr: number }
export interface Cursor { index: number; overlay: SmaPositionOverlayState; waiting: Waiting | null }
export interface Replay {
  targets: number[]; cursor: Cursor; blocked: number; risks: number; breakouts: number; regimeBars: number;
  events: { index: number; time: string; direction: string; wanted: number; actual: number; reason: string }[];
}
export function replay(features: Features, decisions: ReadonlyMap<number, StrategyCycleRecentSignal[]>, start: number,
  policy: Policy, until = features.bars.length, resume?: Replay): Replay {
  const bars = features.bars, controller = new SmaPositionOverlay(bars, DEFAULT_POSITION_OVERLAY_OPTIONS);
  if (start < 0 || until > bars.length || until < start) throw new Error("Invalid replay bounds");
  if (resume && (resume.targets.length !== bars.length || resume.cursor.index < start - 1 || resume.cursor.index >= until)) throw new Error("Invalid replay cursor");
  if (resume) controller.restore(resume.cursor.overlay);
  const targets = resume ? [...resume.targets] : bars.map(() => 0);
  let waiting = resume?.cursor.waiting ? { ...resume.cursor.waiting } : null;
  let blocked = resume?.blocked ?? 0, risks = resume?.risks ?? 0, breakouts = resume?.breakouts ?? 0, regimeBars = resume?.regimeBars ?? 0;
  const events = resume ? [...resume.events] : [];
  for (let index = resume ? resume.cursor.index + 1 : start; index < until; index++) {
    const before = controller.checkpoint(), signals = decisions.get(index) ?? [], original = strategyCycleSignalDirection(signals);
    if (original) controller.request(original, signals.at(-1)!.targetAllocation, index);
    const desired = controller.close(index, signals.length > 0), after = controller.checkpoint();
    const direction = desired > before.allocation + 1e-10 ? "increase" : desired < before.allocation - 1e-10 ? "reduce" : null;
    const regime = policy.family === "regime" || policy.family === "er-only" ? features.regime(index, policy) : false;
    if (regime) regimeBars++;
    const risk = direction === "reduce" && features.hardRisk(index, before, after);
    let allow = true, reason = "ordinary";
    if (risk) { risks++; reason = "risk"; waiting = null; }
    else if (policy.family !== "baseline" && direction && (direction === "increase" || policy.scope === "both")) {
      const needsFilter = policy.family === "buffer" || regime;
      if (needsFilter) {
        waiting = waiting?.direction === direction ? { ...waiting, count: waiting.count + 1 }
          : { direction, count: 1, anchor: bars[index].close, atr: features.atr[index - 1] ?? 0 };
        if (policy.family === "buffer") {
          allow = waiting.atr <= 0 || (bars[index].close - waiting.anchor) * (direction === "increase" ? 1 : -1) >= policy.buffer * waiting.atr;
          reason = "buffer";
        } else {
          const breakout = direction === "increase" ? features.high[index] !== null && bars[index].close > features.high[index]!
            : features.low[index] !== null && bars[index].close < features.low[index]!;
          allow = breakout || waiting.count >= policy.confirmation;
          if (breakout) breakouts++;
          reason = breakout ? "breakout" : "confirmation";
        }
      } else waiting = null;
    } else waiting = null;
    if (!allow && direction) {
      blocked++;
      controller.restore({ ...before, pending: direction === "reduce" ? Math.min(before.pending ?? before.allocation, desired)
        : original === "increase" ? null : before.pending,
        flatStart: before.allocation > 1e-10 ? null : before.flatStart ?? index,
        previousCloseAllocation: before.allocation, lastClosedIndex: index,
        lastIncreaseRequestIndex: after.lastIncreaseRequestIndex });
    } else if (direction) waiting = null;
    targets[index] = controller.allocation;
    if (direction) events.push({ index, time: bars[index].time, direction, wanted: desired,
      actual: controller.allocation, reason: allow ? reason : `blocked-${reason}` });
  }
  return { targets, blocked, risks, breakouts, regimeBars, events,
    cursor: { index: until - 1, overlay: controller.checkpoint(), waiting } };
}

export interface Segment { totalReturn: number; maxDrawdown: number; fills: number; turnover: number }
export interface Row { policy: Policy; train: Segment; validation: Segment; audit: Segment; full: Segment;
  targetHash: string; blocked: number; risks: number; breakouts: number; regimeBars: number }
export function select(rows: readonly Row[], family: Policy["family"]): Row {
  const base = rows.find((row) => row.policy.family === "baseline");
  if (!base) throw new Error("Missing baseline");
  const eligible = rows.filter((row) => row.policy.family === family &&
    row.train.fills <= base.train.fills * .9 && row.train.totalReturn >= base.train.totalReturn - 3 && row.train.maxDrawdown >= base.train.maxDrawdown - 3 &&
    row.validation.fills <= base.validation.fills * .9 && row.validation.totalReturn >= base.validation.totalReturn && row.validation.maxDrawdown >= base.validation.maxDrawdown - 2);
  return eligible.sort((a, b) => b.validation.totalReturn - a.validation.totalReturn || a.validation.fills - b.validation.fills || a.policy.id.localeCompare(b.policy.id))[0] ?? base;
}
