# Function Map

## Market data

- `searchEastmoney(query)`: searches and retains only index/ETF results.
- `searchYahoo(query)`: extends global index/ETF symbol discovery.
- `searchMarketAssets(query)`: merges and de-duplicates provider results.
- `fetchEastmoneySeries(instrument, interval, limit)`: fetches and normalizes
  OHLCV bars with `fqt=1` and marks the result corporate-action adjusted.
- `fetchYahooSeries(instrument, interval, limit)`: fetches global chart history.
  Daily bars scale OHLC per bar by a finite positive
  `adjclose / raw close`; invalid or missing factors leave their bars raw and
  make the entire series metadata raw. Intraday output is raw.
- `fetchNasdaqDailySeries(instrument, limit)`: fetches supported daily index/ETF
  history and marks it raw.
- `fetchMarketSeries(...)`: applies the ordered provider fallback.
- `/api/market?mode=history`: returns cacheable normalized history.
- `/api/market?mode=latest`: returns an uncached window of up to ten recent
  bars for current-bar replacement. The current UI requests five.
- `mergeLatestMarketSeries(...)`: idempotently retains history and replaces
  overlapping bars by `time`, then sorts and limits the result. It accepts only
  the same interval and source; the workspace does not merge a changed source.
- `parseKlineRow(row)`: parses daily or intraday Eastmoney CSV rows.
- `parseYahooChart(...)` and `parseNasdaqRows(...)`: normalize provider payloads
  into `MarketBar[]`. Provider volume passes through without price-adjustment
  scaling.

## Indicators

- `sma`, `ema`, `wma`, `dema`, `bollingerBands`, `vwap`, `supertrend`,
  `ichimoku`, `rsi`, `macd`, `kdj`, `stochasticRsi`, `cci`, `williamsR`,
  `adx`, `roc`, `mfi`, `cmf`, `atr`, and `obv` return deterministic arrays
  aligned with source bars.
- `stochasticSlow` and `parabolicSar` support the corresponding built-in
  strategy equivalents.
- `getIndicator(id)`: resolves display placement and parameter metadata from
  the shared indicator registry.
- `getDefaultIndicatorParameters(id)`: returns a fresh default parameter
  object for one indicator.
- `createDefaultIndicatorSettings()`: creates independent session settings for
  every registered indicator.
- `MarketWorkspace` keeps one `focusedIndicator` for settings and an ordered
  `visibleIndicatorIds` collection for chart output. Focusing a hidden
  indicator adds it to the visible order; its visibility can then be toggled
  independently without discarding its parameter settings.

## Chart configuration

- `buildIndicatorSeries(bars, indicator, parameters, labels, xAxis, yAxis)`:
  calculates one configured indicator and returns its ECharts series without
  consulting strategy state.
- `buildPriceChartLayout(times, paneCount)`: keeps overlay indicators on the
  main price axes and allocates one lower grid for each visible pane indicator.
- `buildPriceDataZoom(barsLength, xAxisIndexes)`: links price, volume, and all
  indicator axes to one inside zoom and one directly draggable timeline slider,
  showing the latest 120 bars initially.
- `applyDataZoomWindow(option, window)`: reapplies the user's current zoom
  start/end percentages when chart series or indicators update.
- `buildStrategyLineSeries(lines, labels)`: renders strategy price references
  as semantic dashed lines on the main price axes.

## Strategies

- `getStrategy(id)`: resolves a registry entry.
- `TRADINGVIEW_BUILT_IN_STRATEGY_IDS`: the ordered 20-entry completeness
  contract for the official built-in template directory.
- Every strategy provides `buildTarget(bars, parameters)`, producing a
  long-only `0/1` desired-position series without future data.
- Price-triggered strategies additionally provide
  `buildOrders(bars, parameters)`, producing bar-aligned long-entry and
  long-exit stop levels derived only from completed bars.
- `INTRABAR_PRICE_ORDER_STRATEGY_IDS`: the ordered contract covering Channel
  BreakOut, Momentum, Pivot Reversal, Price Channel, and Volty Expan Close.
- `buildStrategyOrders(bars, strategyId, parameters)`: validates and returns the
  strategy's existing bar-aligned order plan, or `null` when the strategy has
  no price-order contract.
- `buildStrategyPriceLines(...)`: pure strategy visual contract. It reuses
  `buildStrategyOrders` directly for the five price-order strategies and
  provides continuous references for `sma-cross`, `ema-cross`,
  `bollinger-reversion`, `donchian-breakout`, `supertrend-trend`,
  `ichimoku-trend`, `vwap-reversion`, `tv-bollinger-bands`,
  `tv-bollinger-directed`, `tv-keltner-channels`, `tv-parabolic-sar`, and
  `tv-supertrend`. Other strategies return an empty array rather than an
  invented line.

## Stability

- `buildNearbyParameterSets(strategyId, baseParameters)`: returns the base
  parameters followed by valid variants that move one parameter at a time to
  the immediately lower or higher value in its screening domain.
- `classifyMarketRegimes(bars)`: classifies each eligible daily bar as up when
  close is above the current 60-day SMA and that SMA is above its value 20 bars
  earlier, down for the inverse, and sideways otherwise. Warm-up bars are
  unclassified.
- `summarizeNearbyBacktests(base, variants)`: reports return, drawdown, and
  trade-count ranges plus nearby return-sign agreement. Stability requires at
  least one valid variant and all inclusive checks: at least 75% sign
  agreement, at most a 15-percentage-point return range, and at most 10
  percentage points of drawdown deterioration.
- `summarizeRegimeReturns(bars, equity)`: compounds consecutive current-rule
  equity growth by the regime of the current bar.
- `analyzeStrategyStability(...)`: reruns the existing backtest for the base
  and nearby sets and returns diagnostics only; it never selects or applies a
  parameter.

## Simulation

- `buildLiveStrategyGuidance(...)`: evaluates the newest available bar through
  the shared strategy registry and returns buy, sell, hold, or wait guidance.
- `runBacktest(...)`: executes prior-bar targets at the next bar open or fills
  predefined stop orders when the active bar touches them. A stop crossed by a
  gap fills at the bar open. The function applies costs to long entries and
  exits and calculates equity, drawdown, return, Sharpe, win rate, profit
  factor, trade count, benchmark return, and a screening score.
- `buildTradeMarkers(trades)`: maps every long entry to a buy marker and every
  strategy exit to a sell marker while separating range-end valuation exits.
- `buildScreeningCandidates(maxPerStrategy)`: expands the constrained
  parameter spaces for all registered strategies, includes each default
  parameter set, and deterministically samples any space above the 2,500 hard
  cap.
- `screeningObjectiveValue(result, objective)`: maps a backtest to balanced,
  return/drawdown, total-return, minimum-drawdown, or Sharpe utility.
- `compareScreeningResults(left, right, objective)`: orders candidates under
  the selected objective and deterministic metric tie-breakers.
- `optimizeStrategies(...)`: runs candidates in interruptible chunks, reports
  progress, keeps only the best result for each strategy under the selected
  objective, and sorts those best results by the same objective.

Historical price bars, indicators, strategy lines, live guidance, stability,
and backtests all receive the same normalized `MarketBar[]` from the active
`MarketSeries`.

## Saved backtests

- `createSaveBacktestInput(...)`: creates a compact current-backtest snapshot.
- `parseSaveBacktestInput(...)`: validates index/ETF identity, strategy,
  parameters, date range, costs, and metrics at the API boundary.
- `GET /api/saved-backtests`: lists up to 20 current-user shortcuts.
- `POST /api/saved-backtests`: inserts or updates the current user's latest
  snapshot for an instrument.
- `DELETE /api/saved-backtests?id=...`: removes only the current user's record.

The persistence shape retains an interval field for compatibility. New UI
saves use `1d`, and opening a shortcut does not change the daily-only workspace
interval.
