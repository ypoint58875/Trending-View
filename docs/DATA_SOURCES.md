# Data Sources

## Eastmoney website market data

- Search endpoint: `https://searchapi.eastmoney.com/api/suggest/get`
- Kline endpoint: `https://push2his.eastmoney.com/api/qt/stock/kline/get`
- Accessed: 2026-07-23
- Current parameters: symbol `secid`; `klt` in 1, 5, 15, 30, 60, or 101;
  forward adjustment `fqt=1`; selected OHLCV fields; bounded result limit.
- Raw sample: `data/raw/eastmoney_n225_daily_sample.json`
- Registry: `data/source_registry.jsonl`

Volume is retained in the provider's quote-page unit. The application displays
it as provider volume and does not silently convert it to shares.

These are public website endpoints, not a documented licensed API. They may
change or rate-limit requests. Do not treat them as an authoritative execution
feed.

## Yahoo Finance website market data

- Search endpoint: `https://query1.finance.yahoo.com/v1/finance/search`
- Chart endpoint: `https://query1.finance.yahoo.com/v8/finance/chart/{symbol}`
- Backup host: `query2.finance.yahoo.com`
- Accessed: 2026-07-23
- Current parameters: interval-specific range, no pre/post-market bars, and
  bounded local output.
- Raw sample: `data/raw/yahoo_sox_daily_sample.json`

Yahoo expands global index/ETF discovery and history. The adapter retries the
equivalent query2 host, but regional HTTP 403 responses remain possible.

## Nasdaq website historical data

- Endpoint: `https://api.nasdaq.com/api/quote/{symbol}/historical`
- Accessed: 2026-07-23
- Current parameters: `assetclass` index or ETF, five-year date range, and a
  bounded row limit.
- Raw sample: `data/raw/nasdaq_sox_daily_sample.json`

Nasdaq is used only as a daily-history fallback for supported symbols. It is
not an intraday replacement and may publish no volume for indexes.

## Reproducibility

Runtime responses are kept separate from calculations. The UI receives a
normalized `MarketSeries`, while raw samples preserve provider field names and
row encoding for parser tests and incident comparison.
