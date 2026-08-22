import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { deserialize, serialize } from "node:v8";
import {
  ScreeningValidationError,
  runScreeningWithValidation,
} from "../lib/analysis/screening-validation";
import type { CombinationOptimizationCheckpoint } from "../lib/analysis/strategy-combinations";
import type { CombinationScreeningProgress } from "../lib/analysis/strategy-combinations";
import type {
  LocalScreeningChildEvent,
  LocalScreeningJobRequest,
} from "../lib/analysis/screening-local-engine-protocol";
import { unpackMarketBars } from "../lib/analysis/screening-worker-bars";

const RESTART_EXIT_CODE = 75;
const jobDirectory = process.argv[2];
if (!jobDirectory) throw new Error("Screening job directory is required");
const requestPath = join(jobDirectory, "request.json");
const checkpointPath = join(jobDirectory, "checkpoint.bin");
const checkpointTemporaryPath = join(jobDirectory, "checkpoint.tmp");
const resultPath = join(jobDirectory, "result.json");
const resultTemporaryPath = join(jobDirectory, "result.tmp");
const barsPath = join(jobDirectory, "bars.bin");
const PROGRESS_EMIT_INTERVAL_MS = 250;

function emit(event: LocalScreeningChildEvent): void {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

async function readCheckpoint(
  signature: string,
): Promise<CombinationOptimizationCheckpoint | null> {
  try {
    const stored = deserialize(await readFile(checkpointPath)) as {
      signature?: string;
      checkpoint?: CombinationOptimizationCheckpoint;
    };
    return stored.signature === signature ? stored.checkpoint ?? null : null;
  } catch {
    return null;
  }
}

async function writeCheckpoint(
  signature: string,
  checkpoint: CombinationOptimizationCheckpoint,
): Promise<void> {
  await writeFile(
    checkpointTemporaryPath,
    serialize({ signature, checkpoint }),
  );
  await rename(checkpointTemporaryPath, checkpointPath);
}

async function main(): Promise<void> {
  const request = JSON.parse(
    await readFile(requestPath, "utf8"),
  ) as LocalScreeningJobRequest & { bars?: LocalScreeningJobRequest["bars"] };
  const bars = request.bars ?? unpackMarketBars(deserialize(await readFile(barsPath)));
  const resumeCheckpoint = await readCheckpoint(request.checkpoint.signature);
  const controller = new AbortController();
  let restartRequested = false;
  let checkpointWrite = Promise.resolve();
  let lastOptimizationEmitAt = 0;
  let lastValidationEmitAt = 0;
  let lastTelemetryAt = Date.now();
  let lastTelemetryStage = "";
  let lastTelemetryCompleted = 0;
  const emitOptimizationProgress = (
    progress: CombinationScreeningProgress,
  ) => {
    const now = Date.now();
    if (
      now - lastOptimizationEmitAt < PROGRESS_EMIT_INTERVAL_MS &&
      progress.stageCompleted !== progress.stageTotal
    ) return;
    lastOptimizationEmitAt = now;
    emit({ type: "optimization-progress", progress });
    const sameStage = lastTelemetryStage === progress.stage;
    const elapsedSeconds = Math.max((now - lastTelemetryAt) / 1_000, 0.001);
    const completedDelta = sameStage
      ? Math.max(progress.stageCompleted - lastTelemetryCompleted, 0)
      : 0;
    const evaluationsPerSecond = completedDelta / elapsedSeconds;
    const memory = process.memoryUsage();
    emit({
      type: "telemetry",
      status: {
        updatedAt: now,
        restartCount: 0,
        evaluationsPerSecond,
        estimatedRemainingSeconds:
          evaluationsPerSecond > 0
            ? Math.max(progress.stageTotal - progress.stageCompleted, 0) /
              evaluationsPerSecond
            : null,
        residentBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
      },
    });
    lastTelemetryAt = now;
    lastTelemetryStage = progress.stage;
    lastTelemetryCompleted = progress.stageCompleted;
  };
  let outcome;
  try {
    outcome = await runScreeningWithValidation(
      bars,
      request.settings,
      request.config,
      {
        ...request.options,
        resumeCheckpoint,
        checkpointEvery: 8_192,
        signal: controller.signal,
        onCheckpoint: (checkpoint) => {
          checkpointWrite = writeCheckpoint(
            request.checkpoint.signature,
            checkpoint,
          );
          restartRequested = true;
          controller.abort();
        },
        onProgress: emitOptimizationProgress,
        onValidationProgress: (progress) => {
          const now = Date.now();
          if (
            now - lastValidationEmitAt < PROGRESS_EMIT_INTERVAL_MS &&
            progress.completed !== progress.total
          ) return;
          lastValidationEmitAt = now;
          emit({ type: "validation-progress", progress });
        },
      },
    );
  } catch (error) {
    if (!restartRequested) throw error;
  }
  await checkpointWrite;
  if (restartRequested) {
    emit({ type: "restart" });
    process.exitCode = RESTART_EXIT_CODE;
    return;
  }
  if (!outcome) throw new Error("Screening finished without an outcome");
  await writeFile(resultTemporaryPath, JSON.stringify(outcome));
  await rename(resultTemporaryPath, resultPath);
  await rm(checkpointPath, { force: true });
  emit({ type: "completed" });
}

main().catch((error: unknown) => {
  emit({
    type: "error",
    ...(error instanceof ScreeningValidationError
      ? { code: error.code }
      : {}),
    message: error instanceof Error ? error.message : "Screening engine failed",
  });
  process.exitCode = 1;
});
