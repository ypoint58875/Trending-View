import type { CombinationOptimizationCheckpoint } from "./strategy-combinations";

const DATABASE_NAME = "quantscope-screening-checkpoint";
const DATABASE_VERSION = 1;
const STORE_NAME = "optimizerCheckpoint";

interface StoredCheckpoint {
  key: string;
  signature: string;
  updatedAt: number;
  checkpoint: CombinationOptimizationCheckpoint;
}

function openDatabase(): Promise<IDBDatabase | null> {
  const factory = globalThis.indexedDB;
  if (!factory) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
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

export async function readScreeningCheckpoint(
  key: string,
  signature: string,
): Promise<CombinationOptimizationCheckpoint | null> {
  const database = await openDatabase();
  if (!database) return null;
  const transaction = database.transaction(STORE_NAME, "readonly");
  const record = await new Promise<StoredCheckpoint | null>((resolve) => {
    const request = transaction.objectStore(STORE_NAME).get(key) as IDBRequest<
      StoredCheckpoint | undefined
    >;
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => resolve(null);
  });
  database.close();
  return record?.signature === signature ? record.checkpoint : null;
}

export async function writeScreeningCheckpoint(
  key: string,
  signature: string,
  checkpoint: CombinationOptimizationCheckpoint,
): Promise<void> {
  const database = await openDatabase();
  if (!database) return;
  const transaction = database.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).put({
    key,
    signature,
    updatedAt: Date.now(),
    checkpoint,
  } satisfies StoredCheckpoint);
  await transactionDone(transaction);
  database.close();
}

export async function clearScreeningCheckpoint(key: string): Promise<void> {
  const database = await openDatabase();
  if (!database) return;
  const transaction = database.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).delete(key);
  await transactionDone(transaction);
  database.close();
}
