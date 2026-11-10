import type { MarketBar } from "../market/types";
import { sma, ema, wma, atr, rsi } from "./indicators";

export const MIXED_POSITION_OVERLAY_MODEL = "ema7-sma11-wma14-v1" as const;
export const PREVIOUS_POSITION_OVERLAY_MODEL = "ema7-sma11-wma7-v2" as const;
export const HOLD5_POSITION_OVERLAY_MODEL = "ema7-sma11-wma7-hold5-v3" as const;
export const FIXED_HOLD5_POSITION_OVERLAY_MODEL = "ema7-sma11-wma7-sma20-hold5-stop4-v4" as const;
export const ENGULF_POSITION_OVERLAY_MODEL = "ema7-sma11-wma7-sma20-hold7-stop4-engulf5-v5" as const;
export const REBOUND_POSITION_OVERLAY_MODEL = "ema7-sma11-wma7-sma20-hold7-stop4-engulf5-rebound4-ema3-v6" as const;
export const ATR_POSITION_OVERLAY_MODEL = "ema7-sma11-wma7-sma20-hold7-stop4-engulf5-rebound4-ema3-atr2-v7" as const;
export const RSI_SHAPE_POSITION_OVERLAY_MODEL = "ema7-sma11-wma7-sma20-hold7-stop4-engulf5-rebound4-ema3-atr2-rsi7-shape9-rsi10-v8" as const;
export const BIAS_ADD_POSITION_OVERLAY_MODEL = "ema7-sma11-wma7-sma20-hold7-stop4-engulf5-rebound4-ema3-atr2-rsi7-shape9-rsi10-bias20s3down3-v9" as const;
export const RANGE_POSITION_OVERLAY_MODEL = "ema7-sma11-wma7-sma20-hold7-stop4-engulf5-rebound4-ema3-atr2-rsi7-shape9-rsi10-bias20s3down3-range3-v10" as const;
export const CURRENT_POSITION_OVERLAY_MODEL = "ema7-sma11-wma7-sma20-hold7-stop4-engulf5-rebound4-ema3-atr2-rsi7-shape9-rsi10-bias20s3down3-range3-sameclose-v11" as const;
export const ORDINARY_EXIT_RANGE_FRACTION = 0.03;
export const SUPPLEMENTAL_MINIMUM_HOLD_BARS = 7;
export const EARLY_POSITION_STOP_BARS = 5;
export const EARLY_POSITION_STOP_FRACTION = 0.04;
export const POST_STOP_WAIT_BARS = 5;
export const REBOUND_LOOKBACK_BARS = 10;
export const REBOUND_DECLINE_FRACTION = 0.05;
export const REBOUND_ENTRY_FRACTION = 0.04;
export const POSITION_OVERLAY_MODELS = [MIXED_POSITION_OVERLAY_MODEL, PREVIOUS_POSITION_OVERLAY_MODEL,
  HOLD5_POSITION_OVERLAY_MODEL, FIXED_HOLD5_POSITION_OVERLAY_MODEL, ENGULF_POSITION_OVERLAY_MODEL, REBOUND_POSITION_OVERLAY_MODEL,
  ATR_POSITION_OVERLAY_MODEL, RSI_SHAPE_POSITION_OVERLAY_MODEL, BIAS_ADD_POSITION_OVERLAY_MODEL, RANGE_POSITION_OVERLAY_MODEL, CURRENT_POSITION_OVERLAY_MODEL] as const;

export interface SmaPositionOverlayOptions {
  model?: (typeof POSITION_OVERLAY_MODELS)[number];
  supplementalEntry?: boolean;
  exitGuard?: boolean;
  entrySlopeGate?: boolean;
}

export const DEFAULT_POSITION_OVERLAY_OPTIONS: Readonly<SmaPositionOverlayOptions> = Object.freeze({
  model: CURRENT_POSITION_OVERLAY_MODEL, supplementalEntry: true, exitGuard: true, entrySlopeGate: true,
});
export const ENGULF_POSITION_OVERLAY_OPTIONS: Readonly<SmaPositionOverlayOptions> = Object.freeze({
  ...DEFAULT_POSITION_OVERLAY_OPTIONS, model: ENGULF_POSITION_OVERLAY_MODEL,
});
export const REBOUND_POSITION_OVERLAY_OPTIONS: Readonly<SmaPositionOverlayOptions> = Object.freeze({
  ...DEFAULT_POSITION_OVERLAY_OPTIONS, model: REBOUND_POSITION_OVERLAY_MODEL,
});
export const ATR_POSITION_OVERLAY_OPTIONS: Readonly<SmaPositionOverlayOptions> = Object.freeze({
  ...DEFAULT_POSITION_OVERLAY_OPTIONS, model: ATR_POSITION_OVERLAY_MODEL,
});
export const RSI_SHAPE_POSITION_OVERLAY_OPTIONS: Readonly<SmaPositionOverlayOptions> = Object.freeze({
  ...DEFAULT_POSITION_OVERLAY_OPTIONS, model: RSI_SHAPE_POSITION_OVERLAY_MODEL,
});
export const BIAS_ADD_POSITION_OVERLAY_OPTIONS: Readonly<SmaPositionOverlayOptions> = Object.freeze({
  ...DEFAULT_POSITION_OVERLAY_OPTIONS, model: BIAS_ADD_POSITION_OVERLAY_MODEL,
});
export const RANGE_POSITION_OVERLAY_OPTIONS: Readonly<SmaPositionOverlayOptions> = Object.freeze({
  ...DEFAULT_POSITION_OVERLAY_OPTIONS, model: RANGE_POSITION_OVERLAY_MODEL,
});

function hasReboundEntry(model: SmaPositionOverlayOptions["model"]): boolean {
  return model === CURRENT_POSITION_OVERLAY_MODEL || model === RANGE_POSITION_OVERLAY_MODEL || model === BIAS_ADD_POSITION_OVERLAY_MODEL || model === RSI_SHAPE_POSITION_OVERLAY_MODEL || model === ATR_POSITION_OVERLAY_MODEL || model === REBOUND_POSITION_OVERLAY_MODEL;
}
function hasAtrExit(model: SmaPositionOverlayOptions["model"]): boolean {
  return model === CURRENT_POSITION_OVERLAY_MODEL || model === RANGE_POSITION_OVERLAY_MODEL || model === BIAS_ADD_POSITION_OVERLAY_MODEL || model === RSI_SHAPE_POSITION_OVERLAY_MODEL || model === ATR_POSITION_OVERLAY_MODEL;
}

function isFixedPolicy(model: SmaPositionOverlayOptions["model"]): boolean {
  return hasReboundEntry(model) || model === ENGULF_POSITION_OVERLAY_MODEL || model === FIXED_HOLD5_POSITION_OVERLAY_MODEL;
}

export function normalizeSmaPositionOverlay(value?: SmaPositionOverlayOptions | null): SmaPositionOverlayOptions | undefined {
  if (value && isFixedPolicy(value.model))
    return { ...DEFAULT_POSITION_OVERLAY_OPTIONS, model: value.model };
  if (!value?.supplementalEntry && !value?.exitGuard && !value?.entrySlopeGate) return undefined;
  return { ...(value.model ? { model: value.model } : {}),
    ...(value.supplementalEntry ? { supplementalEntry: true } : {}),
    ...(value.exitGuard ? { exitGuard: true } : {}),
    ...(value.entrySlopeGate ? { entrySlopeGate: true } : {}) };
}

interface Features {
  turns: boolean[]; protected: boolean[]; entryAllowed: boolean[];
  policy?: { closes: number[]; supplementalAllowed: boolean[]; wmaNegative: boolean[]; recoveryAllowed: boolean[];
    reversalEntry: boolean[]; reboundAllowed: boolean[]; shockExit: boolean[];
    shapeEntry: boolean[]; shapeExit: boolean[]; holdingAddBlocked: boolean[] };
}
const featuresByBars = new WeakMap<MarketBar[], Map<string, Features>>();
function features(bars: MarketBar[], model?: SmaPositionOverlayOptions["model"]): Features {
  let byModel = featuresByBars.get(bars);
  if (!byModel) { byModel = new Map(); featuresByBars.set(bars, byModel); }
  const key = model ?? "legacy-sma12-sma12-sma11";
  const cached = byModel.get(key);
  if (cached) return cached;
  if (model !== undefined) {
    const current = model !== MIXED_POSITION_OVERLAY_MODEL;
    const closes = bars.map(bar => bar.close), entry = ema(closes, 7), exit = sma(closes, 11), gate = wma(closes, current ? 7 : 14);
    const result: Features = {
      turns: entry.map((value, i) => value != null && entry[i - 1] != null && entry[i - 2] != null &&
        value > entry[i - 1]! && entry[i - 1]! <= entry[i - 2]!),
      protected: exit.map((value, i) => value != null && exit[i - 1] != null && exit[i - 1]! > 0 && value / exit[i - 1]! - 1 > (current ? 0.00075 : 0.00125)),
      entryAllowed: gate.map((value, i) => value != null && gate[i - 1] != null && value >= gate[i - 1]!),
    };
    if (isFixedPolicy(model)) {
      const average20 = sma(closes, 20);
      const volatility = hasAtrExit(model) ? atr(bars, 14) : [];
      const shapePolicy = model === CURRENT_POSITION_OVERLAY_MODEL || model === RANGE_POSITION_OVERLAY_MODEL || model === BIAS_ADD_POSITION_OVERLAY_MODEL || model === RSI_SHAPE_POSITION_OVERLAY_MODEL;
      const bias20 = average20.map((value, index) => value === null ? null : (closes[index]! / value - 1) * 100);
      const smoothBias20 = bias20.map((value, index) => value === null || bias20[index - 1] == null || bias20[index - 2] == null
        ? null : (bias20[index - 2]! + bias20[index - 1]! + value) / 3);
      const entryStrength = shapePolicy ? rsi(closes, 7) : [];
      const exitStrength = shapePolicy ? rsi(closes, 10) : [];
      result.policy = { closes,
        holdingAddBlocked: smoothBias20.map((value, index) => (model === CURRENT_POSITION_OVERLAY_MODEL || model === RANGE_POSITION_OVERLAY_MODEL || model === BIAS_ADD_POSITION_OVERLAY_MODEL) && value !== null &&
          smoothBias20[index - 1] != null && smoothBias20[index - 2] != null && smoothBias20[index - 3] != null &&
          value < smoothBias20[index - 1]! && smoothBias20[index - 1]! < smoothBias20[index - 2]! &&
          smoothBias20[index - 2]! < smoothBias20[index - 3]!),
        shockExit: closes.map((close, index) => hasAtrExit(model) && entry[index] != null &&
          close < entry[index]! && volatility[index - 1] != null && volatility[index - 1]! > 0 &&
          closes[index - 1]! - close >= 2 * volatility[index - 1]!),
        shapeEntry: bars.map((bar, index) => {
          if (!shapePolicy || index < 1 || entryStrength[index] == null || entryStrength[index - 1] == null ||
            entryStrength[index]! <= entryStrength[index - 1]! || bar.low <= bars[index - 1]!.low ||
            bar.close <= bars[index - 1]!.high ||
            !entryStrength.slice(Math.max(0, index - 5), index).some((value) => value != null && value <= 25)) return false;
          let lowIndex = Math.max(0, index - 10);
          for (let cursor = lowIndex + 1; cursor < index; cursor += 1)
            if (closes[cursor]! <= closes[lowIndex]!) lowIndex = cursor;
          let peak = 0;
          for (let cursor = Math.max(0, lowIndex - 10); cursor < lowIndex; cursor += 1)
            peak = Math.max(peak, closes[cursor]!);
          return peak > 0 && closes[lowIndex]! > 0 && 1 - closes[lowIndex]! / peak + 1e-12 >= 0.09;
        }),
        shapeExit: bars.map((bar, index) => shapePolicy && index >= 3 && exitStrength[index] != null &&
          exitStrength[index]! < 35 && bars[index - 3]!.high > bars[index - 2]!.high &&
          bars[index - 2]!.high > bars[index - 1]!.high && bars[index - 1]!.high > bar.high),
        supplementalAllowed: closes.map((close, i) => average20[i] != null && close > average20[i]!),
        wmaNegative: gate.map((value, i) => value != null && gate[i - 1] != null && value < gate[i - 1]!),
        recoveryAllowed: entry.map((value, i) => value != null && entry[i - 1] != null && value > entry[i - 1]! &&
          gate[i] != null && gate[i - 1] != null && gate[i]! > gate[i - 1]! && closes[i]! > value),
        reboundAllowed: entry.map((value, index) => hasReboundEntry(model) && value != null &&
          entry[index - 1] != null && entry[index - 2] != null && entry[index - 3] != null &&
          value > entry[index - 1]! && entry[index - 1]! > entry[index - 2]! && entry[index - 2]! > entry[index - 3]! &&
          average20[index] != null && closes[index]! <= average20[index]!),
        reversalEntry: bars.map((bar, i) => {
          if (model === FIXED_HOLD5_POSITION_OVERLAY_MODEL || i < 11) return false;
          let lowIndex = i;
          for (let n = i - 4; n <= i; n++) if (bars[n]!.open <= bars[lowIndex]!.open) lowIndex = n;
          const low = bars[lowIndex]!.open;
          let peak = 0;
          for (let n = Math.max(0, lowIndex - 10); n < lowIndex; n++) peak = Math.max(peak, closes[n]!);
          const previous = bars[i - 1]!;
          return low > 0 && peak > 0 && 1 - low / peak >= 0.05 && previous.close < previous.open &&
            bar.open <= previous.close && bar.close > previous.open && bar.close > bar.open;
        }),
      };
    }
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

export interface SmaPositionOverlayState {
  allocation: number;
  pending: number | null;
  lastSupplement: number | null;
  flatStart: number | null;
  previousCloseAllocation: number;
  entryIndex: number | null;
  entryClose: number;
  recoveryTarget: number | null;
  stoppedAt: number;
  blockedUntil: number;
  lastClosedIndex: number;
  lastIncreaseRequestIndex: number;
  rangeEpisode?: PositionRangeEpisode | null;
  rangeRequestStart?: SmaPositionOverlayState;
  rangeRequestIndex?: number;
  rangePartialAllocation?: number;
}

export interface PositionRangeEpisode { index: number; cost: number; high: number; low: number; includeEntryBar: boolean }

/** One inherited account; callers retain their own execution timing and prices. */
export class SmaPositionOverlay {
  allocation: number;
  private pending: number | null = null;
  private lastSupplement: number | null = null;
  private readonly fixedPolicy: boolean;
  private readonly closes: number[];
  private readonly supplementalAllowed: boolean[];
  private readonly wmaNegative: boolean[];
  private readonly recoveryAllowed: boolean[];
  private readonly reversalEntry: boolean[];
  private readonly reboundAllowed: boolean[];
  private flatStart: number | null = null;
  private readonly minimumHoldBars: number;
  private previousCloseAllocation: number;
  private entryIndex: number | null = null;
  private entryClose = 0;
  private recoveryTarget: number | null = null;
  private stoppedAt = -1;
  private blockedUntil = 0;
  private lastClosedIndex = -1;
  private lastIncreaseRequestIndex = -1;
  private readonly features: Features;
  private rangeEpisode: PositionRangeEpisode | null = null;
  private rangeRequestStart: SmaPositionOverlayState | null = null;
  private rangeRequestIndex = -1;
  private rangePartialAllocation: number | null = null;
  constructor(private readonly bars: MarketBar[], private readonly options: SmaPositionOverlayOptions, initialAllocation = 0,
    private readonly holdingAddDecisionLag: 0 | 1 = 0) {
    this.options = normalizeSmaPositionOverlay(options) ?? options;
    this.features = features(bars, options.model);
    this.allocation = initialAllocation;
    this.previousCloseAllocation = initialAllocation;
    this.fixedPolicy = isFixedPolicy(options.model);
    this.minimumHoldBars = hasReboundEntry(options.model) || options.model === ENGULF_POSITION_OVERLAY_MODEL
      ? SUPPLEMENTAL_MINIMUM_HOLD_BARS : 5;
    this.closes = this.features.policy?.closes ?? [];
    this.supplementalAllowed = this.features.policy?.supplementalAllowed ?? [];
    this.wmaNegative = this.features.policy?.wmaNegative ?? [];
    this.recoveryAllowed = this.features.policy?.recoveryAllowed ?? [];
    this.reversalEntry = this.features.policy?.reversalEntry ?? [];
    this.reboundAllowed = this.features.policy?.reboundAllowed ?? [];
  }
  checkpoint(): SmaPositionOverlayState {
    return {
      allocation: this.allocation,
      pending: this.pending,
      lastSupplement: this.lastSupplement,
      flatStart: this.flatStart,
      previousCloseAllocation: this.previousCloseAllocation,
      entryIndex: this.entryIndex,
      entryClose: this.entryClose,
      recoveryTarget: this.recoveryTarget,
      stoppedAt: this.stoppedAt,
      blockedUntil: this.blockedUntil,
      lastClosedIndex: this.lastClosedIndex,
      lastIncreaseRequestIndex: this.lastIncreaseRequestIndex,
      ...(this.rangeEnabled ? { rangeEpisode: this.rangeEpisode ? { ...this.rangeEpisode } : null,
        ...(this.rangeRequestStart ? { rangeRequestStart: structuredClone(this.rangeRequestStart), rangeRequestIndex: this.rangeRequestIndex,
          ...(this.rangePartialAllocation !== null ? { rangePartialAllocation: this.rangePartialAllocation } : {}) } : {}) } : {}),
    };
  }

  restore(state: SmaPositionOverlayState): void {
    if (this.rangeEnabled && state.rangeEpisode === undefined) throw new Error("Range-protected account checkpoint is incomplete; replay the saved selections to restore this account");
    if (this.rangeEnabled) {
      const episode = state.rangeEpisode;
      if (episode && (!Number.isInteger(episode.index) || episode.index < 0 || episode.index >= this.bars.length ||
        ![episode.cost, episode.high, episode.low].every(Number.isFinite) || episode.cost <= 0 || episode.low <= 0 ||
        episode.high < episode.low || typeof episode.includeEntryBar !== "boolean")) throw new Error("Invalid range-protection checkpoint episode");
      if (state.rangeRequestStart && (state.rangeRequestStart.rangeRequestStart !== undefined ||
        !Number.isInteger(state.rangeRequestIndex) || state.rangeRequestIndex! < 0 || state.rangeRequestIndex! >= this.bars.length))
        throw new Error("Invalid range-protection checkpoint request");
      if (state.rangePartialAllocation !== undefined && (!Number.isFinite(state.rangePartialAllocation) ||
        state.rangePartialAllocation <= 0 || state.rangePartialAllocation > 1)) throw new Error("Invalid range-protection checkpoint partial allocation");
    }
    this.allocation = state.allocation;
    this.pending = state.pending;
    this.lastSupplement = state.lastSupplement;
    this.flatStart = state.flatStart;
    this.previousCloseAllocation = state.previousCloseAllocation;
    this.entryIndex = state.entryIndex;
    this.entryClose = state.entryClose;
    this.recoveryTarget = state.recoveryTarget;
    this.stoppedAt = state.stoppedAt;
    this.blockedUntil = state.blockedUntil;
    this.lastClosedIndex = state.lastClosedIndex;
    this.lastIncreaseRequestIndex = state.lastIncreaseRequestIndex;
    this.rangeEpisode = state.rangeEpisode ? { ...state.rangeEpisode } : null;
    this.rangeRequestStart = state.rangeRequestStart ? structuredClone(state.rangeRequestStart) : null;
    this.rangeRequestIndex = state.rangeRequestIndex ?? -1;
    this.rangePartialAllocation = state.rangePartialAllocation ?? null;
  }

  private get rangeEnabled(): boolean { return this.options.model === CURRENT_POSITION_OVERLAY_MODEL || this.options.model === RANGE_POSITION_OVERLAY_MODEL; }

  /** Execution callers provide real fills; adds/partial sells never reset an episode. */
  recordExecution(index: number, previousUnits: number, units: number, fillPrice: number, commission: number, atOpen = false): void {
    if (!this.rangeEnabled) return;
    if (!Number.isInteger(index) || !this.bars[index] || !Number.isFinite(fillPrice) || fillPrice <= 0 || !Number.isFinite(commission) || commission < 0 ||
      !Number.isFinite(previousUnits) || !Number.isFinite(units) || previousUnits < 0 || units < 0)
      throw new Error("Invalid range-protection execution context");
    if (previousUnits <= 1e-10 && units > 1e-10) this.rangeEpisode = {
      index, cost: fillPrice * (1 + commission), high: fillPrice, low: fillPrice, includeEntryBar: atOpen,
    };
    if (previousUnits > 1e-10 && units <= 1e-10) this.rangeEpisode = null;
  }

  private beginRangeDay(index: number): void {
    if (!this.rangeEnabled || this.rangeRequestIndex === index && this.rangeRequestStart) return;
    if (this.rangeEpisode && (index > this.rangeEpisode.index || index === this.rangeEpisode.index && this.rangeEpisode.includeEntryBar)) {
      this.rangeEpisode.high = Math.max(this.rangeEpisode.high, this.bars[index].high);
      this.rangeEpisode.low = Math.min(this.rangeEpisode.low, this.bars[index].low);
    }
    this.rangeRequestStart = null;
    this.rangePartialAllocation = null;
    this.rangeRequestStart = this.checkpoint(); this.rangeRequestIndex = index;
  }

  private rangeBlocksExit(before: SmaPositionOverlayState, index: number): boolean {
    if (!this.rangeEnabled || !this.bars[index] || before.allocation <= 1e-10 || this.allocation > 1e-10 || !this.rangeEpisode) return false;
    const early = before.entryIndex !== null && index - before.entryIndex <= EARLY_POSITION_STOP_BARS && before.entryClose > 0 &&
      this.bars[index].close <= before.entryClose * (1 - EARLY_POSITION_STOP_FRACTION);
    if (this.stoppedAt === index || early || this.features.policy?.shockExit[index]) return false;
    return (this.rangeEpisode.high - this.rangeEpisode.low) / this.rangeEpisode.cost < ORDINARY_EXIT_RANGE_FRACTION - 1e-12;
  }

  private retainRangePosition(before: SmaPositionOverlayState, index: number, closed: boolean): void {
    const lastRequest = this.lastIncreaseRequestIndex;
    const partial = this.rangePartialAllocation;
    this.restore(before); this.pending = 0; this.flatStart = null;
    if (closed) {
      this.allocation = Math.min(before.allocation, partial ?? before.allocation);
      this.previousCloseAllocation = this.allocation; this.lastClosedIndex = index;
    }
    this.lastIncreaseRequestIndex = lastRequest;
  }

  request(direction: "increase" | "reduce", target: number, completedIndex: number): number {
    const priorCloseOrder = this.rangeEnabled && completedIndex <= this.lastClosedIndex;
    if (this.rangeEnabled && !priorCloseOrder) this.beginRangeDay(completedIndex);
    const before = priorCloseOrder ? this.checkpoint() : null;
    this.requestNative(direction, target, completedIndex);
    if (this.rangeRequestStart && direction === "increase") this.rangePartialAllocation = null;
    if (this.rangeRequestStart && direction === "reduce" && target > 1e-10 && this.allocation > 1e-10 &&
      this.allocation < this.rangeRequestStart.allocation - 1e-10)
      this.rangePartialAllocation = Math.min(this.rangePartialAllocation ?? this.rangeRequestStart.allocation, this.allocation);
    if (before && this.rangeBlocksExit(before, completedIndex)) this.retainRangePosition(before, completedIndex, false);
    return this.allocation;
  }
  private requestNative(direction: "increase" | "reduce", target: number, completedIndex: number): number {
    target = Math.min(1, Math.max(0, target));
    if (direction === "increase") {
      this.lastIncreaseRequestIndex = completedIndex;
      this.pending = null;
      if (this.fixedPolicy && this.allocation <= 1e-10 && completedIndex < this.blockedUntil) return this.allocation;
      const holdingAddBlocked = this.allocation > 1e-10 &&
        this.features.policy?.holdingAddBlocked[completedIndex - (this.options.model === CURRENT_POSITION_OVERLAY_MODEL ? 0 : this.holdingAddDecisionLag)] === true;
      if (!holdingAddBlocked && (this.allocation > 1e-10 || this.entryAllowed(completedIndex))) this.allocation = Math.max(this.allocation, target);
    } else if (target < this.allocation - 1e-10) {
      this.pending = Math.min(this.pending ?? this.allocation, target);
    }
    return this.release(completedIndex);
  }
  private entryAllowed(index: number): boolean {
    return !this.options.entrySlopeGate || this.features.entryAllowed[index] === true;
  }
  private release(completedIndex: number): number {
    const holdProtected = (this.options.model === HOLD5_POSITION_OVERLAY_MODEL || this.fixedPolicy) && this.lastSupplement !== null &&
      completedIndex - this.lastSupplement < this.minimumHoldBars;
    const trendProtected = this.fixedPolicy && this.wmaNegative[completedIndex] !== true;
    if (this.pending !== null && !holdProtected && !trendProtected && !(this.options.exitGuard && this.features.protected[completedIndex])) {
      this.allocation = Math.min(this.allocation, this.pending);
      this.pending = null;
    }
    if (this.allocation <= 1e-10) this.lastSupplement = null;
    return this.allocation;
  }
  close(index: number, hasOriginalSignal: boolean, originalIncrease = false): number {
    if (!this.rangeEnabled) return this.closeNative(index, hasOriginalSignal, originalIncrease);
    if (this.lastClosedIndex === index) return this.allocation;
    this.beginRangeDay(index);
    const before = this.rangeRequestStart!;
    this.closeNative(index, hasOriginalSignal, originalIncrease);
    if (this.rangeBlocksExit(before, index)) this.retainRangePosition(before, index, true);
    this.rangeRequestStart = null; this.rangeRequestIndex = -1;
    this.rangePartialAllocation = null;
    return this.allocation;
  }
  private closeNative(index: number, hasOriginalSignal: boolean, originalIncrease = false): number {
    if (this.fixedPolicy && this.lastClosedIndex === index) return this.allocation;
    if (this.flatStart === null && this.previousCloseAllocation <= 1e-10) this.flatStart = index;
    if (this.fixedPolicy && this.previousCloseAllocation <= 1e-10 && index < this.blockedUntil) {
      this.allocation = 0; this.pending = null; this.lastSupplement = null; this.lastClosedIndex = index;
      return 0;
    }
    const shapeEntryEligible = this.options.supplementalEntry && this.previousCloseAllocation <= 1e-10 &&
      !hasOriginalSignal && this.pending === null && index >= this.blockedUntil && this.entryAllowed(index) &&
      this.features.policy?.shapeEntry[index] === true;
    if (this.previousCloseAllocation > 1e-10 && this.features.policy?.shapeExit[index] &&
      !originalIncrease && this.lastIncreaseRequestIndex !== index) {
      this.request("reduce", 0, index);
      hasOriginalSignal = true;
    }
    const wasFlat = this.allocation <= 1e-10;
    this.release(index);
    if (this.options.supplementalEntry && this.allocation <= 1e-10 && !hasOriginalSignal && this.features.turns[index] && this.entryAllowed(index) &&
      (!this.fixedPolicy || this.supplementalAllowed[index])) {
      this.allocation = 1;
      this.pending = null;
      if (wasFlat && (this.options.model === HOLD5_POSITION_OVERLAY_MODEL || this.fixedPolicy)) this.lastSupplement = index;
    }
    if (this.options.supplementalEntry && this.allocation <= 1e-10 && !hasOriginalSignal && this.reversalEntry[index]) {
      this.allocation = 1; this.pending = null; this.lastSupplement = index;
    }
    if (this.options.supplementalEntry && wasFlat && this.allocation <= 1e-10 && !hasOriginalSignal &&
      this.pending === null && index >= this.blockedUntil && this.entryAllowed(index) && this.reboundAllowed[index] &&
      !(this.recoveryTarget !== null && index > this.stoppedAt && this.recoveryAllowed[index]) && this.reboundReady(index)) {
      this.allocation = 1; this.lastSupplement = index;
    }
    if (this.fixedPolicy) this.finishPolicyBar(index, hasOriginalSignal);
    if (shapeEntryEligible && this.allocation <= 1e-10 && this.pending === null) {
      this.allocation = 1; this.pending = null; this.lastSupplement = index;
      this.entryIndex = index; this.entryClose = this.closes[index]!; this.recoveryTarget = null;
      this.flatStart = null; this.previousCloseAllocation = 1;
    }
    return this.allocation;
  }

  private reboundReady(index: number): boolean {
    if (this.flatStart === null) return false;
    const from = Math.max(0, this.flatStart, index - REBOUND_LOOKBACK_BARS);
    if (from >= index) return false;
    let lowIndex = from;
    for (let cursor = from + 1; cursor < index; cursor++)
      if (this.closes[cursor]! <= this.closes[lowIndex]!) lowIndex = cursor;
    if (lowIndex === 0) return false;
    let peak = 0;
    for (let cursor = Math.max(0, lowIndex - REBOUND_LOOKBACK_BARS); cursor < lowIndex; cursor++)
      peak = Math.max(peak, this.closes[cursor]!);
    const low = this.closes[lowIndex]!;
    return low > 0 && peak > 0 && 1 - low / peak >= REBOUND_DECLINE_FRACTION &&
      this.closes[index]! / low - 1 >= REBOUND_ENTRY_FRACTION;
  }

  private finishPolicyBar(index: number, hasOriginalSignal: boolean): void {
    const before = this.previousCloseAllocation, close = this.closes[index]!;
    if (before <= 1e-10 && this.allocation > 1e-10) {
      this.entryIndex = index; this.entryClose = close; this.recoveryTarget = null;
    } else if (before > 1e-10 && this.allocation <= 1e-10) {
      this.entryIndex = null; this.entryClose = 0; this.recoveryTarget = null;
    }
    if (this.recoveryTarget !== null && index > this.stoppedAt && !hasOriginalSignal && this.recoveryAllowed[index]) {
      this.allocation = Math.max(this.allocation, this.recoveryTarget); this.pending = null;
      this.recoveryTarget = null; this.entryIndex = index; this.entryClose = close;
    }
    const age = this.entryIndex === null ? Infinity : index - this.entryIndex;
    if (before > 1e-10 && this.allocation > 1e-10 && age <= EARLY_POSITION_STOP_BARS && this.entryClose > 0 &&
      close <= this.entryClose * (1 - EARLY_POSITION_STOP_FRACTION)) {
      this.recoveryTarget = this.allocation; this.stoppedAt = index;
      this.blockedUntil = index + POST_STOP_WAIT_BARS + 1;
      this.allocation = 0; this.pending = null; this.lastSupplement = null; this.entryIndex = null;
    }
    if (before > 1e-10 && this.allocation > 1e-10 && this.features.policy?.shockExit[index]) {
      this.allocation = 0; this.pending = null; this.lastSupplement = null;
      this.entryIndex = null; this.entryClose = 0; this.recoveryTarget = null;
      this.stoppedAt = index; this.blockedUntil = Math.max(this.blockedUntil, index + 1);
    }
    if (this.allocation > 1e-10) this.flatStart = null;
    else if (before > 1e-10 || this.flatStart === null) this.flatStart = index;
    this.previousCloseAllocation = this.allocation; this.lastClosedIndex = index;
  }
}
