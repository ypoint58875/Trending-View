# Function Map

## Market data

- `searchEastmoney(query)`: searches securities and normalizes exchange metadata.
- `fetchEastmoneySeries(instrument, interval, limit)`: fetches and normalizes
  OHLCV bars.
- `parseKlineRow(row)`: parses daily or intraday Eastmoney CSV rows.

## Indicators

- `sma`, `ema`, `rsi`, `macd`, `bollingerBands`, `atr`, `kdj`, and `obv`
  return deterministic arrays aligned with source bars.

## Strategies

- `getStrategy(id)`: resolves a registry entry.
- Each strategy provides `buildTarget(bars, parameters)`, producing a 0/1
  desired-position series without future data.

## Simulation

- `runBacktest(...)`: executes prior-bar targets at the next bar open, applies
  costs, and calculates equity, drawdown, return, Sharpe, win rate, profit
  factor, trade count, benchmark return, and a screening score.
- `screenStrategies(...)`: runs 18 declared candidates and sorts them by score.

