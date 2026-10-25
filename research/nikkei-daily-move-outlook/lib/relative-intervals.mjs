import { mean, quantile, change } from "./core.mjs";

export function amplitudeBucket(value, bins) {
  return bins.find((b) => value >= b.lower && (b.upper === null || value < b.upper))?.id ?? null;
}

export function adjacentPairs(dataset, analysisStart) {
  const ordered = [...dataset.completed, ...(dataset.current ? [dataset.current] : [])];
  const pairs = [], excluded = [];
  for (let i = 1; i < ordered.length; i++) {
    const previous = ordered[i - 1], current = ordered[i];
    if (current.startDate < analysisStart) continue;
    let reason = null;
    if (previous.sign === 0 || current.sign === 0 || previous.sign === current.sign) reason = "not_opposite_nonzero_ma_directions";
    else if (previous.endIndex + 1 !== current.startIndex) reason = "not_adjacent";
    else if (previous.confirmedDate !== current.startDate) reason = "previous_not_confirmed_at_current_start";
    else if (!(Math.abs(previous.movePct) > 0)) reason = "zero_previous_amplitude";
    else if (Math.sign(previous.movePct) !== previous.sign) reason = "previous_actual_return_disagrees_with_ma_direction";
    if (reason) { excluded.push({ period: dataset.period, previousId: previous.id, currentId: current.id, reason }); continue; }
    const scale = Math.abs(previous.movePct);
    pairs.push({ period: dataset.period, pairId: `${previous.id}->${current.id}`, previousId: previous.id,
      currentId: current.id, direction: current.direction, sign: current.sign,
      previousStart: previous.startDate, previousAnchorDate: previous.anchorDate,
      previousAnchorClose: previous.anchorClose, previousEnd: previous.endDate,
      previousEndClose: previous.endClose, previousMovePct: previous.movePct, scalePct: scale,
      startIndex: current.startIndex, endIndex: current.endIndex, startDate: current.startDate,
      anchorDate: current.anchorDate, anchorClose: current.anchorClose, endDate: current.endDate,
      endClose: current.endClose, movePct: current.movePct, sessions: current.sessions,
      confirmedDate: current.confirmedDate, status: current.status,
      finalRatio: current.sign * current.movePct / scale,
      maxRatio: current.sign > 0 ? current.maxRisePct / scale : -current.maxFallPct / scale,
      pointRatio: current.sign * (current.endClose - current.anchorClose) / Math.abs(previous.endClose - previous.anchorClose) });
  }
  return { pairs, excluded };
}

export function summarizePairs(pairs) {
  return { n: pairs.length, directionAgreement: pairs.length ? pairs.filter((p) => p.finalRatio > 0).length / pairs.length : null,
    previousMedianPct: quantile(pairs.map((p) => p.scalePct), 0.5),
    nextMedianSignedPct: quantile(pairs.map((p) => p.movePct), 0.5),
    ratioQ20: quantile(pairs.map((p) => p.finalRatio), 0.2), ratioQ50: quantile(pairs.map((p) => p.finalRatio), 0.5),
    ratioQ80: quantile(pairs.map((p) => p.finalRatio), 0.8), ratioQ90: quantile(pairs.map((p) => p.finalRatio), 0.9),
    maximumRatioMedian: quantile(pairs.map((p) => p.maxRatio), 0.5),
    pointRatioMedian: quantile(pairs.map((p) => p.pointRatio), 0.5) };
}

export function fitRelativeCandidates(pairs, config) {
  return config.maPeriods.flatMap((period) => ["up", "down"].flatMap((direction) => {
    const training = pairs.filter((p) => p.period === period && p.direction === direction &&
      p.startDate >= config.analysisStart && p.confirmedDate && p.confirmedDate <= config.trainingEnd);
    const magnitudes = training.map((p) => p.maxRatio).filter((r) => r > 0);
    if (!magnitudes.length) throw new Error(`No relative training sample for MA${period}/${direction}`);
    return ["all", ...config.previousAmplitudeBins.map((b) => b.id)].flatMap((bucket) => {
      const local = bucket === "all" ? training : training.filter((p) => amplitudeBucket(p.scalePct, config.previousAmplitudeBins) === bucket);
      const positive = local.map((p) => p.maxRatio).filter((r) => r > 0);
      const fallback = bucket !== "all" && positive.length < config.minimumBucketTrainingPairs;
      const estimation = fallback ? magnitudes : positive;
      return config.ratioQuantiles.map((q) => ({ period, direction, bucket, quantileRank: q,
        ratio: quantile(estimation, q), trainingPairs: local.length, positivePeakPairs: positive.length,
        estimationPairs: estimation.length, fallbackToPooled: fallback }));
    });
  }));
}

export function relativeCrossings(bars, pairs, candidates, bins = []) {
  const result = [];
  for (const candidate of candidates) for (const pair of pairs) {
    if (pair.period !== candidate.period || pair.direction !== candidate.direction ||
      (candidate.bucket && candidate.bucket !== "all" && amplitudeBucket(pair.scalePct, bins) !== candidate.bucket)) continue;
    for (let i = pair.startIndex; i <= pair.endIndex; i++) {
      const move = change(pair.anchorClose, bars[i].close), ratio = pair.sign * move / pair.scalePct;
      if (ratio + 1e-12 < candidate.ratio) continue;
      const completed = pair.status === "completed";
      const remainingPct = completed ? pair.sign * change(bars[i].close, pair.endClose) : null;
      const tail = completed ? bars.slice(i + 1, pair.endIndex + 1).map((b) => pair.sign * change(bars[i].close, b.close)) : [];
      result.push({ ...candidate, pairId: pair.pairId, previousMovePct: pair.previousMovePct,
        anchorClose: pair.anchorClose, triggerIndex: i, triggerDate: bars[i].date, triggerClose: bars[i].close,
        triggerMovePct: move, observedRatio: ratio, pointRatio: pair.sign * (bars[i].close - pair.anchorClose) / Math.abs(pair.previousEndClose - pair.previousAnchorClose),
        pairStatus: pair.status, endDate: pair.endDate, confirmedDate: pair.confirmedDate,
        finalRatio: completed ? pair.finalRatio : null, remainingSessions: completed ? pair.endIndex - i : null,
        remainingPct, furtherMaxPct: completed ? Math.max(0, ...tail) : null,
        adverseMaxPct: completed ? Math.max(0, ...tail.map((v) => -v)) : null });
      break;
    }
  }
  return result.sort((a, b) => a.triggerIndex - b.triggerIndex || a.ratio - b.ratio);
}

export function summarizeRelativeCrossings(rows) {
  const mature = rows.filter((r) => r.pairStatus === "completed");
  const continued = mature.filter((r) => r.remainingPct > 0);
  const reversed = mature.filter((r) => r.remainingPct < 0);
  return { n: mature.length, unfinishedN: rows.length - mature.length,
    continuedProbability: mature.length ? continued.length / mature.length : null,
    reversedProbability: mature.length ? reversed.length / mature.length : null,
    zeroRemainingProbability: mature.length ? mature.filter((r) => r.remainingPct === 0).length / mature.length : null,
    endedOnTriggerN: mature.filter((r) => r.remainingSessions === 0).length,
    medianObservedRatio: quantile(mature.map((r) => r.observedRatio), 0.5),
    meanRemainingPct: mean(mature.map((r) => r.remainingPct)),
    meanContinuationWhenOccursPct: mean(continued.map((r) => r.remainingPct)),
    meanReversalWhenOccursPct: mean(reversed.map((r) => -r.remainingPct)),
    medianFurtherMaxPct: quantile(mature.map((r) => r.furtherMaxPct), 0.5),
    medianAdverseMaxPct: quantile(mature.map((r) => r.adverseMaxPct), 0.5),
    medianRemainingSessions: quantile(mature.map((r) => r.remainingSessions), 0.5) };
}

export function ratioPrice(previousAnchor, previousEnd, ratio, mode = "percentage") {
  if (![previousAnchor, previousEnd, ratio].every(Number.isFinite) || previousAnchor <= 0 || previousEnd <= 0 || ratio < 0 || previousAnchor === previousEnd) throw new Error("Invalid relative-price inputs");
  const direction = Math.sign(previousEnd - previousAnchor), magnitude = Math.abs(change(previousAnchor, previousEnd));
  if (!["points", "percentage"].includes(mode)) throw new Error("Unknown ratio convention");
  const result = mode === "points" ? previousEnd - direction * ratio * Math.abs(previousEnd - previousAnchor) : previousEnd * (1 - direction * ratio * magnitude / 100);
  if (result <= 0) throw new Error("Relative ratio implies a nonpositive price");
  return result;
}
