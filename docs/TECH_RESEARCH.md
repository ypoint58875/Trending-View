# Technical Research

Research date: 2026-07-24.

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
