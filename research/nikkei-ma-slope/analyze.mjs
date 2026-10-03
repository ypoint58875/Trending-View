#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  allTrueMask,
  benjaminiHochberg,
  bootstrapComparison,
  buildPredicateMask,
  dateIndexRange,
  enumerateCombinations,
  evaluateMask,
  executableReturns,
  htmlEscape,
  intersectMasks,
  mean,
  movingAverage,
  normalizedSlope,
  percentile,
  quantile,
  simulateBuyAndHold,
  simulateStrategy,
  summarizeReturns,
  toCsv,
} from "./lib/core.mjs";

const STUDY_DIR = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(STUDY_DIR, "config.json");
const COPY_PATH = path.join(STUDY_DIR, "report-copy.zh-CN.json");
const RAW_DIR = path.join(STUDY_DIR, "data", "raw");
const PROCESSED_DIR = path.join(STUDY_DIR, "data", "processed");
const STATE_DIR = path.join(STUDY_DIR, "data", "state");
const OUTPUT_DIR = path.join(STUDY_DIR, "output");
const RAW_CACHE_PATH = path.join(RAW_DIR, "yahoo-n225-chart.json");
const SOURCE_REGISTRY_PATH = path.join(STUDY_DIR, "data", "source_registry.jsonl");
const YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart/%5EN225";
const NIKKEI_CSV = "https://indexes.nikkei.co.jp/nkave/historical/nikkei_stock_average_daily_en.csv";

function printHelp() {
  console.log(`Nikkei 225 multi-moving-average slope study

Usage:
  node research/nikkei-ma-slope/analyze.mjs [--refresh]

Options:
  --refresh   Ignore a fresh local Yahoo raw-response cache.
  --help      Show this message.

The study writes only inside research/nikkei-ma-slope/.`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function atomicWrite(targetPath, contents) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  const temporary = `${targetPath}.${process.pid}.tmp`;
  await writeFile(temporary, contents, "utf8");
  try {
    await rename(temporary, targetPath);
  } catch (error) {
    if (error?.code !== "EEXIST" && error?.code !== "EPERM") throw error;
    await unlink(targetPath).catch(() => undefined);
    await rename(temporary, targetPath);
  }
}

function tokyoDate(timestampSeconds) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestampSeconds * 1000));
}

function isLikelyCompleteTokyoBar(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value ?? "";
  const today = `${get("year")}-${get("month")}-${get("day")}`;
  if (date < today) return true;
  if (date > today) return false;
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));
  return minutes >= 15 * 60 + 30;
}

async function fetchText(url, accept) {
  const response = await fetch(url, {
    headers: {
      Accept: accept,
      "User-Agent": "QuantScope-independent-Nikkei-research/1.0",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Request failed (${response.status}) for ${url}`);
  return response.text();
}

async function loadYahoo(config, refresh) {
  const now = Date.now();
  if (!refresh) {
    try {
      const cacheStat = await stat(RAW_CACHE_PATH);
      const ageHours = (now - cacheStat.mtimeMs) / 3_600_000;
      if (ageHours <= config.dataCacheTtlHours) {
        const cachedText = await readFile(RAW_CACHE_PATH, "utf8");
        const cached = JSON.parse(cachedText);
        return { ...cached, cacheHit: true, rawText: JSON.stringify(cached.payload) };
      }
    } catch {
      // A missing or invalid cache falls through to a fresh read.
    }
  }
  const period1 = Math.floor(Date.parse("1950-01-01T00:00:00Z") / 1000);
  const period2 = Math.floor(Date.now() / 1000) + 86_400;
  const url = `${YAHOO_BASE}?period1=${period1}&period2=${period2}&interval=1d&events=history&includeAdjustedClose=true`;
  const rawText = await fetchText(url, "application/json");
  const payload = JSON.parse(rawText);
  const cached = { fetchedAt: new Date().toISOString(), url, payload };
  await atomicWrite(RAW_CACHE_PATH, `${JSON.stringify(cached)}\n`);
  return { ...cached, cacheHit: false, rawText };
}

function parseYahoo(payload) {
  const result = payload?.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const adjusted = result?.indicators?.adjclose?.[0]?.adjclose ?? [];
  if (!result || !quote || !Array.isArray(result.timestamp)) {
    throw new Error(payload?.chart?.error?.description ?? "Yahoo returned no chart data");
  }
  const bars = [];
  let adjustedCloseMatches = 0;
  for (let index = 0; index < result.timestamp.length; index += 1) {
    const date = tokyoDate(result.timestamp[index]);
    const open = Number(quote.open?.[index]);
    const high = Number(quote.high?.[index]);
    const low = Number(quote.low?.[index]);
    const close = Number(quote.close?.[index]);
    const adjustedClose = Number(adjusted[index]);
    if (![open, high, low, close].every((value) => Number.isFinite(value) && value > 0)) continue;
    if (!isLikelyCompleteTokyoBar(date)) continue;
    if (Number.isFinite(adjustedClose) && Math.abs(adjustedClose / close - 1) < 1e-12) {
      adjustedCloseMatches += 1;
    }
    bars.push({ date, open, high, low, close });
  }
  bars.sort((left, right) => left.date.localeCompare(right.date));
  const unique = [];
  for (const bar of bars) {
    if (unique.at(-1)?.date === bar.date) unique[unique.length - 1] = bar;
    else unique.push(bar);
  }
  return {
    bars: unique,
    meta: result.meta,
    adjustedCloseMatches,
    adjustedCloseObserved: adjusted.filter(Number.isFinite).length,
  };
}

function parseOfficialCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines[0]?.trim() !== "Date of Data,Close,Open,High,Low") {
    throw new Error("Nikkei official CSV header changed");
  }
  return lines.slice(1).map((line) => {
    const fields = line.split(",").map((value) => value.trim().replace(/^"|"$/g, ""));
    const date = fields[0]?.replaceAll("/", "-");
    const close = Number(fields[1]?.replaceAll(",", ""));
    const open = Number(fields[2]?.replaceAll(",", ""));
    const high = Number(fields[3]?.replaceAll(",", ""));
    const low = Number(fields[4]?.replaceAll(",", ""));
    return { date, open, high, low, close };
  }).filter((bar) => /^\d{4}-\d{2}-\d{2}$/.test(bar.date) && [bar.open, bar.high, bar.low, bar.close].every((value) => Number.isFinite(value) && value > 0));
}

async function validateOfficial(yahooBars) {
  const accessedAt = new Date().toISOString();
  try {
    const text = await fetchText(NIKKEI_CSV, "text/csv,text/plain;q=0.9");
    const official = parseOfficialCsv(text);
    const yahooByDate = new Map(yahooBars.map((bar) => [bar.date, bar]));
    const errors = [];
    for (const bar of official) {
      const peer = yahooByDate.get(bar.date);
      if (peer) errors.push(Math.abs(peer.close / bar.close - 1) * 100);
    }
    return {
      status: "ok",
      accessedAt,
      returnedBars: official.length,
      firstDate: official[0]?.date ?? null,
      lastDate: official.at(-1)?.date ?? null,
      overlapDates: errors.length,
      meanAbsoluteCloseErrorPct: mean(errors),
      maxAbsoluteCloseErrorPct: Math.max(...errors),
      rawStored: false,
    };
  } catch (error) {
    return { status: "failed", accessedAt, error: String(error?.message ?? error), rawStored: false };
  }
}

function conditionText(feature) {
  return `${feature.type.toUpperCase()}(${feature.period}) slope ${feature.operator} ${feature.threshold.toFixed(5)}%/day`;
}

function ruleText(features) {
  return features.map(conditionText).join(" AND ");
}

function compactNumber(value, digits = 4) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function selectBestAtomicFeature(feature, slopes, bars, config, trainRange, trainBaseline) {
  const trainValues = slopes.slice(trainRange.start, trainRange.end).filter(Number.isFinite);
  const candidates = [];
  for (const probability of config.thresholdQuantiles) {
    const threshold = quantile(trainValues, probability);
    for (const operator of [">=", "<="]) {
      const mask = buildPredicateMask(slopes, operator, threshold);
      const evaluation = evaluateMask(mask, bars, trainRange, config.selectionHorizon, trainBaseline);
      if (evaluation.tradeSummary.count < config.minimumTrainTrades) continue;
      candidates.push({ probability, threshold, operator, mask, evaluation });
    }
  }
  candidates.sort((left, right) =>
    right.evaluation.balancedScore - left.evaluation.balancedScore ||
    right.evaluation.tradeSummary.upProbabilityLower95 - left.evaluation.tradeSummary.upProbabilityLower95 ||
    right.evaluation.tradeSummary.meanReturnPct - left.evaluation.tradeSummary.meanReturnPct,
  );
  const winner = candidates[0];
  if (!winner) throw new Error(`No viable threshold for ${feature.id}`);
  return { ...feature, slopes, ...winner };
}

function validationSearch(features, bars, config, validationRange) {
  const baselineMask = allTrueMask(validationRange.end - validationRange.start);
  const baselineSummary = evaluateMask(baselineMask, bars, validationRange, config.selectionHorizon).tradeSummary;
  const records = [];
  enumerateCombinations(features.length, config.maxCombinationDepth, (indexes) => {
    const mask = intersectMasks(indexes.map((index) => features[index].mask), validationRange.start, validationRange.end);
    const evaluation = evaluateMask(mask, bars, validationRange, config.selectionHorizon, baselineSummary);
    records.push({
      indexes,
      depth: indexes.length,
      ids: indexes.map((index) => features[index].id),
      rule: ruleText(indexes.map((index) => features[index])),
      eligible: evaluation.tradeSummary.count >= config.minimumValidationTrades,
      qualifyingDays: evaluation.eventSummary.count,
      tradeCount: evaluation.tradeSummary.count,
      upProbability: evaluation.tradeSummary.upProbability,
      upProbabilityLower95: evaluation.tradeSummary.upProbabilityLower95,
      meanReturnPct: evaluation.tradeSummary.meanReturnPct,
      medianReturnPct: evaluation.tradeSummary.medianReturnPct,
      probabilityLiftPp: evaluation.probabilityLiftPp,
      meanExcessReturnPct: evaluation.meanExcessReturnPct,
      balancedScore: evaluation.balancedScore,
    });
  });
  return { records, baselineSummary };
}

function chooseValidationCandidates(records, maxDepth) {
  const selected = [];
  const primary = [];
  for (let depth = 1; depth <= maxDepth; depth += 1) {
    const eligible = records.filter((record) => record.depth === depth && record.eligible);
    const choices = [
      {
        objective: "probability",
        row: [...eligible].sort((left, right) => right.upProbabilityLower95 - left.upProbabilityLower95 || right.meanReturnPct - left.meanReturnPct)[0],
      },
      {
        objective: "return",
        row: [...eligible].sort((left, right) => right.meanReturnPct - left.meanReturnPct || right.upProbability - left.upProbability)[0],
      },
      {
        objective: "balanced",
        row: [...eligible].sort((left, right) => right.balancedScore - left.balancedScore || right.upProbabilityLower95 - left.upProbabilityLower95)[0],
      },
    ].filter((choice) => choice.row);
    for (const choice of choices) {
      const key = choice.row.ids.join("|");
      selected.push({ ...choice.row, objective: choice.objective, validationRankKey: key });
    }
    const balanced = choices.find((choice) => choice.objective === "balanced")?.row;
    if (balanced) primary.push({ ...balanced, objective: "balanced", validationRankKey: balanced.ids.join("|") });
  }
  return { selected, primary };
}

function holdoutEvaluation(candidates, features, bars, config, holdoutRange) {
  const rows = [];
  const baselineByHorizon = new Map();
  for (const horizon of config.horizons) {
    const baseline = evaluateMask(allTrueMask(holdoutRange.end - holdoutRange.start), bars, holdoutRange, horizon);
    baselineByHorizon.set(horizon, baseline);
  }
  for (const candidate of candidates) {
    const selectedFeatures = candidate.indexes.map((index) => features[index]);
    const mask = intersectMasks(selectedFeatures.map((feature) => feature.mask), holdoutRange.start, holdoutRange.end);
    for (const horizon of config.horizons) {
      const baseline = baselineByHorizon.get(horizon);
      const evaluation = evaluateMask(mask, bars, holdoutRange, horizon, baseline.tradeSummary);
      const returns = evaluation.trades.map((trade) => trade.grossReturnPct);
      const baselineReturns = baseline.trades.map((trade) => trade.grossReturnPct);
      const bootstrap = bootstrapComparison(returns, baselineReturns, config.bootstrapSamples, config.bootstrapSeed + candidate.depth * 1_000 + horizon * 10 + candidate.objective.length);
      rows.push({
        candidateKey: `${candidate.depth}:${candidate.objective}:${candidate.validationRankKey}`,
        depth: candidate.depth,
        objective: candidate.objective,
        rule: candidate.rule,
        horizon,
        qualifyingDays: evaluation.eventSummary.count,
        eventUpProbability: evaluation.eventSummary.upProbability,
        eventMeanReturnPct: evaluation.eventSummary.meanReturnPct,
        tradeCount: evaluation.tradeSummary.count,
        upProbability: evaluation.tradeSummary.upProbability,
        upProbabilityLower95: evaluation.tradeSummary.upProbabilityLower95,
        upProbabilityUpper95: evaluation.tradeSummary.upProbabilityUpper95,
        meanReturnPct: evaluation.tradeSummary.meanReturnPct,
        medianReturnPct: evaluation.tradeSummary.medianReturnPct,
        meanPositivePct: evaluation.tradeSummary.meanPositivePct,
        meanNonPositivePct: evaluation.tradeSummary.meanNonPositivePct,
        p10ReturnPct: evaluation.tradeSummary.p10ReturnPct,
        p90ReturnPct: evaluation.tradeSummary.p90ReturnPct,
        probabilityLiftPp: evaluation.probabilityLiftPp,
        meanExcessReturnPct: evaluation.meanExcessReturnPct,
        baselineUpProbability: baseline.tradeSummary.upProbability,
        baselineMeanReturnPct: baseline.tradeSummary.meanReturnPct,
        ...bootstrap,
      });
    }
  }
  benjaminiHochberg(rows, "probabilityPValue", "probabilityFdrQValue");
  benjaminiHochberg(rows, "meanPValue", "meanFdrQValue");
  return { rows, baselineByHorizon };
}

function slopeBinGrid(features, bars, config, trainRange, holdoutRange) {
  const short = features.find((feature) => feature.id === "sma-3");
  const long = features.find((feature) => feature.id === "sma-10");
  const probabilities = [0, 0.2, 0.4, 0.6, 0.8, 1];
  const boundaries = (feature) => {
    const values = feature.slopes.slice(trainRange.start, trainRange.end).filter(Number.isFinite);
    return probabilities.map((probability) => probability === 0 ? Number.NEGATIVE_INFINITY : probability === 1 ? Number.POSITIVE_INFINITY : quantile(values, probability));
  };
  const shortBounds = boundaries(short);
  const longBounds = boundaries(long);
  const rows = [];
  for (let shortBin = 0; shortBin < 5; shortBin += 1) {
    for (let longBin = 0; longBin < 5; longBin += 1) {
      const fullMask = new Uint8Array(bars.length);
      for (let index = 0; index < bars.length; index += 1) {
        const shortValue = short.slopes[index];
        const longValue = long.slopes[index];
        if (shortValue === null || longValue === null) continue;
        fullMask[index] = Number(
          shortValue >= shortBounds[shortBin] && shortValue < shortBounds[shortBin + 1] &&
          longValue >= longBounds[longBin] && longValue < longBounds[longBin + 1],
        );
      }
      const localMask = fullMask.slice(holdoutRange.start, holdoutRange.end);
      for (const horizon of config.horizons) {
        const evaluation = evaluateMask(localMask, bars, holdoutRange, horizon);
        rows.push({
          shortBin: shortBin + 1,
          longBin: longBin + 1,
          sma3LowerPctPerDay: Number.isFinite(shortBounds[shortBin]) ? shortBounds[shortBin] : null,
          sma3UpperPctPerDay: Number.isFinite(shortBounds[shortBin + 1]) ? shortBounds[shortBin + 1] : null,
          sma10LowerPctPerDay: Number.isFinite(longBounds[longBin]) ? longBounds[longBin] : null,
          sma10UpperPctPerDay: Number.isFinite(longBounds[longBin + 1]) ? longBounds[longBin + 1] : null,
          horizon,
          qualifyingDays: evaluation.eventSummary.count,
          eventUpProbability: evaluation.eventSummary.upProbability,
          eventMeanReturnPct: evaluation.eventSummary.meanReturnPct,
          nonOverlappingTrades: evaluation.tradeSummary.count,
          tradeUpProbability: evaluation.tradeSummary.upProbability,
          tradeMeanReturnPct: evaluation.tradeSummary.meanReturnPct,
        });
      }
    }
  }
  return rows;
}

function subperiodRows(primary, features, bars, config) {
  const periods = [
    { label: "2016-2019", start: "2016-01-01", end: "2019-12-31" },
    { label: "2020-2022", start: "2020-01-01", end: "2022-12-31" },
    { label: "2023-latest", start: "2023-01-01", end: "9999-12-31" },
  ];
  const rows = [];
  for (const candidate of primary) {
    const selectedFeatures = candidate.indexes.map((index) => features[index]);
    const fullMask = intersectMasks(selectedFeatures.map((feature) => feature.mask), 0, bars.length);
    for (const period of periods) {
      const range = dateIndexRange(bars, period.start, period.end);
      const localMask = fullMask.slice(range.start, range.end);
      const baseline = evaluateMask(allTrueMask(range.end - range.start), bars, range, config.selectionHorizon);
      const evaluation = evaluateMask(localMask, bars, range, config.selectionHorizon, baseline.tradeSummary);
      rows.push({
        depth: candidate.depth,
        rule: candidate.rule,
        period: period.label,
        tradeCount: evaluation.tradeSummary.count,
        upProbability: evaluation.tradeSummary.upProbability,
        probabilityLiftPp: evaluation.probabilityLiftPp,
        meanReturnPct: evaluation.tradeSummary.meanReturnPct,
        meanExcessReturnPct: evaluation.meanExcessReturnPct,
      });
    }
  }
  return rows;
}

function strategyRows(primary, features, bars, config, holdoutRange) {
  const rows = [];
  for (const candidate of primary) {
    const mask = intersectMasks(candidate.indexes.map((index) => features[index].mask), holdoutRange.start, holdoutRange.end);
    for (const costBpsPerSide of config.costsBpsPerSide) {
      const simulation = simulateStrategy(mask, bars, holdoutRange, config.selectionHorizon, costBpsPerSide);
      const summary = summarizeReturns(simulation.trades.map((trade) => trade.netReturnPct));
      rows.push({
        depth: candidate.depth,
        rule: candidate.rule,
        horizon: config.selectionHorizon,
        costBpsPerSide,
        tradeCount: simulation.trades.length,
        winRate: summary.upProbability,
        averageTradePct: summary.meanReturnPct,
        totalReturnPct: simulation.totalReturnPct,
        cagrPct: simulation.cagrPct,
        maximumDrawdownPct: simulation.maximumDrawdownPct,
        sharpe: simulation.sharpe,
        exposurePct: simulation.exposurePct,
      });
    }
  }
  for (const costBpsPerSide of config.costsBpsPerSide) {
    const benchmark = simulateBuyAndHold(bars, holdoutRange, costBpsPerSide);
    rows.push({
      depth: 0,
      rule: "Nikkei 225 price-index buy and hold",
      horizon: null,
      costBpsPerSide,
      tradeCount: 1,
      winRate: Number.NaN,
      averageTradePct: benchmark.totalReturnPct,
      totalReturnPct: benchmark.totalReturnPct,
      cagrPct: benchmark.cagrPct,
      maximumDrawdownPct: benchmark.maximumDrawdownPct,
      sharpe: benchmark.sharpe,
      exposurePct: benchmark.exposurePct,
    });
  }
  return rows;
}

function fmtPercent(value, digits = 2) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : "—";
}

function fmtPctPoint(value, digits = 2) {
  return Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${value.toFixed(digits)}pp` : "—";
}

function fmtReturn(value, digits = 2) {
  return Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%` : "—";
}

function verdict(row, copy) {
  if (row.probabilityLiftLower95 > 0 && row.meanExcessLower95 > 0) return copy.positive;
  if (row.probabilityLiftUpper95 < 0 || row.meanExcessUpper95 < 0) return copy.negative;
  return copy.mixed;
}

function replaceTemplate(template, values) {
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), template);
}

function renderHeatmap(rows) {
  const target = rows.filter((row) => row.horizon === 20);
  const cells = target.map((row) => {
    const probability = row.eventUpProbability;
    const normalized = Number.isFinite(probability) ? Math.max(0, Math.min(1, (probability - 0.35) / 0.3)) : 0.5;
    const hue = 8 + normalized * 140;
    return `<div class="heat" style="--heat:${hue}" title="SMA3 bin ${row.shortBin}, SMA10 bin ${row.longBin}">
      <span>${fmtPercent(probability, 1)}</span><small>n=${row.qualifyingDays}</small>
    </div>`;
  }).join("");
  return `<div class="heatmap-label top">SMA(10) slope: low → high</div><div class="heatmap-wrap"><div class="heatmap-label side">SMA(3)<br>high<br>↑<br>low</div><div class="heatmap">${cells}</div></div>`;
}

function renderReport({ copy, bars, config, configHash, dataHash, officialValidation, combinationCount, primaryRows, strategyData, subperiodData, binRows, yahoo }) {
  const supported = primaryRows.filter((row) => row.probabilityLiftLower95 > 0 && row.meanExcessLower95 > 0).length;
  const headline = replaceTemplate(copy.headlineTemplate, { supported });
  const asOf = replaceTemplate(copy.asOfTemplate, { date: bars.at(-1).date });
  const reproduction = replaceTemplate(copy.reproductionTemplate, {
    configHash: configHash.slice(0, 12),
    dataHash: dataHash.slice(0, 12),
    combinationCount,
    bootstrapSamples: config.bootstrapSamples,
  });
  const primaryTable = primaryRows.map((row) => `<tr>
    <td><span class="depth">${row.depth}</span></td>
    <td class="rule">${htmlEscape(row.rule)}</td>
    <td>${row.tradeCount}</td>
    <td>${fmtPercent(row.upProbability)}</td>
    <td>${fmtPctPoint(row.probabilityLiftPp)}<small>[${fmtPctPoint(row.probabilityLiftLower95)}, ${fmtPctPoint(row.probabilityLiftUpper95)}]</small></td>
    <td>${fmtReturn(row.meanReturnPct)}</td>
    <td>${fmtReturn(row.medianReturnPct)}</td>
    <td>${fmtReturn(row.meanPositivePct)}</td>
    <td><span class="status ${verdict(row, copy) === copy.positive ? "good" : verdict(row, copy) === copy.negative ? "bad" : "mixed"}">${verdict(row, copy)}</span></td>
  </tr>`).join("");
  const chartBars = primaryRows.map((row) => {
    const width = Math.min(100, Math.abs(row.probabilityLiftPp) * 5);
    return `<div class="bar-row"><span>${row.depth} MA</span><div class="bar-track"><i class="${row.probabilityLiftPp >= 0 ? "positive" : "negative"}" style="width:${width}%"></i></div><strong>${fmtPctPoint(row.probabilityLiftPp)}</strong></div>`;
  }).join("");
  const strategyTable = strategyData.filter((row) => row.costBpsPerSide === 5).sort((left, right) => left.depth - right.depth).map((row) => `<tr><td>${row.depth === 0 ? "B&H" : row.depth}</td><td>${row.tradeCount}</td><td>${fmtPercent(row.winRate)}</td><td>${fmtReturn(row.averageTradePct)}</td><td>${fmtReturn(row.cagrPct)}</td><td>${fmtReturn(row.maximumDrawdownPct)}</td><td>${Number.isFinite(row.sharpe) ? row.sharpe.toFixed(2) : "—"}</td><td>${fmtReturn(row.exposurePct)}</td></tr>`).join("");
  const stabilityTable = subperiodData.map((row) => `<tr><td>${row.depth}</td><td>${row.period}</td><td>${row.tradeCount}</td><td>${fmtPercent(row.upProbability)}</td><td>${fmtPctPoint(row.probabilityLiftPp)}</td><td>${fmtReturn(row.meanReturnPct)}</td><td>${fmtReturn(row.meanExcessReturnPct)}</td></tr>`).join("");
  const list = (items) => items.map((item) => `<li>${htmlEscape(item)}</li>`).join("");
  const sourceStatus = officialValidation.status === "ok"
    ? `Official overlap: ${officialValidation.overlapDates} dates; mean absolute close error ${officialValidation.meanAbsoluteCloseErrorPct.toExponential(2)}%.`
    : `Official overlap check failed: ${htmlEscape(officialValidation.error)}`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:"><title>${htmlEscape(copy.title)}</title><style>
  :root{--ink:#17202a;--muted:#65727e;--paper:#f4f1ea;--card:#fffefa;--line:#d9d3c7;--navy:#173b57;--teal:#1d766f;--red:#a4443f;--amber:#997126}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 Inter,"Noto Sans SC","Microsoft YaHei",sans-serif}.page{max-width:1220px;margin:auto;padding:34px 24px 72px}.hero{padding:34px;border-radius:20px;background:linear-gradient(135deg,#102f46,#235b6b);color:white;box-shadow:0 18px 45px #173b5724}.eyebrow{letter-spacing:.12em;text-transform:uppercase;font-size:12px;color:#b7dae1}.hero h1{font-size:38px;line-height:1.15;margin:10px 0 8px}.hero p{max-width:850px;color:#e0edf0}.meta{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}.chip{padding:6px 10px;border:1px solid #ffffff36;border-radius:999px;background:#ffffff0e;font-size:12px}.grid{display:grid;grid-template-columns:1.5fr 1fr;gap:18px;margin-top:18px}.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:22px;box-shadow:0 8px 24px #3a30250b}.card h2{font-size:20px;margin:0 0 12px;color:var(--navy)}.lead{font-size:18px}.small,.card small{display:block;color:var(--muted);font-size:12px}.table-wrap{overflow:auto;border:1px solid var(--line);border-radius:12px}table{border-collapse:collapse;width:100%;min-width:850px;background:white}th,td{padding:11px 12px;border-bottom:1px solid #ebe7df;text-align:right;vertical-align:top}th{background:#f0eee8;color:#43515d;font-size:12px;text-transform:uppercase;position:sticky;top:0}th:nth-child(2),td.rule{text-align:left}.rule{font:12px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;min-width:320px}.depth{display:inline-flex;width:28px;height:28px;border-radius:50%;background:var(--navy);color:white;align-items:center;justify-content:center}.status{white-space:nowrap;font-size:12px;font-weight:700}.status.good{color:var(--teal)}.status.bad{color:var(--red)}.status.mixed{color:var(--amber)}.bar-row{display:grid;grid-template-columns:50px 1fr 72px;gap:10px;align-items:center;margin:10px 0}.bar-track{height:14px;background:#ece7dd;border-radius:7px;overflow:hidden}.bar-track i{display:block;height:100%;border-radius:7px}.bar-track .positive{background:var(--teal)}.bar-track .negative{background:var(--red)}.heatmap-wrap{display:flex;gap:10px;align-items:center}.heatmap{display:grid;grid-template-columns:repeat(5,1fr);direction:ltr;gap:6px;flex:1}.heat{aspect-ratio:1.25;border-radius:8px;background:hsl(var(--heat) 43% 52%);display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;text-shadow:0 1px 2px #0005}.heat span{font-size:16px;font-weight:800}.heat small{color:white}.heatmap-label{font-size:11px;color:var(--muted);text-align:center}.heatmap .heat:nth-child(-n+5){order:5}.heatmap .heat:nth-child(n+6):nth-child(-n+10){order:4}.heatmap .heat:nth-child(n+11):nth-child(-n+15){order:3}.heatmap .heat:nth-child(n+16):nth-child(-n+20){order:2}.heatmap .heat:nth-child(n+21){order:1}section{margin-top:18px}.two{display:grid;grid-template-columns:1fr 1fr;gap:18px}ul{padding-left:20px;margin-bottom:0}li{margin:7px 0}.source-links a{color:var(--teal)}footer{color:var(--muted);font-size:12px;margin-top:22px}@media(max-width:860px){.grid,.two{grid-template-columns:1fr}.hero h1{font-size:30px}.page{padding:18px 12px 48px}.hero{padding:24px}}
  </style></head><body><main class="page"><header class="hero"><div class="eyebrow">Independent quantitative research · N225</div><h1>${htmlEscape(copy.title)}</h1><p>${htmlEscape(copy.subtitle)}</p><div class="meta"><span class="chip">${bars[0].date} → ${bars.at(-1).date}</span><span class="chip">SMA / EMA / WMA</span><span class="chip">1–5 MA</span><span class="chip">Next-open causal execution</span></div></header>
  <section class="grid"><article class="card"><h2>${htmlEscape(copy.executive)}</h2><p class="lead">${htmlEscape(headline)}</p><p class="small">${htmlEscape(asOf)}</p></article><article class="card"><h2>20-day holdout probability lift</h2>${chartBars}</article></section>
  <section class="card"><h2>${htmlEscape(copy.primaryTable)}</h2><div class="table-wrap"><table><thead><tr><th>${copy.depth}</th><th>${copy.rule}</th><th>${copy.trades}</th><th>${copy.upProbability}</th><th>${copy.probabilityLift}</th><th>${copy.meanReturn}</th><th>${copy.medianReturn}</th><th>${copy.meanPositive}</th><th>${copy.verdict}</th></tr></thead><tbody>${primaryTable}</tbody></table></div></section>
  <section class="two"><article class="card"><h2>${htmlEscape(copy.heatmapTitle)}</h2>${renderHeatmap(binRows)}<p class="small">${htmlEscape(copy.heatmapNote)}</p></article><article class="card"><h2>${htmlEscape(copy.sources)}</h2><ul>${list(copy.sourceItems)}</ul><p class="small">${htmlEscape(sourceStatus)}</p></article></section>
  <section class="card"><h2>${htmlEscape(copy.strategy)}</h2><p>${htmlEscape(copy.strategyNote)}</p><div class="table-wrap"><table><thead><tr><th>${copy.depth}</th><th>${copy.trades}</th><th>${copy.upProbability}</th><th>Avg trade</th><th>CAGR</th><th>Max DD</th><th>Sharpe</th><th>Exposure</th></tr></thead><tbody>${strategyTable}</tbody></table></div><p class="small">Table uses 5 bps per side. Full 0/5/10 bps sensitivity is in strategy-cost-sensitivity.csv.</p></section>
  <section class="card"><h2>${htmlEscape(copy.stability)}</h2><p>${htmlEscape(copy.stabilityNote)}</p><div class="table-wrap"><table><thead><tr><th>${copy.depth}</th><th>Period</th><th>${copy.trades}</th><th>${copy.upProbability}</th><th>${copy.probabilityLift}</th><th>${copy.meanReturn}</th><th>Mean excess</th></tr></thead><tbody>${stabilityTable}</tbody></table></div></section>
  <section class="two"><article class="card"><h2>${htmlEscape(copy.methodology)}</h2><ul>${list(copy.methodItems)}</ul></article><article class="card"><h2>${htmlEscape(copy.caveats)}</h2><ul>${list(copy.caveatItems)}</ul></article></section>
  <section class="card source-links"><h2>${htmlEscape(copy.audit)}</h2><p>${htmlEscape(reproduction)}</p><p>Yahoo cache: ${yahoo.cacheHit ? "reused" : "refreshed"}; official audit: ${officialValidation.status}. Open the CSV and JSON companions for every rule, horizon, source parameter, and bootstrap diagnostic.</p><p><a href="https://indexes.nikkei.co.jp/nkave/data/index.en.html">Nikkei data provision and licensing</a> · <a href="https://indexes.nikkei.co.jp/en/nkave/index/profile?idx=nk225">Nikkei 225 official profile</a> · <a href="https://www.fmg.ac.uk/publications/discussion-papers/data-snooping-technical-trading-rule-performance-and-bootstrap">Technical-rule data-snooping research</a> · <a href="https://doi.org/10.1080/01621459.1994.10476870">Stationary bootstrap</a></p></section>
  <footer>Generated ${new Date().toISOString()} · Independent research only · Not investment advice</footer></main></body></html>`;
}

function normalizeNumericRows(rows) {
  return rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === "number" ? compactNumber(value, 8) : value])));
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    return;
  }
  const refresh = process.argv.includes("--refresh");
  const configText = await readFile(CONFIG_PATH, "utf8");
  const copyText = await readFile(COPY_PATH, "utf8");
  const config = JSON.parse(configText);
  const copy = JSON.parse(copyText);
  const configHash = sha256(configText);
  await Promise.all([RAW_DIR, PROCESSED_DIR, STATE_DIR, OUTPUT_DIR].map((directory) => mkdir(directory, { recursive: true })));

  console.log("[1/6] Loading and validating market data");
  const yahoo = await loadYahoo(config, refresh);
  const parsed = parseYahoo(yahoo.payload);
  const bars = parsed.bars.filter((bar) => bar.date >= config.eventStudyStart);
  if (bars.length < 10_000) throw new Error(`Expected long Nikkei history, received only ${bars.length} bars`);
  const dataHash = sha256(JSON.stringify(bars));
  const officialValidation = await validateOfficial(bars);
  const processedRows = bars.map((bar) => ({ date: bar.date, open: bar.open, high: bar.high, low: bar.low, close: bar.close }));
  await atomicWrite(path.join(PROCESSED_DIR, "nikkei225-normalized.csv"), toCsv(processedRows, ["date", "open", "high", "low", "close"]));

  const trainRange = dateIndexRange(bars, config.executableStart, config.trainEnd);
  const validationRange = dateIndexRange(bars, config.validationStart, config.validationEnd);
  const holdoutRange = dateIndexRange(bars, config.holdoutStart, "9999-12-31");
  const allTrueTrain = allTrueMask(trainRange.end - trainRange.start);
  const trainBaseline = evaluateMask(allTrueTrain, bars, trainRange, config.selectionHorizon).tradeSummary;

  console.log("[2/6] Fitting one threshold per moving average in training data");
  const closes = bars.map((bar) => bar.close);
  const features = [];
  for (const type of config.movingAverageTypes) {
    for (const period of config.periods) {
      const base = { id: `${type}-${period}`, type, period };
      const slopes = normalizedSlope(movingAverage(closes, type, period));
      features.push(selectBestAtomicFeature(base, slopes, bars, config, trainRange, trainBaseline));
    }
  }
  const atomicRows = features.map((feature) => ({
    id: feature.id,
    type: feature.type,
    period: feature.period,
    operator: feature.operator,
    thresholdPctPerDay: feature.threshold,
    trainingQuantile: feature.probability,
    trainTrades: feature.evaluation.tradeSummary.count,
    trainUpProbability: feature.evaluation.tradeSummary.upProbability,
    trainMeanReturnPct: feature.evaluation.tradeSummary.meanReturnPct,
    trainProbabilityLiftPp: feature.evaluation.probabilityLiftPp,
    trainMeanExcessReturnPct: feature.evaluation.meanExcessReturnPct,
  }));

  console.log("[3/6] Exhaustively searching one-through-five fixed-threshold combinations in validation data");
  const search = validationSearch(features, bars, config, validationRange);
  const { selected, primary } = chooseValidationCandidates(search.records, config.maxCombinationDepth);
  if (primary.length !== config.maxCombinationDepth) throw new Error("At least one combination depth had no viable validation candidate");

  console.log("[4/6] Evaluating fixed candidates in untouched holdout data");
  const holdout = holdoutEvaluation(selected, features, bars, config, holdoutRange);
  const primaryKeys = new Set(primary.map((candidate) => `${candidate.depth}:balanced:${candidate.validationRankKey}`));
  const primaryRows = holdout.rows
    .filter((row) => row.horizon === config.selectionHorizon && primaryKeys.has(row.candidateKey))
    .sort((left, right) => left.depth - right.depth);
  const binRows = slopeBinGrid(features, bars, config, trainRange, holdoutRange);
  const stability = subperiodRows(primary, features, bars, config);
  const strategies = strategyRows(primary, features, bars, config, holdoutRange);

  console.log("[5/6] Writing audit tables and report");
  const searchRows = search.records.map((record) => ({
    depth: record.depth,
    movingAverages: record.ids.join("|"),
    rule: record.rule,
    eligible: record.eligible,
    qualifyingDays: record.qualifyingDays,
    tradeCount: record.tradeCount,
    upProbability: record.upProbability,
    upProbabilityLower95: record.upProbabilityLower95,
    meanReturnPct: record.meanReturnPct,
    medianReturnPct: record.medianReturnPct,
    probabilityLiftPp: record.probabilityLiftPp,
    meanExcessReturnPct: record.meanExcessReturnPct,
    balancedScore: record.balancedScore,
  }));
  const primaryOutput = primaryRows.map((row) => ({ ...row, verdict: verdict(row, copy) }));
  const writes = [
    [path.join(OUTPUT_DIR, "atomic-thresholds.csv"), toCsv(normalizeNumericRows(atomicRows), Object.keys(atomicRows[0]))],
    [path.join(OUTPUT_DIR, "validation-combination-search.csv"), toCsv(normalizeNumericRows(searchRows), Object.keys(searchRows[0]))],
    [path.join(OUTPUT_DIR, "selected-holdout-all-horizons.csv"), toCsv(normalizeNumericRows(holdout.rows), Object.keys(holdout.rows[0]))],
    [path.join(OUTPUT_DIR, "primary-holdout.csv"), toCsv(normalizeNumericRows(primaryOutput), Object.keys(primaryOutput[0]))],
    [path.join(OUTPUT_DIR, "sma3-sma10-holdout-grid.csv"), toCsv(normalizeNumericRows(binRows), Object.keys(binRows[0]))],
    [path.join(OUTPUT_DIR, "strategy-cost-sensitivity.csv"), toCsv(normalizeNumericRows(strategies), Object.keys(strategies[0]))],
    [path.join(OUTPUT_DIR, "subperiod-stability.csv"), toCsv(normalizeNumericRows(stability), Object.keys(stability[0]))],
  ];
  for (const [target, contents] of writes) await atomicWrite(target, contents);

  const sourceRows = [
    {
      id: `yahoo-n225-daily-${yahoo.fetchedAt.slice(0, 10)}`,
      source_url: yahoo.url,
      accessed_at: yahoo.fetchedAt,
      parameters: { symbol: config.symbol, interval: "1d", period1: "1950-01-01", includeAdjustedClose: true },
      raw_path: "data/raw/yahoo-n225-chart.json (local, gitignored)",
      notes: `${bars.length} normalized complete OHLC rows; ${bars[0].date} through ${bars.at(-1).date}; SHA256 ${dataHash}; price index, not total return.`,
    },
    {
      id: `nikkei-official-overlap-${officialValidation.accessedAt.slice(0, 10)}`,
      source_url: NIKKEI_CSV,
      accessed_at: officialValidation.accessedAt,
      parameters: { purpose: "recent OHLC overlap validation", rawStored: false },
      notes: officialValidation.status === "ok"
        ? `${officialValidation.overlapDates} overlap dates; mean absolute close error ${officialValidation.meanAbsoluteCloseErrorPct}%; official response not stored due licensing restrictions.`
        : `Validation failed: ${officialValidation.error}`,
    },
  ];
  await atomicWrite(SOURCE_REGISTRY_PATH, `${sourceRows.map((row) => JSON.stringify(row)).join("\n")}\n`);
  const manifest = {
    study: "nikkei-225-multi-moving-average-slope",
    generatedAt: new Date().toISOString(),
    config,
    configHash,
    dataHash,
    data: {
      source: "Yahoo Chart ^N225",
      fetchedAt: yahoo.fetchedAt,
      cacheHit: yahoo.cacheHit,
      firstDate: bars[0].date,
      lastDate: bars.at(-1).date,
      barCount: bars.length,
      adjustedCloseMatches: parsed.adjustedCloseMatches,
      adjustedCloseObserved: parsed.adjustedCloseObserved,
      officialValidation,
    },
    splits: {
      train: { start: bars[trainRange.start].date, end: bars[trainRange.end - 1].date, bars: trainRange.end - trainRange.start },
      validation: { start: bars[validationRange.start].date, end: bars[validationRange.end - 1].date, bars: validationRange.end - validationRange.start },
      holdout: { start: bars[holdoutRange.start].date, end: bars[holdoutRange.end - 1].date, bars: holdoutRange.end - holdoutRange.start },
    },
    search: {
      featureCount: features.length,
      combinationCount: search.records.length,
      eligibleCombinationCount: search.records.filter((record) => record.eligible).length,
      selectedCandidateCount: selected.length,
      primaryCandidateCount: primary.length,
    },
    methodology: {
      slope: "(MA[t] / MA[t-1] - 1) * 100 percent per trading session",
      execution: "signal at close t; enter open t+1; exit close t+h; one non-overlapping position per rule",
      inference: "stationary bootstrap on non-overlapping trade returns with Benjamini-Hochberg exploratory correction",
      limitation: "price-index simulation; no dividend total return or directly tradable instrument",
    },
  };
  await atomicWrite(path.join(OUTPUT_DIR, "run-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const report = renderReport({
    copy,
    bars,
    config,
    configHash,
    dataHash,
    officialValidation,
    combinationCount: search.records.length,
    primaryRows,
    strategyData: strategies,
    subperiodData: stability,
    binRows,
    yahoo,
  });
  await atomicWrite(path.join(OUTPUT_DIR, "report.zh-CN.html"), report);

  console.log("[6/6] Complete");
  console.log(JSON.stringify({
    bars: bars.length,
    firstDate: bars[0].date,
    lastDate: bars.at(-1).date,
    combinations: search.records.length,
    eligibleCombinations: search.records.filter((record) => record.eligible).length,
    primaryRules: primaryRows.map((row) => ({ depth: row.depth, trades: row.tradeCount, upProbability: compactNumber(row.upProbability), probabilityLiftPp: compactNumber(row.probabilityLiftPp), meanReturnPct: compactNumber(row.meanReturnPct), verdict: verdict(row, copy) })),
    report: path.join(OUTPUT_DIR, "report.zh-CN.html"),
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
