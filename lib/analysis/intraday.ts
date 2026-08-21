import type { MarketBar } from "@/lib/market/types";

export const MIN_INTRADAY_SCREENING_SESSIONS = 5;
export const DEFAULT_INTRADAY_ENTRY_CUTOFF_BARS = 5;

export interface IntradaySessionMetadata {
  sessionKey: string;
  isFirst: boolean;
  isLast: boolean;
  barsRemaining: number;
}

function normalizeTime(value: string): string {
  return value.replace("T", " ");
}

export function intradaySessionKey(bar: MarketBar): string {
  return normalizeTime(bar.time).slice(0, 10);
}

export function buildIntradaySessionMetadata(
  bars: readonly MarketBar[],
): IntradaySessionMetadata[] {
  const metadata = bars.map((bar) => ({
    sessionKey: intradaySessionKey(bar),
    isFirst: false,
    isLast: false,
    barsRemaining: 0,
  }));

  for (let index = 0; index < metadata.length; index += 1) {
    metadata[index]!.isFirst =
      index === 0 ||
      metadata[index - 1]!.sessionKey !== metadata[index]!.sessionKey;
  }
  for (let index = metadata.length - 1; index >= 0; index -= 1) {
    const next = metadata[index + 1];
    const current = metadata[index]!;
    current.isLast = !next || next.sessionKey !== current.sessionKey;
    current.barsRemaining = current.isLast
      ? 0
      : next!.barsRemaining + 1;
  }

  return metadata;
}

export function countIntradayTradingSessions(
  bars: readonly MarketBar[],
  startTime?: string,
  endTime?: string,
): number {
  const start = startTime ? normalizeTime(startTime) : "";
  const end = endTime ? normalizeTime(endTime) : "";
  return new Set(
    bars
      .filter((bar) => {
        const time = normalizeTime(bar.time);
        return (!start || time >= start) && (!end || time <= end);
      })
      .map(intradaySessionKey),
  ).size;
}

export function hasIntradayScreeningEvidence(
  bars: readonly MarketBar[],
  startTime?: string,
  endTime?: string,
): boolean {
  return (
    countIntradayTradingSessions(bars, startTime, endTime) >=
    MIN_INTRADAY_SCREENING_SESSIONS
  );
}
