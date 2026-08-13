import {
  canonicalMarketInstrumentKey,
  type CanonicalMarketProfile,
} from "./canonical";
import {
  fingerprintMarketReferenceSeries,
  fingerprintMarketSeries,
} from "./fingerprint";
import type { MarketSourceQualitySnapshot } from "./quality";
import {
  appendMarketSourceHealthAttempt,
  nextMarketSourceDemotedAt,
  type MarketSourceHealthAttemptSample,
} from "./source-health";
import type {
  MarketInstrument,
  MarketInterval,
  MarketReferenceSeries,
  MarketSeries,
  MarketSourceProvider,
} from "./types";

const DATABASE_NAME = "quantscope-canonical-market";
const DATABASE_VERSION = 1;
const CANONICAL_STORE = "canonicalSeries";
const SOURCE_SNAPSHOT_STORE = "sourceSnapshots";
const REFERENCE_SNAPSHOT_STORE = "referenceSnapshots";
const SOURCE_HEALTH_STORE = "sourceHealth";
const MAX_CANONICAL_ENTRIES = 32;
const MAX_SOURCE_SNAPSHOTS = 160;
const MAX_REFERENCE_SNAPSHOTS = 32;

interface CanonicalMarketSeriesRecord {
  key: string;
  cachedAt: number;
  fingerprint: string;
  series: MarketSeries;
}

interface MarketSourceSnapshotRecord {
  key: string;
  instrumentKey: string;
  provider: MarketSeries["source"];
  mode: "history" | "latest";
  recordedAt: number;
  fingerprint: string;
  series: MarketSeries;
}

interface MarketReferenceSnapshotRecord {
  key: string;
  instrumentKey: string;
  provider: MarketReferenceSeries["source"];
  mode: "history" | "latest";
  recordedAt: number;
  fingerprint: string;
  series: MarketReferenceSeries;
}

export interface MarketSourceHealthRecord {
  key: string;
  instrumentKey: string;
  provider: MarketSourceProvider;
  attempts: number;
  successes: number;
  failures: number;
  availabilityPercent: number;
  averageLatencyMs: number;
  lastLatencyMs: number;
  lastAttemptAt: string;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastErrorCode: string | null;
  demotedAt: string | null;
  recentAttempts: MarketSourceHealthAttemptSample[];
  quality: MarketSourceQualitySnapshot | null;
}

export interface CachedCanonicalMarketSeries {
  cachedAt: number;
  fingerprint: string;
  series: MarketSeries;
}

export interface MarketSourceAttempt {
  instrumentKey: string;
  provider: MarketSourceProvider;
  success: boolean;
  latencyMs: number;
  attemptedAt?: Date;
  errorCode?: string;
  quality?: MarketSourceQualitySnapshot | null;
}

const memoryCanonicalCache = new Map<
  string,
  CanonicalMarketSeriesRecord
>();
const memorySourceHealth = new Map<string, MarketSourceHealthRecord>();

function canonicalCacheKey(
  instrument: Pick<MarketInstrument, "assetType" | "code" | "exchange">,
  interval: MarketInterval,
): string {
  return `${canonicalMarketInstrumentKey(instrument)}:${interval}`;
}

function materializeCanonicalSeries(
  record: CanonicalMarketSeriesRecord,
): MarketSeries {
  return record.series;
}

function openDatabase(): Promise<IDBDatabase | null> {
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
        if (!database.objectStoreNames.contains(CANONICAL_STORE)) {
          const store = database.createObjectStore(CANONICAL_STORE, {
            keyPath: "key",
          });
          store.createIndex("cachedAt", "cachedAt");
        }
        if (!database.objectStoreNames.contains(SOURCE_SNAPSHOT_STORE)) {
          const store = database.createObjectStore(
            SOURCE_SNAPSHOT_STORE,
            { keyPath: "key" },
          );
          store.createIndex("recordedAt", "recordedAt");
          store.createIndex("instrumentKey", "instrumentKey");
        }
        if (!database.objectStoreNames.contains(REFERENCE_SNAPSHOT_STORE)) {
          const store = database.createObjectStore(
            REFERENCE_SNAPSHOT_STORE,
            { keyPath: "key" },
          );
          store.createIndex("recordedAt", "recordedAt");
          store.createIndex("instrumentKey", "instrumentKey");
        }
        if (!database.objectStoreNames.contains(SOURCE_HEALTH_STORE)) {
          const store = database.createObjectStore(SOURCE_HEALTH_STORE, {
            keyPath: "key",
          });
          store.createIndex("instrumentKey", "instrumentKey");
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

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });
}

async function pruneStore(
  database: IDBDatabase,
  storeName: string,
  indexName: string,
  maximumEntries: number,
): Promise<void> {
  const readTransaction = database.transaction(storeName, "readonly");
  const records =
    (await requestResult(
      readTransaction
        .objectStore(storeName)
        .index(indexName)
        .getAll() as IDBRequest<Array<{ key: string }>>,
    )) ?? [];
  const overflow = Math.max(0, records.length - maximumEntries);
  if (overflow === 0) return;
  const writeTransaction = database.transaction(storeName, "readwrite");
  const store = writeTransaction.objectStore(storeName);
  for (const record of records.slice(0, overflow)) {
    store.delete(record.key);
  }
  await transactionComplete(writeTransaction);
}

export async function readCanonicalMarketSeriesEntry(
  instrument: MarketInstrument,
  interval: MarketInterval,
  expectedSource?: MarketSeries["source"],
): Promise<CachedCanonicalMarketSeries | null> {
  const key = canonicalCacheKey(instrument, interval);
  const memoryRecord = memoryCanonicalCache.get(key);
  if (
    memoryRecord?.series.bars.length &&
    (!expectedSource || memoryRecord.series.source === expectedSource)
  ) {
    return {
      cachedAt: memoryRecord.cachedAt,
      fingerprint: memoryRecord.fingerprint,
      series: materializeCanonicalSeries(memoryRecord),
    };
  }
  const database = await openDatabase();
  if (!database) return null;
  try {
    const transaction = database.transaction(
      CANONICAL_STORE,
      "readonly",
    );
    const record = await requestResult(
      transaction.objectStore(CANONICAL_STORE).get(key) as IDBRequest<
        CanonicalMarketSeriesRecord | undefined
      >,
    );
    if (
      !record ||
      record.key !== key ||
      !record.series?.bars.length ||
      record.series.interval !== interval ||
      (expectedSource && record.series.source !== expectedSource) ||
      canonicalMarketInstrumentKey(record.series.instrument) !==
        canonicalMarketInstrumentKey(instrument)
    ) {
      return null;
    }
    memoryCanonicalCache.set(key, record);
    return {
      cachedAt: record.cachedAt,
      fingerprint: record.fingerprint,
      series: materializeCanonicalSeries(record),
    };
  } catch {
    return null;
  } finally {
    database.close();
  }
}

export async function writeCanonicalMarketSeries(
  series: MarketSeries,
  profile: CanonicalMarketProfile,
): Promise<void> {
  if (
    series.bars.length === 0 ||
    canonicalMarketInstrumentKey(series.instrument) !== profile.key ||
    (series.source !== profile.primary.provider &&
      !profile.backups.some(
        (definition) => definition.provider === series.source,
      ))
  ) {
    return;
  }
  const record: CanonicalMarketSeriesRecord = {
    key: `${profile.key}:${series.interval}`,
    cachedAt: Date.now(),
    fingerprint: await fingerprintMarketSeries(series),
    series,
  };
  memoryCanonicalCache.set(record.key, record);
  const database = await openDatabase();
  if (!database) return;
  try {
    const transaction = database.transaction(
      CANONICAL_STORE,
      "readwrite",
    );
    transaction.objectStore(CANONICAL_STORE).put(record);
    await transactionComplete(transaction);
    await pruneStore(
      database,
      CANONICAL_STORE,
      "cachedAt",
      MAX_CANONICAL_ENTRIES,
    );
  } catch {
    // The canonical series remains available in memory for this session.
  } finally {
    database.close();
  }
}

export async function writeMarketSourceSnapshot(
  series: MarketSeries,
  profile: CanonicalMarketProfile,
  mode: "history" | "latest",
): Promise<void> {
  if (
    series.bars.length === 0 ||
    canonicalMarketInstrumentKey(series.instrument) !== profile.key
  ) {
    return;
  }
  const lastDate = series.bars.at(-1)!.time;
  const record: MarketSourceSnapshotRecord = {
    key: `${profile.key}:${series.source}:${series.interval}:${mode}:${lastDate}`,
    instrumentKey: profile.key,
    provider: series.source,
    mode,
    recordedAt: Date.now(),
    fingerprint: await fingerprintMarketSeries(series),
    series,
  };
  const database = await openDatabase();
  if (!database) return;
  try {
    const transaction = database.transaction(
      SOURCE_SNAPSHOT_STORE,
      "readwrite",
    );
    transaction.objectStore(SOURCE_SNAPSHOT_STORE).put(record);
    await transactionComplete(transaction);
    await pruneStore(
      database,
      SOURCE_SNAPSHOT_STORE,
      "recordedAt",
      MAX_SOURCE_SNAPSHOTS,
    );
  } catch {
    // Source snapshots are diagnostic and never block the active chart.
  } finally {
    database.close();
  }
}

export async function writeMarketReferenceSnapshot(
  series: MarketReferenceSeries,
  mode: "history" | "latest",
): Promise<void> {
  if (series.observations.length === 0) return;
  const lastDate = series.observations.at(-1)!.time;
  const record: MarketReferenceSnapshotRecord = {
    key: `${series.instrumentKey}:${series.source}:${series.interval}:${mode}:${lastDate}`,
    instrumentKey: series.instrumentKey,
    provider: series.source,
    mode,
    recordedAt: Date.now(),
    fingerprint: await fingerprintMarketReferenceSeries(series),
    series,
  };
  const database = await openDatabase();
  if (!database) return;
  try {
    const transaction = database.transaction(
      REFERENCE_SNAPSHOT_STORE,
      "readwrite",
    );
    transaction.objectStore(REFERENCE_SNAPSHOT_STORE).put(record);
    await transactionComplete(transaction);
    await pruneStore(
      database,
      REFERENCE_SNAPSHOT_STORE,
      "recordedAt",
      MAX_REFERENCE_SNAPSHOTS,
    );
  } catch {
    // Reference snapshots are diagnostic and never block the active chart.
  } finally {
    database.close();
  }
}

function nextHealthRecord(
  previous: MarketSourceHealthRecord | null,
  attempt: MarketSourceAttempt,
): MarketSourceHealthRecord {
  const attemptedAt = attempt.attemptedAt ?? new Date();
  const attempts = (previous?.attempts ?? 0) + 1;
  const successes = (previous?.successes ?? 0) + (attempt.success ? 1 : 0);
  const failures = attempts - successes;
  const previousLatencyTotal =
    (previous?.averageLatencyMs ?? 0) * (attempts - 1);
  const recentAttempts = appendMarketSourceHealthAttempt(
    previous?.recentAttempts,
    {
      attemptedAt: attemptedAt.toISOString(),
      success: attempt.success,
      latencyMs: Math.max(attempt.latencyMs, 0),
      errorCode: attempt.success
        ? null
        : attempt.errorCode ?? "UNKNOWN",
    },
    attemptedAt,
  );
  const nextQuality = attempt.quality
    ? {
        ...attempt.quality,
        historyBarCount: Math.max(
          attempt.quality.historyBarCount ?? attempt.quality.barCount,
          previous?.quality?.historyBarCount ??
            previous?.quality?.barCount ??
            0,
        ),
      }
    : previous?.quality ?? null;
  return {
    key: `${attempt.instrumentKey}:${attempt.provider}`,
    instrumentKey: attempt.instrumentKey,
    provider: attempt.provider,
    attempts,
    successes,
    failures,
    availabilityPercent: (successes / attempts) * 100,
    averageLatencyMs:
      (previousLatencyTotal + Math.max(attempt.latencyMs, 0)) / attempts,
    lastLatencyMs: Math.max(attempt.latencyMs, 0),
    lastAttemptAt: attemptedAt.toISOString(),
    lastSuccessAt: attempt.success
      ? attemptedAt.toISOString()
      : previous?.lastSuccessAt ?? null,
    lastFailureAt: attempt.success
      ? previous?.lastFailureAt ?? null
      : attemptedAt.toISOString(),
    lastErrorCode: attempt.success ? null : attempt.errorCode ?? "UNKNOWN",
    demotedAt: nextMarketSourceDemotedAt(
      previous?.demotedAt,
      recentAttempts,
      attemptedAt,
    ),
    recentAttempts,
    quality: nextQuality,
  };
}

export async function recordMarketSourceAttempt(
  attempt: MarketSourceAttempt,
): Promise<MarketSourceHealthRecord> {
  const key = `${attempt.instrumentKey}:${attempt.provider}`;
  let previous = memorySourceHealth.get(key) ?? null;
  const database = await openDatabase();
  if (database && !previous) {
    try {
      const transaction = database.transaction(
        SOURCE_HEALTH_STORE,
        "readonly",
      );
      previous =
        (await requestResult(
          transaction.objectStore(SOURCE_HEALTH_STORE).get(key) as IDBRequest<
            MarketSourceHealthRecord | undefined
          >,
        )) ?? null;
    } catch {
      previous = null;
    }
  }
  const next = nextHealthRecord(previous, attempt);
  memorySourceHealth.set(key, next);
  if (!database) return next;
  try {
    const transaction = database.transaction(
      SOURCE_HEALTH_STORE,
      "readwrite",
    );
    transaction.objectStore(SOURCE_HEALTH_STORE).put(next);
    await transactionComplete(transaction);
  } catch {
    // Source health remains available in memory for this session.
  } finally {
    database.close();
  }
  return next;
}

export async function readMarketSourceHealth(
  instrumentKey: string,
): Promise<MarketSourceHealthRecord[]> {
  const memoryRecords = [...memorySourceHealth.values()].filter(
    (record) => record.instrumentKey === instrumentKey,
  );
  const database = await openDatabase();
  if (!database) return memoryRecords;
  try {
    const transaction = database.transaction(
      SOURCE_HEALTH_STORE,
      "readonly",
    );
    const records =
      (await requestResult(
        transaction
          .objectStore(SOURCE_HEALTH_STORE)
          .index("instrumentKey")
          .getAll(instrumentKey) as IDBRequest<MarketSourceHealthRecord[]>,
      )) ?? [];
    for (const record of records) {
      memorySourceHealth.set(record.key, record);
    }
    return records;
  } catch {
    return memoryRecords;
  } finally {
    database.close();
  }
}
