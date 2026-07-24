# Architecture

## Runtime

QuantScope is a vinext App Router application compiled to a Cloudflare
Worker-compatible bundle.

```text
Browser UI
  -> /api/search and /api/market
  -> index/ETF search filter
  -> Eastmoney, Yahoo Finance, and Nasdaq adapters
  -> ordered data-source fallback
  -> normalized MarketSeries
  -> indicator registry
  -> strategy registry
  -> backtest and screening engines
  -> ECharts canvas views
  -> /api/saved-backtests
  -> authenticated owner key
  -> D1 saved backtest snapshots
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

Saved backtests are scoped by the authenticated ChatGPT email header. One
snapshot is retained per owner, provider, and instrument identifier; saving the
same instrument updates its current snapshot instead of creating duplicates.

Eastmoney is the preferred source for search and bars. Yahoo Finance extends
global symbol discovery and history. Nasdaq is the daily-history fallback for
supported indexes and ETFs when Yahoo is unavailable. A shorter valid
Eastmoney series is preserved as the final fallback instead of turning a
partial upstream response into an empty chart.
