# Decisions

## D-001: Independent product implementation

Use TradingView only as a product reference. Do not redistribute its library
files or copy protected Pine scripts.

## D-002: Provider adapter boundary

Use Eastmoney first, Yahoo Finance for broader discovery/history, and Nasdaq
for supported daily-history fallback. Keep all formats isolated behind
`lib/market/` and preserve a shorter valid series if longer-history sources
fail.

## D-003: Hybrid target and price-order fills

Close-derived target signals are generated from completed bars and execute at
the next bar open. Strategies that predefine stop prices from completed-bar
data may keep those orders active inside the following bar. A touched stop
fills at its stop price; a gap crossing the stop fills at the bar open. A rule
whose condition is defined exclusively by the observed active open may execute
at that open. This preserves no-look-ahead behavior while avoiding a one-bar
delay for causal price and open events. Commission and slippage apply on both
entry and exit.

The manual-history workspace, screening, applied chart, stability analysis,
and saved metrics use this hybrid contract. Combination allocation changes use
a deterministic conservative daily path when multiple causal prices touch:
entry prices lower-to-higher, then exit prices higher-to-lower, with the
relative-long layer first at an equal price.

## D-004: Bounded client-side parameter optimization

Generate constrained parameter grids for every registered strategy and allow
at most 2,500 combinations per strategy. If a grid is larger, sample it
deterministically across the full ordered range while retaining the default
parameters. Run the current search in small asynchronous browser chunks, expose
progress and cancellation, and retain only the best result for each strategy.
Move execution to a Web Worker or durable queue when jobs become concurrent,
durable, or materially more CPU-intensive.

## D-005: Index and ETF product scope

Search, defaults, UI labels, examples, and traceability data include only
indexes and ETFs. Provider results classified as individual equities are
discarded before reaching the browser.

## D-006: Independent indicator and strategy catalog

Implement common formulas and strategy rules independently. Do not claim or
attempt a verbatim copy of TradingView's proprietary/community Pine catalog.
Keep every built-in formula deterministic, bar-aligned, and covered by catalog
tests.

The completeness boundary is the 20-entry official built-in-strategy support
directory checked on 2026-07-24. Free community scripts are dynamic,
author-owned, and not a finite catalog. Five templates with auditable
stop-price rules use the shared price-order contract. Templates that rely on
pyramiding, multi-order brackets, lower-timeframe Bar Magnifier data, or
TradingView's Technical Ratings implementation remain documented independent
equivalents rather than execution-identical clones.

## D-007: Long-only execution

Represent close-derived desired position as `0` or `1`; execute a changed
target at the next bar open. For price-order strategies, map the reference long
stop to entry and the reference short stop to a long exit. Never open a short
position. Apply slippage and commission on entry and exit. Derive displayed buy
and sell points only from the resulting completed long trades.

## D-008: Durable saved backtest shortcuts

Persist saved index/ETF backtests in D1 instead of browser storage. Use the
authenticated ChatGPT email as the owner key and include it in every query.
Keep every explicit save as a separate owner-scoped snapshot. Index the owner,
provider, and instrument columns for retrieval without making them unique, so
one instrument can retain multiple strategy plans. A shortcut
restores the instrument, strategy, parameters, date range, capital, commission,
and slippage; the current UI remains daily. Displayed metrics remain a saved
summary while the current chart recalculates from current market data.
Always label a shortcut with its stored interval. If that provenance is
non-daily, disclose that opening retains the daily workspace and recalculates
the selected setup on daily bars.

For one-click local Windows use, retain the same D1 schema and owner-scoped
queries but map unauthenticated loopback requests to
`local@quantscope.invalid`. Persist the local D1 database under
`.wrangler/state`. This local identity is accepted only for `localhost` and
`127.0.0.1`; non-loopback hosted requests still require injected
authentication. Exclude `.wrangler` from the local Vite file watcher: a
saved-backtest write is application data, not source code, and must not reload
the page or discard completed in-memory screening results.

Place the Save current strategy action inside the shortcut panel where the
record appears. Do not duplicate the same save action in the lower strategy
lab. Store the ordered visible indicator configurations in the same saved
snapshot as the strategy plan. Opening a shortcut restores those IDs and exact
parameters. Use a nullable JSON column so existing rows remain valid and map a
missing value to no visible indicators.

Single-strategy plans always use full allocation. The persisted plan parser
normalizes older partial single-strategy JSON to 100%; partial 40/60 allocation
is meaningful only when both Strategy A and Strategy B are selected.

Keep the shortcut collection bounded to 200 rows and present it as a scrollable
set of collapsed instrument disclosures rather than pages. Canonicalize known
provider symbol aliases so one instrument owns one group. Persist the complete
owner-visible order in an explicit `display_order` column; do not overload
`updated_at`, because reordering is presentation state and must not change the
saved snapshot's update provenance. Support both native drag-and-drop and
Up/Down keyboard movement.

## D-009: Dynamic-bar strategy guidance

Return full history with one-hour HTTP freshness and one-day
`stale-while-revalidate`, then fetch a separate `no-store` window of recent
bars on page open, manual refresh, every 60 seconds while visible, and whenever
the page regains focus or visibility. The API permits up to ten latest bars and
the current UI requests five. Merge matching bar times idempotently only when
history and latest share source, interval, and price-adjustment mode. If source
or adjustment mode changes, retain the complete compatible history until a
full compatible refresh succeeds.
Evaluate the provider's newest bar immediately, even when it is still forming,
and label the result as a preview that can change before close.

Reuse the same strategy registry and execution contract for guidance and
historical backtests. Price-order guidance exposes the current entry and exit
condition prices and labels a touched condition as same-bar execution.
Close-confirmed guidance remains a following-open instruction. Distinguish a
range-end valuation close from a genuine sell marker. Wall-clock time does not
change either execution contract.

## D-010: Daily-only manual product boundary

Present one index or ETF at a time at a fixed daily interval. Do not expose
intraday interval controls in the current UI. Keep interval support in provider
adapters, the market API, and persistence types for internal compatibility, but
treat any return of interval selection as an explicit product decision.

The application supports manual decisions only. Browser refresh timers,
backtests, stability diagnostics, and parameter screening do not place trades
or constitute scheduled server jobs.

## D-011: Dividend/split-aware normalized price series

Set `MarketSeries.priceAdjustment` on every provider result and treat it as the
authoritative UI label. Eastmoney requests `fqt=1` and is marked
`corporate-action-adjusted`. For Yahoo daily data, scale each bar's OHLC by a
finite positive `adjclose / raw close`; when a parsed bar lacks a valid factor,
leave that bar raw and mark the whole series `raw`. Keep Yahoo intraday raw
internally and mark Nasdaq as a raw daily fallback. Never rescale provider
volume. For an all-adjusted Yahoo parse, scale provider previous close by the
first accepted factor. After slicing, use the immediately preceding normalized
bar as previous close when available; raw/mixed fallback remains raw.

Feed the same normalized `MarketBar[]` to chart history, indicators, strategy
price lines, latest guidance, stability, and backtests. For ETFs, this prevents
mechanical distribution/split gaps from becoming ordinary analysis signals
where adjusted data is available. For indexes, it records a provider-adjusted
price series whose symbol/methodology may be a price index or a total-return
index; QuantScope does not convert between those methodologies or process
constituent operating-company events and fundamentals. It does not implement
separate cash distributions, cash yield, reinvestment, exchange-rate handling,
or multi-asset alignment.

## D-012: Diagnostic-only local stability

Build nearby parameter sets from the existing constrained screening domains.
Require exactly the registered keys, finite values within each domain's
minimum/maximum, integer values for shared lookback/count/vote keys, and all
cross-field constraints. Keep price and oscillator level thresholds decimal-
capable. Reuse the same integer-key rule in workspace inputs, rounding and
clamping those values to at least one before storage. Invalid parameters return
no nearby sets and do not run a backtest. For a valid base, change one field at
a time to the immediately lower or higher configured value and report facts;
never rank, select, or apply a nearby set.

Require at least 120 daily observations inside the current backtest range, two
completed base trades, and one valid nearby variant before a stable/sensitive
label is allowed. Otherwise show insufficient evidence with explicit reasons
and keep any factual nearby/regime output available. With sufficient evidence,
use inclusive thresholds: at least 75% of variants share the base return sign,
the return range is at most 15 percentage points, and worst drawdown is no more
than 10 points below base. Classify regimes with the current 60-day SMA and its
20-bar slope; earlier bars may remain only for causal warm-up. This label is
not predictive or a substitute for out-of-sample validation.

## D-013: Indicator collection and strategy price references

Keep the focused indicator separate from the ordered-visible collection and
retain independent settings for every indicator. Start with all indicators
hidden. A toolbar click focuses and toggles that indicator, while a focused
hidden button remains visually distinct from a visible one. Persist validated
focus, visibility, and parameter values as device-local display preferences.
Render overlays on the main price axes and allocate one lower pane per visible
pane indicator. Share zoom across price, volume, and every pane. Build every
parameterized legend name from its actual settings, keep VWAP/OBV
parameter-free, and use a scrolling legend with reserved top clearance.

Calculate strategy price references through a pure, bar-aligned contract.
Price-order strategies must reuse their actual order plans. Render returned
references as dashed lines on the main price axes; return no lines for a rule
without a continuous price reference. Technical Ratings exposes the same
EMA-20 and SMA-50 used by its price votes. These visuals do not infer or
execute trades.

## D-014: Explicit horizons and two-layer strategy combinations

Classify every strategy explicitly as `long` or `short` in the shared registry.
The label describes intended signal duration while all current analysis remains
daily-only. Do not infer the label from tuned parameters or observed holding
period because either would make the taxonomy asset- and sample-dependent.

Combine horizons as a gate and a second allocation layer, not as equal votes.
A plan may omit either horizon. A long-only plan switches between zero and A;
a short-only plan switches between zero and B. With both selected, a flat long
target produces zero. A new long entry establishes A without inheriting a short
signal that was already active. Only a later fresh short entry adds B; its
paired exit removes B, and a long exit clears the complete position. Default
lab values are A=60% and B=40%; each allocation is bounded to `[0, 1]` and
their sum may not exceed one.

Avoid the full parameter Cartesian product. One screening action owns the
objective, parameter cap, progress, and cancellation for standalone and
combination outputs. First retain the best two standalone parameter sets for
every strategy; expose the first as that strategy's only standalone result and
keep the second for internal combination diversity. Rank their long-by-short
product once at reference A=60% and B=40%, retain up to 1,024 parameter pairs,
then run complete allocation backtests for `(0%,40%)`, `(0%,60%)`, `(40%,60%)`,
and `(60%,40%)` on those finalists. These choices keep actual target holdings
at 0%, 40%, 60%, or 100%; A is limited to 0%, 40%, or 60%, and 100% is reached
only through A+B. Keep all three stages interruptible. For each unique
long-strategy/short-strategy ID pair, retain only its best parameter and
allocation result, then keep the best 32 unique pairs globally. The current
two-finalist catalog produces 1,020 parameter pairs, below the cap, so every
retained pair reaches the allocation stage. The search is exhaustive inside
those retained parameters, not across the full cross-strategy parameter
Cartesian product.

Screening builds every target from complete loaded history and uses the
selected range only for performance so persistent strategy state cannot reset
at a fixed warm-up boundary. Applying a result restores both
strategies, both parameter sets, A, and B, then projects both reference sets
and allocation markers to the main chart. Allocation rebalances occur only on
planned-state transitions, never merely to correct market-driven weight drift.
They retain long/short event attribution; a long exit also emits a short exit
if that layer was active, while the chart shows one close marker.
Close-confirmed targets rebalance at the following open and causal price-order
targets may rebalance on the touched bar.

Persist current plans with explicit `longAllocation` and `shortAllocation`.
Read prior core/maximum plan JSON as `A = core` and
`B = maximum - core`; the existing JSON column requires no table migration.

## D-015: Commodity futures quote proxies

Add `commodity` to normalized asset types while continuing to reject individual
equities. Accept Yahoo `FUTURE` search results and keep a deterministic catalog
for gold (`GC=F`), silver (`SI=F`), crude oil (`CL=F`), and copper (`HG=F`).
Use Yahoo as the only history source for these symbols and do not pass them to
the Nasdaq fallback.

Treat these as continuous quote-page research proxies, not a futures execution
ledger. Do not model a contract chain, roll rule, back-adjustment method,
multiplier, margin, expiry, delivery, or leverage. Disclose that boundary in
the UI and documentation.

## D-016: Date-bounded daily history

Request daily history from 2000-01-01 rather than approximating the desired
window with a small bar count or a five-year provider range. Keep one shared
10,000-bar daily safety cap, translate the date boundary to Eastmoney `beg`,
Yahoo `period1`/`period2`, and Nasdaq `fromdate`/`todate`, and retain the
existing smaller intraday caps. Latest refreshes remain separate five-bar
uncached requests.

If the preferred Eastmoney result starts after January 2000, attempt Yahoo and
use whichever valid series is longer. Preserve the existing source and
price-adjustment merge boundary: never splice providers together. Instruments
listed after 2000 naturally start at their first provider-available bar.

## D-017: Arbitrary pairs with relative-horizon roles

Supersede D-014's fixed long-catalog-by-short-catalog pairing boundary while
retaining its hierarchical execution rule. Strategy A and Strategy B may each
use any different registered strategy. Fixed horizon metadata remains
descriptive for the standalone catalog and does not determine pair
eligibility.

For every dual plan, build both long/flat targets and measure them over the
selected backtest range. The target with the longer average active run becomes
the relative long-cycle gate. If averages tie, prefer fewer target transitions;
if both measures tie, use Strategy A. Display these derived roles in the manual
lab and each screening row, and recalculate them when dates or parameters
change.

Keep event-driven hierarchy rather than independent sleeves. A fresh
relative-long entry establishes its assigned 40% or 60% allocation without
inheriting an already-active relative-short signal. A later fresh
relative-short entry adds the other allocation, its exit removes that layer,
and the relative-long exit clears both. Close-confirmed changes execute at the
following daily open, while causal price orders follow D-003.

Retain two standalone parameter finalists per strategy. Enumerate every
unordered pair of non-equivalent strategy IDs and the Cartesian product of
their finalists. Registry-declared equivalence keeps mathematically identical
signals available as standalone choices without pairing them together. For 34
strategies and two equivalent ID pairs this is
`(choose(34, 2) - 2) * 2 * 2 = 2,236` parameter pairs, so keep a safety bound
of 4,096. Rank pairs first at
A=60%/B=40%, then replay A=40%/B=60%. Keep one best result per unordered
strategy-ID pair and up to 32 presentation rows.

Persist new plans with `strategyA`, `strategyB`, `strategyAAllocation`, and
`strategyBAllocation`. Convert existing long/short and core/maximum JSON at the
read boundary; no D1 table migration is required.

## D-018: Full-history signal state and result identity

Build every strategy target over the complete loaded bar history. Apply the
selected start/end dates only when calculating trades, equity, and performance.
Do not truncate signal construction to a fixed warm-up prefix: sticky
long/flat state can persist longer than any arbitrary lookback.

When complete-history state is already long immediately before the selected
start, initialize that selected-range simulation at the first bar's open. Do
not wait for a later transition, and do not import pre-range profit or loss.

During unified screening, build a candidate's complete target once for its
standalone evaluation. Retain the complete target only when that candidate is
one of the two finalists for its strategy; discard non-finalist arrays. Reuse
the bounded finalist cache for pair and allocation stages.

Treat exact result identity as a regression contract. Reapplying a standalone
screening row with the same history, parameters, dates, costs, and execution
policy must deep-equal the row's backtest. Rebuilding a combination plan must
produce the same metrics and rebalance records as its screening card.

## D-019: Explicit close-confirmed and causal-trigger strategy variants

Do not silently change a close-confirmed strategy into a touched-price rule.
Keep Donchian Close Breakout and Supertrend Close Confirmation as following-open
strategies, and register separate Donchian Intrabar and Supertrend Stop variants
whose levels come from completed bars.

Greedy is a mixed-timing rule: a gap condition is known at the active open and
executes there, while candle direction is confirmed only after the bar closes
and executes at the following open. The candle-body filter applies only to the
candle condition, never to the gap.

Parabolic SAR exposes its projected stop and pre-trigger direction before the
active bar. A high/low touch reverses its long-only order state inside that bar;
the strategy wrapper must not add a second close-confirmation delay. Direct
backtests, combination replay, and live guidance resolve all open and stop
instructions through one shared stateful execution helper.

Daily OHLC cannot establish the order of two touched stops. For one flat
strategy whose entry and exit are both touched, use the conservative
entry-then-exit sequence. Across different strategies, use the same
lower-to-higher entry then higher-to-lower exit ordering rather than discarding
causal fills.

Greedy guidance must expose a qualifying completed-candle direction as pending
for the next open. The active open's opposite qualifying gap remains higher
priority and may replace that pending direction.

## D-020: Conservative daily completion status

Use provider regular-session end metadata when available and documented
exchange closes otherwise. Treat an unknown same-date session as unknown.
Close-derived live target changes freeze at the preceding state for
in-progress or unknown bars; causal price orders from prior completed data
remain active.

## D-021: Device-local shortcut history cache

Store normalized provider/symbol/interval histories in IndexedDB for responsive
saved-shortcut opens. Bound retention to 32 series without an age expiry,
display a hit with its last successful write time immediately, and always
continue the full network refresh. The cache is processed convenience state,
not a raw archive or source of record.

## D-022: Draft versus applied strategy plans

Keep the strategy lab's editable plan and backtest separate from the trend
chart's applied plan. Only explicit Apply, a screening-result action, or a
saved-shortcut action may update chart strategy lines, markers, and live
guidance. Save current strategy persists the applied plan and matching applied
metrics, not later draft edits.

## D-023: Optional normalized moving-average-slope entry filter

Offer one shared, optional right-side entry filter for SMA, EMA, or WMA with a
period of at least two sessions and a finite minimum slope. Store the enabled
filter inside the existing strategy-plan JSON and treat omission as disabled.
Keep the control disabled by default while presetting EMA(7) and 0% per
session.

Calculate slope as `(MA[t] / MA[t-1] - 1) * 100`, not a raw price-unit
difference. Apply it only when a strategy is flat and requests a new long
entry. A blocked target may enter later if the strategy still wants long and
the slope becomes eligible; a later ineligible slope never exits an existing
position. Close-confirmed entries use the completed signal bar and execute at
the following open. Intrabar and open-trigger entries use the preceding
completed bar so no active-bar close is observed early.

Use the same filter in strategy-lab backtests, stability diagnostics,
standalone and combination screening, result application, chart guidance, and
saved-shortcut restoration. Keep lab and screening drafts independent, and
freeze the screening filter as part of each last-run result snapshot. The
strategy lab filter remains a user-selected rule. D-024 supersedes the
one-click screening treatment of its EMA period.

## D-024: Bounded period sample and fixed EMA screening range

The period-sample range decision remains active. D-026 supersedes the
parameter cap, EMA period range, finalist count, and combination construction
in this section.

Replace three weighted trailing windows with one adjustable period-sample
window. Default it to 128 sessions and reuse the same constant when a newly
loaded instrument initializes the strategy-lab start date. Optimize on all
available history before that window, freeze candidates, rank inside the
window, and replay retained candidates over the complete lab range only for
display parity.

Cap each strategy's own parameter grid at 120 sets with no higher UI or API
path. When the one-click right-side filter is enabled, compare only EMA(6),
EMA(7), and EMA(8), all at a fixed 0% minimum normalized slope. Retain
finalists separately per filter period and combine only finalists from the same
period. Store the winning filter in each standalone or combination result so
applying it remains exactly reproducible in the strategy lab.

## D-025: One live performance range across screening, lab, and shortcuts

Use the strategy-lab start/end dates as the calendar representation of one
shared trading-session range, with the period-sample session input as its count
representation. Synchronize both directions against actual loaded bars.
Changing the session count derives a trailing range from the current end date;
changing either date normalizes to trading bars and derives the count. When the
instrument changes, retain the session count and derive dates from the new
instrument instead of restoring a shortcut's creation-time dates.

Keep range-validation selection/test evidence and rolling-fold evidence
independent from presentation. After those ranks are fixed, replay retained
candidates over the shared range for result tables, shortlist cards, and lab
application. Recalculate active-instrument shortcut returns from saved plans
and saved costs over the same range without rewriting durable record
provenance. Do not show an inactive instrument's stored numeric return as if it
used the current range.

## D-026: Exhaustive parameters, family-scoped EMA5-8, and automatic winner combinations

Remove the one-click per-strategy parameter limit and its UI control. Production
screening must traverse all 37,131 valid finite combinations in the registry.
Test-only candidate injection remains allowed for fast deterministic tests but
must not alter the production domain.

Evaluate the complete parameter grid without an entry filter first. Only
explicitly listed trend, breakout, and momentum strategies continue to the
filter phase; the list must include Channel BreakOut and Price Channel. For
each eligible strategy, retain compact metrics for its top 30 unfiltered
parameter sets and compare those sets under EMA(5), EMA(6), EMA(7), and EMA(8)
at a 0% slope. The no-filter result remains eligible to win. Reversal and
candlestick families must not receive an automatic EMA context.

Retain one unique final winner per strategy. Combination screening is always
enabled and has no checkbox: enumerate all unordered non-equivalent pairs of
those winners, rank the 60%/40% allocation, and replay 40%/60% for retained
pairs. With 34 strategies and two excluded equivalent-ID pairs this is 559
pairs, which is below the 4,096 safety bound. If two winners chose the same EMA
the pair may retain that shared filter; otherwise replay it without a shared
EMA because the current plan schema has only one filter field.

## D-027: Same-canonical shortcut reuse and optional licensed EODHD fallback

Treat a saved shortcut as a plan restore when its canonical instrument and
daily interval match the current successful non-empty series. Preserve that
exact price series even when the saved provider alias differs, and restore
only strategy, parameters, indicators, metrics, and markers. Reload market data
only for a different canonical instrument or when no usable current series
exists.

Add EODHD behind the existing `lib/market/` adapter contract as an optional
licensed daily index/ETF fallback. Enable it only with the server-side
`EODHD_API_TOKEN`, place it before Yahoo/Nasdaq in the daily index/ETF fallback
chain, retry one transient failure, use all-or-nothing adjusted OHLC, and never
send commodity proxies to it. Public providers remain available when the token
is absent; this improves resilience but does not guarantee uninterrupted data.

## D-028: Recent-adaptive window screening without training/test stages

Supersede D-024's pre-window optimization rule and D-025's
range/rolling holdout-display contract. The product owner accepts unavoidable
parameter-selection overfit and intends to rerun screening weekly or every few
weeks, so the primary objective is recent configured-window performance.

Period mode runs the complete parameter, EMA Top-30, combination, and
allocation workflow only on its configured N-session window. Range mode does
the same over one custom start/end interval and has no separate training,
selection, or test stage. Rolling mode forms its retained candidate pool over
one custom total interval, advances a fixed-width calendar window by one year,
converts each window's objective order to tied percentile ranks, and averages
all window ranks equally. These are in-sample selection modes and must not be
labelled as out-of-sample validation.

Continue building indicators, targets, and opening position state from all
available earlier bars so a window boundary represents a continuously running
strategy. Exclude every pre-window transaction and metric from the active
objective. Balanced score is
`0.45 * currentWindowReturn + 8 * clamp(currentWindowSharpe, -5, 5) +
0.35 * currentWindowMaxDrawdown`. Trade count remains visible and continues to
control candidate/observe-only presentation, but it never changes the score.
