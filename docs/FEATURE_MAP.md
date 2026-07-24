# Feature Map

| Feature | Implementation | UI | Tests | Documentation |
| --- | --- | --- | --- | --- |
| Index/ETF search | `lib/market/eastmoney.ts`, `lib/market/yahoo.ts`, `lib/market/index.ts`, `app/api/search/route.ts` | `app/MarketWorkspace.tsx`, locale copy | Provider filtering tests, live searches | `DATA_SOURCES.md` |
| OHLCV intervals and fallback | `lib/market/eastmoney.ts`, `lib/market/yahoo.ts`, `lib/market/nasdaq.ts`, `lib/market/index.ts`, `app/api/market/route.ts` | Toolbar and `PriceChart.tsx` | Parser tests, live series matrix | `DATA_SOURCES.md`, `DECISIONS.md` |
| Chart modes, indicators, zoom, and trade markers | `lib/analysis/indicators.ts`, `lib/analysis/trade-markers.ts` | `EChart.tsx`, `PriceChart.tsx`, stable chart labels in `MarketWorkspace.tsx`, locale copy | Indicator, marker-mapping, slider-zoom configuration, option-update restoration, and real-browser post-apply drag checks | `FUNCTIONS.md`, `DEBUGGING.md`, `TECH_RESEARCH.md` |
| Strategy backtest | `strategies.ts`, `built-in-strategies.ts`, `backtest.ts` | Strategy panel, `PriceChart.tsx`, `BacktestChart.tsx` | Long-only catalog, Channel BreakOut exit, execution, and cost tests | `DECISIONS.md`, `TECH_RESEARCH.md` |
| Automated screening | `screening.ts` | Lower screening panel, objective selector, parameter cap, progress, stop action, and best-result table | Grid coverage/cap/uniqueness, five-objective ranking, best-per-strategy sorting, progress, and cancellation tests | `FUNCTIONS.md`, `MODULE_PATTERNS.md`, `TECH_RESEARCH.md` |
| Strategy research layout | `MarketWorkspace.tsx`, `globals.css` | Upper chart/shortcut grid and lower strategy-lab/screening grid | Built-worker rendered order and copy test | `ARCHITECTURE.md` |
| Saved backtest shortcuts | `saved-backtests.ts`, `db/schema.ts`, `/api/saved-backtests` | Lower-lab save action and dedicated upper-right shortcut bar in `MarketWorkspace.tsx` | Payload validation and rendered-copy tests | `ARCHITECTURE.md`, `FUNCTIONS.md`, `DECISIONS.md` |
| Product copy and risk disclosure | `app/i18n/zh-CN.ts` | Workspace and footer | Rendered HTML test | `README.md` |
| Windows launcher | `open-quantscope.bat` | New maximized Edge window with default-browser fallback | Command and full-width browser inspection | `DEBUGGING.md` |
