import type { MarketBar } from "../market/types";
import { sma, ema, wma } from "./indicators";

export const MIXED_POSITION_OVERLAY_MODEL = "ema7-sma11-wma14-v1" as const;

export interface SmaPositionOverlayOptions {
  model?: typeof MIXED_POSITION_OVERLAY_MODEL;
  supplementalEntry?: boolean;
  exitGuard?: boolean;
  entrySlopeGate?: boolean;
}

export function normalizeSmaPositionOverlay(value?: SmaPositionOverlayOptions | null): SmaPositionOverlayOptions | undefined {
  if (!value?.supplementalEntry && !value?.exitGuard && !value?.entrySlopeGate) return undefined;
  return { ...(value.model ? { model: value.model } : {}),
    ...(value.supplementalEntry ? { supplementalEntry: true } : {}),
    ...(value.exitGuard ? { exitGuard: true } : {}),
    ...(value.entrySlopeGate ? { entrySlopeGate: true } : {}) };
}

interface Features { turns: boolean[]; protected: boolean[]; entryAllowed: boolean[] }
const featuresByBars = new WeakMap<MarketBar[], Map<string, Features>>();
function features(bars: MarketBar[], model?: SmaPositionOverlayOptions["model"]): Features {
  let byModel = featuresByBars.get(bars);
  if (!byModel) { byModel = new Map(); featuresByBars.set(bars, byModel); }
  const key = model ?? "legacy-sma12-sma12-sma11";
  const cached = byModel.get(key);
  if (cached) return cached;
  if (model === MIXED_POSITION_OVERLAY_MODEL) {
    const closes = bars.map(bar => bar.close), entry = ema(closes, 7), exit = sma(closes, 11), gate = wma(closes, 14);
    const result = {
      turns: entry.map((value, i) => value != null && entry[i - 1] != null && entry[i - 2] != null &&
        value > entry[i - 1]! && entry[i - 1]! <= entry[i - 2]!),
      protected: exit.map((value, i) => value != null && exit[i - 1] != null && exit[i - 1]! > 0 && value / exit[i - 1]! - 1 > 0.00125),
      entryAllowed: gate.map((value, i) => value != null && gate[i - 1] != null && value >= gate[i - 1]!),
    };
    byModel.set(key, result);
    return result;
  }
  const closes = bars.map(bar => bar.close), average = sma(closes, 12);
  const result = {
    turns: closes.map((close, i) => i >= 13 && close > closes[i - 12]! && closes[i - 1]! <= closes[i - 13]!),
    protected: average.map((value, i) => value != null && average[i - 1] != null && average[i - 1]! > 0 && value / average[i - 1]! - 1 > 0.002),
    entryAllowed: closes.map((close, i) => i >= 11 && close >= closes[i - 11]!),
  };
  byModel.set(key, result);
  return result;
}

/** One inherited account; callers retain their own execution timing and prices. */
export class SmaPositionOverlay {
  allocation: number;
  private pending: number | null = null;
  private readonly features: Features;
  constructor(bars: MarketBar[], private readonly options: SmaPositionOverlayOptions, initialAllocation = 0) {
    this.features = features(bars, options.model);
    this.allocation = initialAllocation;
  }
  request(direction: "increase" | "reduce", target: number, completedIndex: number): number {
    target = Math.min(1, Math.max(0, target));
    if (direction === "increase") {
      this.pending = null;
      if (this.allocation > 1e-10 || this.entryAllowed(completedIndex)) this.allocation = Math.max(this.allocation, target);
    } else if (target < this.allocation - 1e-10) {
      this.pending = Math.min(this.pending ?? this.allocation, target);
    }
    return this.release(completedIndex);
  }
  private entryAllowed(index: number): boolean {
    return !this.options.entrySlopeGate || this.features.entryAllowed[index] === true;
  }
  private release(completedIndex: number): number {
    if (this.pending !== null && !(this.options.exitGuard && this.features.protected[completedIndex])) {
      this.allocation = Math.min(this.allocation, this.pending);
      this.pending = null;
    }
    return this.allocation;
  }
  close(index: number, hasOriginalSignal: boolean): number {
    this.release(index);
    if (this.options.supplementalEntry && this.allocation <= 1e-10 && !hasOriginalSignal && this.features.turns[index] && this.entryAllowed(index)) {
      this.allocation = 1;
      this.pending = null;
    }
    return this.allocation;
  }
}
