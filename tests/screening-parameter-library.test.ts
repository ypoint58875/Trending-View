import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildScreeningCandidates } from "../lib/analysis/screening";
import { STRATEGIES } from "../lib/analysis/strategies";
import { optimizeStrategyCombinations, COMBINATION_FINALISTS_PER_STRATEGY, COMBINATION_STRATEGY_PERCENTILE,
  SCREENING_RESULT_MODEL_VERSION, selectCombinationStrategyIds, TWO_STRATEGY_ALLOCATION_CANDIDATES,
  THREE_STRATEGY_ALLOCATION_CANDIDATES, FOUR_STRATEGY_ALLOCATION_CANDIDATES,
  type CombinationOptimizationCheckpoint } from "../lib/analysis/strategy-combinations";
import { buildCheckpointIdentity } from "../lib/analysis/screening-worker-client";
import { LOCAL_SCREENING_ENGINE_VERSION } from "../lib/analysis/screening-local-engine-protocol";
import { enqueueScreeningBatchInLocalEngine, screeningJobRequest } from "../lib/analysis/screening-local-engine-client";
import { compactCycleScreeningOutcome } from "../lib/analysis/shortcut-batch-screening";
import { runScreeningWithValidation } from "../lib/analysis/screening-validation";
import { isCurrentCycleScreeningSignature } from "../lib/analysis/strategy-cycle-validation-store";
import type { BacktestResult } from "../lib/analysis/backtest";
import type { MarketBar } from "../lib/market/types";

const settings = { initialCash: 100000, commissionRate: 0.0003, slippageRate: 0.0002, interval: "1d" as const };
const bars: MarketBar[] = Array.from({ length: 80 }, (_, i) => {
  const time = new Date(Date.UTC(2025, 0, i + 1)).toISOString().slice(0, 10), close = 100 + i / 8 + Math.sin(i / 3) * 8;
  return { time, timestamp: Date.parse(time), open: close - 0.2, high: close + 1, low: close - 1, close,
    volume: 10000, amount: 1000000, amplitude: 1, changePercent: 0, change: 0, turnoverRate: 0 };
});
const excluded = STRATEGIES.filter(row => row.id !== "sma-cross").map(row => row.id);
const config = { mode: "sample" as const, periods: [{ sessions: 20, weight: 100 }] };
const options = { objective: "totalReturn" as const, excludedStrategyIds: excluded, maxCombinationStrategies: 2 };

// The former reusable-library tests now cover full-only search and legacy-mode rejection.
test("full search policy retains six execution candidates and all eligible families", () => {
  assert.equal(COMBINATION_FINALISTS_PER_STRATEGY, 6);
  assert.equal(COMBINATION_STRATEGY_PERCENTILE, 100);
  const rows = STRATEGIES.map((row, i) => ({ strategyId: row.id, totalReturn: -i, score: -i, sharpe: -i,
    maxDrawdown: -100, parameters: {} }) as BacktestResult);
  const selected = selectCombinationStrategyIds(rows, "totalReturn");
  assert.equal(selected.size, STRATEGIES.length);
  assert.ok(selected.has(rows.at(-1)!.strategyId));
});

test("full screening evaluates the complete family grid and retains its six finalists", async () => {
  const result = await optimizeStrategyCombinations(bars, settings, options);
  assert.equal(result.evaluatedCount, buildScreeningCandidates(["long", "short"], excluded).length);
  assert.equal(result.singleCandidatePool.length, 6);
  assert.equal("parameterLeaders" in result, false);
  assert.equal(result.failedCount, 0);
});

test("six candidates per family produce all thirty-six parameter pairings", async () => {
  const grid = buildScreeningCandidates();
  const candidates = ["sma-cross", "ema-cross"].flatMap(id => grid.filter(r => r.strategyId === id).slice(0, 6));
  const totals = new Map<string, number>();
  const result = await optimizeStrategyCombinations(bars, settings, { candidates, objective: "totalReturn", maxCombinationStrategies: 2,
    allocationCandidates: TWO_STRATEGY_ALLOCATION_CANDIDATES.slice(0, 1), onProgress: p => { totals.set(p.stage, p.stageTotal); } });
  assert.equal(totals.get("strategies"), 12);
  assert.equal(totals.get("pairs"), 36);
  assert.equal(result.singleCandidatePool.length, 12);
  assert.equal(result.failedCount, 0);
});

test("current search checkpoints resume exactly without a parameter library", async () => {
  const controller = new AbortController(); let checkpoint: CombinationOptimizationCheckpoint | undefined;
  await optimizeStrategyCombinations(bars, settings, { ...options, checkpointEvery: 20, signal: controller.signal,
    onCheckpoint: value => { checkpoint = structuredClone(value); controller.abort(); } });
  assert.ok(checkpoint);
  assert.equal(checkpoint.resultModelVersion, SCREENING_RESULT_MODEL_VERSION);
  const resumed = await optimizeStrategyCombinations(bars, settings, { ...options, resumeCheckpoint: checkpoint });
  const fresh = await optimizeStrategyCombinations(bars, settings, options);
  assert.deepEqual(resumed.singleCandidatePool, fresh.singleCandidatePool);
  assert.deepEqual(resumed.results, fresh.results);
  assert.equal("parameterLeaders" in checkpoint, false);
});

test("obsolete search checkpoints restart rather than resume a narrower search", async () => {
  const controller = new AbortController(); let checkpoint: CombinationOptimizationCheckpoint | undefined;
  await optimizeStrategyCombinations(bars, settings, { ...options, checkpointEvery: 20, signal: controller.signal,
    onCheckpoint: value => { checkpoint = structuredClone(value); controller.abort(); } });
  assert.ok(checkpoint);
  const legacy = { ...checkpoint, resultModelVersion: SCREENING_RESULT_MODEL_VERSION - 1 } as unknown as CombinationOptimizationCheckpoint;
  const resumed = await optimizeStrategyCombinations(bars, settings, { ...options, resumeCheckpoint: legacy });
  const fresh = await optimizeStrategyCombinations(bars, settings, options);
  assert.deepEqual(resumed, fresh);
});

test("cycle compaction preserves full-search winners without reusable-library metadata", async () => {
  const outcome = await runScreeningWithValidation(bars, settings, config, options);
  const compact = compactCycleScreeningOutcome(outcome, "totalReturn");
  assert.equal(compact.singleResults.length + compact.results.length, 1);
  assert.equal("parameterLeaders" in outcome, false);
  assert.equal(compact.evaluatedCount, outcome.evaluatedCount);
});

test("new checkpoint identities include the current result model and isolate search settings", () => {
  const identity = buildCheckpointIdentity(bars, settings, config, options);
  const parsed = JSON.parse(identity.signature);
  assert.equal(parsed.resultModelVersion, SCREENING_RESULT_MODEL_VERSION);
  assert.equal("quickScreening" in parsed, false);
  assert.notEqual(identity.signature, buildCheckpointIdentity(bars, settings, config, { ...options, objective: "sharpe" }).signature);
  const request = screeningJobRequest(bars, settings, config, options, identity);
  assert.equal("quickScreening" in request.options, false);
});

test("obsolete quick requests fail explicitly rather than silently run a restricted grid", async () => {
  const legacy = { ...options, quickScreening: true };
  await assert.rejects(runScreeningWithValidation(bars, settings, config, legacy), { code: "unsupported-screening-mode" });
  await assert.rejects(optimizeStrategyCombinations(bars, settings, legacy), /removed/);
});

test("obsolete quick validation configurations are rejected before computation", async () => {
  const legacy = { ...config, parameterSearch: { mode: "quick", profileKey: "old", candidateCount: 3 } };
  await assert.rejects(runScreeningWithValidation(bars, settings, legacy, options), { code: "unsupported-screening-mode" });
});

test("old cycle tasks cannot restore their winners or queues under the new search policy", () => {
  const signature = { resultModelVersion: SCREENING_RESULT_MODEL_VERSION, screeningWindows: [10] };
  assert.equal(isCurrentCycleScreeningSignature(JSON.stringify(signature)), true);
  assert.equal(isCurrentCycleScreeningSignature(JSON.stringify({ ...signature, resultModelVersion: SCREENING_RESULT_MODEL_VERSION - 1 })), false);
  assert.equal(isCurrentCycleScreeningSignature(JSON.stringify({ ...signature, quickCandidatesByWindow: { "10": [] } })), false);
  assert.equal(isCurrentCycleScreeningSignature(JSON.stringify({ ...signature, quickLibraryKey: "old" })), false);
  assert.equal(isCurrentCycleScreeningSignature("bad-json"), false);
});

test("full screening batch uploads remain bounded and preserve deterministic ordering", async context => {
  const sizes: number[] = [];
  context.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    const buffer = init!.body as ArrayBuffer, size = new DataView(buffer).getUint32(0, true);
    const payload = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, size)));
    sizes.push(payload.jobs.length);
    return new Response(JSON.stringify({ jobIds: payload.jobs.map((j: { checkpoint: { key: string } }) => j.checkpoint.key) }),
      { headers: { "Content-Type": "application/json" } });
  });
  const jobs = Array.from({ length: 130 }, (_, i) => ({ version: LOCAL_SCREENING_ENGINE_VERSION, settings, config, barCount: bars.length,
    checkpoint: { key: String(i), signature: String(i) },
    options: { candidates: buildScreeningCandidates(["long", "short"], excluded).slice(0, 6) } }));
  assert.deepEqual(await enqueueScreeningBatchInLocalEngine(bars, jobs), jobs.map(j => j.checkpoint.key));
  assert.deepEqual(sizes, [64, 64, 2]);
});

test("full staged expansion resumes exactly through higher-order combinations", async () => {
  const grid = buildScreeningCandidates();
  const candidates = ["sma-cross", "ema-cross", "rsi-reversal", "tv-macd", "bollinger-reversion"]
    .flatMap(id => grid.filter(row => row.strategyId === id).slice(0, 2));
  const settingsForRun = { candidates, objective: "totalReturn" as const, maxCombinationStrategies: 4,
    allocationCandidates: TWO_STRATEGY_ALLOCATION_CANDIDATES.slice(0, 1),
    tripleAllocationCandidates: THREE_STRATEGY_ALLOCATION_CANDIDATES.slice(0, 1),
    quadrupleAllocationCandidates: FOUR_STRATEGY_ALLOCATION_CANDIDATES.slice(0, 1) };
  const controller = new AbortController(); let checkpoint: CombinationOptimizationCheckpoint | undefined;
  await optimizeStrategyCombinations(bars, settings, { ...settingsForRun, checkpointEvery: 10, signal: controller.signal,
    onCheckpoint: value => { if (value.progress.stage === "triples") { checkpoint = structuredClone(value); controller.abort(); } } });
  assert.ok(checkpoint);
  const resumed = await optimizeStrategyCombinations(bars, settings, { ...settingsForRun, resumeCheckpoint: checkpoint });
  const fresh = await optimizeStrategyCombinations(bars, settings, settingsForRun);
  assert.deepEqual(resumed.results, fresh.results);
  assert.equal(resumed.evaluatedCount, fresh.evaluatedCount);
});

test("production workspaces expose no quick-screen controls or reusable-library imports", async () => {
  for (const path of ["app/MarketWorkspace.tsx", "app/strategy-validation/StrategyValidationWorkspace.tsx"]) {
    const source = await readFile(path, "utf8");
    assert.doesNotMatch(source, /quickScreening|quickCandidates|quickLibrary|screening-parameter/);
  }
});
