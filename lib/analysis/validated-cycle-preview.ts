import type { ValidatedCycleStrategy } from "./validated-cycle-strategy";
import { buildStrategyCycleRollingReport, type StrategyCycleRollingReport } from "./strategy-cycle-validation";
import { normalizeSmaPositionOverlay, type SmaPositionOverlayOptions } from "./sma-position-overlay";

export interface ValidatedCyclePreview {
  key: string;
  report: StrategyCycleRollingReport;
}

export function validatedCycleRulesMatch(profile: ValidatedCycleStrategy, overlay?: SmaPositionOverlayOptions): boolean {
  return JSON.stringify(normalizeSmaPositionOverlay(profile.settings.positionOverlay)) === JSON.stringify(normalizeSmaPositionOverlay(overlay));
}

export function validatedCyclePreviewKey(profile: ValidatedCycleStrategy, overlay?: SmaPositionOverlayOptions): string {
  return JSON.stringify({ version: 1, key: profile.key, revision: profile.revision, model: profile.model,
    conflictPolicy: profile.conflictPolicy, start: profile.startTime, end: profile.series.bars.at(-1)?.time,
    bars: profile.series.bars.length, settings: { ...profile.settings, positionOverlay: normalizeSmaPositionOverlay(overlay) } });
}

export function cachedValidatedCyclePreview(profile: ValidatedCycleStrategy, overlay?: SmaPositionOverlayOptions): ValidatedCyclePreview | null {
  const key = validatedCyclePreviewKey(profile, overlay);
  if (profile.preview?.key === key) return profile.preview;
  if (validatedCycleRulesMatch(profile, overlay)) {
    return { key, report: profile.report };
  }
  return null;
}

export function promoteValidatedCycleProfile(profile: ValidatedCycleStrategy, overlay: SmaPositionOverlayOptions | undefined,
  preview: ValidatedCyclePreview): ValidatedCycleStrategy {
  if (validatedCycleRulesMatch(profile, overlay)) return profile;
  if (preview.key !== validatedCyclePreviewKey(profile, overlay) ||
    preview.report.evaluationStartTime !== profile.report.evaluationStartTime ||
    preview.report.evaluationEndTime !== profile.report.evaluationEndTime ||
    preview.report.decisionCount !== profile.report.decisionCount ||
    preview.report.newOnConflictReturn !== preview.report.updateReturn) throw new Error("Invalid validated cycle rule upgrade");
  return { ...profile, settings: { ...profile.settings, positionOverlay: normalizeSmaPositionOverlay(overlay) },
    report: structuredClone(preview.report), preview: undefined, updatedAt: new Date().toISOString(),
    ruleBackup: structuredClone({ settings: profile.settings, report: profile.report, revision: profile.revision, updatedAt: profile.updatedAt }) };
}

export function buildValidatedCyclePreview(profile: ValidatedCycleStrategy, overlay?: SmaPositionOverlayOptions): ValidatedCyclePreview {
  const cached = cachedValidatedCyclePreview(profile, overlay);
  if (cached) return cached;
  const start = profile.series.bars.findIndex((bar) => bar.time === profile.startTime);
  if (start < 0 || profile.series.bars.length > 10000 || profile.snapshots.length > 10000) throw new Error("Invalid validated cycle preview range");
  return { key: validatedCyclePreviewKey(profile, overlay), report: buildStrategyCycleRollingReport(
    profile.series.bars, profile.snapshots, profile.series.bars.length - start, profile.screeningWindow,
    { ...profile.settings, positionOverlay: overlay }, profile.snapshots.map((snapshot) => snapshot.decisionIndex),
  ) };
}
