# Module Patterns

## Multi-strategy plan slots

- Extend multi-leg behavior through the shared `StrategySlot`/`STRATEGY_SLOTS` A–I contract. Persistence, archive keys, shortlist membership, display, and execution must traverse the same ordered slots while accepting missing trailing legacy slots.
- Keep execution semantics dependent on strategy count: one leg is direct, two legs retain core/tactical hierarchy, and three-to-nine legs produce one weighted-consensus decision. Multi-leg weights must be finite, positive, and sum to one.
- Discover four-through-nine-leg candidates by bounded forward expansion from retained winners of the preceding count. Do not enumerate every catalog tuple. Optimize allocations only after reference-allocation finalists are retained. Keep search breadth separate from presentation diversity: retain up to 20 intermediate candidates per Strategy A primary at every three-through-nine-leg level, then rank all completed candidates and cap only the final displayed category at five per primary and 30 total.

## Explicit multi-range validation

- Add modes to the shared `ScreeningValidationConfig` discriminated union so UI, Worker protocol, archives, and calculation code stay aligned.
- Never concatenate disjoint market ranges. Replay frozen candidates in each normalized range, rank within each range, then aggregate equal-weight normalized ranks.
- Keep visible equity/performance from one real interval and store cross-period evidence in `screeningValidation` and the validation report.
- Persist only user configuration in browser storage; results and market data retain their existing persistence boundaries.

## Long-only TradingView community strategies

- Register every port in `community/strategies.ts`, `strategies.ts`, `screening.ts`, the community catalog, localization, and coverage tests.
- A port may emit only `0` and `1`; source short/reversal states become exits. Close-derived transitions use the shared next-open executor, and visual offsets are omitted from calculations.
- Every parameter requires a finite screening domain and localized label. Prefix-causality and long-only target tests apply to the complete registry.

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
in `lib/market/commodities.ts` and use deterministic Eastmoney continuous
identifiers with explicit exchange identities.

Proxy-preferred local sources use `lib/market/local-relay.ts` and
`scripts/market-relay.mjs`. The relay must bind only to loopback, accept only
allowlisted HTTPS provider hosts and paths, forward only non-sensitive request
headers, and never receive proxy configuration inside Worker code. The Windows
launcher keeps one runtime-port registry for the application and relay and
reconciles both on every path, including reuse of an already ready application.
Development mode may use only the fixed loopback default; production requires
an explicit binding. Runtime lifecycle checks must probe health first, map a
listener to its owning process, verify the exact current-checkout command and
role arguments before stopping it, wait for release, and never stop another
checkout or unrelated listener.
One-shot local migration commands retain their normal exit-code contract. A
process-tree recovery is allowed only after Wrangler emits the exact no-pending
migrations terminal message and then exceeds a short exit grace period. A
generic timeout must fail startup rather than assume migration success.

Canonical orchestration belongs in `lib/market/canonical.ts`,
`series.ts`, `quality.ts`, `canonical-cache.ts`, `source-health.ts`, and
`shortcut-refresh.ts`. Every instrument has one
primary definition. Prefer Yahoo only when the instrument already carries an
exact Yahoo symbol or the shared Yahoo mapping boundary can derive one
deterministically; never guess an unsupported exchange suffix. Source snapshots
and references remain isolated by provider and mode. A completed canonical bar
is immutable. Only the unconfirmed final bar may be replaced, and only missing
or later dates may be appended. Every backup definition declares either
`verified-identity` or `overlap-required`. Identity-verified sources may recover
an empty chart; overlap-required sources need sufficient matching dates and
bounded OHLC error. Neither path may rewrite a confirmed date. Rejected
candidates remain provider-isolated. Retain a bounded 31-day attempt sample
list in addition to lifetime counters. Source choice uses 7/30-day windows,
minimum observations, quality gates, persistent demotion, hourly configured-
primary probes, and seven-day restoration hysteresis; it must never rank a
provider from a key's presence alone. Credentialed sources are recovered
sequentially and normally excluded from background audits. Explicitly approved
commodity fallbacks may receive a 30-minute active-instrument audit; an invalid
credential is cooled down for 24 hours in the current page session so a reload
can validate a rotated key.
History may be HTTP cached; current refresh remains uncached. A one-bar quote
source may update only an unconfirmed same-day bar or append a newer bar in the
active in-memory view after identity, date, OHLC, and relative-price validation.
Keep the canonical base in a separate reference and never persist the temporary
bar. Retain the newest accepted quote separately and revalidate it against the
canonical base when a later request produces no replacement. Prefer a no-key
quote probe before quota-bearing recovery sources when both are needed to
render a current session. A credentialed quote-only fallback with a small
allowance must be last, skipped after an earlier valid quote, excluded from
routine audits and effective-primary selection, and protected by a provider-day
quota gate. The Juhe implementation uses Shanghai calendar days, a hard maximum
of 50, and optional same-day external-usage offset metadata. Its in-process
counter is a conservative client guard; the upstream provider remains
authoritative across server restarts.

Refresh orchestration belongs at the workspace boundary, not in provider
adapters. Use `resolveMarketAutoRefreshPolicy` for venue-local session timing,
apply one shared minimum-attempt timestamp to timers, focus, and visibility,
and require `document.visibilityState === "visible"`. Try ordered backups
immediately after a primary failure. Increment the 15/30/60-minute global
backoff only when the complete chain fails, and clear it after any accepted
primary, promoted backup, or valid temporary quote. Whole-shortcut refresh is
triggered by both the manual header action and automatic active-market refresh
updates. It is sequential by unique canonical instrument, progress-reporting,
cooldown-protected, and consumes each queued automatic request version once.

Commodity providers must preserve the canonical instrument code even when the
upstream symbol differs. Spot, CFD, and continuous-futures mappings are always
`overlap-required`; they cannot recover an empty chart or rewrite confirmed
history. Current gold mappings are Yahoo `GC=F`, FMP `GCUSD`, AllTick `GOLD`,
and Eastmoney `101.GC00Y`.

Normalize safe provider failure states through
`lib/market/provider-errors.ts`. Never return upstream bodies, keys, request
URLs containing keys, or authorization headers to the browser. Keep invalid or
expired credentials, access/entitlement denial, quota limitation, missing
configuration, and generic upstream failures distinct; only the first state is
shown as a credential warning.

`MARKET_DATA_PROVIDERS` in `lib/market/types.ts` is the runtime and compile-time
provider registry. API validators and archive parsers must derive provider
membership from that constant instead of maintaining parallel string lists.

Published provider allowances belong in `.env.example`, `SECRETS.md`, and
`DATA_SOURCES.md`, with the access date and official source. Treat those values
as documented free/starter baselines, not inferred account entitlement. Never
probe an unused key solely to discover its plan. Add a runtime quota counter
only when the implemented path consumes a small known bucket; larger or
dashboard-dependent plans continue to rely on ordered recovery, cooldown, and
provider 429 classification.

Canonical cache identity is instrument plus interval, not the current primary
provider. A deliberate primary-policy change may reuse a same-instrument locked
record or qualifying legacy cache as the existing seed. Current-primary writes
remain strict, so an old-provider seed is never relabeled as a successful new
primary before the new source actually responds.

Exchange resolution is shared through `lib/market/exchanges.ts`. A provider
market bucket is not necessarily an exchange: Eastmoney market `100`, for
example, contains multiple global indexes and must be resolved by index code.
Unknown codes stay `OTHER` rather than being assigned a false venue.

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
All-shortcut refresh must de-duplicate canonical keys, process inactive
instruments sequentially, update canonical storage and shortcut calculations,
never switch the visible instrument, and preserve a pending automatic request
until it can run after an active pass or cooldown.

## Indicator

Indicators are pure, bar-aligned functions. Warm-up entries are `null`; values
must never be shifted backward or use future bars.

Repeated rolling high/low windows must use the shared monotonic-queue helper in
`indicators.ts`. Channel and Ichimoku-style calculations must remain linear in
bar count rather than allocating and rescanning a slice at every bar. Preserve
the same inclusive window boundary and aligned `null` warm-up contract.

Display metadata belongs in the shared indicator registry. The registry owns
stable IDs, categories, main-chart versus lower-pane placement, defaults,
minimums, and input steps. It contains no localized text and no chart styling. UI controls
and chart calculations consume the same registry entry so a displayed setting
cannot drift from the formula input.

The UI keeps focused state separate from ordered-visible and favorite state. Focus selects
which indicator's independent settings are edited; ordered visibility selects
what the chart renders and preserves display order; favorites only control the
shortcut strip. All indicators are hidden by default. A favorite or category
menu click focuses and toggles the same indicator; the focused
hidden style must remain visually distinct from the visible style. Hiding an
indicator does not reset its settings. Validated per-indicator settings,
visibility, and favorites are device-local preferences. Overlay definitions render on the
price axes. Every visible pane definition receives its own lower pane. Price,
volume, and all indicator panes share the same zoom contract. Build legend
names from each visible indicator's actual parameters, leave VWAP/OBV
parameter-free, use a scrolling legend, and reserve top space so it cannot
cover the price plot.

When a formula gains a backward-compatible parameter, add it to the registry
and fill absent stored keys from registry defaults while still rejecting
unknown keys. Indicator panes are exclusively user-controlled: applying a
strategy, applying a screening result, or opening a saved shortcut must not
add, remove, reorder, or reconfigure visible indicators.

Pivot-derived studies must not backpaint. A pivot may be calculated only when
its configured right-side confirmation bars exist, and its level begins at the
confirmation index. Later break markers compare a completed close with the
already-known carried level.

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

Production screening executes inside `screening.worker.ts`, reached only
through the typed protocol and `screening-worker-client.ts`. The main thread
sends serializable bars/settings/configuration, receives progress and result
messages, and terminates the worker after result, error, or cancellation. The
core optimizer keeps cooperative yields for non-Worker/test callers. Run-local
indicator, target, and order caches belong inside the worker lifetime; never
persist or reload a completed result as an optimization cache. The current
registry must produce exactly
45,196 candidates; changing a domain requires updating the explicit coverage
test and documentation.
Objective comparison and tie-breaking belong in the shared screening module,
not the UI. A candidate/observe-only presentation label may explain evidence
quality but must not alter ranking. Tests enforce registry coverage, uniqueness,
the exhaustive count, objective ordering, best-result sorting, progress
completion, cancellation, and exact screening-card/application equality.
Combination screening retains the top three final parameter sets per strategy,
evaluates all nine parameter crossings per non-equivalent strategy-ID pair,
and keeps one best crossing per pair before allocation replay. Do not collapse
to the standalone winner before pairing.
Generate each target from the complete loaded history so persistent state is
not reset by an arbitrary warm-up boundary, then restrict only performance
calculation to the selected range. If the complete target is already active
before the boundary, inherit exposure at the first selected open without a
transaction or cost. At the range end, mark open units to the close without a
forced trade. Cache complete targets only for retained finalists inside the
current run; do not retain every candidate array. When a strategy exposes
`buildOrders`, screening must build that order series once and derive the
executed target from it; do not also build a close target that the hybrid
execution path will discard.

Strategy plans use optional Strategy A through Strategy E selections. Every
selector accepts the complete registry, and every selected pair must
contain different, non-equivalent strategy IDs. Equivalent strategy families are
declared in the registry rather than inferred from display names. Catalog
horizon metadata is descriptive and must not filter combination eligibility.
For two legs, summarize selected-range targets by average active-run length and
retain the established core/tactical event-driven state machine. For three to
five legs, normalize positive allocations as judgment weights and drive one
binary portfolio state with strict-majority plus 60% weighted confirmation for
entry, and 40% weighted support or insufficient active-count confirmation for
exit. Hold the prior state between thresholds. Do not translate individual leg
changes into partial portfolio rebalances.

Unified screening must reuse one selected objective, candidate domain, and
tie-breaking contract for both result groups. First evaluate the complete
unfiltered parameter grid. Only strategies listed in the explicit
trend/breakout/momentum EMA family continue to the filter stage, and only their
top 60 compact unfiltered results are compared under EMA(5), EMA(6), EMA(7),
and EMA(8) at a fixed 0% threshold. Channel BreakOut and Price Channel belong
to this family; reversal and candlestick strategies do not. Retain exactly one
winner per strategy for standard display, but retain the top three final
parameter sets per strategy for pairing. Rolling screening may retain the best
ten per strategy for window aggregation before collapsing the displayed list
to one per strategy. Combination screening is always enabled: evaluate all
nine parameter crossings for every unordered non-equivalent strategy-ID pair
without catalog-horizon filtering, keep the best crossing per pair, and retain
every pair up to the
4,096 safety bound, then compare 50/50, 60/40, 40/60, 70/30, and 30/70. With 57 strategies
and two equivalent ID pairs excluded, the current catalog creates
`choose(57, 2) - 2 = 1,594` unique strategy-ID pairs. Store and replay
`strategyAEntryFilter` and `strategyBEntryFilter` independently, including
mixed filtered/unfiltered and different-EMA legs. Final presentation is a separate
bounded view: keep one best result per unordered strategy-ID pair, then sort
and truncate globally. Allowed dual targets must produce only 0%, 30%, 40%,
50%, 60%, 70%, or 100% holdings, and each result must disclose the derived relative-long
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
indicator and opening-position continuity, but count no performance or
synthetic boundary transaction before the active boundary. The balanced score uses only current-window return, Sharpe,
and drawdown; trade count is presentation evidence only. None of these modes
uses training/test terminology or claims an independent holdout. Period and
rolling shortlist order may use their explicit aggregate score; range order
uses its custom-interval objective.

Screening progress presentation must use
`resolveScreeningProgressBarState(...)` rather than reconstructing validation
phases in the component. The shared scale contains six optimizer segments and
one additional segment for each rolling selection window. Period, range, and
rolling completion must always resolve to equal value and maximum.

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
costs, unchanged-state behavior, inherited opening state, and range-end
mark-to-market without liquidation.

Trade annotations are derived from completed `BacktestTrade` or
`AllocationRebalance` records by pure mapping helpers. Every entry/increase is
an entry-side marker and every strategy exit/reduction is an exit-side marker.
The mapping helper assigns exactly one visible action from `open`, `short-buy`,
`short-sell`, or `close`; chart components never join multiple event labels or
infer trades from indicator lines. Combination timelines attach explicit
relative-long/short entry and exit events to actual rebalances. When the
relative-long gate closes an active short layer, retain both exit events on the
single final fill but show one close action.
There is no synthetic range-end exit. An ending open position affects final
equity through mark-to-market only and creates no trade, rebalance, marker, or
cost.

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
If a flat price-order strategy touches its causal entry while the entry filter
is false, replay the order once without the filter only to identify the blocked
condition. Keep the actual action and position unchanged, expose a separate
blocked flag, and never report the hypothetical fill as an executed trade.

Daily completion is provider-normalized metadata, not a component clock check.
Adapters set `MarketSeries.latestBarStatus` through the shared session resolver.
Close-derived guidance freezes only the newest target while status is
in-progress or unknown; price-order replay remains active because its levels
were derived from prior completed data.

Device-local market history uses one shared IndexedDB adapter. Keys include
canonical instrument or provider snapshot identity plus interval and mode.
Components may display a validated canonical hit immediately, but must
continue the primary refresh. Canonical series, source snapshots, reference
snapshots, fingerprints, and health records use separate stores. The legacy
provider/symbol cache is accepted only for controlled same-instrument
migration, including an explicit configured-primary policy change. Cache
failures are a documented storage fallback, not permission to change the
canonical source.

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

The browser workspace holds one index, ETF, or commodity quote proxy at a time
and exposes only daily and provider-native one-minute research tabs. An
interval change is a market-state boundary: abort screening, clear the active
series and exact range, then load the interval-keyed cache. Keep indicator and
applied-strategy selections so they can be recalculated on the selected bars.
Do not add resampled or additional minute controls incidentally through an
adapter change.

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
legacy null values become an empty collection. Before insert, POST compares the
owner's existing records by canonical instrument, interval, complete plan,
range, initial cash, and costs. A match is updated in place (so
indicator-only changes replace); otherwise a new snapshot is inserted. The
owner/provider/provider-symbol index is non-unique so one instrument can keep
multiple materially different strategies. UI
components consume API records and do not access D1
bindings directly. Shortcut labels use the stored interval for provenance. A
stored one-minute record switches the workspace to one-minute mode;
unsupported legacy intervals fall back to daily. Stored dates and metrics
remain creation-time provenance, but the
workspace does not use them as a second active range. Active or successfully
background-refreshed shortcut instruments instead replay every daily saved
plan over the latest 128 trading sessions. Persist the resulting return, but
do not derive, append, or backfill shortcut ranks during refresh or screening.
The shortcut return display uses the current
calculation when available, then the stored rolling return, and finally the
creation-time return. Chart
indicator focus and visibility never participate in this selection. This keeps
inactive-instrument shortcuts informative while keeping all strategies in one
canonical instrument comparable over the same fixed window.

Shortcut folders use a normalized owner-scoped table with fixed `instrument`
and `strategy` scopes. Instrument folders use the root context; strategy
folders use one canonical instrument key. Saved rows hold nullable foreign
keys. Every assignment validates owner, scope, and context. Deleting a folder
unfiles its contents with `SET NULL`; it never cascades into saved records.
Reordering stays inside the current folder section.

Screening audit records use a parallel shared boundary in
`screening-runs.ts`, `/api/screening-runs`, and the `screening_runs` D1 table.
All route handlers must resolve the owner through `app/api/owner.ts`; do not
duplicate host/email fallback logic. Archive rows are compact provenance:
canonical market source, optional temporary-quote provider/date/fetched time,
adjustment, fetched time, last bar, bar count, SHA-256 fingerprint,
mode/configuration, objective, settings, retained candidates, and validation
summary. Never store full equity/trade/rebalance arrays, and never
use archived candidates as calculation input. Retention is owner-isolated and
canonical-instrument scoped: order by creation time and ID, keep the newest six,
and permanently prune every older row on both read and write boundaries.

## Community analysis intake

Community Pine inputs use one catalog-plus-port pattern. Provenance and known
differences belong in `community/catalog.ts`; indicator IDs/defaults belong in
`community/registry.ts`; pure indicator formulas belong in
`community/indicators.ts`; strategy targets/defaults belong in
`community/strategies.ts`; finite screening domains remain in `screening.ts`.
Main registries only spread the community collections. Never add a community
formula directly to a React component or duplicate its ID list in the main
registry. Tests must prove catalog/registry agreement, bar alignment, and input
prefix invariance. See `COMMUNITY_IMPORTS.md` for the complete intake contract.

Recursive Pine ports preserve explicit prior-state variables and initialize
them from the same first available series values. Visual displacement is never
used as calculation input. Volume profiles distribute volume by price overlap,
return aligned developing POC/VAH/VAL series, and keep the latest histogram as
separate display data. Event-anchored indicators use a persisted absolute
timestamp parameter with `kind: "datetime"`; bars-back anchors are forbidden
because appending data would move the anchor and rewrite history.

## UI copy

Chinese user-facing strings live in `app/i18n/zh-CN.ts`. Business logic,
internal errors, identifiers, and tests remain English. Provider-defined field
values may retain their source language when required for parsing.
## Multi-leg strategy plan pattern

Represent each selected strategy as a stable `strategyA` through `strategyE`
leg with its own selection, judgment weight, entry filter, target, and order
fills. Target generation branches within the shared `StrategyAllocationPlan`
contract: one leg is direct, two legs use hierarchical allocation, and three to
five legs use weighted consensus. Persistence, live guidance, chart indicators,
and shortcut display must consume that same contract without treating 3–5 leg
weights as independent tradable sleeves.

Preserve legacy JSON by keeping trailing Strategy C–E fields optional and
omitting them when absent. Candidate identity must include the complete sorted
strategy-ID set, parameters, per-leg filters, allocations, and tactical mode.
Equivalent strategy families remain invalid in every pairwise comparison.

Triple search must be staged from retained pair parents rather than enumerate
the cubic raw parameter grid. Keep reference-triple selection and allocation
replay interruptible, bounded, and progress-reporting. Pair and triple results
share one presentation pool but de-duplicate only within the same complete
component set.

Comprehensive assessment is post-screening evidence aggregation. It may consume
the diversified shortlist and shared live-guidance outputs, but it must not
modify candidate scores, rankings, backtests, or validation reports.
