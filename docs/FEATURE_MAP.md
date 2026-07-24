# Feature Map

| Feature | Implementation | UI | Tests | Documentation |
| --- | --- | --- | --- | --- |
| Index/ETF search | `lib/market/eastmoney.ts`, `lib/market/yahoo.ts`, `lib/market/index.ts`, `app/api/search/route.ts` | `app/MarketWorkspace.tsx`, locale copy | Provider filtering tests, live searches | `DATA_SOURCES.md` |
| OHLCV intervals and fallback | `lib/market/eastmoney.ts`, `lib/market/yahoo.ts`, `lib/market/nasdaq.ts`, `lib/market/index.ts`, `app/api/market/route.ts` | Toolbar and `PriceChart.tsx` | Parser tests, live series matrix | `DATA_SOURCES.md`, `DECISIONS.md` |
| Chart modes, indicators, and trade markers | `lib/analysis/indicators.ts`, `lib/analysis/trade-markers.ts` | `PriceChart.tsx`, locale copy | Indicator and marker-mapping tests | `FUNCTIONS.md` |
| Strategy backtest | `strategies.ts`, `built-in-strategies.ts`, `backtest.ts` | Strategy panel, `PriceChart.tsx`, `BacktestChart.tsx` | Catalog, Channel BreakOut, long/short execution, and cost tests | `DECISIONS.md`, `TECH_RESEARCH.md` |
| Automated screening | `screening.ts` | Screening panel and result table | Full-candidate sorting test | `FUNCTIONS.md` |
| Product copy and risk disclosure | `app/i18n/zh-CN.ts` | Workspace and footer | Rendered HTML test | `README.md` |
