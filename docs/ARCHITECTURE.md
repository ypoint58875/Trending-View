# Architecture

## Runtime

QuantScope is a vinext App Router application compiled to a Cloudflare
Worker-compatible bundle.

```text
Browser UI
  -> /api/search and /api/market
  -> Eastmoney adapter
  -> normalized MarketSeries
  -> indicator registry
  -> strategy registry
  -> backtest and screening engines
  -> ECharts canvas views
```

## Boundaries

- `app/`: routes, UI components, styles, and localized copy.
- `lib/market/`: provider adapters, parsers, and normalized market types.
- `lib/analysis/`: pure indicators, strategies, backtesting, and screening.
- `tests/`: deterministic analysis tests and built-worker rendering tests.
- `data/`: traceable source samples and source registry.
- `docs/`: durable project memory.

The API routes return normalized data and do not expose provider-specific row
formats to the browser.

