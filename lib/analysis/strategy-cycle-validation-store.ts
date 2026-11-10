import {
  NIKKEI_CYCLE_MODEL,
  NIKKEI_CYCLE_CONFLICT_POLICY,
} from "./strategy-cycle-validation";
import type { MarketBar, MarketInstrument } from "@/lib/market/types";
import type {
  StrategyCycleSelectionSnapshot,
} from "./strategy-cycle-validation";
import type { ScreeningObjective } from "./screening";
import { SCREENING_RESULT_MODEL_VERSION } from "./strategy-combinations";

const DATABASE_NAME = "quantscope-strategy-cycle-validation";
const DATABASE_VERSION = 1;
const TASK_STORE = "tasks";
const LATEST_TASK_KEY = "latest";

export interface StrategyCycleQueuedUnit {
  decisionIndex: number;
  decisionTime: string;
  screeningWindow: number;
  jobId: string;
}

export interface StoredStrategyCycleValidationTask {
  key: typeof LATEST_TASK_KEY;
  version: 2;
  signature: string;
  instrument: MarketInstrument;
  screeningWindows: number[];
  updateIntervals: number[];
  maxCombinationStrategies: number;
  evaluationSessions: number;
  objective: ScreeningObjective;
  initialCash: number;
  commissionPercent: number;
  slippagePercent: number;
  completedUnits: number;
  totalUnits: number;
  snapshots: StrategyCycleSelectionSnapshot[];
  queuedUnits: StrategyCycleQueuedUnit[];
  updatedAt: string;
  status: "running" | "paused" | "completed" | "error";
  lastError: string | null;
}

/** Only the report policy changes; selected winners and queued screening jobs stay valid. */
export function migrateCycleConflictPolicySignature(signature: string): string {
  try {
    const parsed = JSON.parse(signature) as Record<string, unknown>;
    if (
      parsed.rollingSchedule !== NIKKEI_CYCLE_MODEL ||
      parsed.conflictPolicy !== "previous-current-signals-on-conflict-v1"
    ) return signature;
    parsed.conflictPolicy = NIKKEI_CYCLE_CONFLICT_POLICY;
    return JSON.stringify(parsed);
  } catch {
    return signature;
  }
}

export function isCurrentCycleScreeningSignature(signature: string): boolean {
  try {
    const value = JSON.parse(signature) as Record<string, unknown>;
    return value.resultModelVersion === SCREENING_RESULT_MODEL_VERSION
      && !("quickCandidatesByWindow" in value) && !("quickLibraryKey" in value);
  } catch {
    return false;
  }
}

/** Hash the exact screening inputs, including the warm-up history. */
export async function cycleTaskHistoryDigest(bars: readonly MarketBar[]): Promise<string> {
  const input = new TextEncoder().encode(JSON.stringify(bars));
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function cycleTaskRecentPrefixDigests(bars: readonly MarketBar[]): Promise<string[]> {
  return Promise.all([1, 2].map((count) => cycleTaskHistoryDigest(bars.slice(0, Math.max(0, bars.length - count)))));
}

export async function reusableCycleTaskSnapshots(
  task: StoredStrategyCycleValidationTask | null,
  signature: string,
  bars: readonly MarketBar[],
): Promise<StrategyCycleSelectionSnapshot[]> {
  if (!task || !isCurrentCycleScreeningSignature(task.signature)) return [];
  if (task.signature === signature) return task.snapshots;
  const previousSettings = JSON.parse(task.signature);
  const nextSettings = JSON.parse(signature);
  const { lastBar, barCount, historyDigest, recentPrefixDigests } = previousSettings;
  const nextDigest = nextSettings.historyDigest;
  for (const key of ["lastBar", "barCount", "historyDigest", "recentPrefixDigests", "screeningWindows", "evaluationSessions"]) {
    delete previousSettings[key];
    delete nextSettings[key];
  }
  if (typeof historyDigest !== "string" || !Number.isInteger(barCount) || barCount < 1 ||
    barCount > bars.length || bars[barCount - 1]?.time !== lastBar ||
    JSON.stringify(previousSettings) !== JSON.stringify(nextSettings)) return [];
  const prefixDigest = barCount === bars.length ? nextDigest : await cycleTaskHistoryDigest(bars.slice(0, barCount));
  if (prefixDigest === historyDigest) return task.snapshots;
  if (!Array.isArray(recentPrefixDigests)) return [];
  // A correction may invalidate the tail without invalidating earlier completed units.
  for (const [offset, digest] of recentPrefixDigests.slice(0, 2).entries()) {
    const prefixCount = barCount - offset - 1;
    if (prefixCount < 1) break;
    if (await cycleTaskHistoryDigest(bars.slice(0, prefixCount)) === digest) {
      return task.snapshots.filter((snapshot) => snapshot.decisionTime <= bars[prefixCount - 1]!.time);
    }
  }
  return [];
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(TASK_STORE)) {
          request.result.createObjectStore(TASK_STORE, { keyPath: "key" });
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

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });
}

export async function readLatestStrategyCycleValidationTask(): Promise<
  StoredStrategyCycleValidationTask | null
> {
  const database = await openDatabase();
  if (!database) return null;
  const transaction = database.transaction(TASK_STORE, "readonly");
  const result = await new Promise<StoredStrategyCycleValidationTask | null>(
    (resolve) => {
      const request = transaction.objectStore(TASK_STORE).get(LATEST_TASK_KEY) as
        IDBRequest<StoredStrategyCycleValidationTask | undefined>;
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => resolve(null);
    },
  );
  database.close();
  if (!result || !isCurrentCycleScreeningSignature(result.signature)) return null;
  if (result.version === 2) {
    const signature = migrateCycleConflictPolicySignature(result.signature);
    if (signature === result.signature) return result;
    const migrated = { ...result, signature };
    await writeStrategyCycleValidationTask(migrated);
    return migrated;
  }
  if ((result as { version?: number }).version === 1) {
    return {
      ...result,
      version: 2,
      queuedUnits: [],
    };
  }
  return null;
}

export async function writeStrategyCycleValidationTask(
  task: Omit<StoredStrategyCycleValidationTask, "key" | "version" | "updatedAt">,
): Promise<void> {
  const database = await openDatabase();
  if (!database) return;
  const transaction = database.transaction(TASK_STORE, "readwrite");
  transaction.objectStore(TASK_STORE).put({
    ...task,
    key: LATEST_TASK_KEY,
    version: 2,
    updatedAt: new Date().toISOString(),
  } satisfies StoredStrategyCycleValidationTask);
  await transactionDone(transaction);
  database.close();
}

export async function clearStrategyCycleValidationTask(): Promise<void> {
  const database = await openDatabase();
  if (!database) return;
  const transaction = database.transaction(TASK_STORE, "readwrite");
  transaction.objectStore(TASK_STORE).delete(LATEST_TASK_KEY);
  await transactionDone(transaction);
  database.close();
}
