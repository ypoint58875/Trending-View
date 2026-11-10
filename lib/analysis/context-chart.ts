import type { ContextObservation } from "./context-replay";
import { DAILY_HISTORY_LIMIT } from "@/lib/market/history";

export const CONTEXT_AREA_COLORS = {
  up: "rgba(34,197,94,.20)",
  down: "rgba(239,83,80,.22)",
  warmup: "rgba(145,162,155,.06)",
} as const;

export type ContextChartArea = [
  { xAxis: string; itemStyle: { color: string } },
  { xAxis: string },
];

/** Project full-history retained states onto a visible date slice without replaying its warmup. */
export function buildContextChartAreas(
  observations: readonly ContextObservation[],
  visibleDates: readonly string[],
): ContextChartArea[] {
  if (observations.length > DAILY_HISTORY_LIMIT || visibleDates.length > DAILY_HISTORY_LIMIT)
    throw new Error("Context chart history exceeds limit");
  for (let index = 1; index < observations.length; index++)
    if (observations[index].time <= observations[index - 1].time) throw new Error("Unordered context history");
  for (let index = 1; index < visibleDates.length; index++)
    if (visibleDates[index] <= visibleDates[index - 1]) throw new Error("Unordered context chart dates");
  const byDate = new Map(observations.map(row => [row.time, row.confirmed]));
  const values = visibleDates.map(date => byDate.get(date));
  const result: ContextChartArea[] = [];
  for (let start = 0; start < values.length;) {
    let end = start + 1;
    while (end < values.length && values[end] === values[start]) end++;
    const direction = values[start];
    if (direction !== undefined) result.push([
      { xAxis: visibleDates[start], itemStyle: { color: CONTEXT_AREA_COLORS[direction ?? "warmup"] } },
      { xAxis: visibleDates[Math.min(end, visibleDates.length - 1)] },
    ]);
    start = end;
  }
  return result;
}
