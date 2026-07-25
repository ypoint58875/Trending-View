# Data Pipeline

This file separates QuantScope's current runtime behavior from possible future
ingestion work. The current application has no scheduled market-data job,
durable raw-response archive, server-side checkpoint, or disk cleanup process.

## Current runtime flow

1. The browser selects one index or ETF. The current UI fixes the interval at
   `1d`, although provider adapters and `/api/market` retain interval support.
2. On a new instrument, the browser requests up to 1,000 history bars with
   `mode=history`.
3. `fetchMarketSeries` uses provider adapters and ordered fallback, returning
   one normalized `MarketSeries`.
4. The browser requests a separate five-bar `mode=latest` window with
   `no-store`. For finite numeric `limit` requests, the route clamps latest
   windows to between 2 and 10 bars; the current UI explicitly requests five.
5. When history and latest share the same source, interval, and
   `priceAdjustment`, the client replaces bars with matching `time` values,
   appends new times, sorts by timestamp, and keeps the newest 1,000 bars.
   Adjusted and raw series are never mixed. A mismatch retains the complete
   compatible history until a full compatible refresh succeeds. Repeating the
   same compatible latest window is idempotent.
6. The resulting `MarketSeries.bars` is the single input for chart history,
   volume, indicators, strategy price references, current-bar guidance,
   stability, and backtesting.

After the initial load, manual refresh, a 60-second timer while the page is
visible, window focus, and restored page visibility request only the latest
window for the current series. This is browser-session refresh behavior, not a
scheduled server job. If a latest request fails, the displayed history remains
usable. If fallback produces a different source, the UI retains the current
history and does not combine providers.

## Current provider normalization

### Eastmoney

- Requests the configured interval with `fqt=1`.
- Marks the resulting series `corporate-action-adjusted`.
- Preserves provider volume without rescaling.

### Yahoo Finance

- Retains interval support inside the adapter.
- For daily bars only, computes a per-bar factor as
  `adjclose / raw close` when both inputs produce a finite positive factor.
- Multiplies that bar's open, high, low, and close by the factor.
- Falls back to raw OHLC for an invalid or missing factor and marks the whole
  daily series `raw`; it marks the series adjusted only when every parsed daily
  bar has a valid factor.
- Scales provider previous close by the first accepted factor only for an
  all-adjusted parsed series. After limiting bars, previous close becomes the
  immediately preceding normalized bar when available.
- Keeps intraday output raw and never rescales volume.
- Accepts `FUTURE` instruments as commodity quote proxies and uses the same
  daily normalization. Commodity instruments remain Yahoo-only.

### Nasdaq

- Supplies supported daily history only and is marked `raw`.
- Acts as a fallback, not an intraday provider.
- Preserves published volume without rescaling.

`MarketSeries.priceAdjustment` is the authoritative UI metadata. For ETFs,
normalized prices reduce mechanical distribution/split gaps where the provider
supplies valid adjustment data. For indexes, the provider symbol/methodology
defines price-index versus total-return-index semantics; the pipeline neither
converts between them nor ingests constituent operating-company events and
fundamentals. It does not maintain separate distribution cash flows or a
synthetic total-return ledger.

## Current fallback behavior

- Eastmoney is preferred for Eastmoney instruments.
- An Eastmoney daily index series with fewer than 60 bars can trigger an
  attempt to obtain longer Yahoo history.
- Yahoo index/ETF instruments fall back to Nasdaq only for daily data.
- Yahoo commodity instruments never fall back to Nasdaq.
- When Yahoo and Nasdaq fail, a valid shorter Eastmoney result is retained.
- Bars from different sources or price-adjustment modes are never merged.

## Current storage and traceability

`data/raw/` contains committed reference samples used for parser tests and
incident comparison, and `data/source_registry.jsonl` records those samples.
Runtime market responses are not automatically appended to either location.
There is no durable processed-market-data store, cursor, watermark, or
`data/state/` checkpoint.

Saved backtest shortcuts use D1 and are a separate product-record pipeline.
They are not a market-data cache or a raw-source archive.

## Future recommendations

The following items are not implemented:

- Replace public website endpoints with a licensed source and record its usage,
  adjustment, and redistribution terms.
- If durable ingestion is added, archive raw responses with source URL,
  request parameters, access time, content hash, and provider adjustment mode.
- Add an explicit per-instrument daily watermark and idempotent processed-bar
  upsert only when a server-side incremental pipeline exists.
- Define reconciliation rules for corrected bars and provider changes before
  persisting cross-run processed history.
- Add monitored recovery for partial writes and source outages before adding
  scheduled execution.
- Define retention and cleanup only after storage, privacy, licensing, and
  recovery requirements are known. Do not delete raw archives implicitly.
