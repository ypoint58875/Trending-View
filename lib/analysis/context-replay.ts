import type { NumericSeries } from "./indicators";

export type ContextDirection = "up" | "down";
export interface ContextObservation {
  time: string;
  direction: ContextDirection | "mixed" | "warmup";
  consecutive: number;
  confirmed: ContextDirection | null;
  confirmedTime: string | null;
}
export interface ContextCurves {
  bias: NumericSeries[];
  slope: NumericSeries[];
}
/** A causal trailing mean: missing values never become zero or bridge a gap. */
export function smoothContext(values: NumericSeries): NumericSeries {
  return values.map((value, index) => {
    const previous = values[index - 1];
    const before = values[index - 2];
    return value == null || previous == null || before == null
      ? null : (before + previous + value) / 3;
  });
}

/** Pure replay keeps the last confirmation through disagreement and opposite candidates. */
export function replayContextDirections(times: readonly string[], curves: ContextCurves): ContextObservation[] {
  const all = [...curves.bias, ...curves.slope];
  if (all.length !== 6 || all.some((curve) => curve.length !== times.length)) throw new Error("Market context requires six aligned curves");
  let candidate: ContextDirection | null = null;
  let consecutive = 0;
  let confirmed: ContextDirection | null = null;
  let confirmedTime: string | null = null;
  return times.map((time, index) => {
    if (index && time <= times[index - 1]) throw new Error("Market context dates must be strictly increasing");
    const changes = all.map((curve) => {
      const value = curve[index];
      const previous = curve[index - 1];
      return value == null || previous == null || !Number.isFinite(value) || !Number.isFinite(previous) ? null : value - previous;
    });
    const direction = changes.some((change) => change === null) ? "warmup"
      : changes.every((change) => change! > 0) ? "up"
      : changes.every((change) => change! < 0) ? "down" : "mixed";
    if (direction === "up" || direction === "down") {
      consecutive = candidate === direction ? consecutive + 1 : 1;
      candidate = direction;
      if (consecutive >= 3 && confirmed !== direction) {
        confirmed = direction;
        confirmedTime = time;
      }
    } else {
      candidate = null;
      consecutive = 0;
    }
    return { time, direction, consecutive, confirmed, confirmedTime };
  });
}

