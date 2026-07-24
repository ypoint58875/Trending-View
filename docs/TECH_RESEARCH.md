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
27,584 valid combinations across 32 strategies. Spaces smaller than the cap
are evaluated completely; larger spaces are sampled evenly while preserving
the default parameters. Execute small asynchronous chunks, report progress,
allow cancellation, and retain only the best full result per strategy. Use a
Web Worker or durable queue if measured job duration or concurrent usage
outgrows this browser-local design.

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
local engine does not reproduce pyramiding, intrabar stop/limit fills, or
TradingView's private Technical Ratings aggregation exactly. The product uses
long-only `0/1` targets and next-bar-open fills: positive signals buy or hold,
while negative reference signals sell to cash rather than open short positions.

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
