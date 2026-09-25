import {
  compareScreeningResults,
  type ScreeningObjective,
} from "./screening";
import type {
  ScreeningCombinationResult,
  ScreeningSingleResult,
} from "./screening-validation";

export const SHORTCUT_BATCH_CHECKPOINT_KEY =
  "quantscope.shortcut-batch-screening.v1";
export const MAX_SHORTCUT_BATCH_INSTRUMENTS = 256;

export interface ShortcutBatchCheckpoint {
  version: 2;
  resumeReason: "failure";
  runId: string;
  configSignature: string;
  sessions: number;
  completedInstrumentKeys: string[];
  failedInstrumentKeys: string[];
  updatedAt: string;
  lastError: string;
}

export type BestShortcutScreeningResult =
  | { kind: "single"; result: ScreeningSingleResult }
  | { kind: "combination"; result: ScreeningCombinationResult };

function uniqueBoundedStrings(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_SHORTCUT_BATCH_INSTRUMENTS) {
    return null;
  }
  const strings = value.filter(
    (entry): entry is string =>
      typeof entry === "string" && entry.length > 0 && entry.length <= 160,
  );
  if (strings.length !== value.length) return null;
  return [...new Set(strings)];
}

export function parseShortcutBatchCheckpoint(
  value: string | null,
): ShortcutBatchCheckpoint | null {
  if (!value || value.length > 64_000) return null;
  try {
    const parsed = JSON.parse(value) as Partial<ShortcutBatchCheckpoint>;
    const completedInstrumentKeys = uniqueBoundedStrings(
      parsed.completedInstrumentKeys,
    );
    const failedInstrumentKeys = uniqueBoundedStrings(
      parsed.failedInstrumentKeys,
    );
    if (
      parsed.version !== 2 ||
      parsed.resumeReason !== "failure" ||
      typeof parsed.runId !== "string" ||
      parsed.runId.length === 0 ||
      parsed.runId.length > 120 ||
      typeof parsed.configSignature !== "string" ||
      parsed.configSignature.length === 0 ||
      parsed.configSignature.length > 2_000 ||
      !Number.isInteger(parsed.sessions) ||
      Number(parsed.sessions) < 3 ||
      Number(parsed.sessions) > 10_000 ||
      !completedInstrumentKeys ||
      !failedInstrumentKeys ||
      typeof parsed.updatedAt !== "string" ||
      typeof parsed.lastError !== "string" ||
      parsed.lastError.length === 0
    ) {
      return null;
    }
    return {
      version: 2,
      resumeReason: "failure",
      runId: parsed.runId,
      configSignature: parsed.configSignature,
      sessions: Number(parsed.sessions),
      completedInstrumentKeys,
      failedInstrumentKeys,
      updatedAt: parsed.updatedAt,
      lastError: parsed.lastError.slice(0, 240),
    };
  } catch {
    return null;
  }
}

export function createShortcutBatchConfigSignature(input: {
  sessions: number;
  objective: ScreeningObjective;
  initialCash: number;
  commissionPercent: number;
  slippagePercent: number;
  entryFilterEnabled: boolean;
}): string {
  return JSON.stringify(input);
}

export function selectBestShortcutScreeningResult(
  singles: readonly ScreeningSingleResult[],
  combinations: readonly ScreeningCombinationResult[],
  objective: ScreeningObjective,
): BestShortcutScreeningResult | null {
  const candidates: BestShortcutScreeningResult[] = [
    ...singles.map((result) => ({ kind: "single" as const, result })),
    ...combinations.map((result) => ({
      kind: "combination" as const,
      result,
    })),
  ];
  return (
    candidates.sort((left, right) =>
      compareScreeningResults(left.result, right.result, objective),
    )[0] ?? null
  );
}

/** Cycle validation persists only the winner consumed by its report. */
export function compactCycleScreeningOutcome<T extends {
  singleResults: ScreeningSingleResult[];
  results: ScreeningCombinationResult[];
}>(outcome: T, objective: ScreeningObjective): T {
  const best = selectBestShortcutScreeningResult(
    outcome.singleResults,
    outcome.results,
    objective,
  );
  return {
    ...outcome,
    singleResults: best?.kind === "single" ? [best.result as ScreeningSingleResult] : [],
    results: best?.kind === "combination" ? [best.result as ScreeningCombinationResult] : [],
  };
}

export function pendingShortcutBatchInstrumentKeys(
  instrumentKeys: readonly string[],
  checkpoint: ShortcutBatchCheckpoint | null,
  configSignature: string,
): string[] {
  const completed =
    checkpoint?.configSignature === configSignature
      ? new Set(checkpoint.completedInstrumentKeys)
      : new Set<string>();
  return instrumentKeys.filter((key) => !completed.has(key));
}
