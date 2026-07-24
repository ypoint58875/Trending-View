# QuantScope

QuantScope is a daily-only workspace for researching one global index or ETF at
a time and making manual swing decisions. It combines filtered asset search,
dividend/split-adjusted price charts when the selected source supports them,
technical indicators, strategy backtests, parameter sensitivity diagnostics,
and bounded parameter screening in one responsive page. It does not place
trades or run unattended jobs.

## Included

- Search only global indexes and exchange-traded funds; individual equities are
  excluded from results.
- One fixed daily interval in the user interface. Provider adapters and API
  types retain interval support for internal compatibility.
- Candlestick and line chart modes with volume and synchronized zoom.
- Cached history plus an uncached latest-bar overlay on open, every
  60 seconds while visible, and on focus/visibility, with current-bar strategy
  guidance recalculated after each compatible overlay. Source or
  price-adjustment mismatches retain the complete existing history.
- Explicit price-adjustment metadata from the selected `MarketSeries`.
  Eastmoney and valid Yahoo daily series are marked
  `corporate-action-adjusted`; Nasdaq is a raw daily fallback.
- Explicit green-up/red-down chart legend and separate range-end valuation
  markers so a forced backtest close is not presented as a strategy sell.
- Twenty independently configurable indicators, including moving-average
  variants, Bollinger Bands, Ichimoku, Supertrend, momentum, volatility, and
  volume studies. One indicator is focused for editing while an ordered
  collection can remain visible. Each indicator retains its own parameters
  while the page remains open.
- Overlay indicators share the price axis; each lower-pane indicator receives
  its own pane. Price, volume, and all indicator panes share the same zoom.
  Series names show their actual parameters in a scrolling legend.
- Indicator visibility is independent from strategy selection. The active
  strategy contributes actual buy/sell fills and, where the rule has
  continuous price references, dashed strategy lines on the main price axis.
  Technical Ratings shows the same EMA-20 and SMA-50 references used by its
  price votes.
- Twelve extended strategy families plus independent equivalents of all 20
  templates in TradingView's official built-in-strategy directory.
- Date-range backtests with initial cash, commission, and slippage settings.
- Long-only execution with next-bar-open fills for close signals and intrabar
  stop fills for predefined breakout prices, including gap-aware pricing.
- Chart-level buy/sell markers derived from the active backtest's actual fills.
- Per-user saved backtests with a right-side shortcut bar that restores the
  instrument, strategy, parameters, date range, and cost settings. The
  workspace interval remains daily. Legacy non-daily records keep their stored
  interval label and disclose that opening them recalculates on daily bars.
- A nearby-parameter stability diagnostic that changes one parameter at a time
  to the immediately lower or higher configured value, reruns valid variants,
  and reports return-sign agreement, return/drawdown/trade-count ranges, and
  performance in up, sideways, and down market regimes. It validates the exact
  parameter shape and requires 120 in-range daily observations, two completed
  base trades, and a nearby variant before showing stable/sensitive. It never
  selects or applies a replacement parameter.
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

Eastmoney requests forward-adjusted data with `fqt=1`. Yahoo daily bars scale
open, high, low, and close per bar by a finite positive
`adjclose / raw close`; a missing or invalid factor leaves that bar raw and
marks the whole returned series as raw. Yahoo intraday support remains raw
inside the provider layer, and Nasdaq is always a raw daily fallback. Provider
volume is never rescaled. `MarketSeries.priceAdjustment` is the authoritative
adjustment label displayed by the UI. Yahoo also scales an adjusted series'
provider previous close and, after limiting output, uses the immediately
preceding normalized bar as `previousClose`.

The chart, indicators, strategy reference lines, current-bar guidance,
stability analysis, and backtests all consume the same normalized
`MarketBar[]`. For ETFs, adjusted prices reduce mechanical distribution/split
gaps. For indexes, the provider symbol and methodology determine whether the
source represents a price index or a total-return index; QuantScope does not
convert one methodology into the other or add constituent-company events and
fundamentals. This is not separate cash-distribution accounting, reinvestment,
cash yield, or a synthetic total-return ledger.

Backtests are research simulations. They do not model every venue rule,
tracking error, tax, suspension, lot constraint, corporate action, or real
order-book liquidity. Intrabar stop fills use chart OHLC rather than tick data.
Index backtests are price proxies and do not represent a directly tradable
instrument. Volume-based studies are unavailable or uninformative when an
index source does not publish volume.

The current strategy guidance intentionally evaluates the newest provider
daily bar, which may still be unfinished. It can therefore change again before
the bar closes. The historical backtest keeps its separate no-look-ahead
execution rules.

The stability label is descriptive, not predictive. Invalid parameters do not
run a stability backtest. Evidence requires at least 120 daily observations
inside the selected range, two completed base trades, and one valid nearby
variant. Insufficient evidence is displayed with explicit reasons rather than
stable/sensitive. With sufficient evidence, stability additionally requires at
least 75% return-sign agreement, a return range no wider than 15 percentage
points, and no more than 10 percentage points of drawdown deterioration.
Regimes use the current close versus a 60-day SMA and the SMA's 20-bar slope,
retaining earlier bars for causal warm-up. These checks do not replace
out-of-sample or walk-forward validation.

TradingView is a product reference only. This project does not redistribute the
TradingView Advanced Charts library or copy protected Pine scripts. The
built-in strategy implementations are transparent, independently written
long-only equivalents. Negative or short signals from an original template
close an existing long position instead of opening a short position. Five
price-triggered templates use completed-bar stop orders with gap-aware fills.
Strategies whose originals depend on pyramiding, multi-order brackets, Bar
Magnifier data, or TradingView's private Technical Ratings engine are not
claimed to be execution-identical.
