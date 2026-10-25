import { validateBars } from "./core.mjs";

export function parseSoxPayload(payload, config) {
  const series = payload.chart?.result?.[0], quote = series?.indicators?.quote?.[0];
  if (payload.chart?.error || series?.meta?.symbol !== config.symbol || series.meta.instrumentType !== "INDEX" ||
    series.meta.exchangeTimezoneName !== config.timeZone || !series.timestamp?.length || !quote) throw new Error("Unexpected or empty SOX index response");
  const bars = [], rejected = [];
  const format = new Intl.DateTimeFormat("sv-SE", { timeZone: config.timeZone });
  for (let i = 0; i < series.timestamp.length; i++) {
    const date = format.format(new Date(series.timestamp[i] * 1000));
    if (date < config.sourceStart || date > config.analysisEnd) continue;
    const values = [quote.open?.[i], quote.high?.[i], quote.low?.[i], quote.close?.[i]];
    if (!values.every((v) => typeof v === "number" && Number.isFinite(v) && v > 0)) { rejected.push(date); continue; }
    bars.push({ date, open: values[0], high: values[1], low: values[2], close: values[3] });
  }
  validateBars(bars, config.maximumBars);
  return { bars, rejected, identity: { symbol: series.meta.symbol, name: series.meta.longName ?? series.meta.shortName,
    instrumentType: series.meta.instrumentType, exchangeTimezoneName: series.meta.exchangeTimezoneName } };
}

export function mergeLockedBars(existing, incoming, maximum) {
  const map = new Map(existing.map((b) => [b.date, b])), revisions = [];
  for (const bar of incoming) {
    const old = map.get(bar.date);
    if (!old) map.set(bar.date, bar);
    else if (["open", "high", "low", "close"].some((k) => Math.abs(old[k] - bar[k]) > .000001)) revisions.push({ date: bar.date, accepted: old, observed: bar });
  }
  const bars = [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  validateBars(bars, maximum);
  return { bars, revisions };
}
