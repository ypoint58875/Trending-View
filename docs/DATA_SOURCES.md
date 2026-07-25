# Data Sources

## Eastmoney website market data

- Search endpoint: `https://searchapi.eastmoney.com/api/suggest/get`
- Kline endpoint: `https://push2his.eastmoney.com/api/qt/stock/kline/get`
- Accessed: 2026-07-25
- Current parameters: symbol `secid`; `klt` in 1, 5, 15, 30, 60, or 101;
  forward adjustment `fqt=1`; selected OHLCV fields; daily `beg=20000101`;
  and a bounded daily result limit of 10,000.
- Raw sample: `data/raw/eastmoney_n225_daily_sample.json`
- Registry: `data/source_registry.jsonl`
- Runtime freshness: full history is cacheable for one hour. A separate
  uncached recent-bar request runs every 60 seconds while visible and on
  focus/visibility, replacing matching current bars.

`fqt=1` output is marked `corporate-action-adjusted`. Volume is retained in the
provider's quote-page unit. The application displays it as provider volume and
does not scale it with price adjustment or silently convert it to shares.

These are public website endpoints, not a documented licensed API. They may
change or rate-limit requests. Do not treat them as an authoritative execution
feed.

## Yahoo Finance website market data

- Search endpoint: `https://query1.finance.yahoo.com/v1/finance/search`
- Chart endpoint: `https://query1.finance.yahoo.com/v8/finance/chart/{symbol}`
- Backup host: `query2.finance.yahoo.com`
- Accessed: 2026-07-25
- Current parameters: daily `period1=946684800` (2000-01-01 UTC) and dynamic
  `period2`; interval-specific ranges for retained internal intraday support;
  no pre/post-market bars; split/dividend events; and bounded local output.
- Raw sample: `data/raw/yahoo_sox_daily_sample.json`
- Runtime freshness: full history is cacheable; recent-bar overlays use
  `no-store`. The newest returned bar may still reflect Yahoo's own publication
  delay.

Yahoo expands global index/ETF discovery and history and accepts `FUTURE`
search results as commodity quote proxies. A deterministic catalog exposes
gold (`GC=F`), silver (`SI=F`), crude oil (`CL=F`), and copper (`HG=F`).
Live read-only checks on 2026-07-25 returned 1,260 five-year daily bars plus
adjusted-close arrays for all four symbols. The adapter retries the equivalent
query2 host, but regional HTTP 403 responses remain possible.
An extended N225 chart request on 2026-07-25 returned 6,627 daily rows from
2000-01-04 through 2026-07-24. The workspace retains at most 10,000 daily bars.

For daily output, each parsed OHLC bar is scaled by a finite positive
`adjclose / raw close`. If a factor is missing, zero, non-finite, or otherwise
invalid, that bar retains raw OHLC and the whole series is marked `raw`;
`corporate-action-adjusted` is used only when every parsed daily bar has a
valid factor. Yahoo intraday support remains raw internally. Yahoo volume is
never rescaled. For an all-adjusted series, provider previous close is scaled
by the first accepted bar factor. When a fetch limit slices normalized bars,
`previousClose` becomes the immediately preceding normalized close when one is
available. Raw and mixed fallback keep provider previous close on the raw
scale.

Commodity symbols use Yahoo only; Nasdaq fallback is skipped. The returned
continuous quote-page series does not provide a complete contract-chain or
roll-accounting model. QuantScope does not model roll schedules,
back-adjustment rules, multipliers, margin, expiry, delivery, or leverage.

## Nasdaq website historical data

- Endpoint: `https://api.nasdaq.com/api/quote/{symbol}/historical`
- Accessed: 2026-07-25
- Current parameters: `assetclass` index or ETF, `fromdate=2000-01-01` for
  extended daily history, current `todate`, and a 10,000-row daily limit.
- Raw sample: `data/raw/nasdaq_sox_daily_sample.json`
- Runtime freshness: recent-bar overlays use `no-store`; Nasdaq remains a
  daily-history fallback rather than an intraday feed.

Nasdaq is marked `raw` and used only as a daily-history fallback for supported
symbols. It is not an intraday replacement and may publish no volume for
indexes. Volume, when present, is not rescaled.

## Normalized analysis semantics

`MarketSeries.priceAdjustment` is the authoritative UI metadata. The active
series supplies one normalized `MarketBar[]` to the historical chart,
indicators, strategy reference lines, newest-bar guidance, stability
diagnostic, and backtests.

For ETFs, an adjusted source reduces mechanical distribution/split gaps. For
indexes, the provider symbol and methodology determine whether the source is a
price index or a total-return index; the adjustment layer does not convert
between them. Commodity history is a futures quote proxy with the limitations
above. QuantScope does not ingest constituent operating-company events or
fundamentals. None of these paths is separate cash-distribution accounting, a
cash-yield calculation, reinvestment, or multi-asset alignment.

## Reproducibility

Runtime responses are kept separate from calculations. The UI receives a
normalized `MarketSeries`, while the committed raw samples preserve provider
field names and row encoding for parser tests and incident comparison. They
are reference fixtures, not an automatic runtime archive. The application does
not persist each live response or run a raw-data retention/cleanup job.

See `DATA_PIPELINE.md` for current fetch/merge behavior and `CACHE_POLICY.md`
for HTTP caching and in-memory retention.
