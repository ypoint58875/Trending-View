import type {
  MarketExchange,
  MarketLatestBarStatus,
} from "./types";

interface RegularSessionClose {
  timeZone: string;
  closeMinute: number;
}

const REGULAR_SESSION_CLOSE: Partial<
  Record<MarketExchange, RegularSessionClose>
> = {
  SSE: { timeZone: "Asia/Shanghai", closeMinute: 15 * 60 },
  SZSE: { timeZone: "Asia/Shanghai", closeMinute: 15 * 60 },
  JPX: { timeZone: "Asia/Tokyo", closeMinute: 15 * 60 + 30 },
  HKEX: { timeZone: "Asia/Hong_Kong", closeMinute: 16 * 60 },
  PHLX: { timeZone: "America/New_York", closeMinute: 16 * 60 },
  NYSE_ARCA: {
    timeZone: "America/New_York",
    closeMinute: 16 * 60,
  },
  NASDAQ: { timeZone: "America/New_York", closeMinute: 16 * 60 },
};

function dateTimeParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    minute: Number(values.hour) * 60 + Number(values.minute),
  };
}

export function resolveLatestDailyBarStatus(
  barDate: string,
  exchange: MarketExchange,
  fetchedAt: Date,
  providerRegularSessionEndSeconds?: number,
): MarketLatestBarStatus {
  const session = REGULAR_SESSION_CLOSE[exchange];
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
