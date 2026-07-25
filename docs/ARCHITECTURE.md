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
  -> cached daily history from 2000 plus uncached latest-bar refresh/merge
  -> index/ETF/commodity search filter plus deterministic commodity catalog
  -> Eastmoney, Yahoo Finance, and Nasdaq adapters
  -> ordered data-source fallback
  -> normalized MarketSeries
  -> indicator registry
  -> independent indicator selection and per-indicator session settings
  -> strategy registry
  -> target-state or price-order strategy plan
  -> newest-bar live strategy guidance
  -> hybrid backtest execution engine
  -> bounded, chunked parameter-grid optimizer
  -> bounded long-gate/short-overlay combination optimizer
  -> partial-allocation next-open backtest
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

`MarketWorkspace` owns separate indicator and strategy-plan state. Indicator
controls read defaults and validation metadata from the indicator registry,
remember one parameter set per indicator for the browser session, and pass the
active values to `PriceChart`. Strategy changes update the backtest, live
guidance, and trade markers without replacing the selected indicator.
`PriceChart` renders the selected studies together with both selected
strategies' qualified reference lines and actual trade/allocation markers.
Indicator settings are display state and do not change the saved-backtest
database schema.

Single-strategy screening generates constrained parameter grids from the shared
strategy registry, applies a per-strategy cap, yields between small batches,
and retains only the highest-scoring result for each strategy. Both screening
paths trim calculation input to the selected range plus up to 500 earlier bars
for causal warm-up. Combination screening has an independent objective and
per-strategy cap while reusing the same candidate and comparison contracts in
three bounded stages: keep two standalone finalists per strategy, rank the
long/short Cartesian product at reference A=60% and B=40%, retain up to 1,024
pairs, then optimize four valid A/B choices for those finalists. The current
two-finalist catalog produces at most 1,020 pairs, so none are pruned. This bounds UI
blocking and result memory without forcing every allocation candidate through
every strategy pair.

Every strategy registry entry declares a stable `long` or `short` horizon.
These labels describe intended signal duration on daily bars rather than a
different market interval. A strategy plan may contain either horizon or both.
A long-only target switches between zero and A; a short-only target switches
between zero and B. A dual target is hierarchical: the long rule gates all
exposure, establishes A when active, and the short rule adds or removes B.
The allocation backtest applies the prior completed bar's target at the next
open, trades only the allocation delta, applies costs to each rebalance, and
liquidates at the selected range end. Strategy-driven rebalances carry explicit
long/short entry/exit attribution. A long-gate exit also closes an active short
layer, so the final strategy sell can contain both exit events.

The strategy registry supports two execution contracts. Target-state
strategies produce long/flat decisions after a completed bar and execute at the
next open. Price-order strategies produce stop levels using only data known
before the active bar. The backtest engine fills touched stops inside that bar,
uses the open for crossed gaps, and applies the same cost and trade-record
pipeline to both contracts.

The current manual-history workspace explicitly selects the target-only
next-open policy for every strategy, including registry entries that also
expose price orders. This keeps all displayed historical buy/sell markers and
both screening workflows on one execution rule. The intrabar contract remains
available only as a tested engine/reference capability.

Live guidance reuses the same strategy registry but remains separate from the
historical execution engine. Target-state strategies compare the newest dynamic
bar target with the preceding target. Price-order strategies replay the same
long-only touched-stop rules through the newest bar. This produces buy, sell,
continue-holding, or remain-flat guidance without changing historical
next-open execution. Full history can be cached for one hour; a separate
uncached request retrieves up to five latest bars on open and every refresh.
Only overlapping bar times are replaced, and series from different sources are
never merged. Provider-side latency remains possible.

The daily workspace asks for provider history from 2000-01-01 and retains at
most 10,000 normalized bars in page memory. `lib/market/history.ts` owns this
shared boundary and the separate retained intraday safety cap. Eastmoney,
Yahoo, and Nasdaq translate the boundary into their provider-specific date
parameters. A later-listed instrument begins at its first available bar.

The live guidance presentation also classifies the current manual execution
window with an explicit `Asia/Shanghai` 15:00 cutoff. This changes only the
actionable clock label: historical target-state backtests and both screeners
always retain following-open execution.

Eastmoney is the preferred source for search and bars. Yahoo Finance extends
global symbol discovery and history and is the only history provider for
commodity futures quote proxies. Nasdaq is the daily-history fallback for
supported indexes and ETFs, never commodities, when Yahoo is unavailable. A shorter valid
Eastmoney series is preserved as the final fallback instead of turning a
partial upstream response into an empty chart.
