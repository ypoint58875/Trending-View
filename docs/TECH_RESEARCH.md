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
31,172 valid combinations across 32 strategies. Spaces smaller than the cap
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
Use up to 500 bars before the selected range as causal warm-up so unrelated
pre-range chart history does not dominate runtime or initialization state.

Two historical execution choices were compared:

1. prior completed-bar signal at the next open, which is conservative and
   avoids using the completed close as both signal and fill;
2. current dynamic daily signal at the same-day close, which approximates a
   manual tail-session rebalance but can differ from the final official signal.

Decision: all historical close-derived buy, sell, add, and reduce signals
execute at the following bar's open. This is the stable no-look-ahead contract
for the strategy lab, single screening, combination screening, and stability
diagnostics. The manual historical product also evaluates strategies with
predefined price references through their close-derived target and the
following open. The engine retains its tested intrabar price-order capability
for reference compatibility, but that policy is not selected by the current
workspace.

Only the live action label is time-sensitive. Using `Asia/Shanghai`
explicitly, times before 15:00 show that the current dynamic signal may still
be acted on near the same-day close; 15:00 or later show next-trading-day open
execution. The label does not attempt to infer weekends or exchange holidays,
and it does not change historical metrics.

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
