import type {
  MarketExchange,
  MarketInstrument,
  MarketLatestBarStatus,
} from "./types";

interface RegularMarketSession {
  timeZone: string;
  openMinute: number;
  closeMinute: number;
}

const REGULAR_MARKET_SESSION: Partial<
  Record<MarketExchange, RegularMarketSession>
> = {
  SSE: {
    timeZone: "Asia/Shanghai",
    openMinute: 9 * 60 + 30,
    closeMinute: 15 * 60,
  },
  SZSE: {
    timeZone: "Asia/Shanghai",
    openMinute: 9 * 60 + 30,
    closeMinute: 15 * 60,
  },
  JPX: {
    timeZone: "Asia/Tokyo",
    openMinute: 9 * 60,
    closeMinute: 15 * 60 + 30,
  },
  HKEX: {
    timeZone: "Asia/Hong_Kong",
    openMinute: 9 * 60 + 30,
    closeMinute: 16 * 60,
  },
  PHLX: {
    timeZone: "America/New_York",
    openMinute: 9 * 60 + 30,
    closeMinute: 16 * 60,
  },
  NYSE: {
    timeZone: "America/New_York",
    openMinute: 9 * 60 + 30,
    closeMinute: 16 * 60,
  },
  NYSE_ARCA: {
    timeZone: "America/New_York",
    openMinute: 9 * 60 + 30,
    closeMinute: 16 * 60,
  },
  NASDAQ: {
    timeZone: "America/New_York",
    openMinute: 9 * 60 + 30,
    closeMinute: 16 * 60,
  },
  XETRA: {
    timeZone: "Europe/Berlin",
    openMinute: 9 * 60,
    closeMinute: 17 * 60 + 30,
  },
  LSE: {
    timeZone: "Europe/London",
    openMinute: 8 * 60,
    closeMinute: 16 * 60 + 30,
  },
  EURONEXT: {
    timeZone: "Europe/Paris",
    openMinute: 9 * 60,
    closeMinute: 17 * 60 + 30,
  },
  KRX: {
    timeZone: "Asia/Seoul",
    openMinute: 9 * 60,
    closeMinute: 15 * 60 + 30,
  },
  BSE: {
    timeZone: "Asia/Kolkata",
    openMinute: 9 * 60 + 15,
    closeMinute: 15 * 60 + 30,
  },
  B3: {
    timeZone: "America/Sao_Paulo",
    openMinute: 10 * 60,
    closeMinute: 17 * 60,
  },
  SIX: {
    timeZone: "Europe/Zurich",
    openMinute: 9 * 60,
    closeMinute: 17 * 60 + 30,
  },
  TWSE: {
    timeZone: "Asia/Taipei",
    openMinute: 9 * 60,
    closeMinute: 13 * 60 + 30,
  },
  SGX: {
    timeZone: "Asia/Singapore",
    openMinute: 9 * 60,
    closeMinute: 17 * 60,
  },
  ASX: {
    timeZone: "Australia/Sydney",
    openMinute: 10 * 60,
    closeMinute: 16 * 60,
  },
};

const CONTINUOUS_REFRESH_EXCHANGES = new Set<MarketExchange>([
  "COMEX",
  "NYMEX",
]);
const CME_GLOBEX_TIME_ZONE = "America/Chicago";
const CME_GLOBEX_OPEN_MINUTE = 17 * 60;
const CME_GLOBEX_CLOSE_MINUTE = 16 * 60;
export const ACTIVE_MARKET_REFRESH_INTERVAL_MS = 5 * 60 * 1_000;
export const INTRADAY_MARKET_REFRESH_INTERVAL_MS = 60 * 1_000;
export const UNKNOWN_MARKET_REFRESH_INTERVAL_MS = 15 * 60 * 1_000;
export const POST_CLOSE_REFRESH_GRACE_MS = 30 * 60 * 1_000;
export const MARKET_REFRESH_FAILURE_BACKOFF_MS = [
  15 * 60 * 1_000,
  30 * 60 * 1_000,
  60 * 60 * 1_000,
] as const;

function dateTimeParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    weekday: values.weekday,
    minute: Number(values.hour) * 60 + Number(values.minute),
  };
}

export type MarketAutoRefreshPhase =
  | "continuous"
  | "open"
  | "post-close"
  | "closed"
  | "unknown";

export interface MarketAutoRefreshPolicy {
  phase: MarketAutoRefreshPhase;
  enabled: boolean;
  minimumIntervalMs: number;
}

function closedAutoRefreshPolicy(): MarketAutoRefreshPolicy {
  return {
    phase: "closed",
    enabled: false,
    minimumIntervalMs: ACTIVE_MARKET_REFRESH_INTERVAL_MS,
  };
}

function resolveCmeGlobexAutoRefreshPolicy(
  currentTime: Date,
): MarketAutoRefreshPolicy {
  const current = dateTimeParts(currentTime, CME_GLOBEX_TIME_ZONE);
  const active = {
    phase: "continuous" as const,
    enabled: true,
    minimumIntervalMs: ACTIVE_MARKET_REFRESH_INTERVAL_MS,
  };
  const postClose = {
    phase: "post-close" as const,
    enabled: true,
    minimumIntervalMs: ACTIVE_MARKET_REFRESH_INTERVAL_MS,
  };
  if (current.weekday === "Sat") return closedAutoRefreshPolicy();
  if (current.weekday === "Sun") {
    return current.minute >= CME_GLOBEX_OPEN_MINUTE
      ? active
      : closedAutoRefreshPolicy();
  }
  if (current.weekday === "Fri") {
    if (current.minute <= CME_GLOBEX_CLOSE_MINUTE) return active;
    if (
      current.minute <=
      CME_GLOBEX_CLOSE_MINUTE +
        POST_CLOSE_REFRESH_GRACE_MS / (60 * 1_000)
    ) {
      return postClose;
    }
    return closedAutoRefreshPolicy();
  }
  if (current.minute <= CME_GLOBEX_CLOSE_MINUTE) return active;
  if (
    current.minute <=
    CME_GLOBEX_CLOSE_MINUTE +
      POST_CLOSE_REFRESH_GRACE_MS / (60 * 1_000)
  ) {
    return postClose;
  }
  if (current.minute < CME_GLOBEX_OPEN_MINUTE) {
    return closedAutoRefreshPolicy();
  }
  return active;
}

export function resolveMarketAutoRefreshPolicy(
  instrument: Pick<MarketInstrument, "assetType" | "exchange">,
  currentTime: Date,
): MarketAutoRefreshPolicy {
  if (
    instrument.assetType === "commodity" &&
    CONTINUOUS_REFRESH_EXCHANGES.has(instrument.exchange)
  ) {
    return resolveCmeGlobexAutoRefreshPolicy(currentTime);
  }

  const session = REGULAR_MARKET_SESSION[instrument.exchange];
  if (!session) {
    return {
      phase: "unknown",
      enabled: true,
      minimumIntervalMs: UNKNOWN_MARKET_REFRESH_INTERVAL_MS,
    };
  }
  const current = dateTimeParts(currentTime, session.timeZone);
  if (current.weekday === "Sat" || current.weekday === "Sun") {
    return closedAutoRefreshPolicy();
  }
  if (current.minute < session.openMinute) {
    return closedAutoRefreshPolicy();
  }
  if (current.minute <= session.closeMinute) {
    return {
      phase: "open",
      enabled: true,
      minimumIntervalMs: ACTIVE_MARKET_REFRESH_INTERVAL_MS,
    };
  }
  const postCloseGraceMinutes =
    POST_CLOSE_REFRESH_GRACE_MS / (60 * 1_000);
  if (current.minute <= session.closeMinute + postCloseGraceMinutes) {
    return {
      phase: "post-close",
      enabled: true,
      minimumIntervalMs: ACTIVE_MARKET_REFRESH_INTERVAL_MS,
    };
  }
  return closedAutoRefreshPolicy();
}

export function marketRefreshFailureBackoffMs(
  consecutiveFailures: number,
): number {
  const index = Math.min(
    Math.max(Math.trunc(consecutiveFailures), 1) - 1,
    MARKET_REFRESH_FAILURE_BACKOFF_MS.length - 1,
  );
  return MARKET_REFRESH_FAILURE_BACKOFF_MS[index];
}

export function resolveLatestDailyBarStatus(
  barDate: string,
  exchange: MarketExchange,
  fetchedAt: Date,
  providerRegularSessionEndSeconds?: number,
): MarketLatestBarStatus {
  const session = REGULAR_MARKET_SESSION[exchange];
  const providerSessionEndMilliseconds =
    Number.isFinite(providerRegularSessionEndSeconds) &&
    providerRegularSessionEndSeconds! > 0
      ? providerRegularSessionEndSeconds! * 1000
      : null;

  const timeZone = session?.timeZone ?? "UTC";
  const current = dateTimeParts(fetchedAt, timeZone);
  if (barDate < current.date) return "complete";
  if (barDate > current.date) return "unknown";
  if (!session && providerSessionEndMilliseconds === null) return "unknown";

  if (providerSessionEndMilliseconds !== null) {
    return fetchedAt.getTime() >= providerSessionEndMilliseconds
      ? "complete"
      : "in-progress";
  }
  return current.minute >= session!.closeMinute
    ? "complete"
    : "in-progress";
}

export function resolveLatestIntradayBarStatus(
  barTimestamp: number,
  fetchedAt: Date,
  intervalMinutes = 1,
): MarketLatestBarStatus {
  if (!Number.isFinite(barTimestamp) || intervalMinutes <= 0) {
    return "unknown";
  }
  const barStart = Math.trunc(barTimestamp);
  const fetchedAtTime = fetchedAt.getTime();
  if (barStart > fetchedAtTime) return "unknown";
  return fetchedAtTime >= barStart + intervalMinutes * 60 * 1_000
    ? "complete"
    : "in-progress";
}
