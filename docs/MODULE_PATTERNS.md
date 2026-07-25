# Module Patterns

## Market provider

Every provider must:

1. Keep endpoint-specific response types inside its adapter.
2. Validate HTTP status and required payload fields.
3. Convert output to `MarketInstrument` and `MarketSeries`.
4. Use an explicit timeout and log only non-sensitive error metadata.
5. Add source documentation and a reproducible raw sample.

Provider orchestration belongs in `lib/market/index.ts`, not in individual
adapters. Search results must normalize to the shared index/ETF/commodity asset
types and must not expose individual equities. Commodity catalog entries live
in `lib/market/commodities.ts`, use Yahoo symbols, and never fall back to
Nasdaq. Fallbacks preserve the last valid series,
prefer longer daily history when available, and never merge bars from different
sources into one series. History responses may be HTTP cached, while current
refresh requests remain uncached and replace only overlapping recent bars from
the same provider, interval, and price-adjustment mode. A mismatch retains the
complete compatible history until a full compatible refresh succeeds.

Daily history boundaries and caps belong in `lib/market/history.ts`, not as
provider-local magic numbers. The current workspace requests 2000-01-01
through the present with a 10,000-bar cap. Adapters translate this contract to
their own date parameters while retaining smaller interval-specific intraday
limits. Latest overlays remain bounded, uncached, and independent from the
full-history boundary.

Every `MarketSeries` must set authoritative `priceAdjustment` metadata.
Eastmoney's `fqt=1` output is `corporate-action-adjusted`. Yahoo daily OHLC is
scaled per bar only when `adjclose / raw close` is finite and positive; any
parsed daily bar without a valid factor falls back to raw prices and makes the
whole series metadata `raw`. Yahoo intraday and Nasdaq daily output are `raw`.
Never rescale provider volume with a price-adjustment factor. Scale Yahoo's
provider previous close only for an all-adjusted parsed series, and after
slicing use the immediately preceding normalized bar when one exists.

The active `MarketSeries.bars` is the shared input for chart history,
indicators, strategy price references, live guidance, stability, and
backtesting. Do not create a second independently adjusted analysis series. For
ETFs, the normalized series reduces mechanical distribution/split gaps. For
indexes, the provider symbol/methodology defines price-index versus
total-return-index semantics; adjustment does not convert between them or
process constituent-company events/fundamentals. Neither path implements a
separate cash-distribution ledger or reinvestment.

## Indicator

Indicators are pure, bar-aligned functions. Warm-up entries are `null`; values
must never be shifted backward or use future bars.

Display metadata belongs in the shared indicator registry. The registry owns
stable IDs, main-chart versus lower-pane placement, defaults, minimums, and
input steps. It contains no localized text and no chart styling. UI controls
and chart calculations consume the same registry entry so a displayed setting
cannot drift from the formula input.

The UI keeps focused state separate from ordered-visible state. Focus selects
which indicator's independent settings are edited; ordered visibility selects
what the chart renders and preserves display order. Hiding an indicator does
not reset its settings. Overlay definitions render on the price axes. Every
visible pane definition receives its own lower pane. Price, volume, and all
indicator panes share the same zoom contract. Build legend names from each
visible indicator's actual parameters, leave VWAP/OBV parameter-free, use a
scrolling legend, and reserve top space so it cannot cover the price plot.

## Strategy

Strategies are registry entries with an ID, explicit `long` or `short` horizon,
linked indicator, default parameters, and a `buildTarget` function. Horizon is
stable catalog metadata describing intended signal duration on daily bars; it
must not be inferred from the current parameters or historical holding time.
Catalog tests must prove the long and short lists are disjoint and cover every
strategy. Target-state strategies describe the desired position after a bar
closes: `1` for long and `0` for flat. Their changes execute at the next open.

Strategies based on prices known before the active bar may additionally expose
`buildOrders`. The returned series is aligned with bars and contains a long
entry stop and long exit stop for that bar. Each order must use only information
available before the bar begins. A touched long stop fills at
`max(open, entryStop)`; a touched exit stop fills at
`min(open, exitStop)`. The engine checks only the order compatible with the
position held at the start of the bar, preventing same-bar exit and re-entry.

The product is long-only. A negative signal or short-side stop in an external
reference strategy must be normalized to closing an existing long position
without opening a short. Execution and costs belong only in the backtest
engine. Extended product strategies stay in `strategies.ts`; independently
implemented external reference catalogs belong in a dedicated module and are
spread into the shared registry. Every reference catalog exports an ordered ID
list so a catalog test can prove that no documented entry is missing. Every
price-order catalog exports a second ordered ID list so tests can prove that no
price-triggered implementation silently falls back to target execution.

The current manual-history UI must pass the shared `next-open` execution policy
to direct backtests, stability analysis, single screening, and combination
screening. This makes every displayed historical buy, sell, add, and reduce
marker use the following bar's open even when the registry entry also exposes
an intrabar price-order reference. Keep the hybrid engine contract covered for
reference compatibility, but do not let one UI path silently omit the manual
policy.

Every registered strategy must have one constrained parameter-space entry in
`screening.ts`. Domains must be finite, economically meaningful, and expressed
with stable numeric precision. Cross-field rules such as fast-period less than
slow-period belong in the parameter-space constraint. The generated candidates
must include the strategy default, remain JSON-distinct, and never exceed the
shared per-strategy hard cap.

When a strategy exposes a price offset such as tick size, that parameter must
be present in its default parameters, UI labels, saved-parameter merge, and
screening domain. Older saved snapshots are merged over current defaults before
use.

Large candidate spaces are sampled deterministically across the full ordered
grid. Screening executes in interruptible chunks and retains only the best
result per strategy under one explicit scalar objective. Objective comparison
and tie-breaking belong in the shared screening module, not the UI. Tests
enforce registry coverage, uniqueness, the cap, objective ordering,
best-result sorting, progress completion, and cancellation. Optimization input
must be trimmed to the selected range plus a documented causal warm-up prefix;
do not make runtime depend on unrelated chart history before that prefix.

Strategy plans use optional horizon selections, never equal-weight votes. A
long-only plan maps flat/long to zero/A; a short-only plan maps flat/long to
zero/B. With both horizons selected, use an event-driven state machine: a
long-entry transition establishes A, an already-active short signal is not
inherited, a later short-entry transition adds B, a short exit removes B, and
a long exit clears every active layer. An inactive long target always maps to
zero. Validate each allocation in `[0, 1]` and require A+B no greater than one
at the pure-function boundary.

Combination optimization must reuse shared candidate domains, objectives, and
tie-breaking while owning an independent selected objective and parameter cap
in the UI. It first retains a small fixed number of standalone finalists per
strategy, ranks the retained long/short Cartesian product once at the default
A/B reference, retains every pair up to a safety bound that covers the current
catalog, and then replays every allowed A/B choice for those finalists through
the allocation engine. Do not tighten that bound below the current retained
pair count without documenting the resulting approximation risk. Allowed dual
choices must produce only the declared 0%, 40%, 60%, or 100% holding states.
The partial-allocation engine executes the prior completed bar's target at the
next open, acts only on a changed planned state, applies costs to the transition,
and reports rebalances rather than claiming completed round-trip win statistics.
It must not generate maintenance trades merely because market movement drifts
the actual weight away from the planned percentage. Tests cover role validation,
target alignment, prefix invariance, bounded three-stage progress, cancellation,
costs, unchanged-state behavior, and range-end liquidation.

Trade annotations are derived from completed `BacktestTrade` or
`AllocationRebalance` records by pure mapping helpers. Every entry/increase is
an entry-side marker and every strategy exit/reduction is an exit-side marker.
The mapping helper assigns exactly one visible action from `open`, `short-buy`,
`short-sell`, or `close`; chart components never join multiple event labels or
infer trades from indicator lines. Combination timelines attach explicit
long/short entry and exit events to actual rebalances. When the long gate closes
an active short layer, retain both exit events on the single final fill but show
one close action so each short entry has an auditable close without duplicate
chart text.
Range-end valuation exits remain part of backtest metrics but use a separate
neutral marker so they cannot be mistaken for strategy-generated sells.

Current-bar guidance is a separate pure projection over the shared strategy
registry. Target strategies compare the newest desired position with the prior
one. Price-order strategies replay their existing entry/exit stop plan through
the newest OHLC range. Guidance never alters historical backtest execution and
must expose both action (`buy`, `sell`, `hold`, or `wait`) and resulting
long-only position.

Live manual execution timing is presentation guidance, not a historical fill
mode. Classify it with an explicit `Asia/Shanghai` 15:00 cutoff: before the
cutoff points to the same-day tail session, while the cutoff and later point to
the next trading-day open. Do not let wall-clock time change historical
following-open backtests or attempt to infer holidays without a calendar.

Strategy price visuals are also a separate pure projection. The visual helper
must return aligned finite-or-null series, reuse the exact `buildOrders` plan
when it exists, and return an empty collection for a strategy without
continuous price references. Chart components render these lines dashed on the
main price axes and never duplicate execution rules to derive order levels.
Technical Ratings may expose EMA-20 and SMA-50 because those are the exact
price references used by its registered vote calculation.

Nearby-parameter stability must reuse screening domains and the existing
backtest engine. Validate that the base has exactly the registered keys, finite
values inside every domain's minimum/maximum, integer values for shared
lookback/count/vote keys, and all cross-field constraints. Do not classify
price or oscillator entry/exit/oversold/overbought levels as integer-only.
Workspace inputs must reuse the shared integer-key predicate and normalize
those values to an integer of at least one. Invalid bases return no variants
and never run a backtest. Generate only one-field moves to immediately adjacent
configured values. The diagnostic reports sensitivity and 60-day
SMA/20-bar-slope regimes; it must never rank, select, or apply a parameter.
Require 120 observations inside the current backtest range, two completed base
trades, and one valid variant before stable/sensitive. Earlier bars remain
available only for causal regime warm-up.
Thresholds are centralized and inclusive: 75% sign agreement, a
15-percentage-point maximum return range, and a 10-percentage-point maximum
drawdown deterioration.

Shared ECharts wrappers initialize and dispose the canvas only at component
mount/unmount. Option changes update the existing instance. Interactive state
that must survive an option update is captured explicitly and reapplied; reset
keys define the business boundary where that state should be discarded.

The browser workspace is daily-only and holds one index, ETF, or commodity
quote proxy at a time.
Provider/API types may keep intraday support, but adding an interval back to
the UI is a product-contract change, not an incidental adapter change.

## Saved record

Saved product records use a shared input/record type, pure boundary validation,
an authenticated API route, and a D1 table. Every query includes the owner key.
The instrument identity is limited to the same index/ETF/commodity types
accepted by the market layer. New rows store nullable-compatible full strategy
plan JSON alongside legacy primary-strategy columns; legacy rows derive a
single full-allocation plan when read. Current JSON stores explicit long A and
short B allocations. Older core/maximum JSON converts to `A = core` and
`B = maximum - core` at the validation boundary. Upserts use the owner,
provider, and provider symbol as the
de-duplication key. UI components consume API records and do not access D1
bindings directly. Shortcut labels use the stored interval for provenance. A
legacy non-daily record remains non-mutating metadata: opening it keeps the
workspace daily and shows that the selected setup is recalculated on daily
bars.

## UI copy

Chinese user-facing strings live in `app/i18n/zh-CN.ts`. Business logic,
internal errors, identifiers, and tests remain English. Provider-defined field
values may retain their source language when required for parsing.
