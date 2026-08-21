import type { CombinationScreeningProgress } from "./strategy-combinations";
import type {
  ScreeningCombinationResult,
  ScreeningSingleResult,
  ScreeningValidationReport,
} from "./screening-validation";
import type { ScreeningObjective } from "./screening";
import type { MarketInterval } from "../market/types";

const DATABASE_NAME = "quantscope-screening-result";
const DATABASE_VERSION = 1;
const RESULT_STORE = "latestResult";
const LATEST_RESULT_KEY = "latest";

export interface CachedScreeningResult {
  key: typeof LATEST_RESULT_KEY;
  instrumentKey: string;
  interval: MarketInterval;
  completedAt: number;
  objective: ScreeningObjective;
  singleResults: ScreeningSingleResult[];
  combinationResults: ScreeningCombinationResult[];
  validationReport: ScreeningValidationReport | null;
  progress: CombinationScreeningProgress;
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(RESULT_STORE)) {
          database.createObjectStore(RESULT_STORE, { keyPath: "key" });
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
    request.onsuccess = () => resolve(request.result ?? null);
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

export async function readLatestScreeningResult(): Promise<CachedScreeningResult | null> {
  const database = await openDatabase();
  if (!database) return null;
  const transaction = database.transaction(RESULT_STORE, "readonly");
  const result = await requestResult(
    transaction.objectStore(RESULT_STORE).get(LATEST_RESULT_KEY) as IDBRequest<CachedScreeningResult>,
  );
  database.close();
  return result;
}

export async function writeLatestScreeningResult(
  result: Omit<CachedScreeningResult, "key" | "completedAt">,
): Promise<void> {
  const database = await openDatabase();
  if (!database) return;
  const transaction = database.transaction(RESULT_STORE, "readwrite");
  transaction.objectStore(RESULT_STORE).put({
    ...result,
    key: LATEST_RESULT_KEY,
    completedAt: Date.now(),
  } satisfies CachedScreeningResult);
  await transactionComplete(transaction);
  database.close();
}

export async function clearLatestScreeningResult(): Promise<void> {
  const database = await openDatabase();
  if (!database) return;
  const transaction = database.transaction(RESULT_STORE, "readwrite");
  transaction.objectStore(RESULT_STORE).delete(LATEST_RESULT_KEY);
  await transactionComplete(transaction);
  database.close();
}
