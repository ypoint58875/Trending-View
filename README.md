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
- Twenty indicators, including moving-average variants, Bollinger Bands,
  Ichimoku, Supertrend, momentum, volatility, and volume studies.
- Twelve strategy families with editable parameters.
- Date-range backtests with initial cash, commission, and slippage settings.
- Next-bar-open execution to avoid same-bar look-ahead.
- Thirty-six-candidate automated screening ranked by a return, Sharpe, drawdown,
  and trade-count score.

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

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
order-book liquidity. Index backtests are price proxies and do not represent a
directly tradable instrument. Volume-based studies are unavailable or
uninformative when an index source does not publish volume.

TradingView is a product reference only. This project does not redistribute the
TradingView Advanced Charts library or copy protected Pine scripts.
