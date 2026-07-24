# QuantScope

QuantScope is a global index and ETF research workspace inspired by
professional charting terminals. It combines filtered asset search, minute and
daily OHLCV charts, technical indicators, strategy backtests, and automated
parameter screening in one responsive page.

## Included

- Search only global indexes and exchange-traded funds; individual equities are
  excluded from results.
- 1, 5, 15, 30, and 60-minute bars plus daily bars.
- Candlestick and line chart modes with volume and synchronized zoom.
- Cached completed history plus an uncached latest-bar overlay on open, every
  60 seconds while visible, and on focus/visibility, with current-bar strategy
  guidance recalculated after each overlay.
- Explicit green-up/red-down chart legend and separate range-end valuation
  markers so a forced backtest close is not presented as a strategy sell.
- Twenty indicators, including moving-average variants, Bollinger Bands,
  Ichimoku, Supertrend, momentum, volatility, and volume studies.
- Twelve extended strategy families plus independent equivalents of all 20
  templates in TradingView's official built-in-strategy directory.
- Date-range backtests with initial cash, commission, and slippage settings.
- Long-only execution with next-bar-open fills for close signals and intrabar
  stop fills for predefined breakout prices, including gap-aware pricing.
- Chart-level buy/sell markers derived from the active backtest's actual fills.
- Per-user saved backtests with a right-side shortcut bar that restores the
  instrument, interval, strategy, parameters, date range, and cost settings.
- Bounded parameter-grid optimization across all 32 strategies, configurable
  up to 2,500 combinations per strategy and ranked by a return, Sharpe,
  drawdown, and trade-count score.
- Chunked screening progress and cancellation, retaining only the best
  parameter set for each strategy.

## Run locally

Requirements: Windows and Node.js 22.13 or newer.

For one-click local use, double-click `open-quantscope.bat`. The launcher:

- runs QuantScope only at `http://127.0.0.1:3000`;
- initializes the project-local saved-backtest database;
- opens a new maximized Edge window when Edge is available; and
- never requires a ChatGPT or other account.

Keep the `QuantScope Local Server` window open while using the application.
Closing that window stops the local server. Saved backtests remain under
`.wrangler/state` after the server stops.

For manual development:

```bash
npm install
npm run local:db:migrate
npm run local:dev
```

Open `http://127.0.0.1:3000`.

## Test and build

```bash
npm test
npm run build
```

## Data and limitations

The provider chain reads public website endpoints exposed by Eastmoney, Yahoo
Finance, and Nasdaq. These endpoints are convenient for a prototype but have
no published stability or commercial-use SLA. Replace the adapters with a
licensed provider before production or investment use.

Backtests are research simulations. They do not model every venue rule,
tracking error, tax, suspension, lot constraint, corporate action, or real
order-book liquidity. Intrabar stop fills use chart OHLC rather than tick data.
Index backtests are price proxies and do not represent a directly tradable
instrument. Volume-based studies are unavailable or uninformative when an
index source does not publish volume.

The current strategy guidance intentionally evaluates the newest provider bar,
including an unfinished intraday or daily bar. It can therefore change again
before the bar closes. The historical backtest keeps its separate no-look-ahead
execution rules.

TradingView is a product reference only. This project does not redistribute the
TradingView Advanced Charts library or copy protected Pine scripts. The
built-in strategy implementations are transparent, independently written
long-only equivalents. Negative or short signals from an original template
close an existing long position instead of opening a short position. Five
price-triggered templates use completed-bar stop orders with gap-aware fills.
Strategies whose originals depend on pyramiding, multi-order brackets, Bar
Magnifier data, or TradingView's private Technical Ratings engine are not
claimed to be execution-identical.
