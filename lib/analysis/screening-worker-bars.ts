import type { MarketBar } from "@/lib/market/types";

const FIELD_COUNT = 11;

export interface PackedMarketBars {
  times: string[];
  values: Float64Array;
}

export function packMarketBars(bars: readonly MarketBar[]): PackedMarketBars {
  const values = new Float64Array(bars.length * FIELD_COUNT);
  bars.forEach((bar, index) => {
    const offset = index * FIELD_COUNT;
    values[offset] = bar.timestamp;
    values[offset + 1] = bar.open;
    values[offset + 2] = bar.close;
    values[offset + 3] = bar.high;
    values[offset + 4] = bar.low;
    values[offset + 5] = bar.volume;
    values[offset + 6] = bar.amount;
    values[offset + 7] = bar.amplitude;
    values[offset + 8] = bar.changePercent;
    values[offset + 9] = bar.change;
    values[offset + 10] = bar.turnoverRate;
  });
  return { times: bars.map((bar) => bar.time), values };
}

export function unpackMarketBars(
  packed: PackedMarketBars,
  requestedCount = packed.times.length,
): MarketBar[] {
  const count = Math.min(
    Math.max(Math.floor(requestedCount), 0),
    packed.times.length,
    Math.floor(packed.values.length / FIELD_COUNT),
  );
  return packed.times.slice(0, count).map((time, index) => {
    const offset = index * FIELD_COUNT;
    return {
      time,
      timestamp: packed.values[offset]!,
      open: packed.values[offset + 1]!,
      close: packed.values[offset + 2]!,
      high: packed.values[offset + 3]!,
      low: packed.values[offset + 4]!,
      volume: packed.values[offset + 5]!,
      amount: packed.values[offset + 6]!,
      amplitude: packed.values[offset + 7]!,
      changePercent: packed.values[offset + 8]!,
      change: packed.values[offset + 9]!,
      turnoverRate: packed.values[offset + 10]!,
    };
  });
}
