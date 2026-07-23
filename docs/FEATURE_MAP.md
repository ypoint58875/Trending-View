# Feature Map

| Feature | Implementation | UI | Tests | Documentation |
| --- | --- | --- | --- | --- |
| Index/ETF search | `lib/market/eastmoney.ts`, `lib/market/yahoo.ts`, `lib/market/index.ts`, `app/api/search/route.ts` | `app/MarketWorkspace.tsx`, locale copy | Provider filtering tests, live searches | `DATA_SOURCES.md` |
| OHLCV intervals and fallback | `lib/market/eastmoney.ts`, `lib/market/yahoo.ts`, `lib/market/nasdaq.ts`, `lib/market/index.ts`, `app/api/market/route.ts` | Toolbar and `PriceChart.tsx` | Parser tests, live series matrix | `DATA_SOURCES.md`, `DECISIONS.md` |
| Chart modes and indicators | `lib/analysis/indicators.ts` | `PriceChart.tsx`, locale copy | Indicator tests | `FUNCTIONS.md` |
| Strategy backtest | `strategies.ts`, `backtest.ts` | Strategy panel, `BacktestChart.tsx` | Execution/cost test | `DECISIONS.md` |
| Automated screening | `screening.ts` | Screening panel and result table | Sorting test | `FUNCTIONS.md` |
| Product copy and risk disclosure | `app/i18n/zh-CN.ts` | Workspace and footer | Rendered HTML test | `README.md` |
