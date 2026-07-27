import type {
  MarketInstrument,
  MarketInterval,
  MarketSeries,
} from "./types";
import { resolveLatestDailyBarStatus } from "./session";

const DATABASE_NAME = "quantscope-market-cache";
const DATABASE_VERSION = 1;
const SERIES_STORE = "series";
const MAX_CACHE_ENTRIES = 32;
const memorySeriesCache = new Map<string, CachedMarketSeriesRecord>();

interface CachedMarketSeriesRecord {
  key: string;
  cachedAt: number;
  series: MarketSeries;
}

export interface CachedMarketSeries {
  cachedAt: number;
  series: MarketSeries;
}

export function marketSeriesCacheKey(
  instrument: Pick<MarketInstrument, "provider" | "secid">,
  interval: MarketInterval,
): string {
  return `${instrument.provider}:${instrument.secid}:${interval}`;
}

function isUsableCachedSeries(
  value: unknown,
  expectedKey: string,
): value is CachedMarketSeriesRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<CachedMarketSeriesRecord>;
  if (
    record.key !== expectedKey ||
    typeof record.cachedAt !== "number" ||
    !Number.isFinite(record.cachedAt) ||
    !record.series ||
    !Array.isArray(record.series.bars) ||
    record.series.bars.length === 0
  ) {
    return false;
  }
  const expectedInterval = expectedKey.slice(expectedKey.lastIndexOf(":") + 1);
  return record.series.interval === expectedInterval;
}

function pruneMemoryCache(): void {
  const overflow = memorySeriesCache.size - MAX_CACHE_ENTRIES;
  if (overflow <= 0) return;
  const oldestKeys = [...memorySeriesCache.values()]
    .sort((left, right) => left.cachedAt - right.cachedAt)
    .slice(0, overflow)
    .map((record) => record.key);
  for (const key of oldestKeys) memorySeriesCache.delete(key);
}

function materializeCachedSeries(
  record: CachedMarketSeriesRecord,
): MarketSeries {
  const latestDate = record.series.bars.at(-1)?.time.slice(0, 10);
  return {
    ...record.series,
    latestBarStatus: latestDate
      ? resolveLatestDailyBarStatus(
          latestDate,
          record.series.instrument.exchange,
          new Date(),
        )
      : "unknown",
  };
}

function openCacheDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(
        DATABASE_NAME,
        DATABASE_VERSION,
      );
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(SERIES_STORE)) {
          const store = database.createObjectStore(SERIES_STORE, {
            keyPath: "key",
          });
          store.createIndex("cachedAt", "cachedAt");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T | null> {
  return new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function pruneCache(database: IDBDatabase): Promise<void> {
  const readTransaction = database.transaction(SERIES_STORE, "readonly");
  const records =
    (await requestResult(
      readTransaction
        .objectStore(SERIES_STORE)
        .index("cachedAt")
        .getAll() as IDBRequest<
        CachedMarketSeriesRecord[]
      >,
    )) ?? [];
  const overflowKeys = records
    .slice(0, Math.max(0, records.length - MAX_CACHE_ENTRIES))
    .map((record) => record.key);
  if (overflowKeys.length === 0) return;
  const writeTransaction = database.transaction(SERIES_STORE, "readwrite");
  const store = writeTransaction.objectStore(SERIES_STORE);
  for (const key of overflowKeys) {
    store.delete(key);
  }
}

export async function readCachedMarketSeriesEntry(
  instrument: MarketInstrument,
  interval: MarketInterval,
): Promise<CachedMarketSeries | null> {
  const key = marketSeriesCacheKey(instrument, interval);
  const memoryRecord = memorySeriesCache.get(key);
  if (isUsableCachedSeries(memoryRecord, key)) {
    return {
      cachedAt: memoryRecord.cachedAt,
      series: materializeCachedSeries(memoryRecord),
    };
  }
  memorySeriesCache.delete(key);

  const database = await openCacheDatabase();
  if (!database) return null;
  try {
    const transaction = database.transaction(SERIES_STORE, "readonly");
    const record = await requestResult(
      transaction.objectStore(SERIES_STORE).get(key) as IDBRequest<
        CachedMarketSeriesRecord | undefined
      >,
    );
    if (!isUsableCachedSeries(record, key)) return null;
    memorySeriesCache.set(key, record);
    pruneMemoryCache();
    return {
      cachedAt: record.cachedAt,
      series: materializeCachedSeries(record),
    };
  } catch {
    return null;
  } finally {
    database.close();
  }
}

export async function readCachedMarketSeries(
  instrument: MarketInstrument,
  interval: MarketInterval,
): Promise<MarketSeries | null> {
  const cached = await readCachedMarketSeriesEntry(instrument, interval);
  return cached?.series ?? null;
}

export async function writeCachedMarketSeries(
  series: MarketSeries,
  requestedInstruments: readonly MarketInstrument[] = [],
): Promise<void> {
  if (series.bars.length === 0) return;
  const cachedAt = Date.now();
  const keys = new Set([
    marketSeriesCacheKey(series.instrument, series.interval),
    ...requestedInstruments.map((instrument) =>
      marketSeriesCacheKey(instrument, series.interval),
    ),
  ]);
  const records = [...keys].map<CachedMarketSeriesRecord>((key) => ({
    key,
    cachedAt,
    series,
  }));
  for (const record of records) memorySeriesCache.set(record.key, record);
  pruneMemoryCache();
  const database = await openCacheDatabase();
  if (!database) return;
  try {
    const transaction = database.transaction(SERIES_STORE, "readwrite");
    const store = transaction.objectStore(SERIES_STORE);
    for (const record of records) store.put(record);
    await new Promise<void>((resolve) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    });
    await pruneCache(database);
  } catch {
    // Market history remains available from the network when storage is blocked.
  } finally {
    database.close();
  }
}
