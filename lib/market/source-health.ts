import type {
  CanonicalMarketProfile,
  CanonicalMarketSourceDefinition,
} from "./canonical";
import type { MarketSourceQualitySnapshot } from "./quality";
import type { MarketSourceProvider } from "./types";

const DAY_MS = 24 * 60 * 60 * 1_000;
const HEALTH_RETENTION_DAYS = 31;
const PRIMARY_RATE_MINIMUM_ATTEMPTS = 5;
const BACKUP_7_DAY_MINIMUM_ATTEMPTS = 3;
const BACKUP_30_DAY_MINIMUM_ATTEMPTS = 5;
const CONFIGURED_PRIMARY_PROBE_INTERVAL_MS = 60 * 60 * 1_000;
const MINIMUM_PROMOTABLE_HISTORY_BARS = 500;

export interface MarketSourceHealthAttemptSample {
  attemptedAt: string;
  success: boolean;
  latencyMs: number;
  errorCode: string | null;
}

export interface MarketSourceRollingWindow {
  days: 7 | 30;
  attempts: number;
  successes: number;
  failures: number;
  availabilityPercent: number | null;
  averageLatencyMs: number | null;
}

export interface MarketSourceHealthLike {
  provider: MarketSourceProvider;
  lastAttemptAt: string;
  lastErrorCode: string | null;
  demotedAt?: string | null;
  recentAttempts?: readonly MarketSourceHealthAttemptSample[];
  quality: MarketSourceQualitySnapshot | null;
}

export interface MarketSourceRollingSummary {
  provider: MarketSourceProvider;
  sevenDays: MarketSourceRollingWindow;
  thirtyDays: MarketSourceRollingWindow;
  consecutiveFailures: number;
  demotedAt: string | null;
}

export interface MarketSourceSelection {
  effectiveProvider: MarketSourceProvider;
  configuredPrimaryDegraded: boolean;
  shouldProbeConfiguredPrimary: boolean;
  orderedBackups: CanonicalMarketProfile["backups"];
}

function timestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function recentSamples(
  samples: readonly MarketSourceHealthAttemptSample[] | undefined,
  days: number,
  now: Date,
): MarketSourceHealthAttemptSample[] {
  const cutoff = now.getTime() - days * DAY_MS;
  return (samples ?? []).filter((sample) => {
    const attemptedAt = timestamp(sample.attemptedAt);
    return attemptedAt !== null && attemptedAt >= cutoff;
  });
}

function summarizeWindow(
  samples: readonly MarketSourceHealthAttemptSample[],
  days: 7 | 30,
): MarketSourceRollingWindow {
  const successes = samples.filter((sample) => sample.success).length;
  const attempts = samples.length;
  return {
    days,
    attempts,
    successes,
    failures: attempts - successes,
    availabilityPercent:
      attempts > 0 ? (successes / attempts) * 100 : null,
    averageLatencyMs:
      attempts > 0
        ? samples.reduce(
            (sum, sample) => sum + Math.max(sample.latencyMs, 0),
            0,
          ) / attempts
        : null,
  };
}

function consecutiveFailures(
  samples: readonly MarketSourceHealthAttemptSample[],
): number {
  let failures = 0;
  for (let index = samples.length - 1; index >= 0; index -= 1) {
    if (samples[index]?.success) break;
    failures += 1;
  }
  return failures;
}

export function appendMarketSourceHealthAttempt(
  samples: readonly MarketSourceHealthAttemptSample[] | undefined,
  attempt: MarketSourceHealthAttemptSample,
  now = new Date(attempt.attemptedAt),
): MarketSourceHealthAttemptSample[] {
  const cutoff = now.getTime() - HEALTH_RETENTION_DAYS * DAY_MS;
  return [...(samples ?? []), attempt]
    .filter((sample) => {
      const attemptedAt = timestamp(sample.attemptedAt);
      return attemptedAt !== null && attemptedAt >= cutoff;
    })
    .slice(-2_048);
}

export function summarizeMarketSourceHealth(
  record: MarketSourceHealthLike,
  now = new Date(),
): MarketSourceRollingSummary {
  const thirtyDaySamples = recentSamples(
    record.recentAttempts,
    30,
    now,
  );
  return {
    provider: record.provider,
    sevenDays: summarizeWindow(
      recentSamples(thirtyDaySamples, 7, now),
      7,
    ),
    thirtyDays: summarizeWindow(thirtyDaySamples, 30),
    consecutiveFailures: consecutiveFailures(thirtyDaySamples),
    demotedAt: record.demotedAt ?? null,
  };
}

export function nextMarketSourceDemotedAt(
  previousDemotedAt: string | null | undefined,
  samples: readonly MarketSourceHealthAttemptSample[],
  now: Date,
): string | null {
  const summary = summarizeMarketSourceHealth(
    {
      provider: "yahoo",
      lastAttemptAt: now.toISOString(),
      lastErrorCode: null,
      demotedAt: previousDemotedAt,
      recentAttempts: samples,
      quality: null,
    },
    now,
  );
  const lowSevenDayAvailability =
    summary.sevenDays.attempts >= PRIMARY_RATE_MINIMUM_ATTEMPTS &&
    (summary.sevenDays.availabilityPercent ?? 100) < 80;
  const degradationTriggered =
    summary.consecutiveFailures >= 3 || lowSevenDayAvailability;
  if (!previousDemotedAt && degradationTriggered) {
    return now.toISOString();
  }
  if (!previousDemotedAt) return null;

  const demotedAt = timestamp(previousDemotedAt);
  const stableForSevenDays =
    demotedAt !== null &&
    now.getTime() - demotedAt >= 7 * DAY_MS &&
    summary.sevenDays.attempts >= PRIMARY_RATE_MINIMUM_ATTEMPTS &&
    (summary.sevenDays.availabilityPercent ?? 0) >= 95 &&
    summary.consecutiveFailures === 0;
  return stableForSevenDays ? null : previousDemotedAt;
}

function qualityPasses(
  record: MarketSourceHealthLike,
  definition: CanonicalMarketSourceDefinition,
): boolean {
  const quality = record.quality;
  if (!quality || quality.latestDateMatches === false) return false;
  if (
    (quality.historyBarCount ?? quality.barCount) <
    MINIMUM_PROMOTABLE_HISTORY_BARS
  ) {
    return false;
  }
  if (
    quality.missingDatePercent !== null &&
    quality.missingDatePercent > 5
  ) {
    return false;
  }
  const closeLimit =
    definition.promotionPolicy === "overlap-required" ? 2 : 5;
  const ohlcLimit =
    definition.promotionPolicy === "overlap-required" ? 3 : 7;
  if (
    quality.meanCloseErrorPercent !== null &&
    quality.meanCloseErrorPercent > closeLimit
  ) {
    return false;
  }
  return [
    quality.meanOpenErrorPercent,
    quality.meanHighErrorPercent,
    quality.meanLowErrorPercent,
  ].every((error) => error === null || error <= ohlcLimit);
}

function isEligibleBackup(
  record: MarketSourceHealthLike | undefined,
  definition: CanonicalMarketProfile["backups"][number],
  now: Date,
): boolean {
  if (["tencent", "juhe"].includes(definition.provider)) {
    return false;
  }
  if (!record || record.demotedAt) return false;
  const summary = summarizeMarketSourceHealth(record, now);
  return (
    summary.sevenDays.attempts >= BACKUP_7_DAY_MINIMUM_ATTEMPTS &&
    (summary.sevenDays.availabilityPercent ?? 0) >= 95 &&
    summary.thirtyDays.attempts >= BACKUP_30_DAY_MINIMUM_ATTEMPTS &&
    (summary.thirtyDays.availabilityPercent ?? 0) >= 90 &&
    summary.consecutiveFailures === 0 &&
    qualityPasses(record, definition)
  );
}

function backupHealthScore(
  record: MarketSourceHealthLike | undefined,
  definition: CanonicalMarketProfile["backups"][number],
  now: Date,
): number {
  if (!isEligibleBackup(record, definition, now)) {
    return Number.NEGATIVE_INFINITY;
  }
  const summary = summarizeMarketSourceHealth(record!, now);
  const latencyPenalty =
    (summary.sevenDays.averageLatencyMs ?? 10_000) / 10_000;
  return (
    (summary.sevenDays.availabilityPercent ?? 0) * 10 +
    (summary.thirtyDays.availabilityPercent ?? 0) -
    latencyPenalty
  );
}

export function selectMarketSourceByRollingHealth(
  profile: CanonicalMarketProfile,
  records: readonly MarketSourceHealthLike[],
  now = new Date(),
): MarketSourceSelection {
  const byProvider = new Map(
    records.map((record) => [record.provider, record] as const),
  );
  const primaryRecord = byProvider.get(profile.primary.provider);
  const primarySummary = primaryRecord
    ? summarizeMarketSourceHealth(primaryRecord, now)
    : null;
  const configuredPrimaryDegraded =
    Boolean(primaryRecord?.demotedAt) ||
    Boolean(
      primarySummary &&
        (primarySummary.consecutiveFailures >= 3 ||
          (primarySummary.sevenDays.attempts >=
            PRIMARY_RATE_MINIMUM_ATTEMPTS &&
            (primarySummary.sevenDays.availabilityPercent ?? 100) < 80)),
    );
  const orderedBackups = [...profile.backups]
    .map((definition, index) => ({
      definition,
      index,
      score: backupHealthScore(
        byProvider.get(definition.provider),
        definition,
        now,
      ),
      credentialFailure:
        byProvider.get(definition.provider)?.lastErrorCode ===
        "PROVIDER_CREDENTIAL_INVALID",
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        Number(left.credentialFailure) -
          Number(right.credentialFailure) ||
        left.index - right.index,
    )
    .map(({ definition }) => definition);
  const effectiveBackup = orderedBackups.find((definition) =>
    isEligibleBackup(
      byProvider.get(definition.provider),
      definition,
      now,
    ),
  );
  const lastPrimaryAttemptAt = primaryRecord
    ? timestamp(primaryRecord.lastAttemptAt)
    : null;
  const shouldProbeConfiguredPrimary =
    configuredPrimaryDegraded &&
    (lastPrimaryAttemptAt === null ||
      now.getTime() - lastPrimaryAttemptAt >=
        CONFIGURED_PRIMARY_PROBE_INTERVAL_MS);

  return {
    effectiveProvider:
      configuredPrimaryDegraded && effectiveBackup
        ? effectiveBackup.provider
        : profile.primary.provider,
    configuredPrimaryDegraded,
    shouldProbeConfiguredPrimary,
    orderedBackups,
  };
}

export function orderMarketRecoveryDefinitions(
  profile: CanonicalMarketProfile,
  records: readonly MarketSourceHealthLike[],
  now = new Date(),
): CanonicalMarketProfile["backups"] {
  const ordered = selectMarketSourceByRollingHealth(
    profile,
    records,
    now,
  ).orderedBackups;
  return [...ordered].sort((left, right) => {
    const priority = (provider: MarketSourceProvider) => {
      if (provider === "tencent") return -1;
      if (provider === "juhe") return 1;
      return 0;
    };
    return priority(left.provider) - priority(right.provider);
  });
}
