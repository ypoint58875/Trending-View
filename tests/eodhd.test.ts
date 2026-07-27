import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchEodhdDailySeries,
  parseEodhdDailyRows,
  searchEodhd,
} from "../lib/market/eodhd";
import type { MarketInstrument } from "../lib/market/types";

const instrument: MarketInstrument = {
  secid: "N225.INDX",
  code: "N225",
  name: "Nikkei 225",
  exchange: "JPX",
  assetType: "index",
  provider: "eodhd",
};

test("normalizes EODHD daily rows and applies one coherent adjustment mode", () => {
  const series = parseEodhdDailyRows(
    [
      {
        date: "2026-07-23",
        open: 100,
        high: 110,
        low: 95,
        close: 105,
        adjusted_close: 52.5,
        volume: 1_000,
      },
      {
        date: "2026-07-24",
        open: 106,
        high: 112,
        low: 102,
        close: 110,
        adjusted_close: 55,
        volume: 1_200,
      },
    ],
    instrument,
    new Date("2026-07-25T12:00:00Z"),
  );

  assert.equal(series.source, "eodhd");
  assert.equal(series.instrument.provider, "eodhd");
  assert.equal(series.priceAdjustment, "corporate-action-adjusted");
  assert.equal(series.bars[0].open, 50);
  assert.equal(series.bars[1].close, 55);
  assert.equal(series.bars[1].volume, 1_200);
});

test("keeps every EODHD row raw when one adjustment factor is missing", () => {
  const series = parseEodhdDailyRows(
    [
      {
        date: "2026-07-23",
        open: 100,
        high: 110,
        low: 95,
        close: 105,
        adjusted_close: 52.5,
      },
      {
        date: "2026-07-24",
        open: 106,
        high: 112,
        low: 102,
        close: 110,
      },
    ],
    instrument,
  );

  assert.equal(series.priceAdjustment, "raw");
  assert.equal(series.bars[0].open, 100);
  assert.equal(series.bars[1].close, 110);
});

test("searches only index and ETF instruments when a server token exists", async () => {
  const requests: URL[] = [];
  const results = await searchEodhd(
    "N225",
    async (input) => {
      requests.push(new URL(String(input)));
      return new Response(
        JSON.stringify([
          {
            Code: "N225",
            Exchange: "INDX",
            Name: "Nikkei 225",
            Type: "Index",
            Country: "Japan",
          },
          {
            Code: "AAPL",
            Exchange: "US",
            Name: "Apple Inc",
            Type: "Common Stock",
            Country: "USA",
          },
        ]),
        { status: 200 },
      );
    },
    "test-token",
  );

  assert.equal(requests.length, 1);
  assert.equal(requests[0].searchParams.get("api_token"), "test-token");
  assert.deepEqual(results, [instrument]);
});

test("does not call EODHD when the optional server token is absent", async () => {
  let called = false;
  const results = await searchEodhd(
    "N225",
    async () => {
      called = true;
      return new Response("[]", { status: 200 });
    },
    null,
  );

  assert.deepEqual(results, []);
  assert.equal(called, false);
});

test("retries a transient EODHD failure and returns a bounded daily series", async () => {
  let calls = 0;
  const series = await fetchEodhdDailySeries(
    instrument,
    2,
    async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(
          JSON.stringify({ code: 429, message: "rate limited" }),
          { status: 429 },
        );
      }
      return new Response(
        JSON.stringify([
          {
            date: "2026-07-22",
            open: 99,
            high: 102,
            low: 98,
            close: 101,
            adjusted_close: 101,
            volume: 900,
          },
          {
            date: "2026-07-23",
            open: 101,
            high: 104,
            low: 100,
            close: 103,
            adjusted_close: 103,
            volume: 1_000,
          },
          {
            date: "2026-07-24",
            open: 103,
            high: 106,
            low: 102,
            close: 105,
            adjusted_close: 105,
            volume: 1_100,
          },
        ]),
        { status: 200 },
      );
    },
    "no-store",
    "test-token",
  );

  assert.equal(calls, 2);
  assert.equal(series.bars.length, 2);
  assert.equal(series.previousClose, 101);
  assert.deepEqual(
    series.bars.map((bar) => bar.time),
    ["2026-07-23", "2026-07-24"],
  );
});
