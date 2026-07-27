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
Eastmoney's `fqt=1` output is `corporate-action-adjusted`. EODHD daily OHLC is
scaled only when every accepted row has a finite positive
`adjusted_close / close` factor; otherwise every accepted row remains raw.
Yahoo daily OHLC is
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

Saved-shortcut restore must compare canonical instrument keys before changing
market state. If a non-empty successful active series, the active instrument,
and the saved instrument have the same canonical key and interval, preserve the
exact active series and restore only plan-derived state. Provider aliases alone
must not blank or reload the chart. A different canonical instrument or an
empty active series must use the normal market loading pipeline.

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
what the chart renders and preserves display order. All indicators are hidden
by default. A toolbar click focuses and toggles the same indicator; the focused
hidden style must remain visually distinct from the visible style. Hiding an
indicator does not reset its settings. Validated per-indicator settings and
visibility are device-local preferences. Overlay definitions render on the
price axes. Every visible pane definition receives its own lower pane. Price,
volume, and all indicator panes share the same zoom contract. Build legend
names from each visible indicator's actual parameters, leave VWAP/OBV
parameter-free, use a scrolling legend, and reserve top space so it cannot
cover the price plot.

## Strategy

Strategies are registry entries with an ID, explicit `long` or `short` horizon,
linked indicator, default parameters, and a `buildTarget` function. Horizon is
stable catalog metadata describing intended signal duration on daily bars; it
must not be inferred from the current parameters or historical holding time.
Catalog tests must prove the long and short lists are disjoint and cover every
strategy. Target-state strategies describe the desired position after a bar
closes: `1` for long and `0` for flat. Their changes execute at the next open.

Strategies with causal price or open conditions may additionally expose
`buildOrders`. The returned series is aligned with bars and can contain a long
entry stop, long exit stop, or an entry/exit action evaluated at that bar's
open. Stop levels must use only completed-bar information; an open action may
also use the observed active open. A touched long stop fills at
`max(open, entryStop)`; a touched exit stop fills at
`min(open, exitStop)`. The shared resolver checks only the instruction
compatible with the held position, preventing same-bar exit and re-entry.

The product is long-only. A negative signal or short-side stop in an external
reference strategy must be normalized to closing an existing long position
without opening a short. Execution and costs belong only in the backtest
engine. Extended product strategies stay in `strategies.ts`; independently
implemented external reference catalogs belong in a dedicated module and are
spread into the shared registry. Every reference catalog exports an ordered ID
list so a catalog test can prove that no documented entry is missing. Every
price-order catalog exports a second ordered ID list so tests can prove that no
price-triggered implementation silently falls back to target execution.

The manual-history UI must pass the shared `hybrid` execution policy to direct
backtests, stability analysis, standalone screening, combination screening,
applied-chart metrics, and saved snapshots. Close-derived targets execute at
the following open. Causal `buildOrders` levels execute on the touched bar,
open-only instructions execute at the observed open, and crossed stops use
that open. Direct backtests, combination replay, and live guidance must route
through `strategy-execution.ts` so order precedence and gap prices cannot
diverge.

Optional cross-strategy entry conditions belong in `entry-filter.ts`, not in
individual strategy formulas. Moving-average slope must be normalized as a
percentage change per session so one threshold is not tied to an instrument's
price scale. Build the aligned filter series once per history/run and reuse it
for direct backtests, stability, standalone screening, combinations, applied
metrics, and guidance. A filter may delay a flat-to-long transition but must
never force an exit or rewrite the strategy's own target. Close-derived entries
use the completed signal bar; intrabar/open entries use the preceding
completed bar. Keep the control optional and preset values separate from the
enabled state.

Every registered strategy must have one constrained parameter-space entry in
`screening.ts`. Domains must be finite, economically meaningful, and expressed
with stable numeric precision. Cross-field rules such as fast-period less than
slow-period belong in the parameter-space constraint. The generated candidates
must remain JSON-distinct. Production one-click screening traverses every valid
finite combination; test-only candidate overrides may reduce fixtures but must
not change the production domain.

When a strategy exposes a price offset such as tick size, that parameter must
be present in its default parameters, UI labels, saved-parameter merge, and
screening domain. Older saved snapshots are merged over current defaults before
use.

Screening executes in shared eight-candidate interruptible chunks. It yields
once before the heavy loop, at each stage transition, and after each chunk.
Every yield may use the browser cooperative scheduler but must still cross a
zero-delay timer-task boundary so prioritized continuations cannot starve React
commits or browser paint. It retains only the best result per strategy under
one explicit scalar objective. The current registry must produce exactly
37,131 candidates; changing a domain requires updating the explicit coverage
test and documentation.
Objective comparison and tie-breaking belong in the shared screening module,
not the UI. A candidate/observe-only presentation label may explain evidence
quality but must not alter ranking. Tests enforce registry coverage, uniqueness,
the exhaustive count, objective ordering, best-result sorting, progress
completion, cancellation, and exact screening-card/application equality.
Generate each target from the complete loaded history so persistent state is
not reset by an arbitrary warm-up boundary, then restrict only performance
calculation to the selected range. If the complete target is already active
before the boundary, initialize exposure at the first selected open. Cache
complete targets only for retained finalists; do not retain every candidate
array.

Strategy plans use optional Strategy A and Strategy B selections. Both
selectors accept the complete registry, but a dual plan must contain two
different, non-equivalent strategy IDs. Equivalent strategy families are
declared in the registry rather than inferred from display names. Catalog
horizon metadata is descriptive and must not filter pair eligibility. For a
dual plan, summarize each selected-range target
by average active-run length. The longer average becomes the relative
long-cycle gate; ties prefer fewer target transitions and then Strategy A.
Use an event-driven state machine: a relative-long entry establishes its
allocation, an already-active relative-short signal is not inherited, a later
fresh relative-short entry adds its allocation, its exit removes that layer,
and a relative-long exit clears every active layer. Validate both allocations
in `[0, 1]` and require their sum not to exceed one.

Unified screening must reuse one selected objective, candidate domain, and
tie-breaking contract for both result groups. First evaluate the complete
unfiltered parameter grid. Only strategies listed in the explicit
trend/breakout/momentum EMA family continue to the filter stage, and only their
top 30 compact unfiltered results are compared under EMA(5), EMA(6), EMA(7),
and EMA(8) at a fixed 0% threshold. Channel BreakOut and Price Channel belong
to this family; reversal and candlestick strategies do not. Retain exactly one
unique final winner per strategy. Combination screening is always enabled:
enumerate every unordered pair of non-equivalent strategy winners without
catalog-horizon filtering. Rank once at reference A=60% and B=40%, retain every
pair up to the 4,096 safety bound, and replay A=40%/B=60%. With 34 strategies
and two equivalent ID pairs excluded, the current catalog creates
`choose(34, 2) - 2 = 559` pairs. If both winners have the same EMA, retain that
shared plan filter; otherwise replay the pair without a shared filter because
the plan schema has one filter field. Final presentation is a separate
bounded view: keep one best result per unordered strategy-ID pair, then sort
and truncate globally. Allowed dual targets must produce only 0%, 40%, 60%,
or 100% holdings, and each result must disclose the derived relative-long
slot.

Windowed screening belongs in
`screening-validation.ts` as wrappers around unified screening. Do not fork
parameter domains, objectives, tie-breakers, or combination construction. A
period selector must run the complete optimizer on its one trailing window; its
128-session default shares one constant and one bidirectionally synchronized
range with the strategy lab. A range selector must run the same optimizer on
one custom start/end interval. A rolling selector must form its retained pool
over one configured total interval, replay that pool in every fixed-width
calendar window, convert each window to tied percentile ranks, and average the
window ranks equally. Generate signals from complete earlier history for causal
indicator and opening-position continuity, but count no performance before the
active boundary. The balanced score uses only current-window return, Sharpe,
and drawdown; trade count is presentation evidence only. None of these modes
uses training/test terminology or claims an independent holdout. Period and
rolling shortlist order may use their explicit aggregate score; range order
uses its custom-interval objective.

Post-screening recommendation logic belongs in `strategy-shortlist.ts`, not in
the UI and not inside either optimizer. Merge the already-ranked standalone and
combination results only after screening completes. Preserve the selected
objective for the primary candidate. Deputy selection may use empirical
equity-return correlation, but independence is a gate rather than a display
label: every deputy must have measurable maximum correlation below 0.75 and
must share no strategy component with the recommendations already selected.
Apply the quality/diversity score only inside that eligible set so a poor
result cannot win only because it is different. High-overlap candidates may be
shown as same-family alternatives but must never receive a deputy role; an
unfilled deputy slot must remain explicitly unfilled. Recent monitoring must
be computed after the shortlist is fixed and must not feed back into
historical ranking. Label it as descriptive
evidence, require a minimum recent execution sample, and never present it as
out-of-sample proof.
The partial-allocation engine executes close-confirmed target changes at the
next open and accepts aligned causal intrabar execution sequences for
price-order changes. One strategy may produce an entry and a conservative exit
on the same bar. Across different strategies, order touched entry prices from
lower to higher, then touched exit prices from higher to lower; equal prices
process the relative-long layer first. It acts only on a changed planned state, applies costs to the
transition, and reports rebalances rather than claiming completed round-trip
win statistics.
It must not generate maintenance trades merely because market movement drifts
the actual weight away from the planned percentage. Tests cover role validation,
target alignment, prefix invariance, staged four-phase progress, cancellation,
costs, unchanged-state behavior, and range-end liquidation.

Trade annotations are derived from completed `BacktestTrade` or
`AllocationRebalance` records by pure mapping helpers. Every entry/increase is
an entry-side marker and every strategy exit/reduction is an exit-side marker.
The mapping helper assigns exactly one visible action from `open`, `short-buy`,
`short-sell`, or `close`; chart components never join multiple event labels or
infer trades from indicator lines. Combination timelines attach explicit
relative-long/short entry and exit events to actual rebalances. When the
relative-long gate closes an active short layer, retain both exit events on the
single final fill but show one close action.
Range-end valuation exits remain part of backtest metrics but use a separate
neutral marker so they cannot be mistaken for strategy-generated sells.

Current-bar guidance is a pure projection over the shared strategy
registry. Target strategies compare the newest desired position with the prior
one. Price-order strategies replay their existing entry/exit stop plan through
the newest OHLC range. Guidance must expose action (`buy`, `sell`, `hold`, or
`wait`), resulting long-only position, execution mode, and the current
entry/exit condition prices when the strategy has causal price orders. An
untouched condition must not be presented as a fill. Wall-clock time must not
change the strategy's execution contract. Mixed-timing definitions may also
publish a pending next-open action; Greedy documents that the next open's gap
branch can override the completed-candle direction.

Daily completion is provider-normalized metadata, not a component clock check.
Adapters set `MarketSeries.latestBarStatus` through the shared session resolver.
Close-derived guidance freezes only the newest target while status is
in-progress or unknown; price-order replay remains active because its levels
were derived from prior completed data.

Device-local market history uses one shared IndexedDB adapter. Keys include
provider, provider symbol, and interval. Components may display a validated hit
immediately, but must continue the authoritative network refresh and may merge
only identical source/interval/adjustment series. Cache failures are a
documented network fallback, not a data-source fallback.

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

The strategy lab owns draft selections and the lab backtest. The trend chart,
markers, and latest guidance own a cloned applied plan. Only the explicit Apply
boundary, a screening-result row, or a saved-shortcut row updates the applied
plan; ordinary draft edits must not leak into the chart.

Strategy-lab and screening entry-filter drafts are separate UI state. A
completed screening result is a last-run snapshot and retains the filter used
for that run. Applying a result copies that filter into both lab and applied
plans; subsequent lab edits must not mutate or clear the screening snapshot.

The browser workspace is daily-only and holds one index, ETF, or commodity
quote proxy at a time.
Provider/API types may keep intraday support, but adding an interval back to
the UI is a product-contract change, not an incidental adapter change.

## Saved record

Saved product records use a shared input/record type, pure boundary validation,
an authenticated API route, and a D1 table. Every query includes the owner key.
The instrument identity is limited to the same index/ETF/commodity types
accepted by the market layer. Text boundaries that originate in market
metadata must reuse the market-layer constants; saved instruments accept the
same 256-character provider-resolved name boundary instead of defining a
shorter persistence-only limit. New rows store nullable-compatible full
strategy plan JSON alongside legacy primary-strategy columns; legacy rows derive a
single full-allocation Strategy A plan when read. Current JSON stores explicit
Strategy A/B selections and allocations. Older long/short and core/maximum
JSON converts to the generic A/B shape at the validation boundary without a
table migration. A single selection is normalized to 100% at the same
boundary. The optional validated moving-average-slope filter is stored inside
the existing plan JSON, so missing legacy values mean disabled and require no
table migration. A nullable indicator-configuration JSON column stores only the
ordered indicators visible at save time and their exact validated parameters;
legacy null values become an empty collection. Each POST inserts a new
snapshot; the owner/provider/provider-symbol
index is non-unique so one instrument can keep multiple strategies. UI
components consume API records and do not access D1
bindings directly. Shortcut labels use the stored interval for provenance. A
legacy non-daily record remains non-mutating metadata: opening it keeps the
workspace daily and shows that the selected setup is recalculated on daily
bars. Stored dates and metrics remain creation-time provenance, but the
workspace does not use them as a second active range. Opening a shortcut keeps
the shared range, and the active instrument's shortcut returns are derived
from saved plans and costs over that range. Do not display a stale numeric
return for an inactive instrument whose history is not loaded.

## UI copy

Chinese user-facing strings live in `app/i18n/zh-CN.ts`. Business logic,
internal errors, identifiers, and tests remain English. Provider-defined field
values may retain their source language when required for parsing.
