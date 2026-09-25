import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { totalmem } from "node:os";
import { deserialize, serialize } from "node:v8";
import {
  ScreeningValidationError,
  runScreeningWithValidation,
} from "../lib/analysis/screening-validation";
import type { CombinationOptimizationCheckpoint } from "../lib/analysis/strategy-combinations";
import type { CombinationScreeningProgress } from "../lib/analysis/strategy-combinations";
import { entryFilterKey } from "../lib/analysis/strategy-combinations";
import { buildMovingAverageEntryAllowedSeries } from "../lib/analysis/entry-filter";
import type {
  LocalScreeningChildEvent,
  LocalScreeningEngineStatus,
  LocalScreeningJobRequest,
} from "../lib/analysis/screening-local-engine-protocol";
import { unpackMarketBars } from "../lib/analysis/screening-worker-bars";
import { screeningCheckpointInterval } from "../lib/analysis/screening-memory-policy";
import { compactCycleScreeningOutcome } from "../lib/analysis/shortcut-batch-screening";
import { replaceFileAtomically } from "./atomic-file";

const RESTART_EXIT_CODE = 75;
const jobDirectory = process.argv[2];
if (!jobDirectory) throw new Error("Screening job directory is required");
const requestPath = join(jobDirectory, "request.json");
const checkpointPath = join(jobDirectory, "checkpoint.bin");
const checkpointDirectory = join(jobDirectory, "checkpoint");
const checkpointManifestPath = join(checkpointDirectory, "manifest.json");
const resultPath = join(jobDirectory, "result.json");
const resultTemporaryPath = join(jobDirectory, "result.tmp");
const barsPath = join(jobDirectory, "bars.bin");
const localDerivedPath = join(jobDirectory, "derived.bin");
const PROGRESS_EMIT_INTERVAL_MS = 250;
const processStartedAt = Date.now();
const CHECKPOINT_SECTIONS = [
  "meta",
  "finalists",
  "entryFilters",
  "pairs",
  "triples",
  "higher",
  "results",
] as const;
type CheckpointSection = (typeof CHECKPOINT_SECTIONS)[number];
const CHECKPOINT_STAGE_ORDER = [
  "strategies", "entryFilters", "pairs", "allocations", "triples",
  "tripleAllocations", "quadruples", "quadrupleAllocations",
  "quintuples", "quintupleAllocations", "sextuples",
  "sextupleAllocations",
] as const;

function emit(event: LocalScreeningChildEvent): void {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

async function readCheckpoint(
  signature: string,
): Promise<CombinationOptimizationCheckpoint | null> {
  let manifestCandidates = [checkpointManifestPath];
  try {
    const entries = await readdir(checkpointDirectory, { withFileTypes: true });
    const recoveryCandidates = await Promise.all(
      entries
        .filter((entry) =>
          entry.isFile() &&
          entry.name !== "manifest.json" &&
          entry.name.startsWith("manifest") &&
          (entry.name.endsWith(".tmp") || entry.name.includes(".backup-")))
        .map(async (entry) => {
          const path = join(checkpointDirectory, entry.name);
          return { path, modifiedAt: (await stat(path)).mtimeMs };
        }),
    );
    manifestCandidates = [
      checkpointManifestPath,
      ...recoveryCandidates
        .sort((left, right) => right.modifiedAt - left.modifiedAt)
        .map((candidate) => candidate.path),
    ];
  } catch {
    // The normal manifest read below still handles a missing directory.
  }
  for (const manifestPath of manifestCandidates) {
    try {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
        signature?: string;
        sections?: Partial<Record<CheckpointSection, string>>;
      };
      if (manifest.signature !== signature || !manifest.sections) continue;
      const readSection = async <T>(section: CheckpointSection): Promise<T> => {
        const filename = manifest.sections?.[section];
        if (!filename) throw new Error(`Missing checkpoint section ${section}`);
        return deserialize(await readFile(join(checkpointDirectory, filename))) as T;
      };
      const [meta, finalistsByStrategy, entryFilterCandidatesByStrategy,
        pairFinalists, tripleFinalists, higherOrderFinalists, results] =
        await Promise.all([
          readSection<Pick<CombinationOptimizationCheckpoint,
            "version" | "progress" | "entryFilterCandidateCount">>("meta"),
          readSection<CombinationOptimizationCheckpoint["finalistsByStrategy"]>("finalists"),
          readSection<CombinationOptimizationCheckpoint["entryFilterCandidatesByStrategy"]>("entryFilters"),
          readSection<CombinationOptimizationCheckpoint["pairFinalists"]>("pairs"),
          readSection<CombinationOptimizationCheckpoint["tripleFinalists"]>("triples"),
          readSection<CombinationOptimizationCheckpoint["higherOrderFinalists"]>("higher"),
          readSection<CombinationOptimizationCheckpoint["results"]>("results"),
        ]);
      return {
        ...meta,
        finalistsByStrategy,
        entryFilterCandidatesByStrategy,
        pairFinalists,
        tripleFinalists,
        higherOrderFinalists,
        results,
      };
    } catch {
      // Try the next manifest generation before the version-1 fallback.
    }
  }
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
): Promise<{ bytes: number; milliseconds: number }> {
  const startedAt = performance.now();
  let bytes = 0;
  await mkdir(checkpointDirectory, { recursive: true });
  let previousSections: Partial<Record<CheckpointSection, string>> = {};
  try {
    const previous = JSON.parse(await readFile(checkpointManifestPath, "utf8")) as {
      signature?: string;
      sections?: Partial<Record<CheckpointSection, string>>;
    };
    if (previous.signature === signature) previousSections = previous.sections ?? {};
  } catch {
    previousSections = {};
  }
  const stageIndex = CHECKPOINT_STAGE_ORDER.indexOf(checkpoint.progress.stage);
  const lastMutableStage: Record<CheckpointSection, number> = {
    meta: Number.POSITIVE_INFINITY,
    finalists: 3,
    entryFilters: 1,
    pairs: 3,
    triples: 5,
    higher: Number.POSITIVE_INFINITY,
    results: Number.POSITIVE_INFINITY,
  };
  const values: Record<CheckpointSection, unknown> = {
    meta: {
      version: checkpoint.version,
      progress: checkpoint.progress,
      entryFilterCandidateCount: checkpoint.entryFilterCandidateCount,
    },
    finalists: checkpoint.finalistsByStrategy,
    entryFilters: checkpoint.entryFilterCandidatesByStrategy,
    pairs: checkpoint.pairFinalists,
    triples: checkpoint.tripleFinalists,
    higher: checkpoint.higherOrderFinalists,
    results: checkpoint.results,
  };
  const generation = `${stageIndex}-${checkpoint.progress.stageCompleted}-${Date.now()}`;
  const sections = { ...previousSections };
  for (const section of CHECKPOINT_SECTIONS) {
    if (sections[section] && stageIndex > lastMutableStage[section]) continue;
    const filename = `${section}-${generation}.bin`;
    const temporary = join(checkpointDirectory, `${filename}.tmp`);
    const encoded = serialize(values[section]);
    bytes += encoded.byteLength;
    await writeFile(temporary, encoded);
    await rename(temporary, join(checkpointDirectory, filename));
    sections[section] = filename;
  }
  const manifestTemporary = join(
    checkpointDirectory,
    `manifest-${Date.now()}-${process.pid}.tmp`,
  );
  await writeFile(
    manifestTemporary,
    JSON.stringify({ format: 2, signature, sections }),
  );
  await replaceFileAtomically(manifestTemporary, checkpointManifestPath);
  const retained = new Set(Object.values(sections));
  for (const entry of await readdir(checkpointDirectory, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".bin") && !retained.has(entry.name)) {
      await rm(join(checkpointDirectory, entry.name), { force: true }).catch(() => {});
    } else if (
      entry.isFile() &&
      entry.name.startsWith("manifest") &&
      (entry.name.endsWith(".tmp") || entry.name.includes(".backup-"))
    ) {
      await rm(join(checkpointDirectory, entry.name), { force: true }).catch(() => {});
    }
  }
  return { bytes, milliseconds: performance.now() - startedAt };
}

async function main(): Promise<void> {
  const request = JSON.parse(
    await readFile(requestPath, "utf8"),
  ) as LocalScreeningJobRequest & {
    bars?: LocalScreeningJobRequest["bars"];
    barCount?: number;
    sharedBarsPath?: string;
    sharedDerivedPath?: string;
  };
  const bars = request.bars ?? unpackMarketBars(
    deserialize(await readFile(request.sharedBarsPath ?? barsPath)),
    request.barCount,
  );
  const derivedPath = request.sharedDerivedPath ?? localDerivedPath;
  const derivedTemporaryPath = `${derivedPath}.${process.pid}.tmp`;
  const derivedSignature = JSON.stringify({
    barCount: bars.length,
    lastTime: bars.at(-1)?.time,
    entryFilter: request.settings.entryFilter ?? null,
    entryFilters: request.options.entryFilters ?? [],
  });
  let entryFilterAllowedByKey = new Map<string, readonly boolean[]>();
  try {
    const stored = deserialize(await readFile(derivedPath)) as {
      signature?: string;
      entryFilterAllowedByKey?: Array<[string, boolean[]]>;
    };
    if (stored.signature === derivedSignature) {
      entryFilterAllowedByKey = new Map(stored.entryFilterAllowedByKey ?? []);
    }
  } catch {
    const filters = [request.settings.entryFilter, ...(request.options.entryFilters ?? [])]
      .filter((filter) => Boolean(filter));
    entryFilterAllowedByKey = new Map(
      filters.map((filter) => [
        entryFilterKey(filter),
        buildMovingAverageEntryAllowedSeries(bars, filter) ?? [],
      ]),
    );
    await writeFile(
      derivedTemporaryPath,
      serialize({
        signature: derivedSignature,
        entryFilterAllowedByKey: [...entryFilterAllowedByKey],
      }),
    );
    await replaceFileAtomically(derivedTemporaryPath, derivedPath);
  }
  const resumeCheckpoint = await readCheckpoint(request.checkpoint.signature);
  const controller = new AbortController();
  let restartRequested = false;
  let checkpointWrite: Promise<{ bytes: number; milliseconds: number } | null> =
    Promise.resolve(null);
  let lastOptimizationEmitAt = 0;
  let lastValidationEmitAt = 0;
  let lastTelemetryAt = Date.now();
  let lastTelemetryStage = "";
  let lastTelemetryCompleted = 0;
  let lastEngineStatus: LocalScreeningEngineStatus | null = null;
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
    lastEngineStatus = {
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
        elapsedSeconds: (now - processStartedAt) / 1_000,
    };
    emit({ type: "telemetry", status: lastEngineStatus });
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
        entryFilterAllowedByKey,
        yieldEvery: bars.length > 7_500 ? 1_024 : 2_048,
        resumeCheckpoint,
        checkpointEvery: screeningCheckpointInterval(
          bars.length,
          totalmem(),
        ),
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
  const checkpointMetrics = await checkpointWrite;
  if (restartRequested) {
    if (lastEngineStatus && checkpointMetrics) {
      const status: LocalScreeningEngineStatus = lastEngineStatus;
      emit({
        type: "telemetry",
        status: {
          ...status,
          updatedAt: Date.now(),
          checkpointBytes: checkpointMetrics.bytes,
          checkpointWriteMilliseconds: checkpointMetrics.milliseconds,
        },
      });
    }
    emit({ type: "restart" });
    process.exitCode = RESTART_EXIT_CODE;
    return;
  }
  if (!outcome) throw new Error("Screening finished without an outcome");
  const persistedOutcome = request.checkpoint.key.startsWith("screening:cycle:")
    ? compactCycleScreeningOutcome(outcome, request.options.objective ?? "balanced")
    : outcome;
  await writeFile(resultTemporaryPath, JSON.stringify(persistedOutcome));
  await rename(resultTemporaryPath, resultPath);
  await rm(checkpointPath, { force: true });
  await rm(checkpointDirectory, { recursive: true, force: true });
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
