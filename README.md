# QuantScope

QuantScope is a Chinese-market research workspace inspired by professional
charting terminals. It combines security search, minute and daily OHLCV charts,
technical indicators, strategy backtests, and automated parameter screening in
one responsive page.

## Included

- Search for Shanghai, Shenzhen, and Beijing securities and major indices.
- 1, 5, 15, 30, and 60-minute bars plus daily bars.
- Candlestick and line chart modes with volume and synchronized zoom.
- Eight indicators: SMA, EMA, Bollinger Bands, RSI, MACD, KDJ, ATR, and OBV.
- Six strategy families with editable parameters.
- Date-range backtests with initial cash, commission, and slippage settings.
- Next-bar-open execution to avoid same-bar look-ahead.
- Eighteen-candidate automated screening ranked by a return, Sharpe, drawdown,
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

The default adapter reads public website endpoints exposed by Eastmoney. These
endpoints are convenient for a prototype but have no published stability or
commercial-use SLA. Replace the adapter with a licensed provider before
production or investment use.

Backtests are research simulations. They do not model every China-market rule,
including limit-up/limit-down fills, suspensions, lot constraints, corporate
actions beyond the selected adjustment mode, or real order-book liquidity.
Index backtests are price proxies and do not represent a directly tradable
instrument.

TradingView is a product reference only. This project does not redistribute the
TradingView Advanced Charts library or copy protected Pine scripts.

