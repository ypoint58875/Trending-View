# Data Pipeline

This file separates QuantScope's current runtime behavior from possible future
ingestion work. The current application has no scheduled market-data job,
durable raw-response archive, or server-side checkpoint. It does keep a
bounded device-local processed-history cache for fast shortcut opens.

## Current runtime flow

1. The browser selects one index or ETF. The current UI fixes the interval at
   `1d`, although provider adapters and `/api/market` retain interval support.
2. On a new instrument, the browser checks its IndexedDB processed-history
   cache. A hit and its last successful write time are displayed immediately
   but never prevent the following full network refresh.
3. The browser requests daily history from 2000-01-01 with a 10,000-bar safety
   cap and `mode=history`.
4. `fetchMarketSeries` uses provider adapters and ordered fallback, returning
   one normalized `MarketSeries`. When fallback wins, the result adopts that
   provider's resolved symbol so later latest-window requests address the same
   source correctly.
5. The browser requests a separate five-bar `mode=latest` window with
   `no-store`. For finite numeric `limit` requests, the route clamps latest
   windows to between 2 and 10 bars; the current UI explicitly requests five.
6. When history and latest share the same source, interval, and
   `priceAdjustment`, the client replaces bars with matching `time` values,
   appends new times, sorts by timestamp, and keeps the newest 10,000 bars.
   Adjusted and raw series are never mixed. A mismatch retains the complete
   compatible history until a full compatible refresh succeeds. Repeating the
   same compatible latest window is idempotent.
7. The compatible result is written back to IndexedDB under
   provider/symbol/interval. Entries do not expire by age; only the oldest
   surplus entry is removed when the 32-series capacity is exceeded.
8. The resulting `MarketSeries.bars` is the single input for chart history,
   volume, indicators, strategy price references, current-bar guidance,
   stability, and backtesting.

Opening a saved shortcut is a restore operation before it is a market switch.
When the saved instrument, active instrument, and non-empty successful active
series have the same canonical key and interval, the workspace preserves the
active series and restores only strategy/indicator/metric/marker state. A
different canonical instrument or missing active series restarts the normal
cache/network flow above.

After the initial load, manual refresh, a 60-second timer while the page is
visible, window focus, and restored page visibility request only the latest
window for the current series. This is browser-session refresh behavior, not a
scheduled server job. If a latest request fails, the displayed history remains
usable. If fallback produces a different source, the UI retains the current
history and does not combine providers.

## Current provider normalization

### Eastmoney

- Requests the configured interval with `fqt=1`; extended daily history adds
  `beg=20000101` and permits up to 10,000 rows.
- Marks the resulting series `corporate-action-adjusted`.
- Preserves provider volume without rescaling.

### EODHD

- Is disabled unless the server runtime provides `EODHD_API_TOKEN`.
- Supports daily index/ETF search and history only; it never receives commodity
  fallbacks.
- Uses the shared 2000-01-01 boundary for extended history and a short explicit
  date window for latest refresh.
- Adjusts all OHLC rows only when every accepted row has a finite positive
  `adjusted_close / close` factor; otherwise the complete result stays raw.
- Retries one transient network, HTTP 429, or 5xx failure and never logs the
  token.

### Yahoo Finance

- Retains interval support inside the adapter.
- Uses explicit daily `period1`/`period2` boundaries starting at 2000-01-01
  for extended history; retained internal intraday requests keep their
  provider-supported ranges.
- For daily bars only, computes a factor as `adjclose / raw close` for every
  accepted row. It adjusts all accepted OHLC rows only when every row produces
  a finite positive factor.
- If any accepted row lacks a valid factor, keeps every accepted row on the raw
  OHLC scale and marks the whole daily series `raw`; adjusted and raw rows are
  never mixed within one `MarketSeries`.
- Scales provider previous close by the first accepted factor only for an
  all-adjusted parsed series. After limiting bars, previous close becomes the
  immediately preceding normalized bar when available.
- Keeps intraday output raw and never rescales volume.
- Accepts `FUTURE` instruments as commodity quote proxies and uses the same
  daily normalization. Commodity instruments remain Yahoo-only.

### Nasdaq

- Supplies supported daily history from 2000-01-01 when extended history is
  requested and is marked `raw`.
- Acts as a fallback, not an intraday provider.
- Preserves published volume without rescaling.

`MarketSeries.priceAdjustment` is the authoritative UI metadata. For ETFs,
normalized prices reduce mechanical distribution/split gaps where the provider
supplies valid adjustment data. For indexes, the provider symbol/methodology
defines price-index versus total-return-index semantics; the pipeline neither
converts between them nor ingests constituent operating-company events and
fundamentals. It does not maintain separate distribution cash flows or a
synthetic total-return ledger.

`MarketSeries.latestBarStatus` is the authoritative daily completion metadata.
Past-date bars are complete. A same-date bar uses Yahoo's published regular
session end when available, otherwise the exchange's documented regular close;
unknown exchanges remain `unknown`. Close-derived live target changes are
frozen at the prior completed state while the latest bar is in-progress or
unknown. Causal prior-day stop orders may still fill inside that bar.

## Current fallback behavior

- Eastmoney is preferred for Eastmoney instruments.
- An Eastmoney daily index/ETF series beginning after January 2000 can trigger
  attempts to obtain longer EODHD or Yahoo history. The longer valid series
  wins.
- If configured, EODHD precedes Yahoo and Nasdaq in daily index/ETF fallback.
- Yahoo index/ETF instruments fall back through EODHD and then Nasdaq only for
  daily data.
- Yahoo commodity instruments never fall back to Nasdaq.
- When EODHD, Yahoo, and Nasdaq fail, a valid shorter Eastmoney result is
  retained.
- Bars from different sources or price-adjustment modes are never merged.
- Legacy saved/cache records that label an Eastmoney-shaped identifier as
  Yahoo are translated to the Yahoo symbol before requesting; new successful
  Yahoo responses persist the resolved Yahoo symbol directly.

## Current storage and traceability

`data/raw/` contains committed reference samples used for parser tests and
incident comparison, and `data/source_registry.jsonl` records those samples.
Runtime market responses are not automatically appended to either location.
There is no server-side processed-market-data store, cursor, watermark, or
`data/state/` checkpoint. IndexedDB holds only a bounded normalized series
snapshot for responsive local shortcut opens; it is not an auditable raw
archive and is always refreshed in the background.

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
