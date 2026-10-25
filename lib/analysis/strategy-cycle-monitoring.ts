import type { AllocationRebalance } from "./backtest";
import type { MarketBar } from "../market/types";

export interface CycleMonitoringRange {
  startTime: string;
  endTime: string;
}

export const DEFAULT_CYCLE_MONITORING_RANGES: readonly CycleMonitoringRange[] = [
  { startTime: "2025-04-21", endTime: "2025-06-16" },
  { startTime: "2025-10-21", endTime: "2025-11-04" },
  { startTime: "2026-03-30", endTime: "2026-05-12" },
  { startTime: "2026-05-20", endTime: "2026-06-03" },
];

export function isValidCycleMonitoringRange(range: CycleMonitoringRange): boolean {
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  return validDate(range.startTime) && validDate(range.endTime) && range.startTime <= range.endTime;
}

/** Inclusive trading dates, using the executed account after each close. */
export function cycleMonitoringCoverage(
  evaluationBars: readonly Pick<MarketBar, "time">[],
  rebalances: readonly AllocationRebalance[],
  ranges: readonly CycleMonitoringRange[],
) {
  const events = [...rebalances].sort((a, b) => a.time.localeCompare(b.time));
  let eventIndex = 0;
  let allocation = 0;
  const held = evaluationBars.map((bar) => {
    while (eventIndex < events.length && events[eventIndex]!.time <= bar.time) {
      allocation = events[eventIndex++]!.targetAllocation;
    }
    return allocation > 1e-10;
  });
  return ranges.map((range) => {
    if (!isValidCycleMonitoringRange(range)) throw new Error("Invalid cycle monitoring range");
    let sessions = 0;
    let heldSessions = 0;
    let actualStartTime: string | null = null;
    let actualEndTime: string | null = null;
    evaluationBars.forEach((bar, index) => {
      if (bar.time < range.startTime || bar.time > range.endTime) return;
      sessions += 1;
      if (held[index]) heldSessions += 1;
      actualStartTime ??= bar.time;
      actualEndTime = bar.time;
    });
    return { ...range, sessions, heldSessions, actualStartTime, actualEndTime,
      coveragePercent: sessions ? heldSessions / sessions * 100 : null };
  });
}
