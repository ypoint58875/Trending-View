# Architecture

## Runtime

QuantScope is a vinext App Router application compiled to a Cloudflare
Worker-compatible bundle.

```text
Windows one-click local runtime
  -> open-quantscope.bat
  -> scripts/start-local.ps1
  -> 127.0.0.1:3000
  -> local D1 under .wrangler/state

Browser UI
  -> /api/search and /api/market
  -> cached history plus uncached latest-bar refresh/merge
  -> index/ETF search filter
  -> Eastmoney, Yahoo Finance, and Nasdaq adapters
  -> ordered data-source fallback
  -> normalized MarketSeries
  -> indicator registry
  -> strategy registry
  -> target-state or price-order strategy plan
  -> newest-bar live strategy guidance
  -> hybrid backtest execution engine
  -> bounded, chunked parameter-grid optimizer
  -> ECharts canvas views
  -> /api/saved-backtests
  -> hosted email or fixed loopback owner key
  -> hosted or project-local D1 saved backtest snapshots
```

## Boundaries

- `app/`: routes, UI components, styles, and localized copy.
- `lib/market/`: provider adapters, parsers, and normalized market types.
- `lib/analysis/`: pure indicators, strategies, backtesting, and screening.
- `db/` and `drizzle/`: saved-backtest schema and forward migrations.
- `tests/`: deterministic analysis tests and built-worker rendering tests.
- `data/`: traceable source samples and source registry.
- `docs/`: durable project memory.

The API routes return normalized data and do not expose provider-specific row
formats to the browser.

Saved backtests use one owner key in every query. Hosted requests use the
authenticated ChatGPT email header. Requests to `localhost` or `127.0.0.1`
without that header use the fixed local owner `local@quantscope.invalid` and
the project-local D1 state under `.wrangler/state`. One snapshot is retained
per owner, provider, and instrument identifier; saving the same instrument
updates its current snapshot instead of creating duplicates.
The upper workspace pairs the price chart with saved shortcuts. The lower
research grid pairs the strategy lab with automated parameter screening.

Screening generates constrained parameter grids from the shared strategy
registry, applies a per-strategy cap, yields between small batches, and retains
only the highest-scoring result for each strategy. This bounds both UI blocking
and result memory without changing the deterministic backtest engine.

The strategy registry supports two execution contracts. Target-state
strategies produce long/flat decisions after a completed bar and execute at the
next open. Price-order strategies produce stop levels using only data known
before the active bar. The backtest engine fills touched stops inside that bar,
uses the open for crossed gaps, and applies the same cost and trade-record
pipeline to both contracts.

Live guidance reuses the same strategy registry but remains separate from the
historical execution engine. Target-state strategies compare the newest dynamic
bar target with the preceding target. Price-order strategies replay the same
long-only touched-stop rules through the newest bar. This produces buy, sell,
continue-holding, or remain-flat guidance without changing historical
next-open execution. Full history can be cached for one hour; a separate
uncached request retrieves up to five latest bars on open and every refresh.
Only overlapping bar times are replaced, and series from different sources are
never merged. Provider-side latency remains possible.

Eastmoney is the preferred source for search and bars. Yahoo Finance extends
global symbol discovery and history. Nasdaq is the daily-history fallback for
supported indexes and ETFs when Yahoo is unavailable. A shorter valid
Eastmoney series is preserved as the final fallback instead of turning a
partial upstream response into an empty chart.
