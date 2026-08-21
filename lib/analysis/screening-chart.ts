import type {
  ScreeningCombinationResult,
  ScreeningDateWindow,
  ScreeningSingleResult,
  ScreeningValidationReport,
} from "./screening-validation";

type ScreeningResult = ScreeningSingleResult | ScreeningCombinationResult;

function cloneWindow(window: ScreeningDateWindow): ScreeningDateWindow {
  return {
    startTime: window.startTime,
    endTime: window.endTime,
  };
}

export function resolveScreeningResultChartWindows(
  result: ScreeningResult,
  report: ScreeningValidationReport | null,
): ScreeningDateWindow[] {
  const evidence = result.screeningValidation;
  if (!evidence) return [];

  if (evidence.mode === "multi-range") {
    if (report?.mode === "multi-range") {
      return report.ranges.map(cloneWindow);
    }
    return [cloneWindow(evidence.evaluationWindow)];
  }

  return [cloneWindow(evidence.rankingWindow)];
}

export function encompassingScreeningWindow(
  windows: readonly ScreeningDateWindow[],
): ScreeningDateWindow | null {
  if (windows.length === 0) return null;
  return {
    startTime: windows.reduce(
      (earliest, window) =>
        window.startTime < earliest ? window.startTime : earliest,
      windows[0].startTime,
    ),
    endTime: windows.reduce(
      (latest, window) =>
        window.endTime > latest ? window.endTime : latest,
      windows[0].endTime,
    ),
  };
}
