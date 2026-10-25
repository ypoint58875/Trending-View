import { mean, change } from "./core.mjs";
import { amplitudeBucket } from "./relative-intervals.mjs";

export function signalSchedule(bars, pairs, rule, bins) {
  const entries = new Map(), exits = new Map();
  for (const pair of pairs) {
    if (rule.mode === "baseline") {
      if (pair.direction === "up") entries.set(pair.startIndex + 1, { pair, ratio: null, line: null, triggerIndex: pair.startIndex });
      continue;
    }
    if (pair.scalePct < (rule.minimumReferenceByDirection?.[pair.direction] ?? 0)) continue;
    const localBins = rule.binsByDirection?.[pair.direction] ?? bins;
    const bucket = amplitudeBucket(pair.scalePct, localBins);
    const q = rule.quantilesByBucket?.[bucket] ?? (pair.direction === "up" ? rule.entryQuantile : rule.exitQuantile);
    const candidate = rule.candidates.find((r) => r.period === pair.period && r.direction === pair.direction && r.bucket === bucket && r.quantileRank === q);
    if (!candidate) throw new Error("Missing bucket-specific threshold schedule");
    for (let i = pair.startIndex; i <= pair.endIndex; i++) {
      const ratio = pair.sign * change(pair.anchorClose, bars[i].close) / pair.scalePct;
      if (ratio + 1e-12 < candidate.ratio) continue;
      const line = pair.anchorClose * (1 + pair.sign * candidate.ratio * pair.scalePct / 100);
      const event = { pair, ratio: candidate.ratio, bucket, line, triggerIndex: i, fallback: candidate.fallbackToPooled };
      if (pair.direction === "up") entries.set(i + 1, event);
      else exits.set(i, event);
      break;
    }
  }
  return { entries, exits };
}

export function simulateRelativeExits(bars, dataset, pairs, window, rule, costBps = 5, bins = []) {
  const first = bars.findIndex((b) => b.date >= window.start);
  let last = bars.length - 1;
  while (last >= 0 && bars[last].date > window.end) last--;
  if (first < 0 || last < first) throw new Error("Empty simulation window");
  const cost = costBps / 10000;
  if (cost < 0 || cost >= 1) throw new Error("Invalid transaction cost");
  const localPairs = pairs.filter((p) => p.startDate >= window.start && p.startDate <= window.end);
  const schedule = signalSchedule(bars, localPairs, rule, bins);
  const labels = new Map(dataset.labels.map((r) => [r.index, r.sign]));
  const completedAt = new Map(dataset.completed.map((r) => [r.endIndex + 1, r]));
  let cash = 1, position = null, pending = null, peak = 1, maxDrawdown = 0;
  let opportunities = 0, entries = 0, ignoredWhileHolding = 0, invalidReferenceExits = 0;
  const trades = [], equity = [], signals = [];
  for (let i = first; i <= last; i++) {
    let exited = false;
    if (pending && position) {
      cash = position.quantity * bars[i].open * (1 - cost);
      trades.push({ period: dataset.period, mode: rule.mode, entryQuantile: rule.entryQuantile ?? null,
        exitQuantile: rule.exitQuantile ?? null, costBps,
        entrySignalDate: position.signalDate, entryDate: position.entryDate, entryIndex: position.entryIndex,
        entryPrice: position.entryPrice, entryRatio: position.entryRatio, entryBucket: position.entryBucket,
        previousDownPct: position.scalePct, exitSignalDate: bars[pending.signalIndex].date,
        exitDate: bars[i].date, exitIndex: i, exitPrice: bars[i].open, exitRatio: pending.ratio ?? null,
        exitBucket: pending.bucket ?? null, triggerLine: pending.line ?? null, reason: pending.reason,
        grossReturnPct: (bars[i].open / position.entryPrice - 1) * 100,
        netReturnPct: (cash / position.entryCapital - 1) * 100, sessions: i - position.entryIndex });
      position = null; pending = null; exited = true;
    }
    const entry = schedule.entries.get(i);
    if (entry) {
      opportunities++;
      if (position || exited) ignoredWhileHolding++;
      else {
        entries++;
        position = { entryIndex: i, entryDate: bars[i].date, signalDate: bars[entry.triggerIndex].date,
          entryPrice: bars[i].open, entryCapital: cash, quantity: cash * (1 - cost) / bars[i].open,
          entryRatio: entry.ratio, entryBucket: entry.bucket ?? null, entryLine: entry.line,
          scalePct: entry.pair.scalePct, anchorClose: entry.pair.anchorClose };
        cash = 0;
      }
    }
    if (position) {
      if (rule.mode === "baseline" || rule.mode === "entry_threshold_ma_exit") {
        if (labels.get(i) <= 0) pending = { reason: "ma_direction_exit", signalIndex: i };
      } else {
        const exit = schedule.exits.get(i);
        if (exit) pending = { reason: "relative_turn_exit", signalIndex: i, ratio: exit.ratio, line: exit.line, bucket: exit.bucket };
        else {
          const ended = completedAt.get(i);
          if (ended?.direction === "up" && ended.movePct <= 0 && labels.get(i) < 0) {
            pending = { reason: "invalid_previous_up_amplitude_fallback", signalIndex: i };
            invalidReferenceExits++;
          }
        }
      }
      if (pending) signals.push({ date: bars[i].date, index: i, reason: pending.reason, ratio: pending.ratio ?? null,
        bucket: pending.bucket ?? null, line: pending.line ?? null, close: bars[i].close });
    }
    const value = position ? position.quantity * bars[i].close : cash;
    peak = Math.max(peak, value); maxDrawdown = Math.min(maxDrawdown, value / peak - 1);
    equity.push({ date: bars[i].date, value, allocation: position ? 1 : 0 });
  }
  const endValue = equity.at(-1).value;
  const years = Math.max(1 / 365.25, (Date.parse(bars[last].date) - Date.parse(bars[first].date)) / 86400000 / 365.25);
  const cagrPct = (endValue ** (1 / years) - 1) * 100;
  const winners = trades.filter((t) => t.netReturnPct > 0), losers = trades.filter((t) => t.netReturnPct < 0);
  const loss = -losers.reduce((s, t) => s + t.netReturnPct, 0);
  const metrics = { period: dataset.period, mode: rule.mode, entryQuantile: rule.entryQuantile ?? null,
    exitQuantile: rule.exitQuantile ?? null, costBps, windowStart: bars[first].date, windowEnd: bars[last].date,
    entries, closedTrades: trades.length, opportunities, ignoredWhileHolding, invalidReferenceExits,
    totalReturnPct: (endValue - 1) * 100, cagrPct, maxDrawdownPct: maxDrawdown * 100,
    calmar: maxDrawdown < 0 ? cagrPct / Math.abs(maxDrawdown * 100) : null,
    winProbability: trades.length ? winners.length / trades.length : null,
    meanNetTradePct: mean(trades.map((t) => t.netReturnPct)),
    profitFactor: loss > 0 ? winners.reduce((s, t) => s + t.netReturnPct, 0) / loss : null,
    exposure: mean(equity.map((r) => r.allocation)),
    openPosition: position ? { ...position, quantity: undefined, markedClose: bars[last].close,
      unrealizedGrossPct: (bars[last].close / position.entryPrice - 1) * 100, pendingExit: pending?.reason ?? null } : null };
  return { metrics, trades, equity, signals };
}

export function evaluateExitGrid(bars, datasets, pairs, candidates, config) {
  const windows = [
    { sample: "training", start: config.analysisStart, end: config.trainingEnd },
    { sample: "validation", start: config.validationStart, end: config.validationEnd },
    { sample: "evaluation", start: config.evaluationStart, end: bars.at(-1).date }
  ];
  const grid = [], selected = [], selectedRuns = [], benchmarks = [], sensitivity = [];
  for (const dataset of datasets) {
    const localPairs = pairs.filter((p) => p.period === dataset.period);
    const schedule = candidates.filter((r) => r.period === dataset.period);
    const bases = new Map();
    for (const window of windows) {
      const run = simulateRelativeExits(bars, dataset, localPairs, window, { mode: "baseline" }, config.selectionCostBpsPerSide, config.previousAmplitudeBins);
      bases.set(window.sample, run);
      benchmarks.push({ sample: window.sample, ...run.metrics });
    }
    const eligible = [];
    for (const exitQuantile of config.ratioQuantiles) for (const entryQuantile of config.ratioQuantiles) {
      const rule = { mode: "relative", exitQuantile, entryQuantile, candidates: schedule };
      for (const window of windows.slice(0, 2)) {
        const run = simulateRelativeExits(bars, dataset, localPairs, window, rule, config.selectionCostBpsPerSide, config.previousAmplitudeBins);
        const participation = bases.get(window.sample).metrics.entries ? run.metrics.entries / bases.get(window.sample).metrics.entries : 0;
        const row = { sample: window.sample, ...run.metrics, openPosition: undefined, participation,
          eligible: run.metrics.closedTrades >= config.minimumValidationTrades &&
            participation >= config.minimumValidationParticipation && Number.isFinite(run.metrics.calmar) };
        grid.push(row);
        if (window.sample === "validation" && row.eligible) eligible.push(row);
      }
    }
    eligible.sort((a, b) => b.calmar - a.calmar || b.cagrPct - a.cagrPct || a.exitQuantile - b.exitQuantile || a.entryQuantile - b.entryQuantile);
    const winner = eligible[0];
    if (!winner) { selected.push({ period: dataset.period, status: "no_eligible_validation_rule" }); continue; }
    const rule = { mode: "relative", exitQuantile: winner.exitQuantile, entryQuantile: winner.entryQuantile, candidates: schedule };
    const test = simulateRelativeExits(bars, dataset, localPairs, windows[2], rule, config.selectionCostBpsPerSide, config.previousAmplitudeBins);
    const matched = simulateRelativeExits(bars, dataset, localPairs, windows[2], { ...rule, mode: "entry_threshold_ma_exit" }, config.selectionCostBpsPerSide, config.previousAmplitudeBins);
    const base = bases.get("evaluation");
    const costs = config.costBpsPerSide.map((cost) => ({ sample: "evaluation",
      ...simulateRelativeExits(bars, dataset, localPairs, windows[2], rule, cost, config.previousAmplitudeBins).metrics, openPosition: undefined }));
    sensitivity.push(...costs);
    const passes = test.metrics.closedTrades >= config.minimumEvaluationTrades && test.metrics.cagrPct > 0 &&
      test.metrics.calmar > base.metrics.calmar && test.metrics.calmar > matched.metrics.calmar &&
      test.metrics.maxDrawdownPct >= base.metrics.maxDrawdownPct && costs.every((r) => r.cagrPct > 0);
    const thresholds = schedule.filter((r) => r.bucket !== "all" && r.quantileRank === (r.direction === "up" ? winner.entryQuantile : winner.exitQuantile));
    selected.push({ period: dataset.period,
      status: passes ? "candidate_improves_defined_evaluation_comparison" : "no_stable_optimum_established",
      exitQuantile: winner.exitQuantile, entryQuantile: winner.entryQuantile,
      thresholds, validation: winner, evaluation: test.metrics, evaluationBaseline: base.metrics,
      matchedEntryBaseline: matched.metrics, passesComparison: passes });
    selectedRuns.push({ period: dataset.period, sample: "evaluation", ...test });
  }
  return { grid, selected, selectedRuns, benchmarks, sensitivity };
}
