import {
  continueValidatedCycleStrategy, mergeValidatedCycleRepair, ValidatedCycleError,
  createValidatedCycleStrategy, validatedCycleKey, type ValidatedCycleStrategy,
} from "./validated-cycle-strategy";
import { readLatestStrategyCycleValidationTask, isCurrentCycleScreeningSignature } from "./strategy-cycle-validation-store";
import { completedNikkeiCycleSeries, isNikkeiCycleInstrument, NIKKEI_CYCLE_MODEL,
  NIKKEI_CYCLE_CONFLICT_POLICY } from "./strategy-cycle-validation";
import type { BacktestSettings } from "./backtest";
import type { MarketSeries } from "../market/types";
import type { StrategyCycleSelectionSnapshot } from "./strategy-cycle-validation";
import { validatedCyclePreviewKey, promoteValidatedCycleProfile, type ValidatedCyclePreview } from "./validated-cycle-preview";
import type { SmaPositionOverlayOptions } from "./sma-position-overlay";

const DATABASE = "quantscope-validated-cycle-strategies";
const STORE = "strategies";
const EVENT = "quantscope-validated-cycle-change";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new ValidatedCycleError("storage"));
    let settled = false;
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "key" });
    request.onerror = request.onblocked = () => { settled = true; reject(new ValidatedCycleError("storage")); };
    request.onsuccess = () => {
      if (settled) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

function notify(): void {
  window.dispatchEvent(new Event(EVENT));
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(EVENT);
    channel.postMessage("changed");
    channel.close();
  }
}

export function subscribeValidatedCycles(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  window.addEventListener("focus", listener);
  const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(EVENT) : null;
  if (channel) channel.onmessage = listener;
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener("focus", listener);
    channel?.close();
  };
}

export async function readValidatedCycles(): Promise<ValidatedCycleStrategy[]> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, "readonly");
      const request = transaction.objectStore(STORE).getAll();
      transaction.oncomplete = () => {
        const records = request.result as ValidatedCycleStrategy[];
        if (records.some((record) => record.version !== 1 || record.model !== NIKKEI_CYCLE_MODEL ||
          record.conflictPolicy !== NIKKEI_CYCLE_CONFLICT_POLICY)) reject(new ValidatedCycleError("history"));
        else resolve(records);
      };
      transaction.onabort = transaction.onerror = () => reject(new ValidatedCycleError("storage"));
    });
  } finally { database.close(); }
}

export async function saveValidatedCyclePreview(profile: ValidatedCycleStrategy, overlay: SmaPositionOverlayOptions | undefined,
  preview: ValidatedCyclePreview): Promise<void> {
  if (preview.key !== validatedCyclePreviewKey(profile, overlay)) throw new ValidatedCycleError("history");
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      const store = transaction.objectStore(STORE), request = store.getAll();
      request.onsuccess = () => {
        const current = (request.result as ValidatedCycleStrategy[]).find((record) => record.key === profile.key);
        if (current && validatedCyclePreviewKey(current, overlay) === preview.key) store.put({ ...current, preview });
      };
      transaction.oncomplete = () => resolve();
      transaction.onabort = transaction.onerror = () => reject(new ValidatedCycleError("storage"));
    });
  } finally { database.close(); }
  notify();
}

async function commit(profile: ValidatedCycleStrategy, expectedRevision: number, requireExisting = false): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      let failure: Error = new ValidatedCycleError("storage");
      const store = transaction.objectStore(STORE);
      const request = store.getAll();
      request.onsuccess = () => {
        const records = request.result as ValidatedCycleStrategy[];
        const current = records.find((record) => record.key === profile.key);
        if ((requireExisting && !current) || (current?.revision ?? 0) !== expectedRevision) {
          failure = new ValidatedCycleError("conflict");
          transaction.abort();
        } else if (!current && records.length >= 32) {
          failure = new ValidatedCycleError("capacity");
          transaction.abort();
        } else {
          store.put({ ...profile, revision: expectedRevision + 1 });
        }
      };
      transaction.oncomplete = () => resolve();
      transaction.onabort = transaction.onerror = () => reject(failure);
    });
  } finally { database.close(); }
  notify();
}

export async function promoteValidatedCycleRules(profile: ValidatedCycleStrategy, overlay: SmaPositionOverlayOptions | undefined,
  preview: ValidatedCyclePreview): Promise<boolean> {
  const next = promoteValidatedCycleProfile(profile, overlay, preview);
  if (next === profile) return false;
  try { await commit(next, profile.revision, true); return true; }
  catch (error) {
    if (error instanceof ValidatedCycleError && error.code === "conflict") return false;
    throw error;
  }
}

export async function publishValidatedCycle(profile: ValidatedCycleStrategy): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const previous = (await readValidatedCycles()).find((record) => record.key === profile.key);
    const next = previous ? mergeValidatedCycleRepair(previous, profile) : profile;
    if (next === previous) return;
    try { await commit(next, previous?.revision ?? 0); return; }
    catch (error) {
      if (!(error instanceof ValidatedCycleError) || error.code !== "conflict" || attempt === 2) throw error;
    }
  }
}

export async function appendValidatedCycle(series: MarketSeries, snapshot: StrategyCycleSelectionSnapshot,
  provenance: string): Promise<"absent" | "unchanged" | "pending" | "updated"> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const previous = (await readValidatedCycles()).find((record) => record.key === validatedCycleKey(series, snapshot.screeningWindow));
    if (!previous) return "absent";
    const next = continueValidatedCycleStrategy(previous, series, snapshot, provenance);
    if (next === previous) return "unchanged";
    try {
      await commit(next, previous.revision);
      return next.pending ? "pending" : "updated";
    } catch (error) {
      if (!(error instanceof ValidatedCycleError) || error.code !== "conflict" || attempt === 2) throw error;
    }
  }
  throw new ValidatedCycleError("conflict");
}

export async function seedCompletedValidatedCycles(series: MarketSeries,
  positionOverlay: BacktestSettings["positionOverlay"]): Promise<void> {
  if (series.interval !== "1d" || !isNikkeiCycleInstrument(series.instrument)) return;
  const task = await readLatestStrategyCycleValidationTask();
  if (!task || task.status !== "completed" || !isNikkeiCycleInstrument(task.instrument) ||
    !isCurrentCycleScreeningSignature(task.signature)) return;
  const signature = JSON.parse(task.signature) as { barCount: number; lastBar: string };
  const existing = await readValidatedCycles();
  const windows = task.screeningWindows.filter((window) => !existing.some((profile) =>
    profile.key === validatedCycleKey(series, window) && profile.series.bars.at(-1)!.time >= signature.lastBar));
  if (!windows.length) return;
  const originalSeries = completedNikkeiCycleSeries({ ...series,
    bars: series.bars.filter((bar) => bar.time <= signature.lastBar) });
  if (originalSeries.bars.length !== signature.barCount || originalSeries.bars.at(-1)?.time !== signature.lastBar) {
    throw new ValidatedCycleError("history");
  }
  for (const window of windows) {
    await publishValidatedCycle(createValidatedCycleStrategy(originalSeries, task.snapshots,
      task.evaluationSessions, window, {
        initialCash: task.initialCash, commissionRate: task.commissionPercent / 100,
        slippageRate: task.slippagePercent / 100, positionOverlay, interval: "1d", executionPolicy: "hybrid",
      }));
  }
}
