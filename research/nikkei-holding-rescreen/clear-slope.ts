import { ema, sma, wma } from "../../lib/analysis/indicators";
import type { SmaPositionOverlay } from "../../lib/analysis/sma-position-overlay";
import type { MarketBar } from "../../lib/market/types";

export const slopeModes = ["replace-sma", "replace-wma", "all-three", "two-of-three"] as const;
export type SlopeMode = typeof slopeModes[number];
export const slopeLines = ["ema7", "sma11", "wma7"] as const;
export type SlopeLine = typeof slopeLines[number];
export const slopeThresholds = [-0.075, 0, 0.075] as const;

export function slopeSeries(bars: MarketBar[]) {
  const prices = bars.map(bar => bar.close);
  function daily(values: ReturnType<typeof ema>) {
    return values.map((value, i) => value !== null && values[i - 1] != null && values[i - 1]! > 0
      ? 100 * (value / values[i - 1]! - 1) : null);
  }
  return { ema7: daily(ema(prices, 7)), sma11: daily(sma(prices, 11)), wma7: daily(wma(prices, 7)) };
}

export function allowsSlopeClear(mode: SlopeMode, smaAllows: boolean, wmaAllows: boolean, addedAllows: boolean) {
  if (mode === "replace-sma") return addedAllows && wmaAllows;
  if (mode === "replace-wma") return smaAllows && addedAllows;
  if (mode === "all-three") return smaAllows && wmaAllows && addedAllows;
  return Number(smaAllows) + Number(wmaAllows) + Number(addedAllows) >= 2;
}

/** Instance-only research hook. Shared cached indicators and the native release method remain unchanged. */
export function configureClearSlope(overlay: SmaPositionOverlay, mode: SlopeMode,
  slopes: (number | null)[], threshold: number) {
  const release = overlay["release"].bind(overlay);
  const originalFeatures = overlay["features"], originalWma = overlay["wmaNegative"];
  const protectedBySlope = slopes.map((value, i) => !allowsSlopeClear(
    mode, !originalFeatures.protected[i], originalWma[i] === true, value !== null && value < threshold,
  ));
  const alternate = { ...originalFeatures, protected: protectedBySlope };
  const passthrough = slopes.map(() => true);
  overlay["release"] = (index) => {
    const pending = overlay.checkpoint().pending;
    if (pending === null || pending > 1e-10) return release(index);
    Object.assign(overlay, { features: alternate, wmaNegative: passthrough });
    try { return release(index); }
    finally { Object.assign(overlay, { features: originalFeatures, wmaNegative: originalWma }); }
  };
}
