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
- `parseKlineRow(row)`: parses daily or intraday Eastmoney CSV rows.
- `parseYahooChart(...)` and `parseNasdaqRows(...)`: normalize provider payloads.

## Indicators

- `sma`, `ema`, `wma`, `dema`, `bollingerBands`, `vwap`, `supertrend`,
  `ichimoku`, `rsi`, `macd`, `kdj`, `stochasticRsi`, `cci`, `williamsR`,
  `adx`, `roc`, `mfi`, `cmf`, `atr`, and `obv` return deterministic arrays
  aligned with source bars.
- `stochasticSlow` and `parabolicSar` support the corresponding built-in
  strategy equivalents.

## Strategies

- `getStrategy(id)`: resolves a registry entry.
- `TRADINGVIEW_BUILT_IN_STRATEGY_IDS`: the ordered 20-entry completeness
  contract for the official built-in template directory.
- Each strategy provides `buildTarget(bars, parameters)`, producing a long-only
  `0/1` desired-position series without future data. Negative reference signals
  are normalized to flat.

## Simulation

- `runBacktest(...)`: executes prior-bar targets at the next bar open, applies
  costs to long entries and exits, and calculates equity, drawdown, return,
  Sharpe, win rate, profit factor, trade count, benchmark return, and a
  screening score.
- `buildTradeMarkers(trades)`: maps every long entry to a buy marker and every
  long exit to a sell marker.
- `buildScreeningCandidates(maxPerStrategy)`: expands the constrained
  parameter spaces for all registered strategies, includes each default
  parameter set, and deterministically samples any space above the 2,500 hard
  cap.
- `optimizeStrategies(...)`: runs candidates in interruptible chunks, reports
  progress, keeps only the highest-scoring result for each strategy, and sorts
  those best results by score.

## Saved backtests

- `createSaveBacktestInput(...)`: creates a compact current-backtest snapshot.
- `parseSaveBacktestInput(...)`: validates index/ETF identity, strategy,
  parameters, date range, costs, and metrics at the API boundary.
- `GET /api/saved-backtests`: lists up to 20 current-user shortcuts.
- `POST /api/saved-backtests`: inserts or updates the current user's latest
  snapshot for an instrument.
- `DELETE /api/saved-backtests?id=...`: removes only the current user's record.
