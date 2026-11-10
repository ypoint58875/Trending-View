import assert from "node:assert/strict";
import test from "node:test";
import {
  createValidatedCycleStrategy, continueValidatedCycleStrategy, mergeValidatedCycleRepair,
  assertValidatedCycleHistory, prepareValidatedCycleHistory, validatedCycleFocusRange, ValidatedCycleError, type ValidatedCycleSettings,
} from "../lib/analysis/validated-cycle-strategy";
import { buildStrategyCycleRollingReport, buildStrategyCycleRollingSchedule,
  bridgeCycleMarketHistory, refreshRecentCycleBars, resolveStrategyCycleRecentSignals, runStrategyCycleCloseBacktest, strategyCycleRecentSignals,
  type StrategyCycleSelectionSnapshot } from "../lib/analysis/strategy-cycle-validation";
import {
  cycleTaskHistoryDigest, cycleTaskRecentPrefixDigests, reusableCycleTaskSnapshots, type StoredStrategyCycleValidationTask,
} from "../lib/analysis/strategy-cycle-validation-store";
import { SCREENING_RESULT_MODEL_VERSION } from "../lib/analysis/strategy-combinations";
import { DEFAULT_POSITION_OVERLAY_OPTIONS } from "../lib/analysis/sma-position-overlay";
import type { MarketSeries } from "../lib/market/types";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ValidatedCycleShortcuts } from "../app/components/ValidatedCycleShortcuts";
import { zhCN, validatedCycleErrorMessage } from "../app/i18n/zh-CN";

const afterClose = new Date("2026-10-27T06:30:00Z");
const settings: ValidatedCycleSettings = { interval: "1d", initialCash: 100_000,
  commissionRate: 0.0003, slippageRate: 0.0005, executionPolicy: "hybrid",
  positionOverlay: DEFAULT_POSITION_OVERLAY_OPTIONS };

function series(count = 29): MarketSeries {
  return { instrument: { secid: "^N225", code: "^N225", name: "Nikkei 225", exchange: "JPX",
    assetType: "index", provider: "yahoo" }, interval: "1d", priceAdjustment: "raw", source: "yahoo",
    previousClose: 100, fetchedAt: afterClose.toISOString(), latestBarStatus: "complete",
    bars: Array.from({ length: count }, (_, index) => {
      const timestamp = Date.UTC(2026, 8, 28 + index);
      const close = 100 + index * 0.4 + Math.sin(index) * 4;
      return { time: new Date(timestamp).toISOString().slice(0, 10), timestamp, open: close,
        high: close + 1, low: close - 1, close, volume: 1000, amount: 100_000,
        amplitude: 2, changePercent: 0, change: 0, turnoverRate: 0 };
    }) };
}

function snapshot(input: MarketSeries, index: number): StrategyCycleSelectionSnapshot {
  return { decisionIndex: index, decisionTime: input.bars[index]!.time, screeningWindow: 10,
    plan: { strategyA: { strategyId: "roc-momentum", parameters: { period: 1, entry: 1, exit: -1 } },
      strategyB: null, strategyAAllocation: 1, strategyBAllocation: 0 },
    fixedRelativeLongStrategy: null, label: "Test winner" };
}

function seed(input = series()) {
  const schedule = buildStrategyCycleRollingSchedule(input.bars, 14, 10)!;
  return createValidatedCycleStrategy(input, schedule.decisionIndexes.map((index) => snapshot(input, index)),
    14, 10, settings, afterClose);
}

test("validated shortcut preserves the complete historical report and clones its inputs", () => {
  const input = series();
  const profile = seed(input);
  assert.deepEqual(profile.report, buildStrategyCycleRollingReport(input.bars, profile.snapshots, 14, 10, settings));
  assert.equal(profile.screeningWindow, 10);
  assert.equal(profile.key, "index:N225:1d:10");
  input.bars[20]!.close = 1;
  assert.notEqual(profile.series.bars[20]!.close, 1);
});

test("research continuation anchors history and preserves the original execution costs and overlay", () => {
  const profile = seed();
  const input = series(30);
  const winner = snapshot(input, 29);
  winner.plan.positionOverlay = { ...DEFAULT_POSITION_OVERLAY_OPTIONS, supplementalEntry: false };
  const updated = continueValidatedCycleStrategy(profile, input, winner, "research:totalReturn", afterClose);
  assert.equal(updated.startTime, profile.startTime);
  assert.equal(updated.series.bars.length, 30);
  assert.deepEqual(updated.snapshots.slice(0, -1), profile.snapshots);
  assert.equal(updated.snapshots.at(-1)?.plan.positionOverlay, undefined);
  assert.deepEqual(updated.settings, settings);
  assert.equal(updated.pending, null);
  assert.deepEqual(updated.report.rebalances.filter((fill) => fill.time <= profile.report.evaluationEndTime), profile.report.rebalances);
  assert.ok(profile.report.rebalances.length > 0);
  assert.equal(updated.report.rebalances[0], profile.report.rebalances[0]);
  assert.deepEqual(updated.report, buildStrategyCycleRollingReport(input.bars, updated.snapshots, 15, 10,
    settings, updated.snapshots.map((item) => item.decisionIndex)));
});

test("same-day provisional screenings replace the tail without changing the confirmed ledger", () => {
  const profile = seed();
  const input = series(30);
  input.latestBarStatus = "in-progress";
  const now = new Date("2026-10-27T06:00:00Z");
  const first = continueValidatedCycleStrategy(profile, input, snapshot(input, 29), "first", now);
  assert.ok(first.pending);
  assert.deepEqual(first.report, profile.report);
  assert.equal(first.snapshots.length, profile.snapshots.length);
  const nextInput = structuredClone(input);
  nextInput.bars[29]!.close += 2;
  const secondWinner = snapshot(nextInput, 29);
  secondWinner.plan.strategyA!.parameters.entry = 5;
  const second = continueValidatedCycleStrategy(first, nextInput, secondWinner, "second", now);
  assert.equal(second.pending?.provenance, "second");
  assert.equal(second.pending?.snapshot.plan.strategyA?.parameters.entry, 5);
  assert.deepEqual(second.report, profile.report);
  nextInput.latestBarStatus = "complete";
  const finalized = continueValidatedCycleStrategy(second, nextInput, secondWinner, "second", afterClose);
  const direct = continueValidatedCycleStrategy(profile, nextInput, secondWinner, "second", afterClose);
  assert.deepEqual(finalized, direct);
  assert.equal(finalized.snapshots.length, profile.snapshots.length + 1);
  assert.equal(continueValidatedCycleStrategy(finalized, nextInput, snapshot(nextInput, 29), "third", afterClose), finalized);
});

test("14:30 boundary requires both session completion and complete source status", () => {
  const profile = seed();
  const input = series(30);
  assert.ok(continueValidatedCycleStrategy(profile, input, snapshot(input, 29), "research",
    new Date("2026-10-27T06:29:59Z")).pending);
  assert.equal(continueValidatedCycleStrategy(profile, input, snapshot(input, 29), "research", afterClose).pending, null);
  input.latestBarStatus = "unknown";
  assert.ok(continueValidatedCycleStrategy(profile, input, snapshot(input, 29), "research", afterClose).pending);
});

test("missing sessions block append and list the dates requiring cycle-validation repair", () => {
  const profile = seed(series(27));
  const input = series(30);
  assert.throws(() => continueValidatedCycleStrategy(profile, input, snapshot(input, 29), "research", afterClose),
    (error: unknown) => error instanceof ValidatedCycleError && error.code === "gap" &&
      JSON.stringify(error.dates) === JSON.stringify([input.bars[27]!.time, input.bars[28]!.time]));
  assert.equal(profile.series.bars.length, 27);
});

test("repair extends the same original account rather than restarting its evaluation window", () => {
  const original = seed(series(27));
  const repaired = mergeValidatedCycleRepair(original, seed(series(30)));
  assert.equal(repaired.startTime, original.startTime);
  assert.deepEqual(repaired.snapshots.slice(0, original.snapshots.length), original.snapshots);
  assert.deepEqual(repaired.settings, original.settings);
  assert.equal(repaired.report.evaluationEndTime, "2026-10-27");
  assert.deepEqual(repaired.report.rebalances.filter((fill) => fill.time <= original.report.evaluationEndTime), original.report.rebalances);
  assert.equal(mergeValidatedCycleRepair(repaired, original), repaired);
});

test("historical corrections, missing prefixes, wrong instruments and versions do not silently rewrite history", () => {
  const profile = seed();
  for (const field of ["close", "volume", "amount"] as const) {
    const changed = series(30);
    changed.bars[20]![field] += 1;
    assert.throws(() => continueValidatedCycleStrategy(profile, changed, snapshot(changed, 29), "research", afterClose), ValidatedCycleError);
  }
  const truncated = series(30);
  truncated.bars = truncated.bars.slice(1);
  assert.throws(() => continueValidatedCycleStrategy(profile, truncated, snapshot(truncated, 28), "research", afterClose), ValidatedCycleError);
  const wrong = series(30);
  wrong.instrument = { ...wrong.instrument, secid: "^GSPC", code: "^GSPC" };
  assert.throws(() => continueValidatedCycleStrategy(profile, wrong, snapshot(wrong, 29), "research", afterClose), ValidatedCycleError);
  assert.throws(() => continueValidatedCycleStrategy({ ...profile, version: 2 } as never, series(30), snapshot(series(30), 29), "research", afterClose), ValidatedCycleError);
});

test("published zero-volume backfill preserves frozen screening inputs, reports and repair history", () => {
  const original = series();
  original.bars[20]!.volume = 0;
  original.bars[28]!.volume = 0;
  const profile = seed(original);
  const before = structuredClone(profile);
  const incoming = series(30);
  const incomingBefore = structuredClone(incoming);
  const anchored = assertValidatedCycleHistory(profile, incoming);
  assert.deepEqual(anchored.bars.slice(0, 29), original.bars);
  assert.equal(anchored.bars[29]!.volume, incoming.bars[29]!.volume);
  assert.equal(continueValidatedCycleStrategy(profile, series(), snapshot(series(), 28), "same", afterClose), profile);
  const expectedInput = { ...incoming, bars: [...original.bars, incoming.bars[29]!] };
  const expected = continueValidatedCycleStrategy(profile, expectedInput, snapshot(incoming, 29), "new", afterClose);
  const updated = continueValidatedCycleStrategy(profile, incoming, snapshot(incoming, 29), "new", afterClose);
  assert.deepEqual(updated, expected);
  assert.deepEqual(updated.report.rebalances.filter((fill) => fill.time <= profile.report.evaluationEndTime), profile.report.rebalances);
  const repaired = mergeValidatedCycleRepair(profile, seed(incoming));
  assert.deepEqual(repaired.series.bars.slice(0, 29), original.bars);
  assert.deepEqual(repaired.report, expected.report);
  assert.deepEqual(profile, before);
  assert.deepEqual(incoming, incomingBefore);
  const prefix = { ...incoming, bars: [{ ...original.bars[0]!, time: "2026-09-27" }, ...incoming.bars] };
  const withPrefix = assertValidatedCycleHistory(profile, prefix);
  assert.deepEqual(withPrefix.bars.slice(1, 30), original.bars);
  assert.equal(withPrefix.bars[0]!.time, "2026-09-27");
});

test("history failures identify the date and field without accepting real data corrections", () => {
  const profile = seed();
  for (const field of ["open", "high", "low", "close", "volume", "amount"] as const) {
    const incoming = series(30);
    incoming.bars[20]![field] += 1;
    assert.throws(() => assertValidatedCycleHistory(profile, incoming), (error: unknown) => {
      assert.ok(error instanceof ValidatedCycleError);
      assert.equal(error.code, "history");
      assert.deepEqual(error.dates, [incoming.bars[20]!.time]);
      assert.equal(error.detail, field);
      assert.ok(validatedCycleErrorMessage(error).includes(zhCN.validatedCycle.historyFields[field]));
      assert.ok(validatedCycleErrorMessage(error).includes(incoming.bars[20]!.time));
      return true;
    });
  }
  const missingVolume = series(30);
  missingVolume.bars[20]!.volume = 0;
  assert.throws(() => assertValidatedCycleHistory(profile, missingVolume), ValidatedCycleError);
  const zero = series();
  zero.bars[20]!.volume = 0;
  const amountChanged = series(30);
  amountChanged.bars[20]!.amount += 1;
  assert.throws(() => assertValidatedCycleHistory(seed(zero), amountChanged),
    (error: unknown) => error instanceof ValidatedCycleError && error.detail === "amount");
});

test("explicit continuation calendar cannot duplicate or reorder a decision and default validation stays strict", () => {
  const profile = seed();
  const input = series(30);
  const snapshots = [...profile.snapshots, snapshot(input, 29)];
  const calendar = snapshots.map((item) => item.decisionIndex);
  assert.throws(() => buildStrategyCycleRollingReport(input.bars, snapshots, 15, 10, settings, [...calendar, 29]));
  assert.throws(() => buildStrategyCycleRollingReport(input.bars, snapshots, 15, 10, settings, [...calendar].reverse()));
  assert.throws(() => createValidatedCycleStrategy(input, [], 15, 10, settings, afterClose));
  assert.throws(() => seed(series(10_001)), ValidatedCycleError);
});

test("an explicit research winner is retained even on an otherwise skipped trend day", () => {
  const profile = seed();
  const input = series(30);
  input.bars[29] = { ...input.bars[29]!, close: 150, open: 140, high: 151, low: 139 };
  const defaultSchedule = buildStrategyCycleRollingSchedule(input.bars, 15, 10)!;
  assert.ok(!defaultSchedule.decisionIndexes.includes(29));
  const updated = continueValidatedCycleStrategy(profile, input, snapshot(input, 29), "research", afterClose);
  assert.equal(updated.snapshots.at(-1)?.decisionIndex, 29);
  assert.equal(updated.report.decisionCount, profile.report.decisionCount + 1);
  assert.throws(() => buildStrategyCycleRollingReport(input.bars, updated.snapshots, 15, 10, settings));
});

test("shortcuts render the screening period, full-history end and inherited position", () => {
  const profile = seed();
  const markup = renderToStaticMarkup(createElement(ValidatedCycleShortcuts, {
    records: [profile], error: false, activeKey: profile.key, onOpen() {},
  }));
  assert.ok(markup.includes(`10${zhCN.validatedCycle.nameSuffix}`));
  assert.ok(markup.includes(profile.report.evaluationEndTime));
  assert.ok(markup.includes(zhCN.validatedCycle.position));
  assert.ok(markup.includes('class="active"'));
  assert.ok(!markup.includes(`14${zhCN.validatedCycle.nameSuffix}`));
  assert.equal(renderToStaticMarkup(createElement(ValidatedCycleShortcuts, { records: [], error: false })), "");
  assert.ok(renderToStaticMarkup(createElement(ValidatedCycleShortcuts, { records: [], error: true }))
    .includes(zhCN.validatedCycle.errors.storage));
});

test("validated chart defaults to the last 128 sessions without trimming stored history", () => {
  const input = series(180);
  input.bars = input.bars.map((bar) => ({ ...bar, timestamp: bar.timestamp - 700 * 86_400_000,
    time: new Date(bar.timestamp - 700 * 86_400_000).toISOString().slice(0, 10) }));
  const schedule = buildStrategyCycleRollingSchedule(input.bars, 150, 10)!;
  const profile = createValidatedCycleStrategy(input, schedule.decisionIndexes.map((index) => snapshot(input, index)),
    150, 10, settings, afterClose);
  assert.deepEqual(validatedCycleFocusRange(profile), { startTime: input.bars[52]!.time, endTime: input.bars[179]!.time });
  assert.equal(profile.series.bars.length, 180);
  assert.equal(profile.startTime, input.bars[30]!.time);
  const short = seed();
  assert.equal(validatedCycleFocusRange(short).startTime, short.startTime);
  const markup = renderToStaticMarkup(createElement(ValidatedCycleShortcuts, {
    records: [profile], error: false, embedded: true, onOpen() {},
  }));
  assert.ok(!markup.includes(input.instrument.name));
  assert.ok(markup.includes(`10${zhCN.validatedCycle.nameSuffix}`));
});


test("unfinished screening reuses its completed prefix across dates and rejects revised inputs", async () => {
  const original = series();
  const updated = series(30);
  const signature = async (input: MarketSeries, objective = "totalReturn") => JSON.stringify({
    resultModelVersion: SCREENING_RESULT_MODEL_VERSION,
    instrumentKey: "index:N225",
    lastBar: input.bars.at(-1)!.time,
    barCount: input.bars.length,
    historyDigest: await cycleTaskHistoryDigest(input.bars),
    screeningWindows: [10],
    evaluationSessions: input.bars.length - 15,
    objective,
  });
  const task = {
    signature: await signature(original),
    snapshots: [snapshot(original, 15)],
    status: "paused",
  } as StoredStrategyCycleValidationTask;
  assert.deepEqual(await reusableCycleTaskSnapshots(task, await signature(updated), updated.bars), task.snapshots);
  assert.deepEqual(await reusableCycleTaskSnapshots(task, await signature(updated, "sharpe"), updated.bars), []);
  updated.bars[2]!.close += 1;
  assert.deepEqual(await reusableCycleTaskSnapshots(task, await signature(updated), updated.bars), []);
});

test("serializing and resuming the close checkpoint matches full replay across appended dates", () => {
  const now = new Date("2026-11-05T07:00:00Z");
  const start = 15;
  const build = (count: number, previous?: ReturnType<typeof seed>, costs = settings) => {
    const input = series(count);
    const sessions = count - start;
    const schedule = buildStrategyCycleRollingSchedule(input.bars, sessions, 10)!;
    const winners = schedule.decisionIndexes.map((index) => snapshot(input, index));
    return createValidatedCycleStrategy(input, winners, sessions, 10, costs, now, previous);
  };
  let profile = build(29);
  assert.ok(profile.report.checkpoint);
  assert.ok(profile.report.rebalances.length > 0);
  for (let count = 30; count <= 38; count += 1) {
    profile = build(count, JSON.parse(JSON.stringify(profile)));
    assert.deepEqual(profile.report, build(count).report);
  }
  const differentCosts = { ...settings, slippageRate: 0.02 };
  assert.deepEqual(build(38, profile, differentCosts).report, build(38, undefined, differentCosts).report);
  const legacy = build(29);
  delete legacy.report.checkpoint;
  assert.deepEqual(build(30, legacy).report, build(30).report);
});


test("close checkpoint without a new winner matches the shared backtester and full replay", () => {
  const original = series();
  const input = series(30);
  const costs = { ...settings, positionOverlay: undefined };
  const calendar = buildStrategyCycleRollingSchedule(original.bars, 14, 10)!.decisionIndexes;
  const winners = calendar.map((index) => snapshot(original, index));
  const first = buildStrategyCycleRollingReport(original.bars, winners, 14, 10, costs);
  const resumed = buildStrategyCycleRollingReport(input.bars, winners, 15, 10, costs, calendar, first);
  assert.deepEqual(resumed, buildStrategyCycleRollingReport(input.bars, winners, 15, 10, costs, calendar));
  assert.equal(resumed.decisionCount, first.decisionCount);
  assert.equal(resumed.skippedDecisionCount, first.skippedDecisionCount + 1);

  const targets = input.bars.map(() => 0);
  const events: Parameters<typeof runStrategyCycleCloseBacktest>[3] = input.bars.map(() => []);
  let allocation = 0;
  for (let index = calendar[0]!; index < input.bars.length; index += 1) {
    const winner = winners.find((item) => item.decisionIndex === index);
    if (winner) {
      const resolved = resolveStrategyCycleRecentSignals(allocation, strategyCycleRecentSignals(input.bars, winner, index));
      events[index] = resolved.signals;
      allocation = resolved.targetAllocation;
    }
    targets[index] = allocation;
  }
  const reference = runStrategyCycleCloseBacktest(input.bars, targets, {
    ...costs, startTime: resumed.evaluationStartTime, endTime: resumed.evaluationEndTime,
  }, events);
  assert.equal(resumed.updateReturn, reference.totalReturn);
  assert.deepEqual(resumed.rebalances, reference.rebalances);
});

test("a same-date repair replaces both revised sessions and keeps earlier winners", () => {
  const previous = seed();
  const input = series();
  input.bars[27]!.close += 1;
  input.bars[28]!.close -= 1;
  const prepared = prepareValidatedCycleHistory(previous, input);
  assert.equal(prepared.firstChangedTime, input.bars[27]!.time);
  const winners = buildStrategyCycleRollingSchedule(input.bars, 14, 10)!.decisionIndexes.map((index) => {
    const winner = snapshot(input, index);
    if (index >= 27) winner.label = "Rescreened";
    return winner;
  });
  const repaired = createValidatedCycleStrategy(prepared.series, winners, 14, 10, settings, afterClose, previous);
  const result = mergeValidatedCycleRepair(previous, repaired, true);
  const later = series(34);
  later.bars[27] = input.bars[27]!;
  later.bars[28] = input.bars[28]!;
  assert.equal(prepareValidatedCycleHistory(previous, later).firstChangedTime, input.bars[27]!.time);
  assert.deepEqual(result.series.bars, input.bars);
  assert.deepEqual(result.snapshots, winners);
  assert.deepEqual(result.report, repaired.report);
  assert.deepEqual(result.report, createValidatedCycleStrategy(input, winners, 14, 10, settings, afterClose).report);
  assert.equal(mergeValidatedCycleRepair(previous, repaired), previous);
  input.bars[26]!.close += 2;
  assert.throws(() => prepareValidatedCycleHistory(previous, input), ValidatedCycleError);
});

test("a long market gap bridges the latest batch and replays every missing session", () => {
  const previous = seed(series(25));
  const input = series(34);
  const recent = { ...input, bars: input.bars.slice(-5) };
  const historical = { ...input, bars: input.bars.slice(0, 31) };
  const anchor = previous.series.bars.at(-1)!.time;
  const bridged = bridgeCycleMarketHistory(historical, recent, anchor);
  assert.deepEqual(bridged?.bars, input.bars);
  assert.equal(bridgeCycleMarketHistory({ ...historical, bars: historical.bars.slice(0, 29) }, recent, anchor), null);
  const sessions = 14 + input.bars.length - previous.series.bars.length;
  const schedule = buildStrategyCycleRollingSchedule(input.bars, sessions, 10)!;
  const repaired = createValidatedCycleStrategy(bridged!, schedule.decisionIndexes.map((index) => snapshot(input, index)),
    sessions, 10, settings, new Date("2026-11-05T07:00:00Z"), previous);
  const result = mergeValidatedCycleRepair(previous, repaired, true);
  assert.equal(result.series.bars.length - previous.series.bars.length, 9);
  assert.deepEqual(result.report, repaired.report);
  assert.deepEqual(result.snapshots.map((winner) => winner.decisionIndex), schedule.decisionIndexes);
});

test("primary refresh and task reuse both respect the two-session revision window", async () => {
  const original = series();
  const updated = series();
  for (const index of [26, 27, 28]) updated.bars[index]!.close += 1;
  const merged = refreshRecentCycleBars(original, updated, afterClose);
  assert.deepEqual(merged.bars.slice(-3), [original.bars[26], updated.bars[27], updated.bars[28]]);
  const signature = async (input: MarketSeries) => JSON.stringify({
    resultModelVersion: SCREENING_RESULT_MODEL_VERSION,
    lastBar: input.bars.at(-1)!.time,
    barCount: input.bars.length,
    historyDigest: await cycleTaskHistoryDigest(input.bars),
    recentPrefixDigests: await cycleTaskRecentPrefixDigests(input.bars),
  });
  const task = { signature: await signature(original), snapshots: [26, 27, 28].map((index) => snapshot(original, index)) } as StoredStrategyCycleValidationTask;
  assert.deepEqual(await reusableCycleTaskSnapshots(task, await signature(merged), merged.bars), task.snapshots.slice(0, 1));
  assert.deepEqual(await reusableCycleTaskSnapshots(task, await signature(updated), updated.bars), []);
  const later = series(34);
  later.bars[27] = merged.bars[27]!;
  later.bars[28] = merged.bars[28]!;
  assert.deepEqual(await reusableCycleTaskSnapshots(task, await signature(later), later.bars), task.snapshots.slice(0, 1));
});
