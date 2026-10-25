import assert from "node:assert/strict";
import test from "node:test";
import { mergeNikkeiMissingBars, nikkeiNeedsMissingBarProbe, supplementNikkeiMissingBars } from "../lib/market/nikkei-freshness";
import type { MarketSeries } from "../lib/market/types";
import { mergeCanonicalMarketSeries } from "../lib/market/series";
import { resolveCanonicalMarketProfile } from "../lib/market/canonical";

const saturday = new Date("2026-10-24T01:00:00Z");
function series(dates: string[], source: "yahoo" | "nikkei" = "yahoo"): MarketSeries {
  return {
    instrument: { secid: source === "yahoo" ? "^N225" : "N225", code: "N225", name: "Nikkei 225", provider: source, exchange: "JPX", assetType: "index" },
    source, interval: "1d", priceAdjustment: source === "yahoo" ? "corporate-action-adjusted" : "raw",
    previousClose: 100, fetchedAt: "2026-10-24T00:00:00Z", latestBarStatus: "complete",
    bars: dates.map((time) => ({ time, timestamp: Date.parse(`${time}T00:00:00Z`),
      open: 100, close: 101, high: 102, low: 99, volume: source === "yahoo" ? 1000 : 0,
      amount: 0, amplitude: 0, changePercent: 1, change: 1, turnoverRate: 0,
    })),
  };
}

test("supplements missing Nikkei dates without switching primary, changing existing bars, or duplicating fills", () => {
  const primary = series(["2026-10-20", "2026-10-22"]);
  const official = series(["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"], "nikkei");
  const repaired = mergeNikkeiMissingBars(primary, official, saturday);
  assert.equal(repaired.source, "yahoo");
  assert.equal(repaired.instrument, primary.instrument);
  assert.equal(repaired.priceAdjustment, primary.priceAdjustment);
  assert.deepEqual(repaired.bars.map((bar) => bar.time), official.bars.map((bar) => bar.time));
  for (const bar of primary.bars) assert.equal(repaired.bars.find((item) => item.time === bar.time), bar);
  assert.deepEqual(repaired.bars.at(-1)!.ohlcSource, { provider: "nikkei", fetchedAt: official.fetchedAt });
  assert.equal(mergeNikkeiMissingBars(repaired, official, saturday), repaired);
});

test("requires matching OHLC overlap and Nikkei identity before supplementing", () => {
  const primary = series(["2026-10-21", "2026-10-22"]);
  const official = series(["2026-10-21", "2026-10-22", "2026-10-23"], "nikkei");
  const wrongScale = { ...official, bars: official.bars.map((bar) => ({
    ...bar, open: bar.open * 2, high: bar.high * 2, low: bar.low * 2, close: bar.close * 2,
  })) };
  assert.equal(mergeNikkeiMissingBars(primary, wrongScale, saturday), primary);
  const mismatch = { ...official, instrument: { ...official.instrument, code: "SOX", secid: "SOX" } };
  assert.equal(mergeNikkeiMissingBars(primary, mismatch, saturday), primary);
  assert.equal(mergeNikkeiMissingBars(primary, { ...official, source: "yahoo" }, saturday), primary);
  assert.equal(mergeNikkeiMissingBars(primary, { ...official, bars: official.bars.slice(1) }, saturday), primary);
});

test("weekdays only trigger probes; holidays, weekends and unfinished bars are never fabricated", async () => {
  const primary = series(["2026-10-21", "2026-10-22"]);
  assert.equal(nikkeiNeedsMissingBarProbe(primary, new Date("2026-10-23T06:29:59Z")), false);
  assert.equal(nikkeiNeedsMissingBarProbe(primary, new Date("2026-10-23T06:30:00Z")), true);
  const official = series(["2026-10-21", "2026-10-22", "2026-10-23"], "nikkei");
  assert.equal(mergeNikkeiMissingBars(primary, official, new Date("2026-10-23T06:29:59Z")), primary);
  assert.equal(mergeNikkeiMissingBars(primary, { ...official, latestBarStatus: "unknown" }, new Date("2026-10-23T06:31:00Z")), primary);
  const repaired = mergeNikkeiMissingBars(primary, official, saturday);
  assert.equal(nikkeiNeedsMissingBarProbe(repaired, saturday), false);
  let probes = 0;
  assert.equal(await supplementNikkeiMissingBars(repaired, async () => { probes += 1; return official; }, saturday), repaired);
  assert.equal(probes, 0);
  const holiday = series(["2026-10-09", "2026-10-13"]);
  assert.equal(nikkeiNeedsMissingBarProbe(holiday, new Date("2026-10-13T07:00:00Z")), true);
  assert.equal(mergeNikkeiMissingBars(holiday, { ...holiday, source: "nikkei" }, new Date("2026-10-13T07:00:00Z")), holiday);
});

test("recent internal gaps are probed and current-day existing prices remain locked", () => {
  const primary = series(["2026-10-20", "2026-10-22", "2026-10-23"]);
  assert.equal(nikkeiNeedsMissingBarProbe(primary, saturday), true);
  const official = series(["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"], "nikkei");
  official.bars.at(-1)!.close += 0.0001;
  const repaired = mergeNikkeiMissingBars(primary, official, saturday);
  assert.equal(repaired.bars.at(-1), primary.bars.at(-1));
  assert.equal(repaired.bars.length, 4);
  assert.equal(nikkeiNeedsMissingBarProbe(repaired, saturday), false);
});

test("supplement errors retain primary data while cancellation propagates", async () => {
  const primary = series(["2026-10-21", "2026-10-22"]);
  assert.equal(await supplementNikkeiMissingBars(primary, async () => { throw new Error("Network unavailable"); }, saturday), primary);
  await assert.rejects(() => supplementNikkeiMissingBars(primary, async () => {
    throw new DOMException("Cancelled", "AbortError");
  }, saturday), { name: "AbortError" });
});

test("primary catch-up enriches volume while retaining locked official OHLC and provenance", () => {
  const primary = series(["2026-10-21", "2026-10-22"]);
  const official = series(["2026-10-21", "2026-10-22", "2026-10-23"], "nikkei");
  const repaired = mergeNikkeiMissingBars(primary, official, saturday);
  const caughtUp = series(["2026-10-21", "2026-10-22", "2026-10-23"]);
  caughtUp.bars.at(-1)!.close += 0.0001;
  const merged = mergeCanonicalMarketSeries(repaired, caughtUp, 10_000, resolveCanonicalMarketProfile(primary.instrument));
  assert.equal(merged.source, "yahoo");
  assert.equal(merged.bars.length, 3);
  assert.equal(merged.bars.at(-1)!.close, 101);
  assert.equal(merged.bars.at(-1)!.volume, 1000);
  assert.deepEqual(merged.bars.at(-1)!.ohlcSource, repaired.bars.at(-1)!.ohlcSource);
  assert.deepEqual(JSON.parse(JSON.stringify(merged)).bars.at(-1).ohlcSource, repaired.bars.at(-1)!.ohlcSource);
});
