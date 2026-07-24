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

Decision: use a transparent TypeScript engine for the 74-candidate current
version. Move to a queued Python service for walk-forward studies or thousands
of combinations.

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
local engine does not yet reproduce pyramiding, intrabar stop/limit fills, or
TradingView's private Technical Ratings aggregation exactly. Signed position
targets and next-bar-open fills were selected because they cover the common
long, short, and reversal semantics without look-ahead.
