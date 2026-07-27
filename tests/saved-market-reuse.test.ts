import assert from "node:assert/strict";
import test from "node:test";
import { canReuseSavedBacktestMarketSeries } from "../lib/analysis/saved-backtests";
import type {
  MarketInstrument,
  MarketSeries,
} from "../lib/market/types";

const eastmoneyNikkei: MarketInstrument = {
  secid: "100.N225",
  code: "N225",
  name: "Nikkei 225",
  exchange: "JPX",
  assetType: "index",
  provider: "eastmoney",
};

const yahooNikkei: MarketInstrument = {
  secid: "^N225",
  code: "N225",
  name: "Nikkei 225",
  exchange: "OTHER",
  assetType: "index",
  provider: "yahoo",
};

const currentSeries: MarketSeries = {
  instrument: eastmoneyNikkei,
  interval: "1d",
  priceAdjustment: "corporate-action-adjusted",
  previousClose: 39_000,
  bars: [
    {
      time: "2026-07-24",
      timestamp: Date.parse("2026-07-24T00:00:00Z"),
      open: 39_000,
      high: 39_500,
      low: 38_800,
      close: 39_300,
      volume: 0,
      amount: 0,
      amplitude: 0,
      changePercent: 0,
      change: 300,
      turnoverRate: 0,
    },
  ],
  latestBarStatus: "complete",
  source: "eastmoney",
  fetchedAt: "2026-07-24T08:00:00Z",
};

test("reuses a successful cross-provider series for the same canonical index", () => {
  assert.equal(
    canReuseSavedBacktestMarketSeries(
      yahooNikkei,
      eastmoneyNikkei,
      currentSeries,
      "1d",
    ),
    true,
  );
});

test("requires a reload for a genuinely different instrument or empty series", () => {
  assert.equal(
    canReuseSavedBacktestMarketSeries(
      {
        ...yahooNikkei,
        secid: "^GSPC",
        code: "GSPC",
        name: "S&P 500",
      },
      eastmoneyNikkei,
      currentSeries,
      "1d",
    ),
    false,
  );
  assert.equal(
    canReuseSavedBacktestMarketSeries(
      yahooNikkei,
      eastmoneyNikkei,
      { ...currentSeries, bars: [] },
      "1d",
    ),
    false,
  );
});
