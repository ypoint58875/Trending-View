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
- Each strategy provides `buildTarget(bars, parameters)`, producing a signed
  `-1/0/1` desired-position series without future data.

## Simulation

- `runBacktest(...)`: executes prior-bar targets at the next bar open, applies
  costs to long and short positions, records trade direction, and calculates
  equity, drawdown, return, Sharpe, win rate, profit factor, trade count,
  benchmark return, and a screening score.
- `buildTradeMarkers(trades)`: maps long/short entries and exits to chart-level
  buy and sell markers.
- `screenStrategies(...)`: runs 74 declared candidates and sorts them by score.
