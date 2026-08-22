import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { deserialize, serialize } from "node:v8";
import {
  ScreeningValidationError,
  runScreeningWithValidation,
} from "../lib/analysis/screening-validation";
import type { CombinationOptimizationCheckpoint } from "../lib/analysis/strategy-combinations";
import type {
  LocalScreeningChildEvent,
  LocalScreeningJobRequest,
} from "../lib/analysis/screening-local-engine-protocol";

const RESTART_EXIT_CODE = 75;
const jobDirectory = process.argv[2];
if (!jobDirectory) throw new Error("Screening job directory is required");
const requestPath = join(jobDirectory, "request.json");
const checkpointPath = join(jobDirectory, "checkpoint.bin");
const checkpointTemporaryPath = join(jobDirectory, "checkpoint.tmp");
const resultPath = join(jobDirectory, "result.json");
const resultTemporaryPath = join(jobDirectory, "result.tmp");

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
  ) as LocalScreeningJobRequest;
  const resumeCheckpoint = await readCheckpoint(request.checkpoint.signature);
  const controller = new AbortController();
  let restartRequested = false;
  let checkpointWrite = Promise.resolve();
  let outcome;
  try {
    outcome = await runScreeningWithValidation(
      request.bars,
      request.settings,
      request.config,
      {
        ...request.options,
        resumeCheckpoint,
        checkpointEvery: 4_096,
        signal: controller.signal,
        onCheckpoint: (checkpoint) => {
          checkpointWrite = writeCheckpoint(
            request.checkpoint.signature,
            checkpoint,
          );
          restartRequested = true;
          controller.abort();
        },
        onProgress: (progress) =>
          emit({ type: "optimization-progress", progress }),
        onValidationProgress: (progress) =>
          emit({ type: "validation-progress", progress }),
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
