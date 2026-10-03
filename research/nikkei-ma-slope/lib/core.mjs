export function sma(values, period) {
  const output = new Array(values.length).fill(null);
  if (!Number.isInteger(period) || period <= 0) return output;
  let sum = 0;
  for (let index = 0; index < values.length; index += 1) {
    sum += values[index];
    if (index >= period) sum -= values[index - period];
    if (index >= period - 1) output[index] = sum / period;
  }
  return output;
}

export function ema(values, period) {
  const output = new Array(values.length).fill(null);
  if (!Number.isInteger(period) || period <= 0 || values.length < period) {
    return output;
  }
  const seed = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  const multiplier = 2 / (period + 1);
  output[period - 1] = seed;
  let previous = seed;
  for (let index = period; index < values.length; index += 1) {
    previous = (values[index] - previous) * multiplier + previous;
    output[index] = previous;
  }
  return output;
}

export function wma(values, period) {
  const output = new Array(values.length).fill(null);
  if (!Number.isInteger(period) || period <= 0) return output;
  const denominator = (period * (period + 1)) / 2;
  for (let index = period - 1; index < values.length; index += 1) {
    let weighted = 0;
    for (let offset = 0; offset < period; offset += 1) {
      weighted += values[index - period + 1 + offset] * (offset + 1);
    }
    output[index] = weighted / denominator;
  }
  return output;
}

export function movingAverage(values, type, period) {
  if (type === "sma") return sma(values, period);
  if (type === "ema") return ema(values, period);
  if (type === "wma") return wma(values, period);
  throw new Error(`Unsupported moving-average type: ${type}`);
}

export function normalizedSlope(values) {
  return values.map((value, index) => {
    const previous = index > 0 ? values[index - 1] : null;
    if (value === null || previous === null || previous === 0) return null;
    return (value / previous - 1) * 100;
  });
}

export function quantile(values, probability) {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function percentile(values, probability) {
  return quantile(values.filter(Number.isFinite), probability);
}

export function mean(values) {
  return values.length === 0
    ? Number.NaN
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function median(values) {
  return quantile(values, 0.5);
}

export function standardDeviation(values) {
  if (values.length < 2) return Number.NaN;
  const average = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function buildPredicateMask(slopes, operator, threshold) {
  const mask = new Uint8Array(slopes.length);
  for (let index = 0; index < slopes.length; index += 1) {
    const value = slopes[index];
    if (value === null || !Number.isFinite(value)) continue;
    mask[index] = operator === ">=" ? Number(value >= threshold) : Number(value <= threshold);
  }
  return mask;
}

export function intersectMasks(masks, start = 0, end = masks[0]?.length ?? 0) {
  const length = Math.max(0, end - start);
  const output = new Uint8Array(length);
  output.fill(1);
  for (const mask of masks) {
    for (let offset = 0; offset < length; offset += 1) {
      output[offset] &= mask[start + offset] ?? 0;
    }
  }
  return output;
}

export function dateIndexRange(bars, startDate, endDate) {
  let start = bars.findIndex((bar) => bar.date >= startDate);
  if (start < 0) start = bars.length;
  let end = bars.findIndex((bar, index) => index >= start && bar.date > endDate);
  if (end < 0) end = bars.length;
  return { start, end };
}

export function executableReturns(mask, bars, range, horizon, costBpsPerSide = 0) {
  const trades = [];
  let nextAvailableEntry = range.start + 1;
  const lastSignal = Math.min(range.end - horizon, bars.length - horizon - 1);
  for (let signalIndex = range.start; signalIndex <= lastSignal; signalIndex += 1) {
    const localIndex = mask.length === bars.length ? signalIndex : signalIndex - range.start;
    if (!mask[localIndex]) continue;
    const entryIndex = signalIndex + 1;
    if (entryIndex < nextAvailableEntry) continue;
    const exitIndex = signalIndex + horizon;
    const entry = bars[entryIndex].open;
    const exit = bars[exitIndex].close;
    if (!(entry > 0) || !(exit > 0)) continue;
    const oneSideCost = costBpsPerSide / 10_000;
    const grossDecimal = exit / entry - 1;
    const netDecimal = (exit / entry) * (1 - oneSideCost) ** 2 - 1;
    let favorable = Number.NEGATIVE_INFINITY;
    let adverse = Number.POSITIVE_INFINITY;
    for (let index = entryIndex; index <= exitIndex; index += 1) {
      favorable = Math.max(favorable, bars[index].high / entry - 1);
      adverse = Math.min(adverse, bars[index].low / entry - 1);
    }
    trades.push({
      signalIndex,
      entryIndex,
      exitIndex,
      signalDate: bars[signalIndex].date,
      entryDate: bars[entryIndex].date,
      exitDate: bars[exitIndex].date,
      grossReturnPct: grossDecimal * 100,
      netReturnPct: netDecimal * 100,
      favorableExcursionPct: favorable * 100,
      adverseExcursionPct: adverse * 100,
    });
    nextAvailableEntry = exitIndex + 1;
  }
  return trades;
}

export function overlappingEventReturns(mask, bars, range, horizon) {
  const returns = [];
  const lastSignal = Math.min(range.end - horizon, bars.length - horizon - 1);
  for (let signalIndex = range.start; signalIndex <= lastSignal; signalIndex += 1) {
    const localIndex = mask.length === bars.length ? signalIndex : signalIndex - range.start;
    if (!mask[localIndex]) continue;
    const entry = bars[signalIndex + 1].open;
    const exit = bars[signalIndex + horizon].close;
    if (entry > 0 && exit > 0) returns.push((exit / entry - 1) * 100);
  }
  return returns;
}

export function wilsonInterval(successes, count, z = 1.96) {
  if (count === 0) return { lower: Number.NaN, upper: Number.NaN };
  const proportion = successes / count;
  const denominator = 1 + (z ** 2) / count;
  const center = (proportion + (z ** 2) / (2 * count)) / denominator;
  const half = (z / denominator) * Math.sqrt((proportion * (1 - proportion)) / count + (z ** 2) / (4 * count ** 2));
  return { lower: center - half, upper: center + half };
}

export function summarizeReturns(values) {
  const finite = values.filter(Number.isFinite);
  const successes = finite.filter((value) => value > 0).length;
  const positive = finite.filter((value) => value > 0);
  const negative = finite.filter((value) => value <= 0);
  const interval = wilsonInterval(successes, finite.length);
  return {
    count: finite.length,
    successes,
    upProbability: finite.length ? successes / finite.length : Number.NaN,
    upProbabilityLower95: interval.lower,
    upProbabilityUpper95: interval.upper,
    meanReturnPct: mean(finite),
    medianReturnPct: median(finite),
    meanPositivePct: mean(positive),
    meanNonPositivePct: mean(negative),
    p10ReturnPct: percentile(finite, 0.1),
    p90ReturnPct: percentile(finite, 0.9),
  };
}

export function evaluateMask(mask, bars, range, horizon, baselineSummary = null) {
  const trades = executableReturns(mask, bars, range, horizon);
  const eventReturns = overlappingEventReturns(mask, bars, range, horizon);
  const tradeSummary = summarizeReturns(trades.map((trade) => trade.grossReturnPct));
  const eventSummary = summarizeReturns(eventReturns);
  const probabilityLift = baselineSummary
    ? (tradeSummary.upProbability - baselineSummary.upProbability) * 100
    : Number.NaN;
  const meanExcess = baselineSummary
    ? tradeSummary.meanReturnPct - baselineSummary.meanReturnPct
    : Number.NaN;
  return {
    trades,
    tradeSummary,
    eventSummary,
    probabilityLiftPp: probabilityLift,
    meanExcessReturnPct: meanExcess,
    balancedScore: probabilityLift + 2 * meanExcess,
  };
}

export function allTrueMask(length) {
  const mask = new Uint8Array(length);
  mask.fill(1);
  return mask;
}

export function enumerateCombinations(itemCount, maxDepth, visitor) {
  const chosen = [];
  function walk(start, targetDepth) {
    if (chosen.length === targetDepth) {
      visitor([...chosen]);
      return;
    }
    const needed = targetDepth - chosen.length;
    for (let index = start; index <= itemCount - needed; index += 1) {
      chosen.push(index);
      walk(index + 1, targetDepth);
      chosen.pop();
    }
  }
  for (let depth = 1; depth <= maxDepth; depth += 1) walk(0, depth);
}

export function createPrng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function stationaryBootstrap(values, samples, seed, averageBlockLength) {
  if (values.length === 0) return [];
  const random = createPrng(seed);
  const output = [];
  const restartProbability = 1 / Math.max(1, averageBlockLength);
  for (let sample = 0; sample < samples; sample += 1) {
    const resampled = new Array(values.length);
    let index = Math.floor(random() * values.length);
    for (let position = 0; position < values.length; position += 1) {
      if (position === 0 || random() < restartProbability) {
        index = Math.floor(random() * values.length);
      } else {
        index = (index + 1) % values.length;
      }
      resampled[position] = values[index];
    }
    output.push(resampled);
  }
  return output;
}

export function bootstrapComparison(candidate, baseline, samples, seed) {
  if (candidate.length < 2 || baseline.length < 2) {
    return {
      probabilityLiftLower95: Number.NaN,
      probabilityLiftUpper95: Number.NaN,
      meanExcessLower95: Number.NaN,
      meanExcessUpper95: Number.NaN,
      probabilityPValue: Number.NaN,
      meanPValue: Number.NaN,
    };
  }
  const candidateBlocks = stationaryBootstrap(candidate, samples, seed, Math.max(2, Math.round(Math.sqrt(candidate.length))));
  const baselineBlocks = stationaryBootstrap(baseline, samples, seed ^ 0x9e3779b9, Math.max(2, Math.round(Math.sqrt(baseline.length))));
  const probabilityLifts = [];
  const meanExcesses = [];
  for (let index = 0; index < samples; index += 1) {
    const candidateSummary = summarizeReturns(candidateBlocks[index]);
    const baselineSummary = summarizeReturns(baselineBlocks[index]);
    probabilityLifts.push((candidateSummary.upProbability - baselineSummary.upProbability) * 100);
    meanExcesses.push(candidateSummary.meanReturnPct - baselineSummary.meanReturnPct);
  }
  return {
    probabilityLiftLower95: percentile(probabilityLifts, 0.025),
    probabilityLiftUpper95: percentile(probabilityLifts, 0.975),
    meanExcessLower95: percentile(meanExcesses, 0.025),
    meanExcessUpper95: percentile(meanExcesses, 0.975),
    probabilityPValue: (probabilityLifts.filter((value) => value <= 0).length + 1) / (samples + 1),
    meanPValue: (meanExcesses.filter((value) => value <= 0).length + 1) / (samples + 1),
  };
}

export function benjaminiHochberg(rows, valueKey, outputKey) {
  const eligible = rows
    .map((row, index) => ({ index, value: row[valueKey] }))
    .filter((item) => Number.isFinite(item.value))
    .sort((left, right) => left.value - right.value);
  let running = 1;
  for (let rank = eligible.length - 1; rank >= 0; rank -= 1) {
    const adjusted = Math.min(1, (eligible[rank].value * eligible.length) / (rank + 1));
    running = Math.min(running, adjusted);
    rows[eligible[rank].index][outputKey] = running;
  }
  return rows;
}

export function simulateStrategy(mask, bars, range, horizon, costBpsPerSide) {
  const trades = executableReturns(mask, bars, range, horizon, costBpsPerSide);
  const byEntry = new Map(trades.map((trade) => [trade.entryIndex, trade]));
  const byExit = new Map(trades.map((trade) => [trade.exitIndex, trade]));
  const equity = [];
  let capital = 1;
  let active = null;
  let entryCapital = 1;
  let exposureDays = 0;
  const cost = costBpsPerSide / 10_000;
  for (let index = range.start; index < range.end; index += 1) {
    if (byEntry.has(index)) {
      active = byEntry.get(index);
      entryCapital = capital * (1 - cost);
    }
    let marked = capital;
    if (active) {
      exposureDays += 1;
      marked = entryCapital * (bars[index].close / bars[active.entryIndex].open);
      if (byExit.has(index)) {
        capital = marked * (1 - cost);
        marked = capital;
        active = null;
      }
    }
    equity.push({ date: bars[index].date, value: marked });
  }
  const dailyReturns = [];
  let peak = equity[0]?.value ?? 1;
  let maximumDrawdown = 0;
  for (let index = 1; index < equity.length; index += 1) {
    dailyReturns.push(equity[index].value / equity[index - 1].value - 1);
    peak = Math.max(peak, equity[index].value);
    maximumDrawdown = Math.min(maximumDrawdown, equity[index].value / peak - 1);
  }
  const years = Math.max(1 / 365.25, (Date.parse(bars[range.end - 1].date) - Date.parse(bars[range.start].date)) / (365.25 * 86_400_000));
  const dailyVolatility = standardDeviation(dailyReturns);
  const sharpe = Number.isFinite(dailyVolatility) && dailyVolatility > 0
    ? (mean(dailyReturns) / dailyVolatility) * Math.sqrt(252)
    : Number.NaN;
  return {
    trades,
    equity,
    totalReturnPct: ((equity.at(-1)?.value ?? 1) - 1) * 100,
    cagrPct: ((equity.at(-1)?.value ?? 1) ** (1 / years) - 1) * 100,
    maximumDrawdownPct: maximumDrawdown * 100,
    sharpe,
    exposurePct: equity.length ? (exposureDays / equity.length) * 100 : Number.NaN,
  };
}

export function simulateBuyAndHold(bars, range, costBpsPerSide) {
  if (range.end - range.start < 2) {
    return {
      totalReturnPct: Number.NaN,
      cagrPct: Number.NaN,
      maximumDrawdownPct: Number.NaN,
      sharpe: Number.NaN,
      exposurePct: Number.NaN,
    };
  }
  const cost = costBpsPerSide / 10_000;
  const entry = bars[range.start].open;
  const equity = [];
  for (let index = range.start; index < range.end; index += 1) {
    let value = (1 - cost) * (bars[index].close / entry);
    if (index === range.end - 1) value *= 1 - cost;
    equity.push({ date: bars[index].date, value });
  }
  const dailyReturns = [];
  let peak = equity[0].value;
  let maximumDrawdown = 0;
  for (let index = 1; index < equity.length; index += 1) {
    dailyReturns.push(equity[index].value / equity[index - 1].value - 1);
    peak = Math.max(peak, equity[index].value);
    maximumDrawdown = Math.min(maximumDrawdown, equity[index].value / peak - 1);
  }
  const years = Math.max(1 / 365.25, (Date.parse(bars[range.end - 1].date) - Date.parse(bars[range.start].date)) / (365.25 * 86_400_000));
  const dailyVolatility = standardDeviation(dailyReturns);
  return {
    totalReturnPct: (equity.at(-1).value - 1) * 100,
    cagrPct: (equity.at(-1).value ** (1 / years) - 1) * 100,
    maximumDrawdownPct: maximumDrawdown * 100,
    sharpe: Number.isFinite(dailyVolatility) && dailyVolatility > 0
      ? (mean(dailyReturns) / dailyVolatility) * Math.sqrt(252)
      : Number.NaN,
    exposurePct: 100,
  };
}

export function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(rows, columns) {
  const header = columns.map((column) => csvEscape(column)).join(",");
  const body = rows.map((row) => columns.map((column) => csvEscape(row[column])).join(","));
  return `${[header, ...body].join("\n")}\n`;
}

export function htmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
