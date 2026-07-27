# Technical Research

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
