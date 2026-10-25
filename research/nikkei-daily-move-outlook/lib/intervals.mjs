import { mean, quantile, change, summarize } from "./core.mjs";

export function movingAverageIntervals(bars, period) {
  if (!Number.isInteger(period) || period < 2) throw new Error("MA period must be an integer of at least two sessions");
  let sum = 0, active = null;
  const labels = [], completed = [];
  const finish = (confirmedIndex) => {
    const end = active.endIndex, anchor = active.startIndex - 1;
    const stepReturns = bars.slice(active.startIndex, end + 1).map((b, k) => change(bars[anchor + k].close, b.close));
    return { ...active, id: `${period}:${bars[active.startIndex].date}`, period,
      startDate: bars[active.startIndex].date, anchorDate: bars[anchor].date, anchorClose: bars[anchor].close,
      endDate: bars[end].date, endClose: bars[end].close, sessions: end - active.startIndex + 1,
      confirmedDate: confirmedIndex === null ? null : bars[confirmedIndex].date,
      movePct: change(bars[anchor].close, bars[end].close),
      maxRisePct: Math.max(0, ...bars.slice(active.startIndex, end + 1).map((b) => change(bars[anchor].close, b.close))),
      maxFallPct: Math.min(0, ...bars.slice(active.startIndex, end + 1).map((b) => change(bars[anchor].close, b.close))),
      sameDirectionDays: stepReturns.filter((r) => Math.sign(r) === active.sign).length,
      status: confirmedIndex === null ? "unfinished" : "completed" };
  };
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].close;
    if (i >= period) sum -= bars[i - period].close;
    if (i < period) continue;
    // sign(SMA[t] - SMA[t-1]) is exactly sign(close[t] - close[t-N]).
    // Comparing these source values preserves exact flat labels without accumulated-sum noise.
    const sign = Math.sign(bars[i].close - bars[i - period].close);
    const direction = sign > 0 ? "up" : sign < 0 ? "down" : "flat";
    labels.push({ index: i, date: bars[i].date, ma: sum / period, sign, direction });
    if (active && active.sign !== sign) { completed.push(finish(i)); active = null; }
    if (!active) active = { period, sign, direction, startIndex: i, endIndex: i };
    else active.endIndex = i;
  }
  return { period, labels, completed, current: active ? finish(null) : null };
}

export function intervalSummary(intervals, period) {
  const sessions = intervals.reduce((s, r) => s + r.sessions, 0);
  return ["up", "down", "flat"].map((direction) => {
    const rows = intervals.filter((r) => r.direction === direction), returns = rows.map((r) => r.movePct);
    const steps = rows.reduce((s, r) => s + r.sessions, 0);
    const aligned = rows.filter((r) => Math.sign(r.movePct) === r.sign);
    return { period, direction, n: rows.length, countShare: intervals.length ? rows.length / intervals.length : null,
      sessions: steps, sessionShare: sessions ? steps / sessions : null,
      agreementProbability: rows.length ? aligned.length / rows.length : null,
      sameDirectionDayShare: steps ? rows.reduce((s, r) => s + r.sameDirectionDays, 0) / steps : null,
      ...Object.fromEntries(Object.entries(summarize(returns)).filter(([key]) => key !== "n")),
      durationMean: mean(rows.map((r) => r.sessions)), durationMedian: quantile(rows.map((r) => r.sessions), 0.5),
      durationQ90: quantile(rows.map((r) => r.sessions), 0.9),
      alignedN: aligned.length, alignedAbsQ25: quantile(aligned.map((r) => Math.abs(r.movePct)), 0.25),
      alignedAbsQ50: quantile(aligned.map((r) => Math.abs(r.movePct)), 0.5),
      alignedAbsQ75: quantile(aligned.map((r) => Math.abs(r.movePct)), 0.75),
      alignedAbsQ90: quantile(aligned.map((r) => Math.abs(r.movePct)), 0.9),
      alignedAbsQ95: quantile(aligned.map((r) => Math.abs(r.movePct)), 0.95) };
  });
}

export function deriveThresholds(intervals, config) {
  const result = [];
  for (const period of config.maPeriods) for (const direction of ["up", "down"]) {
    const rows = intervals.filter((r) => r.period === period && r.direction === direction &&
      r.startDate >= config.analysisStart && r.confirmedDate !== null && r.confirmedDate <= config.calibrationEnd &&
      (direction === "up" ? r.movePct > 0 : r.movePct < 0));
    const amplitudes = rows.map((r) => Math.abs(r.movePct));
    if (!amplitudes.length) throw new Error(`No completed calibration intervals for SMA(${period}) ${direction}`);
    for (const q of config.candidateQuantiles) result.push({ period, direction, quantileRank: q,
      thresholdPct: quantile(amplitudes, q), calibrationN: rows.length, calibrationEnd: config.calibrationEnd });
  }
  return result;
}

export function thresholdEvents(bars, intervals, candidates, startDate) {
  const events = [];
  for (const candidate of candidates) {
    if (!(candidate.thresholdPct > 0)) throw new Error("Threshold must be positive");
    const sign = candidate.direction === "up" ? 1 : -1;
    for (const interval of intervals) {
      if (interval.period !== candidate.period || interval.direction !== candidate.direction || interval.startDate < startDate) continue;
      for (let i = interval.startIndex; i <= interval.endIndex; i++) {
        const move = change(interval.anchorClose, bars[i].close);
        if (sign * move + 1e-12 >= candidate.thresholdPct) {
          events.push({ ...candidate, intervalId: interval.id, intervalStart: interval.startDate,
            anchorDate: interval.anchorDate, anchorClose: interval.anchorClose,
            index: i, date: bars[i].date, close: bars[i].close, reachedPct: move });
          break;
        }
      }
    }
  }
  return events.sort((a, b) => a.index - b.index || a.thresholdPct - b.thresholdPct);
}

export function eventOutcome(bars, event, horizon, endDate = "9999") {
  const last = event.index + horizon;
  if (last >= bars.length || bars[last].date > endDate) return null;
  const counterSign = event.direction === "down" ? 1 : -1;
  const future = bars.slice(event.index + 1, last + 1).map((b) => change(event.close, b.close));
  const terminalPct = future.at(-1), counterPct = counterSign * terminalPct;
  return { ...event, horizon, outcomeDate: bars[last].date, terminalPct, counterPct,
    nextOpenTerminalPct: change(bars[event.index + 1].open, bars[last].close),
    counterMaxPct: Math.max(0, ...future.map((r) => counterSign * r)),
    adverseMaxPct: Math.max(0, ...future.map((r) => -counterSign * r)) };
}

export function thinOutcomes(outcomes, horizon) {
  const result = [];
  let last = -Infinity;
  for (const row of [...outcomes].sort((a, b) => a.index - b.index)) {
    if (row.index - last >= horizon) { result.push(row); last = row.index; }
  }
  return result;
}

export function summarizeOutcomes(outcomes) {
  const counter = outcomes.filter((r) => r.counterPct > 0), continued = outcomes.filter((r) => r.counterPct < 0);
  return { n: outcomes.length, counterProbability: outcomes.length ? counter.length / outcomes.length : null,
    continuationProbability: outcomes.length ? continued.length / outcomes.length : null,
    flatProbability: outcomes.length ? outcomes.filter((r) => r.counterPct === 0).length / outcomes.length : null,
    counterMeanWhenOccursPct: mean(counter.map((r) => r.counterPct)), counterMedianWhenOccursPct: quantile(counter.map((r) => r.counterPct), 0.5),
    continuationMeanWhenOccursPct: mean(continued.map((r) => -r.counterPct)),
    meanTerminalPct: mean(outcomes.map((r) => r.terminalPct)), meanCounterPct: mean(outcomes.map((r) => r.counterPct)),
    q10TerminalPct: quantile(outcomes.map((r) => r.terminalPct), 0.1), q90TerminalPct: quantile(outcomes.map((r) => r.terminalPct), 0.9),
    medianCounterMaxPct: quantile(outcomes.map((r) => r.counterMaxPct), 0.5),
    medianAdverseMaxPct: quantile(outcomes.map((r) => r.adverseMaxPct), 0.5) };
}

export function analyzeThresholds(bars, events, candidates, config) {
  const groups = [
    { sample: "all", start: config.analysisStart, end: bars.at(-1).date },
    { sample: "calibration", start: config.analysisStart, end: config.calibrationEnd },
    { sample: "evaluation", start: config.evaluationStart, end: bars.at(-1).date }
  ];
  const summaries = [], outcomes = [];
  for (const group of groups) for (const h of config.horizons) {
    const baseline = [];
    for (let i = 0; i + h < bars.length; i++) {
      if (bars[i].date >= group.start && bars[i + h].date <= group.end) baseline.push(change(bars[i].close, bars[i + h].close));
    }
    for (const candidate of candidates) {
      const selected = events.filter((e) => e.period === candidate.period && e.direction === candidate.direction &&
        e.quantileRank === candidate.quantileRank && e.thresholdPct === candidate.thresholdPct && e.date >= group.start && e.date <= group.end);
      const mature = selected.map((e) => eventOutcome(bars, e, h, group.end)).filter(Boolean);
      const independent = thinOutcomes(mature, h), counterSign = candidate.direction === "down" ? 1 : -1;
      const baseProbability = mean(baseline.map((r) => Number(counterSign * r > 0)));
      const summary = summarizeOutcomes(mature), thinned = summarizeOutcomes(independent);
      summaries.push({ ...candidate, sample: group.sample, horizon: h, ...summary,
        censoredN: selected.length - mature.length, baselineN: baseline.length, baselineCounterProbability: baseProbability,
        lift: summary.counterProbability === null ? null : summary.counterProbability - baseProbability,
        nonOverlapN: thinned.n, nonOverlapCounterProbability: thinned.counterProbability,
        nonOverlapMeanCounterPct: thinned.meanCounterPct,
        sparse: summary.n < config.minimumDisplaySamples, firstEvent: mature[0]?.date ?? null, lastEvent: mature.at(-1)?.date ?? null });
      if (group.sample === "all") outcomes.push(...mature);
    }
  }
  return { summaries, outcomes };
}
