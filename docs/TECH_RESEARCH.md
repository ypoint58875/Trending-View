# Technical Research

Research date: 2026-07-23.

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
private token and returned current `688484` daily and minute data during the
research check.

Source:

- https://github.com/akfamily/akshare/blob/main/docs/data/stock/stock.md

Risk: no public endpoint SLA or commercial-use guarantee.

### Option B: Tushare Pro

Tushare publishes stock/index daily and minute interfaces, but access is gated
by accounts and point tiers; index daily access is documented at a 2,000-point
threshold.

Sources:

- https://tushare.pro/document/1?doc_id=108
- https://tushare.pro/document/1?doc_id=234

Decision: use Eastmoney for the no-credential prototype behind a replaceable
adapter. Recommend Tushare or an exchange-licensed feed for production.

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

Decision: use a transparent TypeScript engine for the 18-candidate first
version. Move to a queued Python service for walk-forward studies or thousands
of combinations.

