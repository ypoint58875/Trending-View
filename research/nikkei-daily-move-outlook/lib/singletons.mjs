import { change, mean, quantile, runs } from "./core.mjs";
import { movingAverageIntervals } from "./intervals.mjs";

export const durationCategory = (sessions) => sessions === 1 ? "one" : sessions === 2 ? "two" : "long";

export function singletonGroups(completed, duration = "one") {
  return ["up", "down"].flatMap((direction) => {
    const rows = completed.filter((r) => r.direction === direction && durationCategory(r.sessions) === duration);
    const values = rows.map((r) => Math.abs(r.move));
    const edges = [0, quantile(values, 1 / 3), quantile(values, 2 / 3), null];
    return [0, 1, 2].map((i) => ({ id: `${direction}-${duration}-${i + 1}`, direction, duration, ordinal: i + 1,
      lower: edges[i], upper: edges[i + 1] }));
  });
}

export function singletonGroup(move, direction, groups, duration = "one") {
  return groups.find((g) => g.direction === direction && g.duration === duration && Math.abs(move) >= g.lower && (g.upper === null || Math.abs(move) < g.upper))?.id ?? null;
}

export function classifyRun(sign, priorSign, observedSigns) {
  if (!priorSign) return { classification: "neutral_or_unavailable", flipOffset: null, transient: false };
  if (sign === priorSign) return { classification: "with_trend", flipOffset: null, transient: false };
  const flipOffset = observedSigns.findIndex((s) => s === -priorSign);
  const prefix = priorSign > 0 ? "up" : "down";
  if (flipOffset >= 0) return { classification: `${prefix}_turn`, flipOffset, transient: observedSigns.at(-1) === priorSign };
  if (observedSigns.some((s) => !s)) return { classification: "neutral_or_unavailable", flipOffset: null, transient: false };
  return { classification: `${prefix}_internal`, flipOffset: null, transient: false };
}

export function analyzeSingletons(bars, config) {
  const analysisBars = bars.filter((b) => b.date >= config.analysisStart);
  const runData = runs(analysisBars), groups = ["one", "two", "long"].flatMap((d) => singletonGroups(runData.completed, d));
  const indexByDate = new Map(bars.map((b, i) => [b.date, i]));
  const datasets = config.maPeriods.map((period) => movingAverageIntervals(bars, period));
  const intervalRows = [], rows = [];
  for (const dataset of datasets) {
    const labels = new Map(dataset.labels.map((l) => [l.index, l]));
    const intervals = [...dataset.completed, ...(dataset.current ? [dataset.current] : [])];
    const intervalByIndex = new Map();
    for (const interval of intervals) for (let i = interval.startIndex; i <= interval.endIndex; i++) intervalByIndex.set(i, interval);
    for (const run of runData.completed) {
      const anchorIndex = indexByDate.get(run.start), endIndex = indexByDate.get(run.end), confirmedIndex = indexByDate.get(run.confirmed);
      const firstIndex = anchorIndex + 1, sign = run.direction === "up" ? 1 : -1;
      const prior = labels.get(anchorIndex), observed = Array.from({ length: confirmedIndex - firstIndex + 1 }, (_, j) => labels.get(firstIndex + j)?.sign ?? 0);
      const context = classifyRun(sign, prior?.sign ?? 0, observed);
      const parent = intervalByIndex.get(anchorIndex);
      const observedParentMove = parent && prior?.sign ? prior.sign * change(parent.anchorClose, bars[anchorIndex].close) : null;
      const previousSign = anchorIndex > 0 ? Math.sign(bars[anchorIndex].close - bars[anchorIndex - 1].close) : 0;
      const confirmingSign = Math.sign(bars[confirmedIndex].close - bars[endIndex].close);
      const strictSingleton = run.sessions === 1 && previousSign === -sign && confirmingSign === -sign;
      const priorDayMovePct = anchorIndex > 0 ? change(bars[anchorIndex - 1].close, bars[anchorIndex].close) : null;
      const afterOne = bars[confirmedIndex + 1], afterN = bars[confirmedIndex + dataset.period];
      rows.push({ id: `${dataset.period}:${run.end}:${run.direction}`, period: dataset.period,
        direction: run.direction, sign, start: run.start, firstDate: bars[firstIndex].date, end: run.end,
        confirmed: run.confirmed, anchorIndex, firstIndex, endIndex, confirmedIndex,
        sessions: run.sessions, movePct: run.move, singleton: run.sessions === 1, strictSingleton,
        duration: durationCategory(run.sessions), group: singletonGroup(run.move, run.direction, groups, durationCategory(run.sessions)),
        priorDayMovePct, priorDayRatio: priorDayMovePct ? Math.abs(run.move / priorDayMovePct) : null,
        confirmationMovePct: change(bars[endIndex].close, bars[confirmedIndex].close),
        ...context, priorMaSign: prior?.sign ?? 0, centerMaSign: labels.get(endIndex)?.sign ?? 0,
        confirmationMaSign: labels.get(confirmedIndex)?.sign ?? 0,
        firstFlipDate: context.flipOffset === null ? null : bars[firstIndex + context.flipOffset].date,
        parentIntervalId: parent?.id ?? null, parentDirection: parent?.direction ?? null,
        parentMoveAtAnchorPct: observedParentMove,
        relativeToObservedTrend: observedParentMove > 0 ? Math.abs(run.move) / observedParentMove : null,
        centerMaGapPct: labels.get(endIndex) ? change(labels.get(endIndex).ma, bars[endIndex].close) : null,
        observedMaSequence: [prior?.sign ?? 0, ...observed].join("/"),
        future1Date: afterOne?.date ?? null, future1Pct: afterOne ? change(bars[confirmedIndex].close, afterOne.close) : null,
        futureNDate: afterN?.date ?? null, futureNPct: afterN ? change(bars[confirmedIndex].close, afterN.close) : null });
    }
    for (const interval of intervals.filter((p) => p.startDate >= config.analysisStart)) {
      const local = rows.filter((r) => r.period === dataset.period && r.parentIntervalId === interval.id);
      const daily = bars.slice(interval.startIndex, interval.endIndex + 1).map((b, j) => change(bars[interval.startIndex + j - 1].close, b.close));
      intervalRows.push({ ...interval, upDays: daily.filter((r) => r > 0).length, downDays: daily.filter((r) => r < 0).length,
        flatDays: daily.filter((r) => r === 0).length, singletonUpN: local.filter((r) => r.singleton && r.sign > 0).length,
        singletonDownN: local.filter((r) => r.singleton && r.sign < 0).length,
        internalRunsN: local.filter((r) => r.classification.endsWith("_internal")).length,
        turnRunsN: local.filter((r) => r.classification.endsWith("_turn")).length });
    }
  }
  const totals = ["up", "down"].map((direction) => {
    const all = runData.completed.filter((r) => r.direction === direction), one = all.filter((r) => r.sessions === 1);
    return { direction, completedRuns: all.length, singletonN: one.length, singletonShare: one.length / all.length,
      singletonMeanPct: mean(one.map((r) => r.move)) };
  });
  return { groups, rows, intervalRows, totals, currentRun: runData.current };
}

export function summarizeSingletonRows(rows) {
  const ratios = rows.map((r) => r.relativeToObservedTrend).filter((r) => r !== null);
  const future1 = rows.map((r) => r.future1Pct).filter((r) => r !== null), futureN = rows.map((r) => r.futureNPct).filter((r) => r !== null);
  return { n: rows.length, meanPct: mean(rows.map((r) => r.movePct)), medianPct: quantile(rows.map((r) => r.movePct), .5),
    absQ25Pct: quantile(rows.map((r) => Math.abs(r.movePct)), .25), absQ75Pct: quantile(rows.map((r) => Math.abs(r.movePct)), .75),
    minAbsPct: rows.length ? Math.min(...rows.map((r) => Math.abs(r.movePct))) : null,
    maxAbsPct: rows.length ? Math.max(...rows.map((r) => Math.abs(r.movePct))) : null,
    durationMedian: quantile(rows.map((r) => r.sessions), .5), relativeN: ratios.length, relativeMedian: quantile(ratios, .5),
    priorDayRatioMedian: quantile(rows.map((r) => r.priorDayRatio).filter((r) => r !== null), .5),
    priorDayMeanPct: mean(rows.map((r) => r.priorDayMovePct).filter((r) => r !== null)),
    confirmationMeanPct: mean(rows.map((r) => r.confirmationMovePct)),
    transientN: rows.filter((r) => r.transient).length,
    future1N: future1.length, future1MeanPct: mean(future1), future1UpProbability: future1.length ? future1.filter((v) => v > 0).length / future1.length : null,
    futureNN: futureN.length, futureNMeanPct: mean(futureN), futureNUpProbability: futureN.length ? futureN.filter((v) => v > 0).length / futureN.length : null };
}
