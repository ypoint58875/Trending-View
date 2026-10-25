import { mean, quantile, change } from "./core.mjs";
import { amplitudeBucket, relativeCrossings, summarizeRelativeCrossings } from "./relative-intervals.mjs";
import { simulateRelativeExits } from "./relative-exits.mjs";

// Partitions use only preceding intervals known by the training cutoff.
// Decrease the group count when ties would create a sparse quantile group.
export function learnPartitions(pairs, config) {
  return config.maPeriods.flatMap((period) => ["up", "down"].flatMap((direction) => {
    const rows = pairs.filter((p) => p.period === period && p.direction === direction &&
      p.startDate >= config.analysisStart && p.startDate <= config.trainingEnd);
    if (!rows.length) throw new Error(`No partition training data: ${period}/${direction}`);
    let count = Math.max(1, Math.min(config.maximumGroups, Math.floor(rows.length / config.minimumGroupTrainingPairs)));
    let bins;
    do {
      const edges = [0, ...Array.from({ length: count - 1 }, (_, i) => quantile(rows.map((r) => r.scalePct), (i + 1) / count)), null];
      bins = Array.from({ length: count }, (_, i) => ({ period, direction, id: `${period}-${direction}-${i + 1}`,
        lower: edges[i], upper: edges[i + 1], trainingN: 0 }));
      for (const row of rows) { const bin = bins.find((b) => b.id === amplitudeBucket(row.scalePct, bins)); if (bin) bin.trainingN++; }
      if (count === 1 || bins.every((b) => b.trainingN >= config.minimumGroupTrainingPairs && (b.upper === null || b.upper > b.lower))) break;
      count--;
    } while (count > 0);
    return bins;
  }));
}

export function fitAdaptiveCandidates(pairs, partitions, config) {
  return partitions.flatMap((bin) => {
    const mature = pairs.filter((p) => p.period === bin.period && p.direction === bin.direction && p.startDate >= config.analysisStart &&
      p.confirmedDate && p.confirmedDate <= config.trainingEnd);
    const bins = partitions.filter((b) => b.period === bin.period && b.direction === bin.direction);
    const local = mature.filter((p) => amplitudeBucket(p.scalePct, bins) === bin.id);
    const positive = local.map((p) => p.maxRatio).filter((r) => r > 0);
    const fallback = positive.length < config.minimumPositiveTrainingPairs;
    const estimation = fallback ? mature.map((p) => p.maxRatio).filter((r) => r > 0) : positive;
    if (!estimation.length) throw new Error("No positive training excursions");
    return config.ratioQuantiles.map((q) => ({ period: bin.period, direction: bin.direction, bucket: bin.id,
      quantileRank: q, ratio: quantile(estimation, q), trainingPairs: local.length,
      positivePeakPairs: positive.length, estimationPairs: estimation.length, fallbackToPooled: fallback }));
  });
}

export function buyAndHold(bars, window, costBps) {
  const rows = bars.filter((b) => b.date >= window.start && b.date <= window.end);
  if (!rows.length) throw new Error("Empty benchmark window");
  const quantity = (1 - costBps / 10000) / rows[0].open;
  let peak = 1, maxDrawdown = 0;
  const equity = rows.map((b) => {
    const value = quantity * b.close; peak = Math.max(peak, value); maxDrawdown = Math.min(maxDrawdown, value / peak - 1);
    return { date: b.date, value, allocation: 1 };
  });
  const years = Math.max(1 / 365.25, (Date.parse(rows.at(-1).date) - Date.parse(rows[0].date)) / 86400000 / 365.25);
  return { equity, metrics: { mode: "buy_and_hold", costBps, windowStart: rows[0].date, windowEnd: rows.at(-1).date,
    totalReturnPct: (equity.at(-1).value - 1) * 100, cagrPct: (equity.at(-1).value ** (1 / years) - 1) * 100,
    maxDrawdownPct: maxDrawdown * 100, exposure: 1, entries: 1, closedTrades: 0 } };
}

export function annualComparison(strategy, benchmark) {
  const years = [...new Set(strategy.map((r) => r.date.slice(0, 4)))];
  return years.map((year) => {
    const first = strategy.findIndex((r) => r.date.startsWith(year));
    let last = strategy.length - 1; while (!strategy[last].date.startsWith(year)) last--;
    const active = (strategy[last].value / (first ? strategy[first - 1].value : 1) - 1) * 100;
    const passive = (benchmark[last].value / (first ? benchmark[first - 1].value : 1) - 1) * 100;
    return { year, partial: first === 0 || last === strategy.length - 1, strategyPct: active, buyHoldPct: passive, excessPct: active - passive };
  });
}

export function candidateEvidence(bars, pairs, partitions, candidates, config, lastDate) {
  const events = partitions.flatMap((bin) => relativeCrossings(bars,
    pairs.filter((p) => p.period === bin.period && p.direction === bin.direction),
    candidates.filter((c) => c.bucket === bin.id), partitions.filter((b) => b.period === bin.period && b.direction === bin.direction)));
  const windows = [
    { sample: "training", start: config.analysisStart, end: config.trainingEnd },
    { sample: "validation", start: config.validationStart, end: config.validationEnd },
    { sample: "evaluation", start: config.evaluationStart, end: lastDate }
  ];
  const statistics = [];
  for (const candidate of candidates) {
    const bins = partitions.filter((b) => b.period === candidate.period && b.direction === candidate.direction);
    for (const window of windows) {
      const local = pairs.filter((p) => p.period === candidate.period && p.direction === candidate.direction &&
        amplitudeBucket(p.scalePct, bins) === candidate.bucket && p.startDate >= window.start && p.startDate <= window.end);
      const selected = events.filter((e) => e.bucket === candidate.bucket && e.quantileRank === candidate.quantileRank &&
        e.triggerDate >= window.start && e.triggerDate <= window.end && local.some((p) => p.pairId === e.pairId))
        .map((e) => e.confirmedDate && e.confirmedDate <= window.end ? e : { ...e, pairStatus: "unfinished" });
      const matured = local.filter((p) => p.confirmedDate && p.confirmedDate <= window.end);
      const naive = matured.map((p) => p.sign * change(bars[p.startIndex].close, p.endClose));
      const summary = summarizeRelativeCrossings(selected);
      const observed = selected.filter((e) => e.pairStatus === "completed");
      statistics.push({ ...candidate, sample: window.sample, opportunities: local.length, matureOpportunities: matured.length,
        ...summary, coverage: matured.length ? summary.n / matured.length : null,
        noThresholdN: naive.length, noThresholdContinuation: naive.length ? naive.filter((r) => r > 0).length / naive.length : null,
        meanRemainingRatio: mean(observed.map((e) => e.finalRatio - e.observedRatio)),
        medianRemainingPct: quantile(observed.map((e) => e.remainingPct), 0.5) });
    }
  }
  return { events, statistics };
}

const better = (a, b) => !b || a.cagrPct > b.cagrPct + 1e-10 ||
  (Math.abs(a.cagrPct - b.cagrPct) <= 1e-10 && a.maxDrawdownPct > b.maxDrawdownPct + 1e-10);

export function optimizeAdaptive(bars, dataset, pairs, partitions, candidates, config, statistics = [], excludedGroups = 0) {
  const local = pairs.filter((p) => p.period === dataset.period), allBins = partitions.filter((b) => b.period === dataset.period);
  const binsByDirection = Object.fromEntries(["up", "down"].map((d) => [d, allBins.filter((b) => b.direction === d)]));
  const minimumReferenceByDirection = Object.fromEntries(["up", "down"].map((d) => [d,
    binsByDirection[d][Math.min(excludedGroups, binsByDirection[d].length - 1)].lower]));
  const bins = allBins.filter((b) => b.lower >= minimumReferenceByDirection[b.direction]);
  const validation = { start: config.validationStart, end: config.validationEnd };
  const evaluation = { start: config.evaluationStart, end: bars.at(-1).date };
  const grid = [], seen = new Map();
  const makeRule = (schedule) => ({ mode: "relative", candidates, binsByDirection, quantilesByBucket: schedule, minimumReferenceByDirection });
  const evaluate = (schedule, phase) => {
    const key = bins.map((b) => schedule[b.id]).join(",");
    if (seen.has(key)) return seen.get(key);
    const run = simulateRelativeExits(bars, dataset, local, validation, makeRule(schedule), config.selectionCostBpsPerSide);
    const row = { period: dataset.period, excludedGroups, phase, key, schedule: { ...schedule }, ...run.metrics, openPosition: undefined,
      eligible: run.metrics.closedTrades >= config.minimumValidationTrades };
    grid.push(row); seen.set(key, row); return row;
  };
  let winner = null;
  for (const entryQ of config.ratioQuantiles) for (const exitQ of config.ratioQuantiles) {
    const schedule = Object.fromEntries(bins.map((b) => [b.id, b.direction === "up" ? entryQ : exitQ]));
    const row = evaluate(schedule, "shared_rank_seed");
    if (row.eligible && better(row, winner)) winner = row;
  }
  if (!winner) return { period: dataset.period, excludedGroups, minimumReferenceByDirection, status: "no_eligible_validation_rule", grid };
  for (let pass = 0; pass < config.coordinatePasses; pass++) {
    const startKey = winner.key;
    for (const bin of bins) {
      const base = { ...winner.schedule };
      for (const q of config.ratioQuantiles) {
        const row = evaluate({ ...base, [bin.id]: q }, `group_refinement_${pass + 1}`);
        if (row.eligible && better(row, winner)) winner = row;
      }
    }
    if (winner.key === startKey) break;
  }
  const rule = makeRule(winner.schedule);
  const run = simulateRelativeExits(bars, dataset, local, evaluation, rule, config.selectionCostBpsPerSide);
  const bh = buyAndHold(bars, evaluation, config.selectionCostBpsPerSide);
  const valBh = buyAndHold(bars, validation, config.selectionCostBpsPerSide);
  const annual = annualComparison(run.equity, bh.equity);
  const sensitivity = config.costBpsPerSide.map((cost) => {
    const active = simulateRelativeExits(bars, dataset, local, evaluation, rule, cost).metrics;
    const passive = buyAndHold(bars, evaluation, cost).metrics;
    return { period: dataset.period, costBps: cost, strategyCagr: active.cagrPct, buyHoldCagr: passive.cagrPct,
      excessCagr: active.cagrPct - passive.cagrPct, strategyReturnPct: active.totalReturnPct, buyHoldReturnPct: passive.totalReturnPct,
      strategyDrawdownPct: active.maxDrawdownPct, buyHoldDrawdownPct: passive.maxDrawdownPct };
  });
  const thresholds = candidates.filter((c) => c.period === dataset.period && winner.schedule[c.bucket] === c.quantileRank);
  // A separate diagnostic answers whether more accurate interval predictions
  // also produce a better portfolio. It never replaces the return-selected rule.
  const accuracyGroups = bins.map((bin) => {
    const rows = statistics.filter((r) => r.bucket === bin.id && r.sample === "validation" &&
      r.n >= config.minimumValidationPredictionEvents);
    rows.sort((a, b) => b.continuedProbability - a.continuedProbability || b.meanRemainingPct - a.meanRemainingPct || a.quantileRank - b.quantileRank);
    const selected = rows[0];
    return { bucket: bin.id, quantileRank: selected?.quantileRank ?? config.ratioQuantiles[0],
      supported: !!selected, validationN: selected?.n ?? 0, validationProbability: selected?.continuedProbability ?? null };
  });
  const accuracySchedule = Object.fromEntries(accuracyGroups.map((r) => [r.bucket, r.quantileRank]));
  const accuracyRule = makeRule(accuracySchedule);
  const accuracyRun = simulateRelativeExits(bars, dataset, local, evaluation, accuracyRule, config.selectionCostBpsPerSide);
  const accuracyValidation = simulateRelativeExits(bars, dataset, local, validation, accuracyRule, config.selectionCostBpsPerSide);
  const accuracyPolicy = { groups: accuracyGroups, supported: accuracyGroups.every((g) => g.supported),
    thresholds: candidates.filter((c) => c.period === dataset.period && accuracySchedule[c.bucket] === c.quantileRank),
    validation: accuracyValidation.metrics, evaluation: accuracyRun.metrics };
  const evidence = run.metrics.closedTrades >= config.minimumEvaluationTrades;
  const outperform = run.metrics.cagrPct > bh.metrics.cagrPct;
  // These are descriptive historical checks, not statistical significance tests.
  const robust = evidence && outperform && sensitivity.every((s) => s.excessCagr > 0) &&
    annual.filter((r) => r.excessPct > 0).length > annual.length / 2;
  return { period: dataset.period, excludedGroups, minimumReferenceByDirection, status: robust ? "historical_checks_passed" : "no_stable_excess_established",
    evidence, outperform, robust, thresholds, validation: winner, validationBuyHold: valBh.metrics,
    evaluation: run.metrics, buyHold: bh.metrics, annual, sensitivity, accuracyPolicy, grid, run,
    accuracyRun, benchmarkEquity: bh.equity };
}

export function optimizeAdaptiveFamilies(bars, dataset, pairs, partitions, candidates, config, statistics = []) {
  const runs = config.excludeSmallestGroups.map((excluded) => optimizeAdaptive(bars, dataset, pairs, partitions, candidates, config, statistics, excluded));
  const eligible = runs.filter((r) => r.validation);
  eligible.sort((a, b) => b.validation.cagrPct - a.validation.cagrPct || b.validation.maxDrawdownPct - a.validation.maxDrawdownPct || a.excludedGroups - b.excludedGroups);
  const winner = eligible[0];
  if (!winner) return { ...runs[0], grid: runs.flatMap((r) => r.grid) };
  return { ...winner, grid: runs.flatMap((r) => r.grid), filteringComparisons: runs.map((r) => ({
    excludedGroups: r.excludedGroups, minimumReferenceByDirection: r.minimumReferenceByDirection,
    validation: r.validation, evaluation: r.evaluation, buyHold: r.buyHold,
    thresholds: r.thresholds,
    status: r.status, selected: r.excludedGroups === winner.excludedGroups })) };
}
