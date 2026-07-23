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

## Strategies

- `getStrategy(id)`: resolves a registry entry.
- Each strategy provides `buildTarget(bars, parameters)`, producing a 0/1
  desired-position series without future data.

## Simulation

- `runBacktest(...)`: executes prior-bar targets at the next bar open, applies
  costs, and calculates equity, drawdown, return, Sharpe, win rate, profit
  factor, trade count, benchmark return, and a screening score.
- `screenStrategies(...)`: runs 36 declared candidates and sorts them by score.
