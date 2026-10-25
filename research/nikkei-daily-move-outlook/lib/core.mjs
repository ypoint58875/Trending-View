export const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
export function quantile(xs, q) {
  if (!xs.length) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const p = (sorted.length - 1) * q;
  return sorted[Math.floor(p)] + (sorted[Math.ceil(p)] - sorted[Math.floor(p)]) * (p % 1);
}
export function stdev(xs) {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}
export const change = (a, b) => (b / a - 1) * 100;
export const bucket = (r, bounds) => bounds.findIndex((b) => r < b) === -1 ? bounds.length : bounds.findIndex((b) => r < b);

export function summarize(xs) {
  const up = xs.filter((r) => r > 0), down = xs.filter((r) => r < 0);
  return { n: xs.length, mean: mean(xs), median: quantile(xs, 0.5), upProbability: xs.length ? up.length / xs.length : null,
    flatProbability: xs.length ? xs.filter((r) => r === 0).length / xs.length : null,
    meanUp: mean(up), meanDown: mean(down), q10: quantile(xs, 0.1), q25: quantile(xs, 0.25),
    q75: quantile(xs, 0.75), q90: quantile(xs, 0.9), min: xs.length ? Math.min(...xs) : null,
    max: xs.length ? Math.max(...xs) : null, stdev: stdev(xs) };
}

export function validateBars(bars, maximum = 20000) {
  if (!bars.length || bars.length > maximum) throw new Error("Invalid or excessive bar count");
  let previous = "";
  for (const b of bars) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date) || b.date <= previous) throw new Error("Dates must be unique and strictly increasing");
    if (![b.open, b.high, b.low, b.close].every((v) => Number.isFinite(v) && v > 0)) throw new Error("Invalid OHLC value");
    if (b.high + 0.01 < Math.max(b.open, b.close) || b.low - 0.01 > Math.min(b.open, b.close) || b.high < b.low) throw new Error(`Invalid OHLC envelope: ${b.date}`);
    previous = b.date;
  }
  return bars;
}

export function features(bars, bounds) {
  let streak = 0, runningPeak = bars[0].close;
  return bars.map((b, i) => {
    const daily = i ? change(bars[i - 1].close, b.close) : null;
    const sma = (n, end = i) => end >= n - 1 ? mean(bars.slice(end - n + 1, end + 1).map((x) => x.close)) : null;
    const ma20 = sma(20), ma60 = sma(60), old20 = sma(20, i - 5);
    const regime = ma60 === null || old20 === null ? "unavailable" :
      b.close > ma20 && ma20 > ma60 && ma20 > old20 ? "up" :
      b.close < ma20 && ma20 < ma60 && ma20 < old20 ? "down" : "mixed";
    if (daily > 0) streak = streak > 0 ? streak + 1 : 1;
    else if (daily < 0) streak = streak < 0 ? streak - 1 : -1;
    else streak = 0;
    runningPeak = Math.max(runningPeak, b.close);
    const rs = i >= 20 ? bars.slice(i - 19, i + 1).map((v, k) => change(bars[i - 20 + k].close, v.close)) : [];
    return { date: b.date, close: b.close, daily, bucket: daily === null ? null : bucket(daily, bounds), regime,
      ma20, ma60, return5: i >= 5 ? change(bars[i - 5].close, b.close) : null,
      return20: i >= 20 ? change(bars[i - 20].close, b.close) : null,
      dailyVol20: stdev(rs), streak, drawdown: change(runningPeak, b.close),
      amplitude: i ? (b.high - b.low) / bars[i - 1].close * 100 : null,
      overnight: i ? change(bars[i - 1].close, b.open) : null, intraday: change(b.open, b.close) };
  });
}

export function forward(bars, i, h) {
  if (i < 0 || i + h >= bars.length) return null;
  const future = bars.slice(i + 1, i + h + 1), anchor = bars[i].close;
  return { terminal: change(anchor, future.at(-1).close),
    upside: Math.max(0, ...future.map((b) => change(anchor, b.high))),
    downside: Math.min(0, ...future.map((b) => change(anchor, b.low))),
    nextOpenReturn: change(future[0].open, future.at(-1).close) };
}

// Every candidate outcome must have finished by the forecast origin.
export function selectHistory(fs, origin, h, config) {
  const start = Math.max(60, origin - config.trainingSessions);
  const available = [];
  for (let j = start; j + h <= origin; j++) {
    if (fs[j].date >= config.analysisStart && fs[j].regime !== "unavailable") available.push(j);
  }
  const target = fs[origin];
  const exact = available.filter((j) => fs[j].regime === target.regime && fs[j].bucket === target.bucket);
  const trend = available.filter((j) => fs[j].regime === target.regime);
  if (exact.length >= config.minimumSamples) return { indices: exact, baseline: available, level: "regime_and_daily_bucket" };
  if (trend.length >= config.minimumSamples) return { indices: trend, baseline: available, level: "regime_only" };
  return { indices: available, baseline: available, level: "unconditional" };
}

export function outlook(bars, fs, origin, h, config) {
  const selected = selectHistory(fs, origin, h, config);
  const moves = selected.indices.map((j) => forward(bars, j, h));
  const stats = summarize(moves.map((m) => m.terminal));
  const baseline = summarize(selected.baseline.map((j) => forward(bars, j, h).terminal));
  return { horizon: h, level: selected.level, ...stats, baseline,
    meanUpside: mean(moves.map((m) => m.upside)), meanDownside: mean(moves.map((m) => m.downside)),
    q90Upside: quantile(moves.map((m) => m.upside), 0.9), q10Downside: quantile(moves.map((m) => m.downside), 0.1),
    probabilityAbove3: mean(moves.map((m) => Number(m.terminal >= 3))),
    probabilityBelowMinus3: mean(moves.map((m) => Number(m.terminal <= -3))),
    touchUp3: mean(moves.map((m) => Number(m.upside >= 3))),
    touchDown3: mean(moves.map((m) => Number(m.downside <= -3))),
    nextOpenMean: mean(moves.map((m) => m.nextOpenReturn)),
    historyStart: selected.baseline.length ? fs[selected.baseline[0]].date : null,
    historyEnd: selected.baseline.length ? fs[selected.baseline.at(-1)].date : null,
    priceQ10: stats.q10 === null ? null : bars[origin].close * (1 + stats.q10 / 100),
    priceQ50: stats.median === null ? null : bars[origin].close * (1 + stats.median / 100),
    priceQ90: stats.q90 === null ? null : bars[origin].close * (1 + stats.q90 / 100) };
}

export function evaluate(bars, fs, config) {
  const rows = [], predictions = [];
  for (const h of config.horizons) {
    const samples = [];
    let nextEligible = 0;
    for (let t = 60; t + h < bars.length; t++) {
      if (fs[t].date < config.evaluationStart || t < nextEligible) continue;
      const forecast = outlook(bars, fs, t, h, config);
      if (forecast.baseline.n < 252 || forecast.n < config.minimumSamples) continue;
      nextEligible = t + h;
      const actual = forward(bars, t, h).terminal, y = Number(actual > 0);
      samples.push({ date: fs[t].date, horizon: h, actual, predictedMean: forecast.mean,
        probability: forecast.upProbability, baselineProbability: forecast.baseline.upProbability,
        q10: forecast.q10, q90: forecast.q90, level: forecast.level, n: forecast.n,
        brier: (forecast.upProbability - y) ** 2,
        baselineBrier: (forecast.baseline.upProbability - y) ** 2,
        correct: Number((forecast.upProbability >= 0.5) === (actual > 0)),
        alwaysUpCorrect: y, absoluteError: Math.abs(actual - forecast.mean),
        zeroReturnError: Math.abs(actual), covered: Number(actual >= forecast.q10 && actual <= forecast.q90) });
    }
    predictions.push(...samples);
    rows.push({ horizon: h, n: samples.length, start: samples[0]?.date, end: samples.at(-1)?.date,
      brier: mean(samples.map((s) => s.brier)), baselineBrier: mean(samples.map((s) => s.baselineBrier)),
      accuracy: mean(samples.map((s) => s.correct)), alwaysUpAccuracy: mean(samples.map((s) => s.alwaysUpCorrect)),
      mae: mean(samples.map((s) => s.absoluteError)), zeroReturnMae: mean(samples.map((s) => s.zeroReturnError)),
      coverage80: mean(samples.map((s) => s.covered)),
      exactFraction: mean(samples.map((s) => Number(s.level === "regime_and_daily_bucket"))) });
  }
  return { rows, predictions };
}

export function runs(bars) {
  const result = [];
  let start = 0, sign = 0;
  for (let i = 1; i < bars.length; i++) {
    const next = Math.sign(bars[i].close - bars[i - 1].close);
    if (next !== sign) {
      if (sign) result.push({ direction: sign > 0 ? "up" : "down", start: bars[start].date,
        end: bars[i - 1].date, sessions: i - 1 - start, move: change(bars[start].close, bars[i - 1].close), confirmed: bars[i].date });
      start = i - 1; sign = next;
    }
  }
  return { completed: result, current: sign ? { direction: sign > 0 ? "up" : "down", start: bars[start].date,
    end: bars.at(-1).date, sessions: bars.length - 1 - start, move: change(bars[start].close, bars.at(-1).close) } : null };
}

// Close-based directional changes: pivot dates are retrospective, confirmation dates are observable.
export function waves(bars, thresholdPct) {
  const completed = [];
  let direction = 0, pivot = 0, extreme = 0, low = 0, high = 0;
  for (let i = 1; i < bars.length; i++) {
    if (!direction) {
      if (bars[i].close < bars[low].close) low = i;
      if (bars[i].close > bars[high].close) high = i;
      if (change(bars[low].close, bars[i].close) >= thresholdPct) { direction = 1; pivot = low; extreme = i; }
      else if (change(bars[high].close, bars[i].close) <= -thresholdPct) { direction = -1; pivot = high; extreme = i; }
      continue;
    }
    if ((direction === 1 && bars[i].close > bars[extreme].close) || (direction === -1 && bars[i].close < bars[extreme].close)) extreme = i;
    const reversal = change(bars[extreme].close, bars[i].close);
    if ((direction === 1 && reversal <= -thresholdPct) || (direction === -1 && reversal >= thresholdPct)) {
      completed.push({ thresholdPct, direction: direction === 1 ? "up" : "down", start: bars[pivot].date,
        end: bars[extreme].date, confirmed: bars[i].date, sessions: extreme - pivot,
        move: change(bars[pivot].close, bars[extreme].close), confirmationLag: i - extreme });
      pivot = extreme; extreme = i; direction *= -1;
    }
  }
  return { completed, current: direction ? { thresholdPct, direction: direction === 1 ? "up" : "down",
    start: bars[pivot].date, extremeDate: bars[extreme].date, end: bars.at(-1).date,
    moveToExtreme: change(bars[pivot].close, bars[extreme].close), moveToLatest: change(bars[pivot].close, bars.at(-1).close),
    retracement: change(bars[extreme].close, bars.at(-1).close), sessions: bars.length - 1 - pivot } : null };
}

export function csv(rows) {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  const cell = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  return `${keys.map(cell).join(",")}\n${rows.map((r) => keys.map((k) => cell(typeof r[k] === "object" ? JSON.stringify(r[k]) : r[k])).join(",")).join("\n")}\n`;
}
