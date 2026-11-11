import { shouldScreenStrategyCycleAtIndex, strategyCycleTrendAngle } from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";

/** Evaluate against actual units before today's close, never a baseline holding mask. */
export function needsHoldingScreen(bars: MarketBar[], index: number, units: number): boolean {
  return !shouldScreenStrategyCycleAtIndex(bars, index) && units > 1e-10 &&
    (strategyCycleTrendAngle(bars, index) ?? 0) <= -30 && bars[index].close < bars[index].open;
}
