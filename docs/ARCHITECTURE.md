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
  -> IndexedDB shortcut history plus background daily history/latest refresh
  -> index/ETF/commodity search filter plus deterministic commodity catalog
  -> Eastmoney, optional EODHD, Yahoo Finance, and Nasdaq adapters
  -> ordered data-source fallback
  -> normalized MarketSeries
  -> indicator registry
  -> independent indicator selection and device-local parameter preferences
  -> strategy registry
  -> target-state or price-order strategy plan
  -> optional normalized moving-average-slope entry filter
  -> newest-bar live strategy guidance
  -> hybrid backtest execution engine
  -> exhaustive, chunked parameter-grid optimizer
  -> staged EMA5-8 family refinement
  -> unique-winner relative-horizon combination optimizer
  -> partial-allocation hybrid backtest
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
the project-local D1 state under `.wrangler/state`. Saved rows are append-only
snapshots at creation time: the owner/provider/instrument columns are indexed
for listing, but they are not unique, so one instrument can retain multiple
strategy plans.
The upper workspace pairs the price chart with saved shortcuts. The lower
research grid pairs the strategy lab with automated parameter screening.
Saved-shortcut listing reads at most 200 owner-scoped rows into a bounded
scroll region. The UI canonicalizes provider-specific aliases into one
instrument group, renders each group as a disclosure, and mounts its saved
strategy/indicator rows only while expanded. Native drag-and-drop or keyboard
arrow moves update the ordered list optimistically and persist `display_order`
through the same owner-scoped API.

`MarketWorkspace` owns separate indicator, draft strategy-plan, and applied
strategy-plan state. Indicator controls read defaults and validation metadata from the indicator registry,
start with every indicator hidden, persist one parameter set per indicator in
device-local storage, and pass only the visible configurations to `PriceChart`.
Each toolbar button both focuses and toggles its indicator. Draft strategy
changes update the lab backtest without replacing the selected indicator.
Only Apply, a screening row, or a saved shortcut updates chart references,
live guidance, and trade markers. Save current strategy snapshots that applied
chart plan and its matching metrics rather than unapplied lab edits.
`PriceChart` renders the selected studies together with both selected
strategies' qualified reference lines and actual trade/allocation markers.
Saved-backtest snapshots store the ordered visible indicator configurations in
a nullable JSON column. Opening a shortcut restores those visible indicators
and parameters without replacing the workspace's shared backtest range. If the
shortcut and the successful active series resolve to the same canonical
instrument, the workspace preserves that exact series and restores only plan,
parameter, indicator, metric, and marker state. Only a different canonical
instrument triggers a market reload; legacy rows restore no indicators. For
the active instrument, shortcut returns are
derived from each saved plan and costs over that shared range instead of
displaying the creation-time metric. Inactive instrument groups show no numeric
return until their history is active, avoiding a stale cross-range comparison.

One strategy-screening action generates all 37,131 finite parameter
combinations from the shared registry, applies one objective, and yields
between small batches. For each explicitly eligible trend, breakout, or
momentum strategy, it retains compact metrics for the top 30 unfiltered
parameter sets and compares EMA(5), EMA(6), EMA(7), and EMA(8) at a 0% slope.
Every strategy then contributes exactly one final winner. The optimizer ranks
every unordered pair of non-equivalent winners at reference A=60% and B=40%,
retains up to 4,096 pairs, and replays the alternate A=40% and B=60%
assignment. The current catalog produces 559 pairs, so none are pruned. Final
combination output keeps only the best parameter/allocation result for each
unique unordered strategy-ID pair. The UI renders standalone and combination
outputs in equal fixed-layout columns beneath one horizontal control bar and
does not truncate the retained rows. Stage-local counters drive one monotonic
four-segment progress bar.
Clicking or keyboard-activating a result row applies it directly; the strategy
A/B columns keep names and horizon labels inline, and the strategy lab remains
the sole equity-preview surface. Every target is generated from
the complete loaded history; only performance is restricted to the selected
date range. Only the final unique winner per strategy retains its complete
execution state for pair replay; the EMA Top-30 stage stores compact
performance records.

`screening-validation.ts` wraps the same optimizer without duplicating its
candidate domain or objective rules. Period screening performs the complete
parameter, EMA Top-30, combination, and allocation workflow inside one
configured trailing window. The default is 128 sessions and is synchronized
bidirectionally with the strategy-lab range. Range screening performs the same
workflow over one custom start/end interval and has no separate training,
selection, or test stage. Rolling screening first forms the retained
standalone and combination pool over one custom total interval, then advances
a fixed-width calendar window by one year. Each window converts the active
objective order into a tied 0-to-100 percentile rank, and equal window weights
drive the final order.

All three modes build indicators, strategy targets, and opening position state
from complete loaded history so a scoring boundary does not reset a
continuously running strategy. Only transactions and performance inside the
active period, custom range, or rolling window feed its return, Sharpe,
drawdown, and objective. The balanced objective is `0.45 * totalReturn +
8 * clamp(Sharpe, -5, 5) + 0.35 * maxDrawdown`; trade count remains report and
candidate-status evidence only. These modes are recent-adaptive in-sample
selectors and make no out-of-sample claim.

After both result groups complete, `strategy-shortlist.ts` forms one combined
eligible pool. The first candidate under the active screening objective is the
primary strategy. It recommends up to two deputies only when each candidate
shares no strategy component with the recommendations already selected and
its maximum aligned daily equity-return correlation to them is below 0.75.
Quality/diversity scoring orders only candidates that pass that hard
independence gate. High-overlap candidates can fill otherwise empty visual
slots only as same-family alternatives, never as deputies; the UI explicitly
reports a deputy shortfall. The shortlist occupies one fixed horizontal row
above both underlying result tables and does not alter them. A separate
30-session review compares strategy
equity with the active instrument and checks a 63-session excess-return
confirmation; this review is descriptive and never feeds back into selection
rank. Period and rolling modes expose their window-aggregate selection score
to the shortlist; range mode uses its custom-range objective. Diversity
measurement remains independent from objective ranking.

Every strategy registry entry retains descriptive `long` or `short` catalog
metadata, but plans and combinations do not use it as an eligibility rule.
Strategy A and Strategy B can each hold any different, non-equivalent registry
entry. Over the selected date range, the target with the longer average active
run becomes the relative long-cycle gate. A duration tie prefers fewer target
transitions and then Strategy A. A new relative-long entry establishes its
assigned allocation and deliberately ignores a relative-short signal already
active. Only a later fresh relative-short entry adds its allocation; its paired
exit removes that layer. The relative-long exit clears both layers. The
allocation plan uses 100% whenever exactly one strategy is selected; 60/40
assignments exist only for dual plans. The allocation backtest applies
close-confirmed changed states at the next open and causal price-order states
on the touched bar. Complete-history state initializes any already-active
position at the first selected open. It does not recenter an unchanged state
after price drift, applies costs to each actual transition, and liquidates at
the selected range end. Rebalances carry
relative long/short entry/exit attribution, and a gate exit with an active
short layer renders as one close action.

The strategy registry supports two execution contracts. Target-state
strategies produce long/flat decisions after a completed bar and execute at the
next open. Price-order strategies produce stop levels using only completed-bar
data; an open-only rule may additionally react to the observed active open.
The backtest engine fills touched stops inside that bar, executes open-only
events at the open, uses the open for crossed gaps, and applies the same cost and trade-record
pipeline to both contracts. When both entry and exit stops of one flat strategy
are touched on the same daily bar, the resolver records a conservative
entry-then-exit sequence rather than choosing the profitable path.

The manual-history workspace, direct backtest, stability analysis, standalone
screening, combination screening, applied chart, and saved metrics all use the
same hybrid policy. Close-derived target changes fill at the following open.
Registry entries with causal price orders fill on the touched bar, including
open-price gap handling. Combination same-bar entry stops execute from lower to
higher and exit stops from higher to lower; the relative-long layer wins an
equal-price tie.

`entry-filter.ts` owns the optional moving-average-slope entry boundary for
SMA, EMA, and WMA. It calculates normalized one-session percentage slopes once
over the complete loaded history and exposes an aligned entry-eligibility
series. Target-state plans apply eligibility on the completed signal bar;
price/open-order plans apply the preceding completed bar's eligibility to the
active execution bar. The stateful filter delays only a flat-to-long
transition and never creates an exit. Strategy-lab drafts and one-click
screening drafts remain independent, while a screening result or saved
shortcut carries the exact filter into the applied plan, backtest, stability
diagnostic, chart, and live guidance. When the screening draft is enabled, the
optimizer creates separate EMA(5), EMA(6), EMA(7), and EMA(8) contexts at a
fixed 0% threshold only for the explicit trend/breakout/momentum family and
only after selecting each eligible strategy's top 30 unfiltered parameter
sets. Combination screening uses each strategy's unique final winner. Because
the current plan schema has one shared entry filter, a pair retains that filter
only when both winners selected the same EMA; otherwise the pair is replayed
without a shared EMA filter and is ranked on that coherent plan.

Live guidance reuses the same strategy registry. Target-state strategies
compare the newest dynamic bar target with the preceding target. Price-order
strategies replay the same long-only touched-stop rules through the newest bar
and expose the current entry/exit condition prices. This produces buy, sell,
continue-holding, or remain-flat guidance under the same execution contract.
Greedy additionally exposes a completed-candle action pending for the next
open, with its documented opposite-gap override. The latest daily bar is
explicitly complete, in-progress, or unknown. Close-derived guidance freezes
at the preceding target until completion is known, while prior-completed-bar
stop orders remain eligible.

Full history can be HTTP-cached for one hour; a separate
uncached request retrieves up to five latest bars on open and every refresh.
Only overlapping bar times are replaced, and series from different sources are
never merged. A bounded same-origin IndexedDB cache (32 normalized series with
no age expiry) lets shortcut histories render first with their cache timestamp,
but the full network refresh always continues. Provider-side latency remains
possible.

The daily workspace asks for provider history from 2000-01-01 and retains at
most 10,000 normalized bars in page memory. `lib/market/history.ts` owns this
shared boundary and the separate retained intraday safety cap. Eastmoney,
EODHD, Yahoo, and Nasdaq translate the boundary into their provider-specific date
parameters. A later-listed instrument begins at its first available bar.

The live guidance presentation labels price orders as same-bar conditional
fills and close-confirmed signals as following-open instructions. It does not
use wall-clock time to change execution semantics.

Eastmoney is the preferred source for Eastmoney instruments. When a server-only
`EODHD_API_TOKEN` is configured, the licensed EODHD daily index/ETF adapter is
inserted before the public Yahoo and Nasdaq fallbacks. Yahoo Finance extends
global symbol discovery/history and remains the only history provider for
commodity futures quote proxies. Nasdaq is a raw daily-history fallback for
supported indexes and ETFs, never commodities. A shorter valid Eastmoney
series is preserved as the final fallback instead of turning a partial
upstream response into an empty chart.
