# Technical Research

## 2026-08-21 resumable screening checkpoints

### Sources

- MDN IndexedDB API, checked 2026-08-21: IndexedDB is available inside Web
  Workers and stores structured-clone-compatible objects.
  <https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API>
- MDN structured clone algorithm, checked 2026-08-21: the same clone model is
  used by Worker messages and IndexedDB, including arrays, plain objects, and
  maps, but not functions.
  <https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm>

### Compared approaches

1. Save only UI progress and completed display rows. This is small and simple,
   but cannot resume optimization because the next stage needs retained target
   arrays, order fills, wide discovery finalists, and stage-specific settings.
2. Save an optimizer checkpoint in IndexedDB from the screening Worker. This
   can resume from the last atomic stage boundary and keeps large structured
   state off the UI thread, but requires a versioned checkpoint schema, strict
   request/data fingerprint validation, quota/error fallback, and explicit
   stage-transition tests.

### Decision

Use Worker-owned IndexedDB checkpoints for genuine continuation, not a UI-only
progress snapshot. Commit only after a stage is fully complete; never resume a
partial stage. Key compatibility by checkpoint schema version, canonical
instrument, interval, market-data fingerprint, and normalized screening
settings. A new manual run replaces the prior checkpoint, successful completion
removes it after writing the final-result cache, and storage failure falls back
to a normal uninterrupted run. Performance fixes remain independent because a
checkpoint reduces lost work but does not make an oversized stage faster.

## 2026-08-21 Six- through nine-strategy screening boundary

Problem:

- Extending weighted-consensus screening beyond five strategies increases both the strategy-set search space and the risk that an apparently superior in-sample combination was selected by trying more alternatives rather than by adding durable information.
- Positive 10% weights that sum to 100% provide a natural upper bound of ten legs, but a ten-leg plan has only one equal-weight allocation and leaves no room to express relative evidence strength.

Option 1: exhaustively enumerate every six- through nine-strategy set.

- Strengths: can identify the best in-sample result under the tested catalog and objective.
- Limitations: the combination count becomes unsuitable for an interactive browser worker, and evaluating more configurations increases selection-overfitting exposure. Bailey et al.'s Probability of Backtest Overfitting framework specifically treats selection across many tried configurations as a source of false discoveries.

Option 2: continue bounded forward expansion from retained finalists.

- Strengths: reuses the deterministic pair-to-five-stage architecture, cancellation and progress reporting; keeps several parent paths; and constrains latency while still testing every eligible next strategy for each retained parent. Weighted voting remains a standard ensemble mechanism for combining heterogeneous signals.
- Limitations: it is an approximate beam search and can discard a weak lower-order parent that would have become a strong higher-order combination.

Decision:

- Extend bounded forward expansion through six, seven, eight, and nine strategies. Retain the best 30 results independently for each strategy count and replay all positive 10% allocations available at that count: 126, 84, 36, and 9 respectively.
- Stop at nine strategies for now. Nine still permits differentiated weights; ten collapses to a single 10%-per-leg allocation while expanding the opportunity for redundant signals and selection bias.
- Keep the existing weighted-consensus execution rule: extra strategies improve one portfolio judgment and do not create independently traded sleeves. Treat higher in-sample performance as a candidate for multi-range or out-of-sample validation, not proof that adding more strategies will continue to improve results.

Primary references accessed 2026-08-21:

- https://scikit-learn.org/stable/modules/ensemble.html
- https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2326253

## 2026-08-21 Multi-strategy judgment versus independent trading sleeves

Problem:

- The first three-to-five-strategy implementation interpreted each strategy's optimized weight as a separately tradable sleeve. It improved signal diversity but could create a partial rebalance whenever any sleeve changed, conflicting with the product goal that more strategies should improve judgment rather than increase trading frequency.

Option 1: retain independent sleeves.

- Strengths: preserves each strategy's exact position contribution and supports gradual exposure changes.
- Limitations: one strategy transition can cause one portfolio rebalance, so transaction count tends to grow with strategy count.

Option 2: unweighted majority voting.

- Strengths: produces one portfolio decision and is easy to explain.
- Limitations: discards the allocation search's evidence about relative strategy importance and treats a weak finalist the same as a strong one.

Option 3: weighted consensus with entry/exit hysteresis.

- Strengths: uses optimized allocations as judgment weights, requires a strategy-count majority plus at least 60% active weight to enter, exits only below 40% active weight or when support falls below half, and holds the prior decision in the ambiguous band. Individual strategy changes therefore do not trade unless the combined decision changes. Scikit-learn's official ensemble documentation describes majority voting and weighted aggregation as standard ways to balance weaknesses across different estimators.
- Limitations: weights no longer represent independently tradable position slices, and three-to-five-strategy price-order evidence is confirmed through the combined bar state for next-open execution rather than producing per-strategy intrabar fills.

Decision:

- Use option 3 for plans with three through five strategies. The portfolio target is binary (0% or 100%); optimized positive 10% allocations are voting weights. Require strict count majority and 60% weighted support to enter. Exit at 40% or less weighted support, or when fewer than half of the strategies remain active. Hold the prior state between those boundaries.
- Keep single-strategy execution and the existing two-strategy core/tactical allocation behavior unchanged. Three-to-five-strategy candidate allocations need only one execution mode because tactical-sleeve modes are not part of consensus execution.
- The change is reversible at the shared timeline boundary and requires no persistence migration; existing allocation fields become consensus weights when three or more slots are present.

Primary references accessed 2026-08-21:

- https://scikit-learn.org/stable/modules/ensemble.html#voting-classifier
- https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.VotingClassifier.html

## 2026-08-21 Four- and five-strategy screening search

Problem:

- Extending the current 57-strategy search from triples to four- and five-strategy plans makes an exhaustive strategy-set traversal impractical in a browser Worker. There are `C(57, 4) = 395,010` four-strategy sets and `C(57, 5) = 4,187,106` five-strategy sets before parameter, allocation, tactical-mode, and validation-window replay.
- Flexible positive 10% allocations that sum to 100% add 84 allocations for four strategies and 126 allocations for five strategies. The later weighted-consensus decision above removes the redundant tactical-mode duplication for plans with three or more strategies.

Option 1: exhaustive unordered strategy sets and allocations.

- Strengths: evaluates every permitted set and preserves a global optimum under the selected objective.
- Limitations: Python's official `itertools.combinations` documentation confirms that the output count is `n! / (r! * (n-r)!)`; at the current catalog size, multiplying millions of sets by allocation and validation replays is not an acceptable interactive workload.

Option 2: staged forward expansion with bounded finalists.

- Strengths: extends the existing pair-to-triple architecture, preserves deterministic ordering and cancellation, and evaluates every eligible next strategy only for retained parent plans. Scikit-learn documents forward sequential selection as a greedy procedure that repeatedly adds the best next feature under the chosen score; a bounded finalist beam keeps several parents instead of only one, reducing the brittleness of a single greedy path.
- Limitations: it is approximate and cannot guarantee that a weak pair or triple which later becomes an exceptional five-strategy plan survives the parent cutoff.

Option 3: introduce a general combinatorial solver.

- Strengths: Google OR-Tools provides mature constraint, integer, and combinatorial optimization solvers.
- Limitations: QuantScope's objective is produced by a path-dependent backtest with non-linear drawdown, Sharpe, entry filtering, and tactical state. It cannot be expressed as a simple linear or constraint objective without replacing the existing replay semantics, and a new solver would add a large runtime dependency.

Decision:

- Continue the existing deterministic staged forward search: retain bounded triple parents, extend them with every non-equivalent fourth strategy, retain bounded four-strategy finalists, replay all positive 10% four-way judgment weights, then repeat from bounded four-strategy parents for the fifth strategy and five-way weights.
- Keep the top 30 displayed results independently for one, two, three, four, and five strategies. Parent/finalist bounds are implementation controls, not claims of exhaustive four- or five-strategy optimality.
- Keep the generalized A-E plan schema. The later decision above supersedes independent tactical sleeves for three-to-five-strategy plans with one weighted consensus decision.
- The decision is reversible: the stage limits can be increased or a later search backend can replace candidate generation without changing the normalized plan/result contract.

Primary references:

- `https://docs.python.org/3/library/itertools.html#itertools.combinations`
- `https://scikit-learn.org/stable/modules/feature_selection.html#sequential-feature-selection`
- `https://developers.google.com/optimization/introduction`

## 2026-08-20: TradingView ports and explicit multi-range screening

TradingView's current [execution model](https://www.tradingview.com/pine-script-docs/language/execution-model/) executes default strategies on confirmed closes and normally fills market orders at the next bar open. Its [repainting guidance](https://www.tradingview.com/pine-script-docs/concepts/repainting/) distinguishes confirmed close calculations from mutable open-bar values. QuantScope therefore keeps the next-open policy, makes imported pivots visible only on their right-side confirmation bar, and never lets a visual back-offset enter a signal array.

Two port approaches were compared. A literal Pine emulator would reproduce displaced plots, reversals, and a second broker model, but would conflict with the host's long-only and no-backpainting invariants. A registry-based formula-and-signal port preserves causal calculations, translates short reversals to exits, and reuses manual backtests, screening, combinations, guidance, and saved plans. The registry approach was selected. Twenty strategies are now included: the prior seventeen plus HalfTrend, QQE Mod, and Schaff Trend Cycle. Ten missing indicators are registered: the prior Keltner, Donchian, Choppiness, Aroon, and TRIX ports plus HalfTrend, QQE Mod, Schaff Trend Cycle, Session Volume Profile, and Anchored VWAP.

The second comparison pass used the original open-source [HalfTrend by everget](https://www.tradingview.com/script/U1SJ8ubc-HalfTrend/), [QQE MOD by Mihkel00](https://www.tradingview.com/script/TpUW4muw-QQE-MOD/), the classic open-source [Schaff Trend Cycle](https://www.tradingview.com/script/dbxXeuw2-Indicator-Schaff-Trend-Cycle-STC/), an open-source [Session Volume Profile](https://www.tradingview.com/script/uDRS8vr5-Session-Volume-Profile-Open-Source-CantoLab/), and the HLC3-based [Anchored VWAP](https://www.tradingview.com/script/L1tWQjgR-Anchored-VWAP/) as primary references. HalfTrend preserves recursive trend/next-trend extrema state; QQE preserves paired Wilder-length RSI-volatility paths and recursive bands; STC preserves the two stochastic normalization passes. Their bearish states clear long exposure instead of opening shorts. The profile distributes volume by exact bar/bin price overlap, expands value area from POC toward the larger adjacent row, and renders the developing current session. Anchored VWAP uses a persisted explicit date-time input rather than an unstable bars-back anchor. All close-derived transitions retain next-open execution.

Two multi-range approaches were compared. Concatenating disjoint bars is cheap but creates false adjacency, contaminates indicator and position state across gaps, and produces an invalid continuous equity curve. Independent interval replay preserves real preceding history. QuantScope now builds a bounded pool on the encompassing history, replays every retained candidate in each explicit interval, normalizes objective ranks per interval, and averages ranks equally. The latest interval supplies coherent visible metrics/equity, while the validation report stores every interval and aggregate statistics. At least two non-overlapping intervals with three bars each are required; the UI allows up to eight and persists mode and dates locally.

Research date: 2026-07-24.

Additional research date: 2026-07-25.

## Charting

### Option A: TradingView Advanced Charts

TradingView documents 13+ chart types and 100+ indicators, but requires
applications to provide their own datafeed. Its integration library does not
support Pine Script, Strategy Tester, Bar Replay, or TradingView market data.
The library also has distribution and attribution conditions.

Sources:

- https://www.tradingview.com/charting-library-docs/latest/getting_started/
- https://www.tradingview.com/charting-library-docs/latest/resources/Frequently-Asked-Questions/
- https://www.tradingview.com/charting-library-docs/latest/ui_elements/indicators/

### Option B: Apache ECharts

ECharts supports candlesticks, lines, bars, multiple grids, connected axes, and
data zoom. It is Apache-licensed, npm-distributed, and works with a custom
strategy UI.

Sources:

- https://echarts.apache.org/en/api.html
- https://echarts.apache.org/handbook/en/concepts/axis/
- https://apache.github.io/echarts-handbook/en/concepts/dataset/

Decision: use ECharts. It provides the required rendering primitives without
implying access to TradingView-only scripting or strategy features.

### Slider zoom interaction

ECharts exposes two relevant slider interaction modes. With `brushSelect`
enabled, dragging the slider background selects a new range and the selected
fill is intentionally silent; moving the existing range is then limited to the
narrow move control. With `brushSelect: false`, ECharts makes the selected fill
the draggable move zone while retaining the two handles for resizing.

Sources:

- https://echarts.apache.org/en/option.html#dataZoom-slider.brushSelect
- https://github.com/apache/echarts/blob/master/src/component/dataZoom/SliderZoomView.ts

Decision: disable brush selection for the price-chart slider, enlarge the
timeline to 22 pixels, and make the handles visually explicit. This matches the
expected timeline behavior: drag the selected range to pan and drag its edges
to change the visible period.

## Market data

### Option A: Eastmoney website endpoints

AKShare documents Eastmoney-backed daily and intraday interfaces and identifies
the corresponding Eastmoney quote pages. Direct website endpoints require no
private token and returned current index and ETF daily/minute data during the
research check.

Source:

- https://github.com/akfamily/akshare/blob/main/docs/data/stock/stock.md

Risk: no public endpoint SLA or commercial-use guarantee.

### Option B: Yahoo Finance chart and search endpoints

Yahoo provides broad global symbol discovery and multiple chart intervals
without an application key. It returned multi-year SOX and N225 daily history
during research, but the chart endpoint can reject some regional or automated
clients with HTTP 403.

Sources:

- https://finance.yahoo.com/quote/%5ESOX/history/
- https://finance.yahoo.com/quote/%5EN225/history/

### Option C: Nasdaq historical endpoint

Nasdaq's website endpoint returned 1,254 SOX daily rows and daily history for
supported US indexes and ETFs. It does not replace a general intraday feed and
does not cover every global index.

Sources:

- https://www.nasdaq.com/market-activity/index/sox/historical
- https://www.nasdaq.com/market-activity/etf/spy/historical

### Option D: Tushare Pro

Tushare publishes stock/index daily and minute interfaces, but access is gated
by accounts and point tiers; index daily access is documented at a 2,000-point
threshold.

Sources:

- https://tushare.pro/document/1?doc_id=108
- https://tushare.pro/document/1?doc_id=234

Decision: use Eastmoney first, Yahoo for broader discovery/history, and Nasdaq
as a supported daily-history fallback. Preserve a shorter Eastmoney response if
both longer-history sources fail. Recommend an exchange-licensed global feed
for production.

### Dividend and split normalization

#### Option A: raw prices plus explicit distribution/split events

An event-aware portfolio engine can keep raw prices, process splits and cash
distributions separately, reset/warm indicators around discontinuities, and
credit or reinvest distributions. QuantConnect documents this explicit model,
including split-aware indicator handling and dividend reinvestment.

Source:

- https://www.quantconnect.com/docs/v2/writing-algorithms/securities/asset-classes/us-equity/corporate-actions

This is the richer ETF accounting approach, but it requires event histories,
cash-ledger rules, and provider-consistent instrument mapping that the current
manual index/ETF/commodity chart workspace does not have. Operating-company
fundamentals and events remain outside the product scope.

#### Option B: one adjusted price series

TradingView documents dividend-adjusted chart data as a way to remove the
price reduction caused by a distribution from the visible history. A
consistently adjusted OHLC series also prevents indicators and rules from
reacting mechanically to a distribution or split discontinuity.

Source:

- https://www.tradingview.com/support/solutions/43000590597-how-to-adjust-data-for-dividends/

Decision: use the provider's adjusted Eastmoney daily output (`fqt=1`) and
scale each Yahoo daily OHLC bar by a validated finite positive
`adjclose / raw close`. If any parsed Yahoo daily factor is missing or invalid,
keep that bar raw and mark the entire result raw. Keep Yahoo intraday raw
internally and Nasdaq raw as the daily fallback. Never rescale volume.
`MarketSeries.priceAdjustment` is the UI authority. For ETFs, the intent is a
distribution/split-adjusted price history. For indexes, it is the provider's
price-index or total-return-index methodology; the adapter does not convert
one methodology to the other or process constituent-company events and
fundamentals. The shared normalized bars do not constitute separate
cash-distribution accounting or a synthetic total-return ledger.

## Backtesting

### Option A: browser-local TypeScript engine

Benefits: no second runtime, immediate parameter feedback, Cloudflare
compatibility, and straightforward deterministic tests. Cost: fewer
institutional execution models and slower very-large searches.

### Option B: Python engine

Backtesting.py supports commission, spread, exclusive orders, and configurable
close execution. vectorbt supports vectorized signals, fees, slippage, and
large parameter grids.

Sources:

- https://kernc.github.io/backtesting.py/doc/backtesting/backtesting.html
- https://vectorbt.dev/api/portfolio/

Decision: keep the transparent TypeScript engine for deterministic local
simulation and immediate chart integration. Move to a queued Python service
for durable multi-user jobs, walk-forward studies, or materially larger search
spaces.

### Stop-order execution

Option A converts every strategy condition into a close-derived target and
fills the change at the next open. It is simple and remains appropriate for
market orders created after a completed bar, but it delays strategies whose
orders were already resting at predefined breakout prices.

Option B adds a typed, bar-aligned stop-order plan beside the existing target
contract. It keeps one deterministic engine and lets a price order created from
completed-bar data fill inside the following OHLC bar. TradingView documents
that predefined stop orders can fill partway through a bar, and that a stop
crossed in the gap between bars fills at the current open.

Option C is a full broker-emulator event queue with persistent order IDs,
cancel/replace behavior, pyramiding, bracket groups, and lower-timeframe Bar
Magnifier data. It can reproduce more complex templates, but materially expands
state, data, and test requirements.

Sources:

- https://www.tradingview.com/pine-script-docs/concepts/strategies/
- https://www.tradingview.com/pine-script-docs/faq/strategies/
- https://www.tradingview.com/support/solutions/43000599828-channel-breakout-strategy/
- https://www.tradingview.com/support/solutions/43000601862-price-channel-strategy/
- https://www.tradingview.com/support/solutions/43000599890-volty-expan-close-strategy/

Decision: use Option B for Channel BreakOut, Momentum, Pivot Reversal, Price
Channel, and Volty Expan Close. Retain Option A for close-derived strategies.
Long-side stops open a position and reference short-side stops close it. Use the
open for gap fills, do not exit and re-enter on the same bar, and reserve Option
C for Greedy-style pyramiding and bracket fidelity.

## Parameter optimization

### Multi-horizon hierarchical strategy combinations

Research distinguishes slow and fast trend signals rather than treating every
indicator as an equal vote. Slow signals tend to retain persistent moves but
react later, while fast signals react earlier and produce more false changes.
The momentum-turning-point research reports that the intersection of slow and
fast signal directions contains information, which supports making the slow
signal the regime gate and using the fast signal only inside that gate.

Sources:

- https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3489539
- https://www.aqr.com/Insights/Research/Alternative-Thinking/Should-Your-Portfolio-Protection-Work-Fast-or-Slow

Three implementation approaches were considered:

1. Treat long and short rules as equal votes.
   This is simple but allows a fast rule to open exposure when the slow trend
   is flat and does not express the requested hierarchy.
2. Require both rules to be long and otherwise hold cash.
   This creates a strict intersection but lets every fast false negative remove
   the long-horizon core position.
3. Use the long rule as an exposure gate and let the short rule select a core
   or full allocation inside the gate.
   This preserves the hierarchy and keeps some exposure through short
   pullbacks.

Decision: use approach 3. The combined target is 0% when the long rule is flat,
a configurable core allocation (60% by default) when the long rule is long and
the short rule is flat, and 100% when both are long. The allocation is not
automatically optimized.

For parameter search, a full Cartesian product of all long and short parameter
sets is impractical and increases selection bias. Backtesting.py documents
constrained grid search, absolute evaluation caps, deterministic seeds, and
partial position closing, while its examples explicitly warn about
overfitting.

Sources:

- https://kernc.github.io/backtesting.py/doc/backtesting/backtesting.html
- https://kernc.github.io/backtesting.py/doc/examples/Parameter%20Heatmap%20%26%20Optimization.html

Decision: retain two standalone parameter finalists per registered strategy,
then evaluate the bounded Cartesian product of long-horizon and short-horizon
finalists. Reuse the current scalar objective, deterministic tie-breaks,
chunked progress, and cancellation. All combined targets execute from the
prior completed daily bar at the next open.

### Option A: constrained exhaustive grid with a hard cap

Backtesting.py's official optimization interface supports grid search,
cross-parameter constraints, and an absolute `max_tries` boundary. Its heatmap
example also exposes parameter combinations for sensitivity analysis. This
approach is reproducible and easy to audit, but runtime grows with the grid.

Sources:

- https://kernc.github.io/backtesting.py/doc/backtesting/backtesting.html
- https://kernc.github.io/backtesting.py/doc/examples/Parameter%20Heatmap%20%26%20Optimization.html

### Option B: randomized or model-based search

Randomized search can cover a large space with fewer evaluations, while
model-based optimization can prioritize promising regions. Both reduce
evaluation count but make the selected sample less transparent and require
seed, convergence, and exploration-policy controls before results are
reproducible.

### Browser execution approaches

A single uninterrupted main-thread search is simple but blocks rendering and
input. MDN defines browser long tasks as uninterrupted main-thread work of at
least 50 milliseconds and recommends splitting work into smaller tasks or
using workers for expensive computation.

Sources:

- https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongTaskTiming
- https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Performance/JavaScript

Decision: use constrained deterministic grids with a user-configurable hard
cap of 2,500 combinations per strategy. The current default spaces expand to
32,518 valid combinations across 34 strategies. Spaces smaller than the cap
are evaluated completely; larger spaces are sampled evenly while preserving
the default parameters. Execute small asynchronous chunks, report progress,
allow cancellation, and retain only the best full result per strategy. Use a
Web Worker or durable queue if measured job duration or concurrent usage
outgrows this browser-local design.

### Optimization objective selection

Approach A is a selectable scalar objective. Backtesting.py accepts either a
named result metric or a custom numeric function and always maximizes the
result, which produces one deterministic best parameter set that can be
applied directly.

Approach B is true multi-objective optimization. Optuna represents this with
multiple optimization directions and returns Pareto-front trials. This
preserves trade-offs without arbitrary weights, but it yields a set of
non-dominated answers rather than the single ranking required by the current
one-click Apply workflow.

Sources:

- https://kernc.github.io/backtesting.py/doc/backtesting/backtesting.html
- https://optuna.readthedocs.io/en/stable/reference/generated/optuna.study.create_study.html
- https://optuna.readthedocs.io/en/stable/reference/visualization/generated/optuna.visualization.plot_pareto_front.html

Decision: expose five scalar targets: the existing balanced score, total return
divided by absolute drawdown, total return, maximum drawdown closest to zero,
and Sharpe ratio. Every target uses the same deterministic tie-break chain.
Reserve a Pareto-front view for a future workflow where the user chooses among
multiple trade-off candidates instead of applying rank one immediately.

### Nearby-parameter stability

#### Option A: choose the best local parameter

Rerunning nearby values and applying the highest historical return is simple,
but it turns a sensitivity check into another in-sample optimizer. QuantConnect
warns that parameter choices which perform very well historically yet are
sensitive to small value changes are a form of overfitting; it also recommends
testing selected parameters on recent out-of-sample history or using
walk-forward optimization.

Source:

- https://www.quantconnect.com/docs/v2/writing-algorithms/optimization/parameters

#### Option B: report local sensitivity without selection

Perturb one parameter at a time to the immediately adjacent values already
defined by the constrained screening domain, omit invalid combinations, and
compare the resulting backtests with the unchanged base rule. This is bounded,
deterministic, and transparent, but it is only a local diagnostic and does not
estimate future performance.

Decision: use Option B. Report nearby return-sign agreement and the return,
drawdown, and trade-count ranges across the base and valid variants. Require at
least one valid variant. Label a rule stable only when at least 75% of valid
variants share the base return sign, the total-return range is no wider than 15
percentage points, and the worst drawdown is no more than 10 percentage points
below the base drawdown. Also report current-rule returns under up, sideways,
and down regimes classified without future data from a 60-day SMA and its
20-bar slope. Never select or apply a parameter from this diagnostic.

## TradingView strategy reference boundary

TradingView's official built-in-strategy support directory listed 20 templates
on 2026-07-24:

1. BarUpDn Strategy
2. Bollinger Bands Strategy
3. Bollinger Bands Strategy Directed
4. Channel BreakOut Strategy
5. Consecutive Up/Down Strategy
6. Greedy Strategy
7. InSide Bar Strategy
8. Keltner Channels Strategy
9. MACD Strategy
10. Momentum Strategy
11. OutSide Bar Strategy
12. Parabolic SAR Strategy
13. Pivot Extension Strategy
14. Pivot Reversal Strategy
15. Price Channel Strategy
16. RSI Strategy
17. Stochastic Slow Strategy
18. Supertrend Strategy
19. Technical Ratings Strategy
20. Volty Expan Close Strategy

Sources:

- https://www.tradingview.com/support/folders/43000587406-built-in-strategies/
- https://www.tradingview.com/support/solutions/43000599828-channel-breakout-strategy/
- https://www.tradingview.com/support/solutions/43000681749-strategy-report/

The Strategy Report documentation distinguishes built-in strategies from free
community strategies. Community scripts are an open-ended, user-published
collection with independent licensing, so "complete" cannot be represented as
a stable finite list. The product therefore implements and catalog-tests all 20
official built-in templates while preserving its 12 existing extended
strategies.

The implementations are independently written, bar-aligned equivalents. The
product uses long-only positions: positive signals buy or hold, while negative
reference signals sell to cash rather than open short positions. Close-derived
signals fill at the next open. Five auditable price-triggered templates use
completed-bar stop plans with OHLC and gap-aware fills. The local engine does
not reproduce pyramiding, multi-order brackets, lower-timeframe Bar Magnifier
fills, or TradingView's private Technical Ratings aggregation exactly.

## Saved backtest persistence

### Option A: browser local storage

The Web Storage API persists data for an origin after the browser closes, but
the record remains device- and browser-local. It is not an authoritative
cross-device store and can be cleared by the user or browser.

Source:

- https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API

### Option B: Cloudflare D1

D1 is a managed serverless SQL database with SQLite semantics and direct Worker
bindings. Prepared statements and bound parameters keep ownership filters and
record mutations explicit. Drizzle provides a D1 driver plus generated SQL
migrations for schema traceability.

Sources:

- https://developers.cloudflare.com/d1/
- https://developers.cloudflare.com/d1/worker-api/prepared-statements/
- https://orm.drizzle.team/docs/get-started/d1-new

Decision: use D1 because saved backtests are user data expected to survive
sessions and devices. Scope every list, upsert, and delete by authenticated
email. Retain one latest snapshot per owner and instrument so the shortcut bar
stays compact.

Update on 2026-07-25: the product requirement now treats the bar as a strategy
library rather than an instrument picker. D1 and owner scoping remain, but the
instrument uniqueness/upsert decision is superseded: each explicit save
inserts a snapshot, and the owner/provider/instrument columns use a non-unique
lookup index so one instrument can retain multiple strategies.

2026-07-25 indicator-state extension: keep general indicator editing
preferences in device-local storage because they are personal display state.
When the user explicitly saves a backtest shortcut, copy only the ordered
visible indicator configurations and exact parameters into a nullable D1 JSON
column beside the strategy plan. This preserves cross-device shortcut fidelity
without turning every parameter keystroke into a database write. Legacy null
values map to an empty visible collection.

## Position-aware strategy plans and commodity proxies

Research date: 2026-07-25.

The allocation representation in this section records the first implemented
core/maximum model. The later **Explicit two-layer position sizing** decision
supersedes that allocation shape while retaining the commodity conclusions.

### Position optimization

#### Option A: bounded discrete allocation ladder

Treat allocation as another explicit strategy parameter and evaluate a small
deterministic ladder. Backtesting.py documents fractional order size between
zero and one as a fraction of available liquidity. Its optimizer supports
exhaustive grid search, admissibility constraints, and an absolute evaluation
limit. These semantics match QuantScope's existing bounded browser optimizer
and next-open allocation engine.

Sources:

- https://kernc.github.io/backtesting.py/doc/backtesting/backtesting.html
- https://kernc.github.io/backtesting.py/doc/examples/Parameter%20Heatmap%20%26%20Optimization.html

Advantages:

- Each result has an immediately executable manual allocation.
- The search is deterministic and the extra evaluation count is known.
- Endpoints have clear meanings: zero core allocation means short-horizon
  timing controls flat/full exposure, while 100% core allocation means the
  long-horizon rule controls exposure and the short rule does not reduce it.

Trade-off: a coarse ladder can miss an in-sample optimum between steps.

#### Option B: continuous or model-based allocation search

Optuna supports categorical and stepped floating-point suggestions and could
search a finer allocation range without exhaustively evaluating every point.
This is useful for expensive or high-dimensional studies, but it adds sampling
behavior and false precision to a manual workflow whose user can only rebalance
approximately.

Source:

- https://optuna.readthedocs.io/en/stable/reference/generated/optuna.trial.Trial.html

Decision: use Option A with core-allocation candidates
`0%, 20%, 40%, 60%, 80%, 100%`. Keep maximum planned allocation fixed at 100%
inside one-click combination screening. The strategy lab separately allows the
user to reduce maximum allocation. Do not optimize maximum allocation because,
without an explicit cash return or risk budget, scaling positive exposure
mostly scales the same return path and does not answer the long-versus-short
control question.

### Commodity market representation

#### Option A: exchange-traded commodity trusts and funds

GLD states that its shares seek to reflect gold bullion less expenses and
trade on NYSE Arca. SLV states that it seeks to track silver bullion and offers
exchange-traded exposure without directly purchasing physical silver. These
products already fit QuantScope's ETF path, adjustment rules, and manual
trade-price interpretation.

Sources:

- https://www.ssga.com/us/en/individual/etfs/spdr-gold-shares-gld
- https://www.ishares.com/us/products/239855/ishares-silver-trust-fund

Advantages:

- Directly tradable through an ordinary securities account.
- Existing adjusted-price and ETF search behavior remains applicable.

Trade-offs:

- Trust expenses, tracking differences, market hours, and premiums or
  discounts mean the chart is not the commodity itself.

#### Option B: commodity futures quote proxies

CME identifies GC as its benchmark gold futures contract and describes
standardized exchange-traded futures. On 2026-07-25, the existing Yahoo website
search returned `GC=F`, `SI=F`, `CL=F`, and `HG=F` as `FUTURE` quotes; its chart
endpoint returned 1,260 daily observations for each requested five-year
window. This reuses the current Yahoo adapter without adding credentials or a
fourth upstream.

Sources:

- https://www.cmegroup.com/markets/metals/precious/gold.contractSpecs.html
- https://query1.finance.yahoo.com/v1/finance/search
- https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF

Advantages:

- A direct commodity-linked price proxy rather than a fund wrapper.
- Gold, silver, crude oil, and copper can share the normalized daily OHLCV
  pipeline.

Trade-offs:

- The public Yahoo website endpoint has no supported data SLA.
- QuantScope does not receive a documented continuous-contract methodology.
- The current cash-allocation backtest does not model contract multipliers,
  margin, expiry, delivery, or roll yield and must not be presented as a real
  futures-account simulation.

Decision: support both paths. Preserve GLD, SLV, and other accepted
exchange-traded products as ETFs. Add `commodity` as an asset type for Yahoo
`FUTURE` results plus a deterministic catalog for `GC=F`, `SI=F`, `CL=F`, and
`HG=F`. Label these records as commodity futures quote proxies and keep their
series-level adjustment metadata authoritative. Do not add spot-price claims,
contract accounting, leverage, or futures margin.

### Commodity discovery

Relying only on remote Yahoo search is small but can return similarly named
equities before the desired futures symbol. A local catalog alone is stable
but would hide other valid Yahoo commodity futures.

Decision: merge both. Search the deterministic commodity catalog first, accept
remote Yahoo `FUTURE` results as `commodity`, de-duplicate through the existing
instrument key, and keep the current equity rejection. Chinese aliases remain
localized UI copy and are canonicalized to English search terms before calling
the search API.

## Explicit two-layer position sizing

Design review date: 2026-07-25.

The requested holding rule has four transitions: the long-horizon buy signal
establishes allocation A, the short-horizon buy signal adds allocation B, the
short-horizon sell signal removes B, and the long-horizon sell signal clears
the complete position. Two representations were compared.

### Option A: store two target levels

The existing plan stores a core target and a maximum target. Allocation B is
implicit as `maximum - core`. This is mathematically sufficient, but it makes
the second buy look like an abstract maximum rather than an independently
chosen layer and encourages legacy sleeve terminology.

### Option B: store two explicit sleeves

Store `longAllocation` as A and `shortAllocation` as B. The combined target is
zero outside the long gate. A fresh long entry establishes A; a later fresh
short entry adds B; the corresponding short exit removes B; and the long exit
clears both layers. A short signal that was already active at the long entry is
not inherited, so the first position is never promoted directly from zero to
A+B. This event-driven representation makes every user action and saved value
directly auditable.

Decision: use Option B. Validate both values in `[0, 1]` and require their sum
not to exceed one. The revised manual-position constraint allows A at 0%, 40%,
or 60% and B at 40% or 60%, while actual dual-plan holdings must remain
0%, 40%, 60%, or 100%. The valid dual choices are therefore `(0%,40%)`,
`(0%,60%)`, `(40%,60%)`, and `(60%,40%)`. A first entry never uses 100%;
full exposure is reachable only when a valid short-entry transition adds B.

Position sizing must be evaluated inside every combination backtest rather
than applied after ranking. Allocation changes alter exposure, commission,
slippage, equity, drawdown, and Sharpe, so the selected optimization objective
cannot be calculated correctly without replaying the A/B target series through
the allocation engine.

The manual allocation engine acts only when the planned state changes. It does
not trade each day to correct weight drift caused by price movement. Daily
recentring creates transactions without a new strategy signal, breaks the
short-buy/short-sell pairing shown to the user, increases costs, and does not
match the intended low-frequency manual workflow.

Two bounded search shapes were compared after chart history expanded. An
exhaustive retained-pair-by-allocation pass preserves the best result inside
the retained parameter set but repeats the allocation replay for every pair.
A three-stage pass first ranks pairs at the default 60%/40% reference and can
bound how many proceed to the remaining allocations. A tight shortlist is
faster but can miss a pair that performs poorly at the reference allocation and
strongly at another allocation. Decision: retain two parameter finalists per
strategy and cap pair finalists at 1,024. The current 15-long by 17-short
catalog yields at most `30 * 34 = 1,020` retained pairs, so the cap preserves
every pair and every allowed allocation while leaving a future safety bound.
The result is exhaustive within retained parameters, not a global optimum over
the full parameter Cartesian product.

The standalone pass and combination pass should not be exposed as separate
actions because the latter already depends on the former. Reuse one objective,
one per-strategy cap, one progress stream, and one cancellation controller.
Return the best standalone result from stage one for each strategy, while
keeping the second finalist internal for combination diversity. In the final
combination list, compare all retained parameters and A/B choices for the same
long-strategy/short-strategy ID pair and expose only the best one. This removes
allocation-driven duplicate rows without reducing the internal search.

This initial design proposed 500 pre-range bars as causal warm-up. D-018
supersedes it because persistent strategy state can outlive any fixed prefix.

Two historical execution choices were compared:

1. prior completed-bar signal at the next open, which is conservative and
   avoids using the completed close as both signal and fill;
2. current dynamic daily signal at the same-day close, which approximates a
   manual tail-session rebalance but can differ from the final official signal.

Decision: close-derived buy, sell, add, and reduce signals execute at the
following bar's open. The later hybrid review supersedes the treatment of
causal predefined price orders: those may execute on the touched bar under
D-003. Wall-clock time does not select an execution model.

Saved JSON uses the explicit A/B fields. Existing plan JSON remains readable
by converting `coreAllocation` to A and
`maximumAllocation - coreAllocation` to B. No D1 table migration is required
because the plan is already stored in a nullable JSON column.

## Daily history beginning in 2000

Research date: 2026-07-25.

The workspace previously requested 1,000 bars, while each provider adapter
retained no more than 1,500 bars and Yahoo daily requests used `range=5y`.
Two expansion approaches were compared.

### Option A: request a larger count only

This is simple for Eastmoney and Nasdaq, but Yahoo's five-year range still
prevents older bars from reaching the adapter. A count also does not express
the product requirement and drifts as calendar time advances.

### Option B: request an explicit start date with a safety cap

Use one shared 2000-01-01 boundary, translate it to provider-specific date
parameters, and retain a 10,000-bar output cap. This expresses the desired
coverage, keeps payload growth bounded, and leaves the existing five-bar
latest refresh unchanged.

Decision: use Option B. Eastmoney receives `beg=20000101`, Yahoo receives
`period1=946684800` plus a current `period2`, and Nasdaq receives
`fromdate=2000-01-01`. Internal intraday requests retain their smaller
provider-supported ranges and 1,500-bar cap.

A live read-only Yahoo N225 request returned 6,627 daily timestamps from
2000-01-04 through 2026-07-24. The Eastmoney endpoint closed the connection in
the current environment during the same read-only check, so deterministic URL
contract tests cover its date and limit parameters while normal runtime
fallback continues to Yahoo. Instruments launched after 2000 begin at their
first provider-available bar.

Sources checked:

- `https://query1.finance.yahoo.com/v8/finance/chart/%5EN225`
- `https://push2his.eastmoney.com/api/qt/stock/kline/get`
- `https://api.nasdaq.com/api/quote/{symbol}/historical`

## Arbitrary two-strategy overlays

Research date: 2026-07-25.

The previous combination model assigned different authority to fixed catalog
groups. The new product requirement keeps the hierarchy but removes the fixed
eligibility boundary: any two distinct registered strategies can be paired,
and the relatively slower signal must become the long-cycle gate.

Three role-resolution approaches were compared.

### Option A: compare parameter names or catalog labels

The largest period-like parameter is easy to calculate, but strategy parameter
names and meanings are not comparable. A 14-bar oscillator, a 3-bar candle
count, and a volatility multiplier cannot be placed reliably on one scale.
Reusing fixed catalog labels would also preserve the restriction the feature
is intended to remove.

### Option B: use realized average signal duration

Build both strategies' existing long/flat targets over the selected backtest
window. Count every active run and divide active bars by active-run count. The
strategy with the longer average active run becomes the relative long-cycle
gate. If averages tie, the strategy with fewer target transitions wins; a
final exact tie resolves deterministically to Strategy A.

Backtrader's official TradeAnalyzer reports position length in bars, including
total, average, maximum, and minimum values. QuantConnect makes an Insight's
expected period explicit and passes combined Alpha signals to Portfolio
Construction. These contracts support treating signal duration as a property
that can be measured separately from target position sizing.

Sources:

- https://www.backtrader.com/docu/analyzers-reference/
- https://www.quantconnect.com/docs/v2/writing-algorithms/algorithm-framework/alpha/key-concepts
- https://www.quantconnect.com/docs/v2/writing-algorithms/algorithm-framework/portfolio-construction/key-concepts

Trade-off: this role is descriptive of the selected historical window, so it
must be displayed and must be recomputed when the date range or parameters
change. It is not a claim that one strategy is intrinsically long-cycle in all
markets.

### Option C: independent sleeves or equal voting

Independent sleeves let either strategy open exposure outside the other
signal. Equal voting or an AND rule removes the requested long-gate/short-layer
relationship. These models are valid for different portfolio designs but do
not match the corrected manual swing rule.

Decision: use Option B for role resolution and retain the hierarchy. A fresh
relative-long entry establishes its assigned allocation without inheriting an
already-active relative-short signal. A later fresh relative-short entry adds
its allocation, its exit removes that layer, and a relative-long exit clears
both layers.

Keep the standalone screening stage unchanged. For combination discovery,
retain two parameter finalists per registered strategy and form every unordered
pair of non-equivalent strategy IDs regardless of catalog horizon. Keep
mathematically identical variants as standalone choices, but do not spend a
pair slot combining the same signal with itself. Evaluate the two manual
full-allocation assignments `(60%,40%)` and `(40%,60%)`. With 34 current
strategies, two finalists each, and two equivalent ID pairs excluded, the
retained parameter-pair count is:

```text
(choose(34, 2) - 2) * 2 * 2 = 2,236
```

Use an internal safety bound of 4,096 so the current catalog remains
exhaustive across retained finalists. Keep only the best parameter/allocation
result for each unordered strategy-ID pair in the presentation list. Strategy
A and Strategy B are stable selector labels; relative long and relative short
are derived roles shown for each result.

Close-confirmed target changes execute at the following daily open and causal
price orders may execute on the touched bar. Ordinary allocation drift still
does not create a maintenance trade. New saved JSON uses strategy A/B fields,
while the data boundary
converts existing long/short plan JSON to the new shape without a database
migration.

## 2026-07-25 hybrid execution and full-history state review

TradingView's official strategy documentation distinguishes market orders
created after bar-close calculation from predefined price orders. A
close-derived market order normally fills on the next available tick, which is
the following bar open in a default historical daily simulation. A stop or
limit order whose price was already known can fill partway through the active
historical bar. TradingView also documents a broker-emulator limitation: daily
OHLC supplies only an assumed intrabar path unless lower-timeframe Bar
Magnifier data is available.

QuantConnect's official stop-market documentation likewise treats the stop as
a trigger, not a guaranteed fill price. A gap can produce a fill worse than the
stop. Its fill-model documentation makes the execution model an explicit
reality-model boundary rather than part of signal calculation.

Primary sources:

- https://www.tradingview.com/pine-script-docs/faq/strategies/
- https://www.tradingview.com/pine-script-docs/concepts/strategies/
- https://www.quantconnect.com/docs/v2/writing-algorithms/trading-and-orders/order-types/stop-market-orders
- https://www.quantconnect.com/docs/v2/writing-algorithms/reality-modeling/trade-fills/supported-models/latest-price-model

Two implementation choices were compared:

1. Convert every signal to a following-open market order. This is conservative
   for manual close-confirmed rules but introduces a full-bar delay for a
   breakout or protective stop that was known and could have been resting
   before the session.
2. Use a typed hybrid contract. Close-confirmed target changes fill at the
   following open; causal entry/exit prices built from prior completed data
   fill on the touched bar, with the active open used after a gap.

Decision: use the typed hybrid contract in direct backtests, stability,
screening, applied charts, combinations, and saved metrics. For multiple
different same-bar stop prices, use a deterministic conservative OHLC path:
process entry stops from lower to higher, then exit stops from higher to lower,
with the relative-long layer first at an identical price. This preserves
causal touched fills without choosing the favorable ordering. Latest guidance
shows the active bar's entry and exit condition prices and never labels an
untouched level as a fill. When one flat strategy's own entry and exit stops
are both touched, use the conservative entry-then-exit sequence; this avoids
selecting the favorable path while preserving the fact that both resting
conditions were reachable.

Signal-state construction is a separate concern from performance-window
selection. A fixed warm-up prefix is adequate for finite-lookback indicators
but not for sticky long/flat strategies whose last transition can be arbitrarily
old. Therefore targets are generated over complete loaded history and only
trades/equity/metrics are date-filtered. A target already active before the
selected start initializes exposure at the first selected open; pre-range P&L
is not imported. To bound memory, only the two retained targets per strategy
are cached for combination replay. Regression tests make screening-card/
application result identity an explicit contract.

## 2026-07-25 causal open and stop strategy review

TradingView's Greedy definition opens its initial direction from a gap between
the active open and the prior bar's high or low. That condition is fully known
at the active open. Candle color is not known until the bar closes. Treating
both branches as one close-derived target incorrectly delays the gap and lets a
candle-body filter block an otherwise valid open event.

TradingView defines Parabolic SAR strategy changes when SAR switches from one
side of price to the other. The projected SAR for the active bar can be derived
from completed state before checking the active high or low. Therefore the
projected value is a causal stop level; waiting for the completed close adds a
different confirmation rule.

Sources:

- https://www.tradingview.com/support/solutions/43000599876-greedy-strategy/
- https://www.tradingview.com/support/solutions/43000645065-parabolic-sar-strategy/
- https://www.tradingview.com/support/solutions/43000754944-mastering-stop-market-orders/

Two implementation choices were compared:

1. Replace the existing Donchian and Supertrend close rules with touched-price
   behavior. This is simpler but breaks saved meaning and silently changes
   every historical result.
2. Preserve the close-confirmed IDs and add explicit causal-trigger variants.
   This makes the execution assumption visible and allows both versions to be
   screened without conflating them.

Decision: use option 2. Add Donchian Intrabar and Supertrend Stop as extended
strategies, keep the prior close-confirmed IDs, execute Greedy gaps at the
observed open while shifting candle-color decisions to the next open, and
execute Parabolic SAR at its projected touched stop. Route all order-state
replay through one shared resolver so direct backtests, combinations, and live
guidance use identical gap and position precedence. Expose the Greedy
completed-candle direction as a pending next-open instruction and explicitly
allow an opposite qualifying open gap to override it.

## 2026-07-26 daily-bar completion and local history-cache review

Official exchange material defines regular cash-market closes rather than one
universal 15:00 boundary. Shanghai closes at 15:00 local time. JPX extended
cash-equity trading to 15:30 from November 5, 2024. Nasdaq regular market hours
end at 16:00 Eastern Time. HKEX's closing-auction documentation uses 16:00 for
a full day and 12:00 for a half day.

Primary sources:

- https://www.sse.com.cn/lawandrules/sselawsrules2025/stocks/exchange/c/c_20260424_10816482.shtml
- https://www.jpx.co.jp/english/equities/trading/strengthening/dreu250000004sar-att/dh3otn000000a8rq.pdf
- https://www.nasdaq.com/docs/nasdaq-global-trading-hours-faqs
- https://www.hkex.com.hk/-/media/HKEX-Market/Services/Trading/Securities/Overview/Trading-Mechanism/Information-Books/Trading-Mechanism-of-CAS-in-the-Securities-Market.pdf

Two completion approaches were compared:

1. Use only a fixed per-exchange regular close. This is available for every
   adapter and is deterministic, but it cannot recognize exchange holidays or
   half days by itself.
2. Use only provider session metadata. This can represent the current session
   precisely, but the field is not available from every provider.

Decision: use provider regular-session end metadata when Yahoo supplies it,
otherwise use the documented exchange close. Treat an unknown same-date
session as unknown and freeze close-confirmed live signals at the preceding
completed state. Past-date bars are complete. This conservative rule can delay
a half-day Eastmoney signal, but it cannot fabricate a completed close.
Prior-completed-bar stop orders remain eligible for same-bar execution.

For device-local history, MDN distinguishes synchronous Web Storage from
asynchronous IndexedDB. Web Storage is intended for smaller key/value data and
can block JavaScript while large values are read or written. IndexedDB stores
significant structured datasets asynchronously and supports indexed,
transactional retention.

Primary sources:

- https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API
- https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB

Two cache approaches were compared:

1. Serialize each full series into `localStorage`. This has a small API surface
   but synchronously parses and writes thousands of bars and has tighter
   practical capacity.
2. Store structured `MarketSeries` records in IndexedDB. This adds a small
   adapter but keeps reads/writes asynchronous and isolates entries by key.

Decision: use IndexedDB for a processed, non-authoritative shortcut cache.
Limit it to 32 series, evict only the oldest surplus records, display a hit
with its last successful write time immediately, and always perform the normal
background history/latest refresh. The original 180-day rejection was removed
because an old, clearly timestamped local preview is more useful than an empty
chart during a network failure. Storage failure falls back to the in-memory
session cache and network path.

## 2026-07-26 primary/deputy strategy shortlist and recent review

Selecting several top backtests without accounting for repeated components or
co-moving equity paths creates a false impression of independent confirmation.
Bailey and Lopez de Prado's Deflated Sharpe Ratio research identifies selection
bias and multiple testing as sources of inflated backtest performance. The
Model Confidence Set literature addresses uncertainty by retaining a
data-dependent set of plausible models rather than asserting that one observed
winner is certainly best.

Primary sources:

- https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2460551
- https://academic.oup.com/jrsssb/advance-article/doi/10.1093/jrsssb/qkag066/8676743

The local `C:\Users\Administrator\Desktop\code\Ni225` project was also reviewed
as a read-only product reference. Its public effectiveness page independently
monitors already-selected strategies over a recent entry-aligned window,
compares them with same-period buy-and-hold, requires at least two executions,
and explicitly avoids claiming that the status proves validity.

Three implementation approaches were compared:

1. Display the first three candidates under the selected objective. This is
   fast and transparent but commonly repeats one strategy component or one
   equity path.
2. Keep the objective winner as primary and select deputies with a bounded
   blend of objective rank, equity-return correlation, and shared-component
   penalties. This remains deterministic, reuses existing result equity, and
   adds negligible work after screening.
3. Add Deflated Sharpe, bootstrap Model Confidence Sets, or a full
   development/holdout re-optimization pass. These are stronger statistical
   research tools but materially increase assumptions, runtime, and UI
   complexity; repeatedly inspecting the holdout would also weaken its
   out-of-sample meaning.

Decision: use option 2 for the manual-swing shortlist. Eligible means positive
return, positive Sharpe, and at least two reported trades. The primary remains
the active-objective winner. Deputy quality rank supplies 68% of the selection
score, positive equity-return diversification supplies 32%, and sharing any
strategy component applies an additional penalty. The exact coefficients are a
transparent product heuristic, not an optimized trading rule.

Add a separate Ni225-inspired monitoring badge after selection: compare the
latest 30 aligned sessions of strategy equity with the instrument, require two
strategy executions inside that window, and require both 30-session and
63-session underperformance plus worse recent drawdown before showing
review-required. Do not use that badge to rerank candidates. It is recent
diagnostic evidence, not prospective or out-of-sample validation. A future
append-only frozen-strategy ledger remains the correct path for genuine live
validation.

## 2026-07-26 market-refresh identity and chart-interaction reliability

Apache ECharts documents periodic data updates through repeated `setOption`
calls and component/data diffing:

- https://echarts.apache.org/handbook/en/how-to/data/dynamic-data/

Inspection of the installed ECharts 6.1 runtime also shows that `TooltipView`
keeps the last pointer coordinates and restores an axis tooltip after a normal
refresh, but that state cannot survive a full `notMerge` component recreation.

Three chart update approaches were compared:

1. Keep `notMerge: true`. This removes stale variable components reliably but
   recreates tooltip and axis-pointer state on every market refresh.
2. Use normal option merging with `replaceMerge` only for the variable grids,
   axes, data zooms, and series. This still removes obsolete panes/series while
   retaining ECharts' interaction components and built-in tooltip restoration.
3. Capture pointer coordinates and manually dispatch `showTip` after every
   update, or force `alwaysShowContent`. This adds custom state and changes
   mouse-leave behavior that the product did not request.

Decision: use option 2 and keep the existing data-zoom restoration. A real
browser check verified that the active price tooltip remains visible while a
focus-triggered latest refresh completes.

The refresh outage had a separate identity defect. A long-history request
could begin as Eastmoney `100.N225`, win through Yahoo fallback, and mark the
series source/provider as Yahoo while retaining `secid=100.N225`. The next
latest request then sent an Eastmoney identifier to Yahoo. Two fixes were
compared:

1. Special-case the client refresh URL. This repairs one caller but leaves
   cached histories and saved shortcuts with contradictory provider identity.
2. Normalize the winning provider symbol inside the Yahoo adapter and retain a
   compatibility translation for already-saved Eastmoney-shaped Yahoo IDs.

Decision: use option 2. In addition, treat a primary Yahoo network or JSON
exception like a non-success response and continue to the existing query2
backup host. This keeps provider identity internally consistent and makes
history, latest refresh, cache aliases, and saved shortcuts share one request
path.

## 2026-07-26 saved-shortcut grouping and reordering

The HTML Drag and Drop API provides native draggable sources, explicit
drop-target opt-in through `dragover`, and a `DataTransfer` channel without a
runtime dependency:

- https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/Drag_operations

Three ordering approaches were compared:

1. Native HTML drag and drop plus keyboard Up/Down controls. This is the
   smallest dependency-free desktop implementation and retains a direct
   accessible alternative.
2. Pointer-event tracking with custom hit testing. This supports richer touch
   behavior but adds capture, movement threshold, scrolling, and cancellation
   state that this desktop shortcut bar does not need.
3. A sortable component library. This offers polished multi-input behavior but
   adds a new dependency and integration surface for a small bounded list.

Decision: use option 1. Dragging is enabled only on dedicated handles, record
drops are isolated from their parent group, and the complete optimistic order
is persisted through an owner-scoped API. An explicit `display_order` column
keeps presentation order separate from snapshot timestamps.

The WAI-ARIA Authoring Practices accordion pattern requires each header control
to expose `aria-expanded` and reference its panel with `aria-controls`:

- https://www.w3.org/WAI/ARIA/apg/patterns/accordion/

Use one disclosure header per canonical instrument and render the concrete
saved strategy/indicator rows only while expanded. Keep the entire collection
inside one bounded scroll region instead of paginating it.

## 2026-07-26 deputy independence gate correction

The original shortlist treated correlation and component overlap as soft
penalties. That could still assign a deputy role to a candidate with
correlation at or above 0.90 when its objective rank was strong, contradicting
the UI promise that deputies were low-overlap.

Three correction options were compared:

1. Keep the weighted score and only rename the similarity badge. This is
   internally consistent but does not make a deputy an independent
   recommendation.
2. Reject only high-overlap candidates while continuing to allow medium or
   unmeasurable overlap. This removes the clearest contradiction but still
   presents unverified diversification as independent.
3. Require every deputy to share no selected strategy component and to have a
   measurable maximum aligned daily equity-return correlation below 0.75.
   Leave missing deputy slots unfilled and label high-overlap candidates as
   same-family alternatives.

Decision: use option 3. The existing 0.75 moderate-correlation boundary becomes
the deputy admission threshold. The quality/diversity heuristic remains useful
only for ordering candidates that pass the gate. A high-overlap candidate may
fill an otherwise empty visual slot as an `alternative`, but it never counts
as a deputy. The UI must explicitly report when screening did not produce two
independent deputies.

## 2026-07-26 out-of-sample and rolling screening validation

Time-series validation must preserve chronology. Scikit-learn's
`TimeSeriesSplit` documents that ordinary cross-validation is inappropriate
for time-ordered data because it can train on future observations and evaluate
past observations. Its successive train sets grow forward in time, while
`max_train_size` provides a fixed-width alternative:

- https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html

QuantConnect's research guidance recommends walk-forward optimization and
out-of-sample testing to reduce backtest overfitting. Its warm-up documentation
also separates earlier state preparation from the period in which orders may
execute:

- https://www.quantconnect.com/docs/v2/writing-algorithms/key-concepts/research-guide
- https://www.quantconnect.com/docs/v2/writing-algorithms/historical-data/warm-up-periods

Bailey et al. describe why repeated strategy selection can overfit even when
each rule is deterministic: the selection process itself searches historical
noise:

- https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2326253

Four implementation approaches were compared:

1. A multi-period trailing selector inside the active backtest range. Optimize
   before the longest window, freeze candidates, replay several nested recent
   windows, and combine within-window ranks with explicit recency weights. It
   balances adaptation and persistence but turns those windows into selection
   inputs rather than independent holdouts.
2. A fixed train/selection/test split. Optimize parameters only on the training
   interval, rank the frozen candidates only on the selection interval, and
   show the test interval without reranking. This is easy to audit and leaves
   one genuinely untouched final interval, but produces only one regime split.
3. An expanding-window walk-forward. Each annual validation fold keeps all
   earlier history in the next training set. It uses the most data but can let
   very old regimes dominate and does not expose a single intuitive window
   length.
4. A fixed-width annual walk-forward. Optimize on the previous N complete
   calendar years, freeze parameters, allocations, and relative long/short
   roles, validate on the following calendar year, and advance by one year.
   This is more expensive but directly measures repeated chronological
   selection under changing regimes.

Decision: expose option 1 as the default `sample` mode with three adjustable
64/128/256-session windows and 40%/35%/25% defaults. Unequal-duration raw
returns are not comparable, so each window converts the combined standalone
and combination objective order to a tied 0-to-100 percentile rank. Positive
weights are normalized before aggregation. Parameters, allocations, and
relative roles are selected before the 256-session default window and frozen
through every selection-window replay. The weighted score drives result and
primary/deputy order.

Display-contract correction on 2026-07-26: the saved shortcut reports the
strategy lab's complete selected-range return, so showing only the shortest
window in the result table made two correct but non-comparable values appear
inconsistent. After weighted selection, replay every retained candidate over
the complete lab range with the lab's normal role resolution. Use that replay
for result-table, shortlist-path, applied-lab, and saved-shortcut metrics
without feeding it back into the weighted order. Keep all three frozen-window
metrics in the validation report as the actual selection evidence.

Expose option 2 as `range` validation with defaults of 2000-01-01 to
2015-12-31 for training, 2016-01-01 to 2019-12-31 for selection, and
2020-01-01 through the latest available bar for final testing. Expose option 4
as `rolling` validation with a default nine-year training window and a
one-calendar-year out-of-sample fold. The current partial calendar year is
allowed but explicitly labelled partial.

All modes may use bars before an evaluation boundary for indicator warm-up,
but count no transactions or metrics before that boundary. Multi-period
windows deliberately feed selection, so their report is comparative recent
evidence rather than independent out-of-sample proof. Range results remain in
selection-period order while showing final-test performance; rolling results
remain in latest-training order while showing the next fold. Neither range nor
rolling holdout performance feeds back into displayed rank or shortlist.

## 2026-07-26 moving-average-slope entry filter

The requested right-side condition was evaluated before implementation rather
than assumed beneficial. The local adjusted Yahoo N225 series contained 6,505
daily bars from 2000-01-04 through 2026-07-24. With every registered strategy
at default parameters, EMA(7), a 0% minimum normalized slope, the hybrid
execution policy, and selected-range inherited openings excluded:

- Full history produced 8,008 buys, of which 2,478 (30.94%) occurred while the
  causal EMA slope was negative; 28 of 34 strategies had at least one such
  entry. Filtering improved total return for five strategies and worsened it
  for 23; maximum drawdown improved for 13 and worsened for 14.
- From 2020 onward, 587 of 1,997 buys (29.39%) were negative-slope entries and
  30 strategies were affected. Return improved for three strategies and
  worsened for 22.
- Across the latest 500 sessions, 168 of 594 buys (28.28%) were affected across
  23 strategies. Return improved for five strategies and worsened for 18,
  while drawdown improved for 11 and worsened for four.

The feature therefore has real targets, but it is not a universal quality
filter: it can remove early breakout entries and the intended oversold entries
of reversal or pullback rules. Two design choices were compared:

1. Raw slope, `MA[t] - MA[t-1]`, is visually intuitive but its threshold changes
   meaning with the instrument's price level.
2. Normalized slope, `(MA[t] / MA[t-1] - 1) * 100`, expresses percent per
   session and keeps a threshold comparable across instruments. Pandas
   documents the same fractional-change convention:
   https://pandas.pydata.org/docs/reference/api/pandas.Series.pct_change.html

For execution, TradingView documents that close-calculated strategy orders are
normally available no earlier than the following bar, while completed-history
warm-up is a separate concern in QuantConnect's indicator guidance:

- https://www.tradingview.com/pine-script-docs/concepts/strategies/
- https://www.quantconnect.com/docs/v2/writing-algorithms/indicators/supported-indicators/exponential-moving-average

Decision: implement normalized SMA/EMA/WMA slope as an optional rule with the
control off by default and an EMA(7), 0%/session preset. It blocks only new
entries, preserves sells, and uses the completed signal bar for following-open
targets or the prior completed bar for active-bar price/open orders. Keep it
fixed for one screening run rather than optimizing it as another search
dimension, and persist it with every applied or saved plan for reproducibility.

## 2026-07-27 licensed daily fallback and staged exhaustive screening

### Market-data resilience

Three viable additions were compared against the existing Eastmoney/Yahoo/
Nasdaq website chain:

1. EODHD documents 150,000+ tickers, 70+ exchanges, 30+ years of history,
   indexes and ETFs, a symbol-search endpoint, and token-authenticated EOD
   history. Its daily response includes adjusted close and fits the existing
   adapter contract with a server-only token.
2. Twelve Data documents broad index coverage and a common `time_series`
   endpoint. It is a viable future provider, but adding a second licensed
   contract now would increase normalization and operational scope without
   improving the first fallback path.
3. Alpha Vantage documents daily history and index endpoints, but full daily
   history and several major-index data paths are premium-limited. It is a
   weaker default fit for the required deep daily index/ETF fallback.

Primary sources:

- https://eodhd.com/financial-apis/quick-start-with-our-financial-data-apis
- https://twelvedata.com/indices
- https://www.alphavantage.co/documentation/

Decision: add EODHD as the optional licensed daily index/ETF source, enabled
only by `EODHD_API_TOKEN`. Keep public providers operational when the token is
absent. Use the shared `MarketSeries` normalization boundary, a 12-second
timeout, one transient retry, asset filtering, and all-or-nothing adjusted
OHLC. This improves source diversity and traceability but cannot guarantee
availability or data correctness.

### Screening computation

The previous deterministic 120-set sample could omit materially better
parameters, as demonstrated by the Channel BreakOut case. Two computation
shapes were compared:

1. Expand filter and combination dimensions across every raw parameter set.
   This is exhaustive but needlessly multiplies the expensive search and
   encourages filter-specific parameter mining.
2. Traverse the complete finite raw grid first, refine only the top 30
   unfiltered candidates for explicitly suitable strategy families under
   EMA5-8, then combine one unique final winner per strategy.

Decision: use option 2. The current registry contains exactly 37,131 valid
parameter combinations. EMA is not a universal rule: the earlier empirical
review found that it often damaged reversal and pullback families, so the
screening family is explicit and includes trend, breakout, and momentum rules,
including Channel BreakOut and Price Channel. Each eligible strategy compares
its unfiltered winner with `Top 30 x EMA(5..8)`. Combination screening then
always runs over 559 unique non-equivalent winner pairs and compares 60/40 with
40/60. This makes combination work small relative to parameter traversal.

Current amendment (2026-08-20): the winner-only pairing shape could miss a
second- or third-ranked standalone parameter set whose behavior complements a
different strategy. The production optimizer now retains the top three final
sets per strategy, evaluates all `3 x 3` crossings for each of 1,594 current
non-equivalent strategy-ID pairs, and retains one best crossing per pair before
the ten allocation/tactical-mode replays.

### Saved-shortcut chart identity

Provider identity is not instrument identity. A saved N225 record may carry a
Yahoo alias while the current successful N225 series came from Eastmoney or
EODHD. Switching provider state before comparing canonical instruments can
blank a valid chart even though no market change was requested.

Decision: compare the saved, active, and active-series canonical keys first.
Preserve the non-empty successful active series for a match and restore only
plan-derived state. Use the normal cache/network pipeline only for a different
canonical instrument or missing active series.

## 2026-07-27 recent-adaptive window selection and boundary continuity

The product workflow intentionally reruns screening weekly or every few weeks
and prioritizes recent configured-window fit over an independent holdout claim.
Two boundary models were compared:

1. Reset every indicator and position at each window start. This makes each
   interval self-contained, but the first bars are dominated by indicator
   initialization and a strategy that was already active is incorrectly forced
   flat.
2. Build indicators, targets, and opening state from available earlier bars,
   while restricting transactions and all performance metrics to the active
   window. This models a continuously running strategy while keeping the
   ranking interval exact.

TradingView documents that scripts execute sequentially over accessible
historical bars and that history references are unavailable on the dataset's
first bar. Backtrader separately exposes minimum-period handling for indicators.
These support option 2 as the less artificial boundary model:

- https://www.tradingview.com/pine-script-docs/language/execution-model/
- https://www.backtrader.com/docu/inddev/

The earlier train/selection/test and walk-forward design remains statistically
stronger for an independent generalization claim. Scikit-learn's
`TimeSeriesSplit` documents chronology-preserving train/test splits for that
purpose:

- https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html

That is not the current product objective. Decision: use one N-session period,
one custom range, or equal-rank fixed-width rolling windows over one custom
total interval. Keep earlier bars only for continuous indicator and position
state, never for active-window return, Sharpe, drawdown, or score. Describe all
three as recent-adaptive in-sample screening rather than out-of-sample
validation. Remove trade count from balanced score; retain it only for result
display and candidate/observe-only status.

## 2026-07-27 dedicated screening worker and durable run archive

### CPU execution and run-local reuse

Two execution approaches were compared:

1. Continue cooperative yielding on the browser main thread. This allows
   React to repaint between chunks, but every strategy target, filter, and
   backtest still competes with input, chart, and stop-button work.
2. Move the existing pure screening coordinator into one dedicated module Web
   Worker. Progress and cancellation cross a small message protocol, while
   the current analysis functions remain the single calculation engine used
   by tests and direct backtests.

Vite recommends the standard module-worker constructor
`new Worker(new URL(..., import.meta.url), { type: "module" })`. MDN documents
that worker messages use the structured clone algorithm, which supports the
plain market/result objects used here but not callback functions or DOM
objects:

- https://vite.dev/guide/features.html#web-workers
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm

Decision: use option 2 and keep the core optimizer browser-independent. The
worker owns one `AbortController`; the page sends serializable input and
receives progress, result, cancellation, or error messages. A direct-core
fallback is retained only where `Worker` is unavailable.

Two cache scopes were also compared:

1. Persist prior screening results or candidate output in browser storage.
   This makes a later run appear faster but risks stale rankings and conflicts
   with the requirement that every run recompute from current data/settings.
2. Keep only run-local computation maps inside the worker: EMA allowed-state
   arrays are keyed by filter, and raw target/order execution is retained only
   for the bounded EMA and rolling finalist pools. The maps disappear when
   the worker terminates.

Decision: use option 2. No IndexedDB/local-storage screening-result cache is
introduced. A SHA-256 market-data fingerprint is calculated from normalized
OHLCV input for provenance; MDN documents `SubtleCrypto.digest()` for this
non-authentication checksum use:

- https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest

### Durable audit history

Two persistence shapes were compared:

1. Store one large JSON document in device storage. It is simple but not
   owner-scoped, is easy to lose, and cannot reliably distinguish multiple
   devices or deployed sessions.
2. Store one compact owner-scoped run row in the existing D1 database. Keep
   indexed identity/date columns for retrieval and compact JSON only for
   settings, retained rankings, and the selected report.

Cloudflare recommends indexes for frequently filtered multi-column access and
documents a 2 MB maximum row/string size. D1 prepared statements provide
bound parameters and its batch API provides transactional multi-statement
writes:

- https://developers.cloudflare.com/d1/best-practices/use-indexes/
- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/d1/worker-api/prepared-statements/
- https://developers.cloudflare.com/d1/worker-api/d1-database/#batch

Decision: use option 2 with an `(owner_email, instrument_key, created_at)`
index. Archive only the complete retained ranking shown/used after selection,
not equity curves or all 37,131 raw trials. The archive records provider,
adjustment, fetch time, last bar, bar count, fingerprint, validation config,
objective, costs, ranking, and report. It is audit-only: it is never loaded
into the current result tables and is never an input to calculation. The UI
compares the new run with the immediately previous run for the same canonical
instrument, exposing winner changes and top-ranking overlap.

## 2026-07-27 automatic market-source reconciliation

The previous latest-bar guard correctly refused to splice different providers
or adjustment modes, but it left the chart on old data after a fallback source
successfully returned a newer bar. Two recovery approaches were compared:

1. Estimate a scale ratio from overlapping closes and rescale the latest
   window into the active history. This is inexpensive, but a short overlap
   cannot prove equal index methodology, closing timestamps, corrections, or
   corporate-action treatment. It would also make the series-level source
   label inaccurate because the resulting bars came from multiple providers.
2. Pin the provider that produced the valid latest response, disable fallback
   for one complete-history request, and atomically replace the active series.
   Merge the latest window only when the strict history reports the same
   adjustment mode. This costs one full request only during a source change,
   but preserves one provider and one declared adjustment mode per series.

TradingView documents that dividend-adjusted charts change historical prices,
and that split handling recalculates historical prices for timeline
consistency. Polygon's official split documentation similarly distinguishes
adjusted and unadjusted aggregate views:

- https://www.tradingview.com/support/solutions/43000590597-how-to-adjust-data-for-dividends/
- https://www.tradingview.com/support/solutions/43000765406-what-are-stock-splits/
- https://polygon.io/docs/rest/stocks/corporate-actions/splits

Decision: use option 2. Keep direct latest merging strict on interval, source,
and `priceAdjustment`. On mismatch, request complete history with
`strictProvider=1` and `no-store` for the latest winner. If that request
succeeds, replace the whole series and cache the unified result locally; if it
fails, retain the prior complete history and show a recovery warning. Never
infer or persist a cross-provider OHLC multiplier.

## 2026-07-27 canonical market data and global coverage

This section supersedes the automatic source-replacement decision immediately
above. Replacing a whole chart when the available source changes is internally
consistent for one response, but it still lets the same saved instrument show
different historical OHLC, adjustment, close boundary, and index methodology
on different days.

Three runtime models were compared:

1. Continue selecting the currently successful provider and atomically replace
   the full chart. This maximizes immediate availability but does not provide a
   stable historical identity.
2. Estimate cross-provider scale factors and merge bars. This is fast but
   cannot reconcile methodology, sessions, corrections, or corporate actions.
3. Assign one canonical primary per instrument, lock confirmed primary bars,
   store every source independently, and limit backups to audit plus a
   temporary quote. This can show an explicit unavailable state before the
   first successful primary load, but it makes every later chart reproducible.

Decision: use option 3. N225 is pinned to Eastmoney, SOX to Nasdaq, and the
built-in continuous commodity proxies to Yahoo after the verified relay
coverage described below. Eastmoney commodity identifiers remain independent
backups. Other search-selected
instruments keep their selected provider. Backup history never overwrites
canonical OHLC. The browser persists canonical, source, reference, health, and
fingerprint records in separate IndexedDB stores.

### Source candidates

The credential-free direct path was compared with proxy-friendly and licensed
paths:

- Eastmoney returned deep daily history for tested Asian, European, US, Indian,
  Brazilian, Swiss, Taiwanese, and Singaporean indexes, US ETFs, and four
  continuous commodity proxies. Its website endpoints have no SLA and can
  close TLS connections or rate-limit burst traffic. The adapter therefore
  prefers HTTPS, retries the same host over HTTP only after transport failure,
  and relies on cache/canonical persistence rather than high request volume.
- Nasdaq returned 6,828 SOX and NDX daily rows and 2,514 rows for each tested
  US ETF. It is a strong direct SOX primary and ETF audit source, but not a
  general commodity-futures source.
- Yahoo offers broad symbols and explicit adjusted-close arrays, but direct
  requests returned regional HTTP 403 during this test. It remains a
  proxy-friendly audit definition.
- EODHD is a licensed token-based index/ETF source already integrated as an
  optional path.
- FRED `NIKKEI225` is a close-only reference. FRED does not provide OHLC and
  must never be expanded into synthetic candles.
- Sina's public global-futures history was tested but rejected as canonical
  OHLC: multiple rows used the prior close in the `open` field, causing open
  values outside the published high/low range.
- Stooq's CSV path returned a JavaScript verification page in this network and
  was not integrated.

Licensed future candidates were compared through official documentation:

- Twelve Data documents exchange-local daily time zones and explicit
  adjustment choices:
  https://twelvedata.com/docs
- EODHD documents broad exchange/index/ETF coverage and token authentication:
  https://eodhd.com/financial-apis/quick-start-with-our-financial-data-apis
- Financial Modeling Prep documents full historical index endpoints:
  https://site.financialmodelingprep.com/developer/docs/stable/index-historical-price-eod-full
- Polygon documents a dedicated indices REST product:
  https://polygon.io/docs/rest/indices/overview
- FRED documents series observations and NIKKEI225:
  https://fred.stlouisfed.org/docs/api/fred/series_observations.html
  and https://fred.stlouisfed.org/series/NIKKEI225

Recommendation: retain the credential-free canonical paths for the local
edition, keep EODHD optional, and use a reviewed licensed provider before
claiming an external availability SLA or redistributing provider history.

### Global exchange normalization

Eastmoney market `100` is an overseas-index bucket, not JPX. Two approaches
were compared:

1. Keep one venue for the whole bucket and classify same-day completion
   approximately.
2. Map known global index codes to their real venue/time zone and leave unknown
   codes as `OTHER`.

Decision: use option 2 through one shared exchange module consumed by
Eastmoney, Yahoo, EODHD, API validation, and saved-record validation. This
prevents DAX, FTSE, CAC, SPX, KOSPI, and other indexes from inheriting the JPX
close boundary.

### Local Worker proxy routing

Live diagnosis found that Python and Node 24 with environment-proxy support
could reach Yahoo while the local Worker runtime still received HTTP 403.
Three approaches were compared:

1. Pass proxy addresses into Worker bindings and implement proxy tunneling in
   Worker code. This expands secret exposure and couples production code to a
   local network route.
2. Disable the Worker-compatible local runtime and run API routes under Node.
   This would diverge from the deployment runtime and local D1 architecture.
3. Keep the Worker runtime and add a loopback-only relay process with a strict
   provider host/path allowlist. The relay owns proxy routing; Worker code sees
   only a fixed localhost endpoint.

Decision: use option 3 only when `HTTP_PROXY` or `HTTPS_PROXY` is configured.
The relay forwards only Accept, language, referer, and user-agent headers. It
rejects non-HTTPS targets, non-allowlisted hosts or paths, oversized requests,
and non-loopback binding. Proxy values are never passed into Worker bindings.
Direct source requests remain unchanged without a configured proxy.

Cloudflare documents proxy environment support for Wrangler and explains that
local Worker code runs under the local workerd runtime:

- https://developers.cloudflare.com/workers/wrangler/configuration/#proxy-support
- https://developers.cloudflare.com/workers/local-development/

The 2026-07-27 live relay matrix returned valid OHLC history for 16 Yahoo
indexes, 11 Yahoo ETFs, and four Yahoo commodity aliases. Independent Nasdaq
checks returned 11 of 11 US ETFs. Eastmoney had already passed the direct
global matrix earlier in the session, then rate-limited the burst test; this is
why canonical persistence and primary-request backoff remain mandatory.

## 2026-07-27 Yahoo-first canonical policy

The previous fixed assignments split global history across Eastmoney for N225,
Nasdaq for SOX, and Yahoo for commodities. Two source policies were compared:

1. Keep provider-specific primaries. This preserves the original assignment
   but leaves the same global workflow dependent on three symbol conventions,
   close-publication paths, and outage modes.
2. Prefer Yahoo only where an exact Yahoo-discovered symbol or deterministic
   reviewed mapping exists. Keep unsupported instruments on their selected
   provider and retain Eastmoney, Nasdaq, EODHD, and FRED as isolated
   backups/references.

Option 2 gives supported indexes, ETFs, and commodity proxies one symbol and
normalization path without guessing unsupported exchange suffixes. It also
keeps direct and credentialed alternatives available for audit. A blanket
conversion of every code was rejected because a code such as a JPX-listed ETF
requires an exchange suffix that cannot be inferred safely from an arbitrary
non-Yahoo record.

Availability still requires multiple network routes. During the research
check, Yahoo's official N225 and SPY history pages returned HTTP 429 to the web
client, while Nasdaq's official SOX historical page displayed that data was
temporarily unavailable. The local adapter's reviewed loopback relay,
query1/query2 hosts, and direct fallback therefore remain necessary.

Official pages:

- https://finance.yahoo.com/quote/%5EN225/history/
- https://finance.yahoo.com/quote/%5ESOX/history/
- https://finance.yahoo.com/quote/SPY/history/
- https://www.nasdaq.com/market-activity/index/sox/historical

The local strict-provider matrix then validated the actual application route.
All 31 cases passed: 16 Yahoo indexes, 11 Yahoo ETFs, and four Yahoo commodity
proxies. N225 returned 6,506 bars from 2000-01-04 through 2026-07-27; SOX
returned 6,679 bars from 2000-01-03 through 2026-07-24. The default N225 API
request returned Yahoo `^N225`, and Yahoo-first search returned the same exact
identity.

Decision: adopt option 2. Search de-duplication prefers Yahoo exact symbols.
N225, SOX, verified global mappings, Yahoo-discovered instruments, and the
existing commodity proxies use Yahoo as primary. Unsupported mappings retain
their selected provider. A deliberate source-policy change reuses locked
same-instrument canonical history, while current-primary writes remain strict
and confirmed dates remain immutable.

## 2026-07-28 Global index fallback promotion

Repeated refresh failures for both N225 and the SSE-listed 513310 ETF exposed a
policy gap rather than only a provider-coverage gap. QuantScope already had
Yahoo, Eastmoney, Nasdaq, optional EODHD, and FRED adapters, but the workspace
used only the configured primary for canonical OHLC. Backups were audited and
could supply a temporary quote, yet they could not restore an empty chart or
append a verified new daily bar. Repeated refreshes therefore retried the same
failed primary.

The following approaches were compared:

1. Add one hard-coded source per reported symbol. This is quick for N225 but
   does not improve other indexes or ETFs and duplicates failover rules.
2. Replace the primary globally with another free provider. This only moves the
   single point of failure and loses the reviewed Yahoo mappings that passed the
   31-instrument coverage matrix.
3. Keep one preferred primary per canonical profile and permit a declared
   backup to become the active canonical source when it passes explicit
   promotion rules. A trusted deterministic mapping may recover an empty chart;
   a candidate mapping requires overlap with retained canonical bars and a
   bounded OHLC error. Completed cached dates remain immutable, provider
   snapshots remain isolated, and the preferred primary is tried again later.

Decision: use option 3. This makes the existing multi-provider registry useful
for every canonical index and ETF instead of only N225. A fallback is selected
by freshness and profile order. It may fill missing dates or replace only an
unconfirmed last bar; it never rewrites confirmed history. The UI reports that
the preferred source is unavailable and identifies the active verified backup.

Additional provider research:

- Nikkei Indexes publishes an official no-key CSV containing three years of
  daily N225 OHLC. It is suitable as a trusted N225-specific backup, not as the
  general solution. Nikkei states that wider display or non-display business
  use can require a license.
- EODHD already supports global index and ETF end-of-day OHLC through a
  server-only key. Its free plan is limited, so it remains an optional
  credentialed backup.
- Twelve Data exposes a general `/time_series` OHLC endpoint and a global index
  catalog, but production use requires an API key and plan-dependent credits.
- Alpha Vantage documents daily OHLC for more than 200 major indexes through
  `INDEX_DATA`, but classifies the index endpoint as premium.
- Financial Modeling Prep exposes stable symbol search and historical EOD
  endpoints. The configured account returned N225 daily OHLC but did not resolve
  SSE ETF `513310`.
- Marketstack's configured plan returned adjusted SPY ETF EOD rows, while index
  listing was forbidden and `513310` was unsupported. It is suitable only as an
  exchange-verified ETF backup.
- Zhitu's free certificate returned recent CSI 300 daily bars through its
  documented SSE/SZSE index path. Its fund API does not document historical ETF
  OHLC and the `513310` probe failed, so it is index-only.
- The reviewed ClawHub Tencent Finance skill wraps
  `https://qt.gtimg.cn/q={symbol}`. It is fast, no-key, and resolved
  `sh513310`, but exposes only a current quote rather than historical daily
  bars. It is useful as a final temporary-quote source, not as a backtest or
  canonical-history provider.
- Polygon documents more than 10,000 indexes and aggregate bars, but is
  credentialed and its strongest coverage is US index families.
- Stooq's no-key download endpoint returned a browser-verification page during
  the live server-side check, so it is not suitable for unattended canonical
  recovery.

Implementation uses the official Nikkei CSV for N225 and adds credentialed
EODHD, Twelve Data, Financial Modeling Prep, Alpha Vantage, Marketstack, and
Zhitu adapters behind the shared canonical registry. Deterministic mappings use
`verified-identity`; Alpha Vantage and Nasdaq use overlap gating where the
mapping or methodology is not strong enough to recover an empty chart.
Credentialed sources are called sequentially only after the preferred source
fails.

The `513310` probes were decisive: EODHD returned valid SSE daily bars; Twelve
Data search found the ETF but daily series returned 404; Alpha Vantage was
sparse and ambiguous; FMP did not resolve it; Marketstack returned 422; Zhitu
returned 404. EODHD is therefore the first proven credentialed recovery source
for that ETF rather than treating every configured key as interchangeable.

Other evaluated candidates:

- Finnhub resolved `513310.SS`, but historical stock candles returned 403 under
  the supplied entitlement and the official API labels that capability premium.
- EIA is authoritative for US energy statistics but is not exchange OHLC.
- iTick offers a time-limited free personal tier with REST history and a
  five-calls-per-minute limit. It requires an account key that is not yet
  configured.
- AKShare API starts an AKTools Python service and largely wraps the same public
  Chinese websites already represented. It adds useful breadth but also a
  sidecar, dependency, and duplicated-source failure mode.
- TuShare Pro requires a token and points; relevant index/ETF endpoints have
  feature-specific point thresholds, so it is not a zero-configuration source.
- Sina Finance ZYHub publishes a global daily-K tool covering China, Hong Kong,
  US, and global indexes, authenticated by `X-Auth-Token`. The configured
  account returned an insufficient-balance response, so the key is retained
  locally but the runtime adapter is intentionally not enabled.

Primary references:

- https://indexes.nikkei.co.jp/en/nkave/index?type=download
- https://indexes.nikkei.co.jp/nkave/data/index.en.html
- https://indexes.nikkei.co.jp/nkave/license/index.en.html
- https://eodhd.com/financial-apis/api-for-historical-data-and-volumes
- https://twelvedata.com/docs/introduction/overview
- https://twelvedata.com/indices
- https://www.alphavantage.co/documentation/
- https://site.financialmodelingprep.com/developer/docs/stable/index-historical-price-eod-full
- https://marketstack.com/pricing/
- https://www.zhituapi.com/hsindexapi.html
- https://clawhub.ai/ezio-xiang/skills/tencent-finance
- https://www.cnblogs.com/doseoer/p/20048143
- https://www.itick.org/en
- https://docs.itick.org/en/getting-started
- https://pypi.org/project/akshare-api/
- https://tushare.pro/document/1?doc_id=13
- https://zyhub.finance.sina.cn/help/api
- https://polygon.io/docs/rest/indices/overview

## 2026-07-28 Session-aware refresh and credential-state handling

The fixed one-minute visible-page refresh was compared with two mainstream
approaches:

1. A browser-side session policy using the Page Visibility API, venue-local
   clocks, one shared last-attempt timestamp, and exponential backoff. This is
   simple, reversible, and matches QuantScope's local single-user/manual
   product boundary, but it stops when the page is closed and needs explicit
   exchange schedules.
2. A durable server scheduler or push stream. This can continue with no open
   page and centralize quota allocation across devices, but it adds background
   infrastructure, durable job state, authentication, and operating cost that
   the current manual workspace does not need.

Decision: use option 1. Known regular venues refresh every five minutes while
open and for 30 minutes after close. The current COMEX/NYMEX proxies follow the
Sunday-Friday Globex session and skip the daily maintenance break and weekend
closure; unknown venues use 15 minutes. The page must be visible. Focus and
visibility reuse the same minimum interval. A primary failure immediately tries
backups; 15/30/60-minute backoff begins only after every source fails. Manual
all-shortcut refresh is sequential, progress-reporting, and cooldown-protected.

The Page Visibility API is the standard browser signal for avoiding background
work in hidden documents:

- https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API
- https://html.spec.whatwg.org/dev/interaction.html
- https://www.cmegroup.com/trading/metals/files/fact-card-gold-futures-options.pdf

For credential state, two approaches were compared:

1. Periodically probe every stored key. This can produce an early status but
   consumes quota, can trigger rate controls, and may incorrectly classify a
   symbol, entitlement, or regional 403 as an expired key.
2. Classify failures only when an implemented provider is used, retain a safe
   status code, and keep credentials and response bodies server-side.

Decision: use option 2. HTTP 401 and explicit invalid/expired-key messages map
to a credential warning; 403 access denial, 429 quota/rate limitation, missing
configuration, and generic transport/upstream failure remain separate. This
cannot validate an unintegrated provider merely because its key exists.

Additional candidate review:

- Tiingo's official symbology documents supported US equities, mutual funds,
  ETFs, and China equities. It does not establish the required global-index or
  commodity-futures coverage, so it is not added to the current fallback
  registry.
- AllTick's official K-line specification defines commodity endpoint
  `quote.alltick.co/quote-b-api/kline`, daily type `8`, and a 500-row maximum;
  its commodity list maps gold to `GOLD`. This is sufficient for an adapter,
  but not for assuming identity with Yahoo continuous futures. The supplied
  token returned HTTP 401. A replacement seven-day trial token then returned
  nine current daily bars through 2026-07-28. Its nine-date Yahoo overlap
  passed the 2%/3% price gate, so AllTick is formally integrated as a currently
  usable overlap-required gold backup with explicit local expiry.
- FMP's official commodity EOD endpoint accepts `GCUSD`. A live read-only probe
  returned 1,330 daily rows through 2026-07-28, so FMP is the first
  overlap-required credentialed gold backup.

For automatic source selection, two approaches were compared:

1. A lifetime cumulative success rate is simple, but old successes hide a new
   outage and a recovered source can oscillate with a backup.
2. Bounded 7/30-day attempt windows react to current behavior. Minimum sample
   counts, price-quality gates, asymmetric demotion/restoration thresholds, and
   periodic configured-primary probes add state but make decisions auditable.

Decision: use option 2. Demote after three consecutive failures or a sub-80%
7-day rate with at least five attempts. Require a backup to reach 95% over
seven days, 90% over 30 days, minimum observations, and passing quality. Probe
the configured primary hourly and require seven elapsed stable days before
restoration.

Primary references:

- https://www.tiingo.com/documentation/general/overview
- https://www.tiingo.com/documentation/end-of-day
- https://www.tiingo.com/documentation/appendix/symbology
- https://all-tick-official-website.vercel.app/en/docs
- https://github.com/alltick/realtime-forex-crypto-stock-tick-finance-websocket-api
- https://github.com/alltick/alltick-realtime-forex-crypto-stock-tick-finance-websocket-api/blob/main/http_interface/kline_query.md
- https://github.com/alltick/alltick-realtime-forex-crypto-stock-tick-finance-websocket-api/blob/main/product_code_list_commodities_gold.md
- https://site.financialmodelingprep.com/developer/docs/stable/commodities-historical-price-eod-full

## 2026-07-28 API allowances and final Chinese quote fallback

The stored credentials were reviewed against current official provider pages.
Two quota-recording approaches were compared:

1. Encode every published free-tier number as a hard runtime limit. This is
   simple to inspect, but it can incorrectly constrain a paid, promotional, or
   grandfathered account and becomes stale when a provider changes pricing.
2. Keep a dated documentation register for every provider and add a runtime
   gate only where QuantScope actually consumes a small known account bucket.
   The account dashboard remains authoritative, while low-quota integrations
   can still fail closed before wasting requests.

Decision: use option 2. `.env.example`, `SECRETS.md`, and `DATA_SOURCES.md`
record the current free/starter baselines, reset periods, and integration
status. Exact account allowances that are not publicly visible are labeled
dashboard-dependent. QuantScope does not probe dormant keys merely to discover
their plan because those probes consume quota and can misclassify entitlement
errors.

Officially confirmed baselines:

- EODHD Free: 20 calls/day and 20 requests/minute.
- Twelve Data Basic: 8 API credits/minute and 800/day, with the daily bucket
  reset at 00:00 UTC. Endpoint weight and symbol count determine actual credit
  use.
- Alpha Vantage Free: 25 requests/day.
- Financial Modeling Prep Basic: 250 calls/day, reset at 15:00 US Eastern, plus
  a 500 MB trailing-30-day bandwidth limit.
- Finnhub documents a 30 requests/second hard ceiling on top of plan limits,
  but its current public pages do not state one fixed free-account minute
  allowance. The account dashboard must decide the usable plan limit.
- U.S. EIA does not publish a fixed daily bucket. Its FAQ recommends a
  sustained rate below about 9,000/hour and bursts below 5/second, while
  warning that complex routes can throttle earlier.
- Marketstack Free: 100 requests/month; each requested symbol consumes one
  request.
- Zhitu Free: 200 requests/day and 300 requests/minute.
- Tiingo Starter: 50 requests/hour, 1,000/day, 500 unique symbols/month, and
  1 GB/month.
- AllTick Free is a seven-day trial with 10 API calls/minute.
- Juhe's current stock-product account allowance is 50 calls/day, while its
  product page states a five-minute data update frequency and product-specific
  request-limit errors.
- Sina Finance ZYHub exposes balance and product entitlement through the
  account service, but no fixed public free allowance was found. The supplied
  account returned insufficient balance.

For the Juhe integration, three recovery positions were compared:

1. Use Juhe as a regular credentialed history source. The product returns
   current quotes, not a reproducible historical daily series, and its small
   allowance makes routine audit unsuitable.
2. Place Juhe before Tencent. This spends a limited credentialed call even when
   the no-key website quote is healthy.
3. Keep Tencent first and Juhe last, skip Juhe after a valid Tencent quote, and
   prevent quote-only providers from becoming effective primaries.

Decision: use option 3. The adapter is restricted to SSE/SZSE indexes and ETFs,
returns one raw bar, preserves canonical identity, and never recovers an empty
chart or persists history. A Shanghai-day in-process counter is capped at 50.
Optional date/offset environment variables account for same-day calls made
outside QuantScope, but the upstream provider remains authoritative after a
server restart. A live strict `513310` request returned a complete
2026-07-28 quote.

Primary references:

- https://eodhd.com/financial-apis/quick-start-with-our-financial-data-apis
- https://twelvedata.com/pricing
- https://support.twelvedata.com/en/articles/5615854-credits
- https://www.alphavantage.co/support/
- https://site.financialmodelingprep.com/pricing-plans
- https://www.finnhub.io/docs/api/country
- https://www.eia.gov/opendata/faqs.php
- https://marketstack.com/contact
- https://zhituapi.com/gettoken.html
- https://www.tiingo.com/about/pricing
- https://blog.alltick.co/how-to-obtain-a-free-alltick-api-key-for-testing/
- https://www.juhe.cn/docs/api/id/21
- https://www.juhe.cn/vip

## 2026-07-28 Windows runtime-port lifecycle

The local launcher has two persistent loopback listeners: the vinext
application on port 3000 and the market relay on port 3001. Three startup
approaches were compared:

1. Stop every process that owns a registered port. This is simple but can
   terminate an unrelated application or another checkout.
2. Select a different free port automatically. This avoids termination but
   changes the browser origin, device-local storage boundary, documented URLs,
   and fixed relay binding.
3. Keep fixed ports, probe each role's health, map the listener to its owning
   PID, verify the exact current-checkout command and role arguments, and stop
   only a verified unhealthy owner.

Decision: use option 3 through one PowerShell runtime-port registry. Healthy
application and relay services are reused. An unhealthy current-checkout
listener is released before restart even when its launcher parent still
exists. Another checkout, a mismatched command, and an unrelated owner remain
untouched; the launcher reports the unresolved PID. The application probe
allows ten seconds because an initial development render can exceed the former
two-second request window. This extends the existing relay identity pattern to
every persistent runtime port while retaining the fixed localhost origin.

Microsoft documents `Get-NetTCPConnection` as exposing local ports and owning
process IDs. `Win32_Process` exposes `CommandLine` and `ParentProcessId`, with
the warning that process IDs can be reused, so PID lookup alone is not treated
as identity. `Stop-Process` supports stopping one exact local PID after those
checks.

Primary references:

- https://learn.microsoft.com/en-us/powershell/module/nettcpip/get-nettcpconnection
- https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-process
- https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/stop-process

## 2026-08-02 saved-shortcut rank history and stable price axes

### Problem

Saved shortcut strategies need comparable latest-128-session returns, the newest
five ranks for each canonical instrument, and a K-line axis that does not change
only because a different strategy overlay is visible. A rank event must represent
one completed one-click screening, cover every saved strategy in that generic
canonical instrument group, remain owner-scoped and bounded, and work for future
instrument groups without symbol-specific branches.

### Persistence approaches

1. Store the bounded rank array on each `saved_backtests` row as JSON, together
   with the latest rolling return and a deduplication snapshot key.
2. Create a normalized child table with one row per rank event and prune it to
   five records per saved strategy.

Both approaches support durable history and owner-scoped writes. A child table
is preferable for unbounded audit queries, event timestamps, and cross-run SQL
analytics, but adds joins, pruning statements, foreign-key lifecycle work, and
more D1 statements. The UI always reads the whole history and the requirement is
strictly bounded to five integers, so row-local JSON is the smaller schema and
request contract. D1 prepared statements and bound parameters remain the normal
safe query boundary; D1's documented per-query bound-parameter and statement
limits are far above this bounded cohort, but the existing 200-row product cap
still constrains payload size.

Decision: use additive nullable/defaulted columns on `saved_backtests`. Rank by
latest-128-session total return descending with saved ID as a deterministic
tie-breaker. Market refresh updates the durable rolling return but does not create
a rank event. A successful screening-run archive request must submit exactly the
complete saved-ID cohort for its canonical instrument; it appends one rank under
the inserted run ID and retains five entries in application code. Old rows are
backfilled from exact archived candidate matches when available, with a current
rolling-cohort baseline for unmatched rows, so all existing shortcut groups gain
an initial numeric rank without inventing repeated screening events.

### Price-axis approaches

1. Let ECharts autoscale the main value axis across candles, indicator overlays,
   strategy reference lines, and marker coordinates.
2. Calculate explicit axis bounds from visible OHLC lows/highs and update them
   from the shared data-zoom window.

Both preserve ECharts' value-axis rendering and linked data zoom. Autoscaling is
simpler but makes the same candles appear at different vertical scales when a
strategy emits an outlying reference. Explicit visible-OHLC bounds keep candle
comparisons stable while retaining zoom-dependent detail; overlays outside the
range remain presentation data rather than scale inputs.

Decision: use option 2 with four-percent padding and retain the current zoom
window in `PriceChart`. ECharts continues to own rendering and zoom interaction,
while the application owns the financial comparison rule for the price axis.
Floor/ceiling bounds and an integer label formatter prevent decimal values from
appearing on the K-line vertical axis.

Primary references accessed 2026-08-02:

- https://developers.cloudflare.com/d1/worker-api/prepared-statements/
- https://developers.cloudflare.com/d1/worker-api/
- https://developers.cloudflare.com/d1/platform/limits/
- https://echarts.apache.org/handbook/en/concepts/axis/

## 2026-08-02 Nasdaq 100 alias and volume recovery

### Evidence

The local search endpoint returns the Eastmoney Nasdaq-100 identity as
`100.NDX100`, while Yahoo returns `^NDX`. A strict local Yahoo request for
`^NDX` succeeded through 2026-07-31 and its recent daily bars carried positive
volume. Nasdaq's strict `NDX` website history returned valid prices but zero
volume. Both tested SOX sources returned zero volume, so missing index volume is
also an upstream capability boundary and must not be fabricated.

The failure occurred before source-quality selection: Yahoo parsed its response
symbol into code `NDX`, but canonical validation still compared it with the
selected code `NDX100`. The correct primary was rejected as a different
instrument. The same structural risk exists for SPX/GSPC, DJIA/DJI,
SENSEX/BSESN, and SX5E/STOXX50E.

Nasdaq's official NDX overview confirms `NDX` as the index symbol. Its official
historical page reported data unavailable during the 2026-08-02 check, which
reinforces keeping Yahoo as the configured primary rather than promoting the
website history merely because it is official.

### Approaches compared

1. Add an NDX-only exception inside the market route or Yahoo parser.
2. Normalize all known global-index aliases at the canonical identity boundary,
   use that key for search/cache/profile validation, and pass canonical provider
   symbols through each backup definition.

The first option is smaller but repeats provider knowledge and allows the same
bug to recur for every alias pair. The second uses the existing Yahoo mapping as
the shared identity registry, prevents duplicate search groups, and lets a
provider response change its display code without changing canonical ownership.

Decision: use option 2. Nasdaq requests honor their definition's `secid`. A
same-session merge also retains an already published positive volume when a
later response reports zero, while never carrying volume from another date.

Primary references accessed 2026-08-02:

- https://indexes.nasdaq.com/Index/Overview/NDX
- https://www.nasdaq.com/market-activity/index/ndx/historical

## 2026-08-09 saved-shortcut folders and disclosure interaction

The shortcut bar needs organization at two known boundaries: canonical
instrument groups at the root and saved strategy rows within one instrument.
It does not need arbitrary recursive nesting.

### Approaches compared

1. Store a generic recursive tree with `parent_id`, attach any saved object to
   any node, and expose treeview keyboard interaction. This is flexible, but it
   adds cycle prevention, cross-level validation, recursive ordering, and the
   complete WAI-ARIA treeview keyboard contract for only two required levels.
2. Store normalized folders with a fixed `instrument` or `strategy` scope and
   a context key. Saved rows retain nullable instrument-folder and
   strategy-folder IDs. Existing instrument disclosures remain disclosures,
   while simple selectors move groups or rows between folders.

Both approaches provide rename, ordering, and durable owner-scoped grouping.
The fixed-scope model is smaller, makes invalid cross-instrument strategy moves
easy to reject, and retains the established disclosure interaction. D1 enforces
foreign keys and supports `ON DELETE SET NULL`; D1 batch statements execute as
transactions, so the delete route also clears both nullable affiliations in
the same batch before deleting the folder.

Decision: use option 2. Folder deletion means unfile, never delete content.
Group and row reordering remains within the current folder section. Empty
folders remain visible so users can rename, delete, or populate them.

Primary references accessed 2026-08-09:

- https://developers.cloudflare.com/d1/sql-api/foreign-keys/
- https://developers.cloudflare.com/d1/worker-api/d1-database/
- https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/
- https://www.w3.org/WAI/ARIA/apg/patterns/treeview/

## 2026-08-09 long-only tactical allocation modes

The requested sequence is not short selling. The position target always stays
inside `[0, 1]`: a relative-long signal opens exposure, while the
relative-short signal only adjusts a tactical sleeve inside that long
position.

Two implementation shapes were compared:

1. A general event/allocation sequence editor. This can express arbitrary
   pyramiding, but greatly expands invalid states, screening candidates,
   persistence validation, and same-bar execution ambiguity.
2. Two explicit causal modes over the existing long/base/full state machine:
   `add-on-short-entry` starts at the long-cycle base allocation and adds the
   tactical sleeve on a fresh short-cycle entry; `reduce-on-short-exit` starts
   at full allocation, removes the sleeve on a short-cycle exit, and restores
   it on the next entry.

Decision: implement option 2. Both modes use the same five A/B splits and are
screened automatically. The new mode can raise return when the long-cycle entry
is early and valid, but it also increases initial market exposure and may
increase drawdown. Therefore it is ranked by the existing return/Sharpe/drawdown
objective instead of being assumed superior. Single-strategy behavior remains
100% long or flat.

Primary reference accessed 2026-08-09:

- https://www.tradingview.com/pine-script-docs/concepts/strategies/

## 2026-08-09 TradingView community catalog review and indicator menus

TradingView's signed-out chart catalog was inspected on 2026-08-09. The
application exposed separate `Editors' picks`, `Top`, and `Trending` community
sections plus Indicator/Strategy tabs. These rankings are mutable discovery
feeds, not evidence that a script is causal, robust, or suitable for daily
long-only index research.

The current Top 20 were: Smart Money Concepts; Squeeze Momentum; MacD Custom
MTF; SuperTrend; Williams Vix Fix; Support and Resistance Levels with Breaks;
WaveTrend Oscillator; Market Structure Break & Order Block; UT Bot Alerts; ICT
Killzones + Pivots; Trendlines with Breaks; Bollinger + RSI Double Strategy;
GainzAlgo Suite; Support Resistance Channels; ADX and DI; Swing high/low
support and resistance; LuxAlgo Signals & Overlays; Support/Resistance High
Volume Boxes; Ultimate MA MTF; and Sessions.

The Trending view currently rendered 19 entries: Adaptive Regression Breakout
Map; XG Boost Lite Reversals; Probabilistic ICT Order Blocks; HalfTrend Signal
Engine; Reversal Trap Probability Bands; Universal Signal Backtester; Smart
Ichimoku; RSI Divergence Entry Engine; Luxy UT God Mode; Elliott Impulse
Engine; HTF Power of 3; Reactive Trail System; two Liquidity Sweep Hunter
variants; Nadaraya-Watson Trend; Liquidity Rejection Auto Target; Strong
Liquidity Outlook; Auto-ATR Volatility Spike & Trend Tracker; and Order Flow 3D
Delta Profile.

The current Editors' picks Top 20 were: Regression Toolkit; Time-of-Day/Session
Performance Stats; Universal Signal Backtester; Smart Trader Isotropic Trend
Lines; MACD with HTF Panels; Chess; Directional Volume Shapes; IQ Trend Beams;
TASC agricultural selling model; Machine Learning Neural Network Engine;
Intrabar Profile; Kinetic Slippage Index; Session Edge Profiler; Supertrend
Parameter Sensitivity 3D; ExprLib; Chart Patterns Screener; Machine Learning
RSI; Polynomial/Linear Regression Volume Profile; Whale Liquidity and
Absorption Profile; and Fractional EMA Kalman Filter.

Suitability for this product:

- Strong candidates are confirmed support/resistance breaks, Supertrend,
  ADX/DI, moving-average families, Bollinger/RSI confluence, ATR volatility
  tracking, and causal trendline/channel breaks. They fit daily OHLC and the
  existing long-only, next-open execution contract.
- Useful after intraday mode exists are session performance, killzones,
  intrabar profiles, and slippage diagnostics. Daily bars cannot evaluate their
  intended behavior.
- Regression, divergence, WaveTrend/Squeeze, and Nadaraya-Watson concepts need
  separate causal/stability review before inclusion. Centered smoothing or
  retrospective pivots must not repaint.
- Invite-only suites, opaque machine-learning scores, order-flow/delta studies,
  and volume-box/liquidity scripts are deferred. They are not reproducible from
  this app's daily OHLCV contract, and index volume is often unavailable.

Copying a community Pine implementation was rejected. The selected pilot is an
independent, price-only confirmed-pivot implementation inspired by the public
concept: support/resistance becomes visible only after the configured right
confirmation bars have closed, and break markers require a later close through
the known level. It is added to the default favorites list but remains hidden
until the user enables it. The registry now categorizes moving averages, trend,
volatility/channel, momentum, volume, and structure/breakout studies; favorites
remain device-local.

Primary references accessed 2026-08-09:

- https://www.tradingview.com/chart/
- https://www.tradingview.com/scripts/editors-picks/
- https://www.tradingview.com/script/JDFoWQbL-Support-and-Resistance-Levels-with-Breaks-LuxAlgo/
- https://www.tradingview.com/support/solutions/43000761245-tradingview-social-network/
- https://www.tradingview.com/support/solutions/43000555216-how-to-try-indicators-and-strategies-from-the-community-on-your-chart/

## 2026-08-09 native one-minute research mode

The accepted product scope is exactly daily and one minute; 5/15/30/60-minute
bars are out of scope. Two viable approaches were compared:

1. Use the current providers' native one-minute endpoint. This reuses the
   normalized `MarketSeries`, has no new credential or redistribution boundary,
   and is immediately testable, but recent-history depth and volume coverage
   remain provider-dependent.
2. Add a credentialed one-minute vendor. FMP documents one-minute stock,
   index, and commodity chart endpoints, Twelve Data documents `1min` time
   series in exchange-local time, Alpha Vantage documents premium `1min`
   equity intraday data, and EODHD documents one-minute intraday data with
   request-unit costs. These services can improve contractual coverage but add
   credentials, quotas, symbol mapping, plan restrictions, and display or
   redistribution review.

The implemented choice is approach 1 for the local research product. The UI
has `日线` and `1 分钟` tabs only. One-minute requests are provider-native,
bounded to 1,500 bars, raw-priced, and never resampled. A tab switch aborts an
active screening run, clears the current market/range state, and loads the
interval-keyed cache. Cache, source health, fingerprint, saved plan, screening
archive, Worker request, chart reset key, latest-bar completion state, and
exact start/end time all retain the interval. Indicators and strategies keep
their selections but recalculate on the selected bars.

Minute mode refreshes the visible instrument once per minute during the venue
session and does not start daily shortcut refresh or daily multi-source audits.
Close-derived signals remain frozen until the latest minute completes; the
existing next-open/hybrid execution contract then applies to the following
minute bar. Period and custom-range screening operate on exact K-line counts.
Year-based rolling validation is disabled because the current bounded native
history cannot support a credible yearly fold. Missing provider volume is not
synthesized; volume-dependent studies are disabled when coverage is unreliable.

A live strict Yahoo N225 check on 2026-08-09 returned 1,500 native bars from
2026-08-03 12:39 through 2026-08-07 15:30. Yahoo published zero volume for this
index minute series, which the UI correctly reports as unavailable. A strict
Eastmoney N225 one-minute attempt returned an upstream 502 and was not adopted
as a fallback.

Primary references accessed 2026-08-09:

- https://site.financialmodelingprep.com/developer/docs
- https://site.financialmodelingprep.com/developer/docs/pricing
- https://twelvedata.com/docs/introduction/quickstart
- https://twelvedata.com/docs/analysis
- https://support.twelvedata.com/en/articles/5656039-how-to-get-historical-prices
- https://www.alphavantage.co/documentation/
- https://eodhd.com/financial-apis-blog/intraday-api-1-minute-intervals-for-the-past-year
- https://eodhd.com/financial-apis/api-limits

## 2026-08-11 reusable TradingView community-script intake

Twelve downloaded Pine files were reviewed: nine declare `indicator()` and
three declare `strategy()`. Two implementation approaches were compared:

1. Embed or execute Pine directly. This would promise closer source parity but
   TradingView's Advanced Charts documentation states that Pine Script is not
   supported and that custom studies must be written in JavaScript. It would
   also couple QuantScope to TradingView-only visual objects, strategy settings,
   and script licensing constraints.
2. Maintain independent TypeScript formula ports behind a typed community
   catalog. This reuses normalized `MarketBar[]`, existing indicator/strategy
   registries, finite parameter spaces, and the host execution engine. It
   requires explicit compatibility notes but is testable, causal, and suitable
   for future downloaded-file or page-referenced additions.

Approach 2 was selected. Each item now records kind, filename, license header,
compatibility level, causality, and omissions. Confirmed pivots publish on the
confirmation bar. MTF support/resistance is explicitly chart-timeframe-only
until a normalized aggregation adapter exists. Close-derived strategy targets
use the existing following-open execution contract even when a downloaded Pine
strategy requested same-close processing; TradingView documents the following
bar open as the default strategy fill and warns that same-close fills can be
misleading in some contexts.

The visible ranking UX was separately compared with a validation-first design.
Ordinal position is unstable when the strategy catalog or parameter grid grows,
whereas the existing 30-session excess-return/drawdown check plus 63-session
confirmation directly answers whether a selected strategy is still behaving as
expected. QuantScope therefore keeps objective ordering only as an internal
search mechanism. Result tables and shortcuts show four explicit statuses:
favorable, short/mid-term disagreement, review required, or insufficient
executions. Saved-rank reads/writes/backfills were removed; legacy database
columns remain inert for a reversible storage migration.

Primary references accessed 2026-08-11:

- https://www.tradingview.com/charting-library-docs/latest/resources/Frequently-Asked-Questions/
- https://www.tradingview.com/pine-script-docs/concepts/strategies/
- https://www.tradingview.com/pine-script-docs/language/execution-model/
- https://www.tradingview.com/pine-script-docs/concepts/repainting/
- https://www.tradingview.com/pine-script-docs/concepts/other-timeframes-and-data/

## 2026-08-13 local Wrangler migration exit recovery

The Windows launcher was observed with Wrangler 4.92.0 printing
`No migrations to apply!` while the Wrangler, npm, and launcher process chain
remained alive and idle. Port 3000 was still closed, proving that the launcher
had not advanced to application startup. Cloudflare documents
`wrangler d1 migrations apply DB --local` as the supported local migration
command and notes that CI/non-interactive execution skips confirmation; it does
not define a command-exit timeout or a separate machine-readable completion
mode.

Two recovery approaches were compared:

1. Apply an unconditional timeout and continue after killing Wrangler. This is
   simple but unsafe because a slow or blocked real migration could be
   interrupted and then incorrectly treated as successful.
2. Capture and relay Wrangler output, retain normal exit-code handling, and
   start a short exit grace period only after the exact no-pending-migrations
   terminal message appears. If the process remains alive after that message,
   terminate only the migration process tree and continue. Any timeout without
   the terminal success message remains a startup failure.

Approach 2 is selected. It addresses the reproduced no-op hang without
weakening migration failure handling. Direct SQLite mutation and migration
skipping were rejected because Wrangler owns the local D1 migration registry
and rollback semantics.

Primary references accessed 2026-08-13:

- https://developers.cloudflare.com/d1/wrangler-commands/
- https://developers.cloudflare.com/d1/best-practices/local-development/
- https://developers.cloudflare.com/d1/reference/migrations/
## 2026-08-21 three-strategy hierarchy and consensus

Three implementation approaches were compared:

1. Exhaustive N-way parameter/allocation enumeration is conceptually simple
   but grows cubically before allocation replay, overweights near-duplicate
   rules, and makes interactive cancellation/progress expensive.
2. A learned market-regime router or mixture-of-experts can dynamically choose
   specialists. AlphaMix uses an uncertainty-aware two-stage expert/router
   design, and published regime-switching portfolio work shows that target
   weights can depend materially on the prevailing state. This is promising,
   but QuantScope does not yet have an independently validated regime label,
   training pipeline, or out-of-sample router evaluation.
3. A bounded hierarchical ensemble first identifies a persistent core gate,
   manages faster rules as independent tactical sleeves, and aggregates the
   already-ranked live targets only after screening. Sliding-window trading-rule
   ensemble research reports that inertia and transaction-cost control are
   important, which aligns with retaining explicit gate/tactical state instead
   of majority-voting every bar.

Decision: implement option 3. Continue from retained pair parents, add one
non-equivalent third finalist, and replay positive tenth-based allocations only
for retained triples. Keep both long-only tactical modes and the existing
execution contract. Use a separate rank-weighted consensus reducer over up to
five diversified single/pair/triple plans; it reports a current target and
action but cannot feed back into historical ranking. A learned router remains
future work until causal regime features and walk-forward validation exist.

Primary research references:

- Sun, Wang, and An, *Quantitative Stock Investment by Routing
  Uncertainty-Aware Trading Experts*:
  https://arxiv.org/abs/2207.07578
- Collin-Dufresne, Daniel, and Saglam, *Liquidity Regimes and Optimal Dynamic
  Asset Allocation*: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3099895
- *Grammatical Evolution-based ensembles for algorithmic trading*:
  https://doi.org/10.1016/j.asoc.2019.105713
