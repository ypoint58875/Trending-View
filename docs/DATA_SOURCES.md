# Data Sources

## Eastmoney website market data

- Search endpoint: `https://searchapi.eastmoney.com/api/suggest/get`
- Kline endpoint: `https://push2his.eastmoney.com/api/qt/stock/kline/get`
- Accessed: 2026-07-23
- Current parameters: symbol `secid`; `klt` in 1, 5, 15, 30, 60, or 101;
  forward adjustment `fqt=1`; selected OHLCV fields; bounded result limit.
- Raw sample: `data/raw/eastmoney_688484_daily_sample.json`
- Registry: `data/source_registry.jsonl`

Volume is retained in the provider's quote-page unit. The application displays
it as provider volume and does not silently convert it to shares.

These are public website endpoints, not a documented licensed API. They may
change or rate-limit requests. Do not treat them as an authoritative execution
feed.

## Reproducibility

Runtime responses are kept separate from calculations. The UI receives a
normalized `MarketSeries`, while the raw sample preserves provider field names
and row encoding for parser tests and incident comparison.

