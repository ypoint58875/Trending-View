import assert from "node:assert/strict";
import test from "node:test";
import { buildStrategyCyclePriceChartOption } from "../app/components/StrategyCyclePriceChart";
import type { StrategyCycleEventValidationResult } from "../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../lib/market/types";

const bars: MarketBar[] = Array.from({ length: 5 }, (_, index) => ({
  time: `2026-09-${String(index + 1).padStart(2, "0")}`,
  timestamp: Date.UTC(2026, 8, index + 1),
  open: 100 + index,
  high: 103 + index,
  low: 98 + index,
  close: 102 + index,
  volume: 1_000,
  amount: 100_000,
  amplitude: 5,
  changePercent: 1,
  change: 1,
  turnoverRate: 1,
}));

const allocationEvent = (
  time: string,
  fromAllocation: number,
  targetAllocation: number,
) => ({
  time,
  fromAllocation,
  targetAllocation,
  fillPrice: 100,
  reason: "strategy" as const,
});

const result: StrategyCycleEventValidationResult = {
  screeningWindow: 64,
  updateInterval: 10,
  evaluationStartTime: bars[1]!.time,
  evaluationEndTime: bars[3]!.time,
  metrics: {
    referenceEventCount: 2,
    predictedEventCount: 2,
    matchedEventCount: 1,
    oppositeDirectionEventCount: 0,
    missedEventCount: 1,
    extraEventCount: 1,
    directionAgreementRate: 1,
    lateEventRate: 1,
    medianSignedTimingError: 1,
    medianAbsoluteTimingError: 1,
    p90AbsoluteTimingError: 1,
    withinTwoSessionsRate: 0.5,
    withinFiveSessionsRate: 0.5,
    meanTargetAllocationError: 0,
    medianTimingReturnDifferenceBps: 0,
  },
  events: [
    {
      status: "missed",
      reference: allocationEvent(bars[1]!.time, 0, 1),
      candidate: null,
      timingErrorSessions: null,
    },
    {
      status: "matched",
      reference: allocationEvent(bars[2]!.time, 1, 0),
      candidate: allocationEvent(bars[3]!.time, 1, 0),
      timingErrorSessions: 1,
    },
    {
      status: "extra",
      reference: null,
      candidate: allocationEvent(bars[3]!.time, 0, 1),
      timingErrorSessions: null,
    },
  ],
};

const labels = {
  price: "price",
  matched: "matched",
  opposite: "opposite",
  missed: "missed",
  extra: "extra",
  candidateDate: "candidate date",
  referenceDate: "reference date",
  targetAllocation: "target allocation",
  timingError: "timing error",
  sessionUnit: "sessions",
};

test("plots only the validation range and separates event classifications", () => {
  const option = buildStrategyCyclePriceChartOption(bars, result, labels);
  const series = option.series as Array<{ name?: string; data?: unknown[] }>;
  const dataCount = (name: string) =>
    series.find((entry) => entry.name === name)?.data?.length ?? 0;

  assert.equal(dataCount(labels.price), 3);
  assert.equal(dataCount(labels.matched), 1);
  assert.equal(dataCount(labels.opposite), 0);
  assert.equal(dataCount(labels.missed), 1);
  assert.equal(dataCount(labels.extra), 1);
});

test("uses the research-workspace up and down arrows for allocation direction", () => {
  const option = buildStrategyCyclePriceChartOption(bars, result, labels);
  const series = option.series as Array<{
    name?: string;
    data?: Array<{ symbol?: string; symbolRotate?: number }>;
  }>;
  const matched = series.find((entry) => entry.name === labels.matched)?.data ?? [];
  const missed = series.find((entry) => entry.name === labels.missed)?.data ?? [];
  const extra = series.find((entry) => entry.name === labels.extra)?.data ?? [];

  assert.equal(matched[0]?.symbol, "triangle");
  assert.equal(matched[0]?.symbolRotate, 180);
  assert.equal(missed[0]?.symbolRotate, 0);
  assert.equal(extra[0]?.symbolRotate, 0);
});
