import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { MarketBar } from "../lib/market/types";
import type { BacktestSettings } from "../lib/analysis/backtest";
import {
  optimizeStrategyCombinations,
  TWO_STRATEGY_ALLOCATION_CANDIDATES,
  THREE_STRATEGY_ALLOCATION_CANDIDATES,
  FOUR_STRATEGY_ALLOCATION_CANDIDATES,
  FIVE_STRATEGY_ALLOCATION_CANDIDATES,
  SIX_STRATEGY_ALLOCATION_CANDIDATES,
  type CombinationOptimizationCheckpoint,
  type CombinationOptimizationResult,
  type CombinationScreeningStage,
  type OptimizeStrategyCombinationsOptions,
} from "../lib/analysis/strategy-combinations";
import type { ScreeningObjective } from "../lib/analysis/screening";

interface SelectionFixture {
  sourceHash: string;
  datasets: Record<string, MarketBar[]>;
  settings: BacktestSettings;
  options: OptimizeStrategyCombinationsOptions;
  cases: Array<{
    shape: string; sessions: number; objective: ScreeningObjective;
    hash: string; evaluatedCount: number;
    topSingle: CombinationOptimizationResult["singleResults"][number];
    topCombination: CombinationOptimizationResult["results"][number];
  }>;
}

// Captured before the performance changes. The hash covers every ranked row,
// parameter, allocation, metric, candidate-pool item and execution count.
const fixture = JSON.parse(await readFile(
  new URL("./fixtures/screening-exact-selection.json", import.meta.url), "utf8",
)) as SelectionFixture;
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const stages: CombinationScreeningStage[] = [
  "strategies", "entryFilters", "pairs", "allocations", "triples", "tripleAllocations",
  "quadruples", "quadrupleAllocations", "quintuples", "quintupleAllocations",
  "sextuples", "sextupleAllocations",
];

for (const scenario of fixture.cases) {
  test(`exact search matches pre-change selection: ${scenario.shape}/${scenario.sessions}/${scenario.objective}`, async () => {
    const bars = fixture.datasets[scenario.shape];
    const result = await optimizeStrategyCombinations(bars, {
      ...fixture.settings, startTime: bars.at(-scenario.sessions)!.time, endTime: bars.at(-1)!.time,
    }, { ...fixture.options, objective: scenario.objective });
    assert.equal(result.failedCount, 0);
    assert.equal(result.evaluatedCount, scenario.evaluatedCount);
    assert.deepEqual(result.singleResults[0], scenario.topSingle);
    assert.deepEqual(result.results[0], scenario.topCombination);
    assert.equal(digest(result), scenario.hash);
  });
}

for (const objective of ["balanced", "totalReturn", "sharpe"] as const) {
  test(`every stage resumes with identical complete results and tie order: ${objective}`, async () => {
    // Flat data deliberately makes different parameter/allocation candidates
    // tie, so an incidental traversal-order change cannot hide behind returns.
    for (const shape of ["flat", "volatile"]) {
      const bars = fixture.datasets[shape];
      const settings = { ...fixture.settings, startTime: bars.at(-10)!.time, endTime: bars.at(-1)!.time };
      const options = { ...fixture.options, objective };
      const checkpoints = new Map<string, CombinationOptimizationCheckpoint>();
      const uninterrupted = await optimizeStrategyCombinations(bars, settings, {
        ...options, yieldEvery: 1, checkpointEvery: 1,
        onCheckpoint(checkpoint) {
          const { stage, stageCompleted, stageTotal } = checkpoint.progress;
          const key = `${stage}:${stageCompleted === stageTotal ? "end" : "inside"}`;
          if (!checkpoints.has(key)) checkpoints.set(key, structuredClone(checkpoint));
        },
      });
      assert.equal(uninterrupted.failedCount, 0);
      for (const stage of stages) {
        assert.ok(checkpoints.has(`${stage}:end`), `missing boundary: ${shape}/${stage}`);
        assert.ok(checkpoints.has(`${stage}:inside`), `missing interior: ${shape}/${stage}`);
      }
      for (const [key, checkpoint] of checkpoints) {
        const progress: Array<{ stage: CombinationScreeningStage; completed: number }> = [];
        const resumed = await optimizeStrategyCombinations(bars, settings, {
          ...options, resumeCheckpoint: structuredClone(checkpoint),
          onProgress(value) { progress.push({ stage: value.stage, completed: value.completed }); },
        });
        assert.deepEqual(resumed, uninterrupted, `${shape}/${objective}/${key}`);
        assert.ok(progress.every(value => stages.indexOf(value.stage) >= stages.indexOf(checkpoint.progress.stage)));
        assert.ok(progress.every(value => value.completed >= checkpoint.progress.completed));
        assert.ok(progress.every((value, index) => index === 0 || value.completed >= progress[index - 1].completed));
        assert.ok(progress.every(value => value.stage !== checkpoint.progress.stage || value.completed > checkpoint.progress.completed));
      }
    }
  });
}

test("repeated persisted interruption preserves failed counts and does not change selection", async () => {
  const bars = fixture.datasets.volatile;
  const options: OptimizeStrategyCombinationsOptions = {
    ...fixture.options,
    candidates: [{ strategyId: "invalid-test-only" as never, parameters: {} }, ...fixture.options.candidates!],
    objective: "totalReturn", yieldEvery: 1, checkpointEvery: 1,
  };
  const settings = { ...fixture.settings, startTime: bars.at(-10)!.time };
  const uninterrupted = await optimizeStrategyCombinations(bars, settings, options);
  let checkpoint: CombinationOptimizationCheckpoint | undefined;
  for (const target of ["strategies", "pairs", "quadruples", "sextupleAllocations"] as const) {
    const controller = new AbortController();
    const interrupted = await optimizeStrategyCombinations(bars, settings, {
      ...options, resumeCheckpoint: checkpoint, signal: controller.signal,
      onCheckpoint(value) {
        if (value.progress.stage === target && value.progress.stageCompleted < value.progress.stageTotal) {
          checkpoint = structuredClone(value);
          controller.abort();
        }
      },
    });
    assert.equal(interrupted.cancelled, true);
    assert.equal(checkpoint!.progress.stage, target);
    assert.equal(checkpoint!.progress.failed, 1);
  }
  const resumed = await optimizeStrategyCombinations(bars, settings, { ...options, resumeCheckpoint: checkpoint });
  assert.equal(resumed.failedCount, 1);
  assert.deepEqual(resumed, uninterrupted);
});

test("allocation cursors preserve interior row offsets across the complete weight grids", async () => {
  const bars = fixture.datasets.volatile;
  const settings = { ...fixture.settings, startTime: bars.at(-10)!.time };
  const options: OptimizeStrategyCombinationsOptions = {
    ...fixture.options,
    candidates: fixture.options.candidates!.filter((_, index) => index % 2 === 0).slice(0, 6),
    entryFilters: [], objective: "totalReturn",
    allocationCandidates: TWO_STRATEGY_ALLOCATION_CANDIDATES,
    tripleAllocationCandidates: THREE_STRATEGY_ALLOCATION_CANDIDATES,
    quadrupleAllocationCandidates: FOUR_STRATEGY_ALLOCATION_CANDIDATES,
    quintupleAllocationCandidates: FIVE_STRATEGY_ALLOCATION_CANDIDATES,
    sextupleAllocationCandidates: SIX_STRATEGY_ALLOCATION_CANDIDATES,
  };
  const strides = new Map<CombinationScreeningStage, number>([
    ["allocations", TWO_STRATEGY_ALLOCATION_CANDIDATES.length - 1],
    ["tripleAllocations", THREE_STRATEGY_ALLOCATION_CANDIDATES.length - 1],
    ["quadrupleAllocations", FOUR_STRATEGY_ALLOCATION_CANDIDATES.length - 1],
    ["quintupleAllocations", FIVE_STRATEGY_ALLOCATION_CANDIDATES.length - 1],
    ["sextupleAllocations", SIX_STRATEGY_ALLOCATION_CANDIDATES.length - 1],
  ]);
  const checkpoints = new Map<CombinationScreeningStage, CombinationOptimizationCheckpoint>();
  const uninterrupted = await optimizeStrategyCombinations(bars, settings, {
    ...options, yieldEvery: 1, checkpointEvery: 1,
    onCheckpoint(checkpoint) {
      const { stage, stageCompleted, stageTotal } = checkpoint.progress;
      const stride = strides.get(stage);
      if (stride === undefined) return;
      const offset = Math.min(stride + 3, Math.floor(stageTotal / 2));
      if (stageCompleted === offset) {
        assert.notEqual(offset % stride, 0, "must exercise an interior allocation row");
        checkpoints.set(stage, structuredClone(checkpoint));
      }
    },
  });
  assert.equal(checkpoints.size, strides.size);
  assert.equal(uninterrupted.failedCount, 0);
  for (const checkpoint of checkpoints.values()) {
    const resumed = await optimizeStrategyCombinations(bars, settings, {
      ...options, resumeCheckpoint: structuredClone(checkpoint),
    });
    assert.deepEqual(resumed, uninterrupted, checkpoint.progress.stage);
  }
});
