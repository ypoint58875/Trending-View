# Function Map

## Market data

- `searchEastmoney(query)`: searches and retains only index/ETF results.
- `searchYahoo(query)`: extends global index/ETF symbol discovery.
- `searchMarketAssets(query)`: merges and de-duplicates provider results.
- `fetchEastmoneySeries(instrument, interval, limit)`: fetches and normalizes
  OHLCV bars.
- `fetchYahooSeries(instrument, interval, limit)`: fetches global chart history.
- `fetchNasdaqDailySeries(instrument, limit)`: fetches supported daily index/ETF
  history.
- `fetchMarketSeries(...)`: applies the ordered provider fallback.
- `/api/market?mode=history`: returns cacheable normalized history.
- `/api/market?mode=latest`: returns an uncached window of up to ten recent
  bars for current-bar replacement.
- `mergeLatestMarketSeries(...)`: retains cached history while replacing
  overlapping recent bars from the same interval and source.
- `parseKlineRow(row)`: parses daily or intraday Eastmoney CSV rows.
- `parseYahooChart(...)` and `parseNasdaqRows(...)`: normalize provider payloads.

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

## Chart configuration

- `buildIndicatorSeries(bars, indicator, parameters, labels)`: calculates the
  selected indicator with the supplied display parameters and returns its
  ECharts series without consulting strategy state.
- `buildPriceDataZoom(barsLength, overlayIndicator)`: links the price, volume,
  and indicator axes to one inside zoom and one directly draggable timeline
  slider, showing the latest 120 bars initially.
- `applyDataZoomWindow(option, window)`: reapplies the user's current zoom
  start/end percentages when chart series or indicators update.

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

## Saved backtests

- `createSaveBacktestInput(...)`: creates a compact current-backtest snapshot.
- `parseSaveBacktestInput(...)`: validates index/ETF identity, strategy,
  parameters, date range, costs, and metrics at the API boundary.
- `GET /api/saved-backtests`: lists up to 20 current-user shortcuts.
- `POST /api/saved-backtests`: inserts or updates the current user's latest
  snapshot for an instrument.
- `DELETE /api/saved-backtests?id=...`: removes only the current user's record.
