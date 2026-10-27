import assert from "node:assert/strict";
import test from "node:test";
import { readValidatedCycles, publishValidatedCycle, appendValidatedCycle,
  subscribeValidatedCycles, saveValidatedCyclePreview, promoteValidatedCycleRules } from "../lib/analysis/validated-cycle-strategy-store";
import { buildValidatedCyclePreview, cachedValidatedCyclePreview } from "../lib/analysis/validated-cycle-preview";
import { DEFAULT_POSITION_OVERLAY_OPTIONS, ATR_POSITION_OVERLAY_OPTIONS } from "../lib/analysis/sma-position-overlay";
import { createValidatedCycleStrategy, ValidatedCycleError } from "../lib/analysis/validated-cycle-strategy";
import { buildStrategyCycleRollingSchedule, type StrategyCycleSelectionSnapshot } from "../lib/analysis/strategy-cycle-validation";
import type { MarketSeries } from "../lib/market/types";

function memoryIndexedDB() {
  const records = new Map<string, unknown>();
  let queue = Promise.resolve();
  let failWrites = false;
  const database = {
    close() {},
    transaction(_store: string, mode: string) {
      let release!: () => void;
      const previous = queue;
      queue = new Promise<void>((resolve) => { release = resolve; });
      let aborted = false;
      const writes = new Map<string, unknown>();
      const transaction = {
        oncomplete: null as (() => void) | null, onabort: null as (() => void) | null,
        onerror: null as (() => void) | null,
        abort() { aborted = true; },
        objectStore() {
          return {
            getAll() {
              const request = { result: [] as unknown[], onsuccess: null as (() => void) | null };
              void previous.then(() => {
                request.result = structuredClone([...records.values()]);
                request.onsuccess?.();
                queueMicrotask(() => {
                  if (aborted || (mode === "readwrite" && failWrites)) transaction.onabort?.();
                  else {
                    for (const [key, value] of writes) records.set(key, structuredClone(value));
                    transaction.oncomplete?.();
                  }
                  release();
                });
              });
              return request;
            },
            put(record: { key: string }) { writes.set(record.key, record); },
          };
        },
      };
      return transaction;
    },
  };
  return {
    records, failWrites(value: boolean) { failWrites = value; },
    factory: { open() {
      const request = { result: database, onsuccess: null as (() => void) | null };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    } } as unknown as IDBFactory,
  };
}

function fixture(count = 25) {
  const series: MarketSeries = { instrument: { secid: "^N225", code: "^N225", name: "Nikkei 225",
    exchange: "JPX", assetType: "index", provider: "yahoo" }, interval: "1d", source: "yahoo",
    priceAdjustment: "raw", latestBarStatus: "complete", fetchedAt: "2024-02-01T00:00:00Z", previousClose: 100,
    bars: Array.from({ length: count }, (_, index) => ({
      time: new Date(Date.UTC(2024, 0, index + 1)).toISOString().slice(0, 10), timestamp: Date.UTC(2024, 0, index + 1),
      open: 100 + index, close: 100 + index, high: 101 + index, low: 99 + index,
      volume: 1000, amount: 100_000, amplitude: 1, change: 1, changePercent: 1, turnoverRate: 0,
    })) };
  const snapshot = (index: number): StrategyCycleSelectionSnapshot => ({ decisionIndex: index,
    decisionTime: series.bars[index]!.time, screeningWindow: 5, label: "Test",
    plan: { strategyA: { strategyId: "roc-momentum", parameters: { period: 1, entry: 1, exit: -1 } },
      strategyB: null, strategyAAllocation: 1, strategyBAllocation: 0 }, fixedRelativeLongStrategy: null });
  const schedule = buildStrategyCycleRollingSchedule(series.bars, 10, 5)!;
  return { series, snapshot, profile: createValidatedCycleStrategy(series, schedule.decisionIndexes.map(snapshot),
    10, 5, { initialCash: 100_000, commissionRate: 0, slippageRate: 0, interval: "1d", executionPolicy: "hybrid" }) };
}

test("validated registry commits atomically, resumes without duplicates and reports storage failures", async () => {
  const memory = memoryIndexedDB();
  const oldDatabase = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: memory.factory });
  Object.defineProperty(globalThis, "window", { configurable: true, value: new EventTarget() });
  let notifications = 0;
  const unsubscribe = subscribeValidatedCycles(() => { notifications += 1; });
  try {
    const first = fixture();
    await Promise.all([publishValidatedCycle(first.profile), publishValidatedCycle(first.profile)]);
    let restored = await readValidatedCycles();
    assert.equal(restored.length, 1);
    assert.equal(restored[0]!.revision, 1);
    assert.deepEqual(restored[0]!.report, first.profile.report);
    const next = fixture(26);
    const statuses = await Promise.all([
      appendValidatedCycle(next.series, next.snapshot(25), "first"),
      appendValidatedCycle(next.series, next.snapshot(25), "second"),
    ]);
    assert.deepEqual(statuses.sort(), ["unchanged", "updated"]);
    restored = await readValidatedCycles();
    assert.equal(restored[0]!.revision, 2);
    assert.equal(restored[0]!.snapshots.length, first.profile.snapshots.length + 1);
    assert.equal(notifications, 2);
    const account = restored[0]!, archived = structuredClone(account.report);
    const preview = buildValidatedCyclePreview(account, DEFAULT_POSITION_OVERLAY_OPTIONS);
    await saveValidatedCyclePreview(account, DEFAULT_POSITION_OVERLAY_OPTIONS, preview);
    const cached = (await readValidatedCycles())[0]!;
    assert.deepEqual(cachedValidatedCyclePreview(cached, DEFAULT_POSITION_OVERLAY_OPTIONS), preview);
    assert.equal(cached.revision, account.revision);
    assert.deepEqual(cached.report, archived);
    assert.deepEqual(cached.settings, account.settings);
    await saveValidatedCyclePreview({ ...account, revision: account.revision - 1 }, DEFAULT_POSITION_OVERLAY_OPTIONS,
      buildValidatedCyclePreview({ ...account, revision: account.revision - 1 }, DEFAULT_POSITION_OVERLAY_OPTIONS));
    assert.deepEqual((await readValidatedCycles())[0]!.preview, preview);
    await assert.rejects(saveValidatedCyclePreview(account, DEFAULT_POSITION_OVERLAY_OPTIONS, { ...preview, key: "invalid" }),
      (error: unknown) => error instanceof ValidatedCycleError && error.code === "history");
    const gap = fixture(28);
    await assert.rejects(appendValidatedCycle(gap.series, gap.snapshot(27), "gap"),
      (error: unknown) => error instanceof ValidatedCycleError && error.code === "gap");
    assert.equal((await readValidatedCycles())[0]!.revision, 2);
    memory.failWrites(true);
    const failed = fixture(27);
    await assert.rejects(appendValidatedCycle(failed.series, failed.snapshot(26), "failed"),
      (error: unknown) => error instanceof ValidatedCycleError && error.code === "storage");
    assert.equal((await readValidatedCycles())[0]!.revision, 2);
    memory.failWrites(false);
    assert.equal(await appendValidatedCycle(failed.series, failed.snapshot(26), "retry"), "updated");
    assert.equal((await readValidatedCycles())[0]!.revision, 3);
    assert.equal(cachedValidatedCyclePreview((await readValidatedCycles())[0]!, DEFAULT_POSITION_OVERLAY_OPTIONS), null);
    for (let index = memory.records.size; index < 32; index += 1) {
      memory.records.set(`placeholder:${index}`, { ...first.profile, key: `placeholder:${index}` });
    }
    await assert.rejects(publishValidatedCycle({ ...first.profile, key: "new-profile" }),
      (error: unknown) => error instanceof ValidatedCycleError && error.code === "capacity");
    assert.equal(memory.records.size, 32);
  } finally {
    unsubscribe();
    if (oldDatabase) Object.defineProperty(globalThis, "indexedDB", oldDatabase);
    else Reflect.deleteProperty(globalThis, "indexedDB");
    if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("unavailable IndexedDB is an explicit error rather than false success", async () => {
  await assert.rejects(readValidatedCycles(), (error: unknown) => error instanceof ValidatedCycleError && error.code === "storage");
});

test("shared rule upgrade is atomic, idempotent, preserves a v7 backup and continues under v8", async () => {
  const memory = memoryIndexedDB();
  const oldDatabase = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: memory.factory });
  Object.defineProperty(globalThis, "window", { configurable: true, value: new EventTarget() });
  try {
    const first = fixture(), following = fixture(26);
    const legacy = createValidatedCycleStrategy(first.series, first.profile.snapshots, 10, 5,
      { ...first.profile.settings, positionOverlay: ATR_POSITION_OVERLAY_OPTIONS });
    legacy.pending = { series: following.series, snapshot: following.snapshot(25), provenance: "pending" };
    await publishValidatedCycle(legacy);
    const original = (await readValidatedCycles())[0]!;
    const preview = buildValidatedCyclePreview(original, DEFAULT_POSITION_OVERLAY_OPTIONS);
    memory.failWrites(true);
    await assert.rejects(promoteValidatedCycleRules(original, DEFAULT_POSITION_OVERLAY_OPTIONS, preview),
      (error: unknown) => error instanceof ValidatedCycleError && error.code === "storage");
    assert.deepEqual((await readValidatedCycles())[0], original);
    memory.failWrites(false);
    const outcomes = await Promise.all([
      promoteValidatedCycleRules(original, DEFAULT_POSITION_OVERLAY_OPTIONS, preview),
      promoteValidatedCycleRules(original, DEFAULT_POSITION_OVERLAY_OPTIONS, preview),
    ]);
    assert.deepEqual(outcomes.sort(), [false, true]);
    const upgraded = (await readValidatedCycles())[0]!;
    assert.deepEqual(upgraded.settings.positionOverlay, DEFAULT_POSITION_OVERLAY_OPTIONS);
    assert.deepEqual(upgraded.report, preview.report);
    assert.deepEqual(upgraded.ruleBackup?.report, original.report);
    assert.deepEqual(upgraded.ruleBackup?.settings, original.settings);
    assert.equal(upgraded.revision, original.revision + 1);
    assert.deepEqual(upgraded.series, original.series);
    assert.deepEqual(upgraded.snapshots, original.snapshots);
    assert.deepEqual(upgraded.pending, original.pending);
    assert.equal(await promoteValidatedCycleRules(original, DEFAULT_POSITION_OVERLAY_OPTIONS, preview), false);
    assert.equal(await promoteValidatedCycleRules(upgraded, DEFAULT_POSITION_OVERLAY_OPTIONS,
      buildValidatedCyclePreview(upgraded, DEFAULT_POSITION_OVERLAY_OPTIONS)), false);
    assert.equal(await appendValidatedCycle(following.series, following.snapshot(25), "after-upgrade"), "updated");
    const continued = (await readValidatedCycles())[0]!;
    assert.equal(continued.revision, upgraded.revision + 1);
    assert.deepEqual(continued.settings.positionOverlay, DEFAULT_POSITION_OVERLAY_OPTIONS);
    assert.deepEqual(continued.ruleBackup, upgraded.ruleBackup);
    assert.deepEqual(continued.snapshots.slice(0, -1), original.snapshots);
    assert.equal(continued.pending, null);
    const missing = { ...original, key: "missing-account", revision: 0 };
    assert.equal(await promoteValidatedCycleRules(missing, DEFAULT_POSITION_OVERLAY_OPTIONS,
      buildValidatedCyclePreview(missing, DEFAULT_POSITION_OVERLAY_OPTIONS)), false);
    assert.equal((await readValidatedCycles()).length, 1);
  } finally {
    if (oldDatabase) Object.defineProperty(globalThis, "indexedDB", oldDatabase);
    else Reflect.deleteProperty(globalThis, "indexedDB");
    if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
