# Debugging

## Local launcher does not open QuantScope

1. Confirm `node --version` reports 22.13.0 or newer and `npm --version`
   succeeds.
2. Confirm port 3000 is free. The launcher refuses to open a different
   application that already owns the port.
3. Read the visible `QuantScope Local Server` window for vinext errors.
4. If a previous launcher is already serving QuantScope, launch again: the
   readiness check now reuses that server before touching the D1 migration
   state.
5. Run `npm run local:db:migrate` if the saved-backtest API reports
   `PERSISTENCE_UNAVAILABLE`.
6. Keep `.wrangler/state` to retain local saved backtests. Removing that
   directory resets local persistence.
7. Run `npm ci` if `node_modules` is missing or dependencies are damaged.

The launcher never falls back to the hosted site. The local UI and saved
records do not require login, but live market-data providers still require
internet access.

## Market route returns `UPSTREAM_UNAVAILABLE`

1. Call the provider URL from the same network.
2. Check whether Eastmoney changed `QuotationCodeTable.Data` or `data.klines`.
3. Confirm daily rows use `YYYY-MM-DD` and minute rows use
   `YYYY-MM-DD HH:mm`.
4. For global daily history, check configured EODHD status/token handling,
   Yahoo query1/query2 status, and then Nasdaq `status.rCode`.
5. Check for provider rate limiting before increasing timeouts.
6. If history succeeds through Yahoo but every latest refresh fails, inspect
   `series.instrument.secid`: a resolved Yahoo series should carry a Yahoo
   symbol such as `^N225`, not an Eastmoney identifier such as `100.N225`.
   Legacy saved values are translated at request time; a fresh history response
   should normalize the stored identity.

## Search returns an individual equity

Inspect the source classification fields and update the adapter-level asset
filter. Do not add UI-only filtering: unsupported asset types must never cross
the API boundary.

## Empty chart

1. Inspect `/api/market` and confirm `bars` is non-empty.
2. Confirm every bar has finite OHLC values and a valid timestamp.
3. Check the browser console for ECharts initialization errors.
4. If the chart disappeared only after opening a saved strategy for the same
   index, inspect `canReuseSavedBacktestMarketSeries(...)`. The saved, active,
   and active-series canonical keys should match (for example, Eastmoney
   `100.N225` and Yahoo `^N225`) and the successful non-empty series should be
   preserved. Provider alias differences alone must not clear market state.

## Indicator visibility or parameters do not restore

1. A fresh browser profile intentionally starts with every indicator hidden.
2. Click an indicator once to show it and again to hide it; a focused hidden
   button uses a neutral style and is not active on the chart.
3. Device-local parameter memory uses
   `quantscope.indicator-preferences.v1`. Invalid stored values are discarded
   and safe registry defaults are used.
4. A saved shortcut restores only the indicators visible when it was saved,
   with their saved parameters. Rows created before migration
   `0003_heavy_nemesis.sql` intentionally restore no indicators.
5. If new saves return `PERSISTENCE_UNAVAILABLE`, run
   `npm run local:db:migrate` and retry.

## Daily chart does not reach 2000

1. Confirm the instrument existed in 2000; later-listed ETFs begin at their
   first provider-available bar.
2. Confirm the history request uses `limit=10000` and `mode=history`.
3. Check the provider URL for Eastmoney `beg=20000101`, EODHD
   `from=2000-01-01`, Yahoo `period1=946684800`, or Nasdaq
   `fromdate=2000-01-01`.
4. If Eastmoney starts later, confirm the longer-history EODHD/Yahoo attempts
   run and that the longer valid series wins without merging providers.
5. Do not treat the five-bar `mode=latest` overlay as the history response.

## Latest strategy guidance does not update

1. Confirm the page is visible; background tabs intentionally do not poll.
2. Check the displayed update time and use the refresh button once.
3. Confirm `/api/market?mode=latest` returns `Cache-Control: no-store` and a
   newer `fetchedAt` value. History mode should remain cacheable.
4. Remember that the guidance uses the provider's newest bar. A web endpoint
   may still be delayed even when the application does not cache it.
5. Confirm an end-of-range diamond is labeled as a valuation close, not a
   strategy sell.

## Chart timeline cannot be dragged

1. Confirm the slider data zoom has `brushSelect: false`; ECharts otherwise
   reserves the selected fill for brush selection instead of moving the window.
2. Drag the green selected range to move it, or drag either bright handle to
   resize it.
3. Confirm `EChart` is initialized only once and reapplies the captured zoom
   window when trade markers or indicators update.
4. Confirm the reset key changes only when the instrument or interval changes.
5. Run the chart configuration test, apply a screening result, and repeat the
   drag in a real browser.
6. If a visible price tooltip disappears during a 60-second refresh, confirm
   chart updates use component `replaceMerge` and do not recreate tooltip or
   axis-pointer state with `notMerge: true`.

## Browser shows an empty pane to the right

The workspace already uses the full webpage viewport. A gray vertical divider
with a second empty region is a browser split pane, not unused page width.
Close the split pane or launch the site through `open-quantscope.bat`, which
opens a new maximized Edge window when Edge is installed.

## Backtest has no trades

The selected parameters may produce no entry signal in the chosen date range.
Expand the range or change the strategy. Do not weaken assertions or inject a
trade only to make a test pass.

## A breakout trade appears one bar late

1. Confirm the strategy is registered with `buildOrders`, not only
   `buildTarget`.
2. Confirm each order at bar N uses data ending at bar N-1.
3. For a long stop, require `high >= stop` and fill at `max(open, stop)`.
4. For a long exit stop, require `low <= stop` and fill at
   `min(open, stop)`.
5. Confirm the configured tick is present after loading an older saved
   backtest; defaults are merged into saved parameter snapshots.
6. Run the synthetic stop, gap, and prefix-invariance tests before comparing
   live provider data.

## Parameter screening is slow

1. Signal targets intentionally scan complete loaded history so persistent
   strategy state is not reset at an arbitrary warm-up boundary. The selected
   range limits performance measurement, not signal construction.
2. The first stage intentionally evaluates all 37,131 registered parameter
   combinations. There is no production cap or sampling control.
3. Confirm only compact metrics for each eligible strategy's top 30 unfiltered
   candidates survive into the EMA stage. Only the final unique winner per
   strategy should retain complete execution state for pair replay.
4. Confirm the unified run advances through parameter, entry-filter, pair, and allocation
   stages. The single-strategy column is produced by the parameter stage; the
   combination column is available after allocation replay.
5. Confirm EMA(5-8) runs only for the explicit trend/breakout/momentum family.
   Channel BreakOut and Price Channel must participate; reversal and
   candlestick families must remain unfiltered.
6. Confirm each pair uses the exact parameters of its two unique standalone
   winners. With 34 winners and two equivalent ID pairs excluded, the current
   maximum is 559 pairs under the 4,096 safety bound. Both 60/40 and 40/60
   assignments should be compared.
7. Use the stop action when a run is no longer useful.
8. Confirm progress continues to advance. Before the first evaluation, at each
   stage transition, and after every eight evaluations, the optimizer yields
   through the browser cooperative scheduler and then crosses a timer-task
   boundary. The timer boundary is required because a chain of prioritized
   scheduler continuations can otherwise finish without giving React and the
   browser a visible paint opportunity. The chart and stop control should
   therefore appear before the heavy loop and remain responsive.
9. If rolling-window replay is too slow or concurrent users become a
   requirement, move execution to a Web Worker or durable server queue without
   changing the registered candidate domain.

## Screening card changes after Apply

1. Confirm both screening and the active workspace use the complete market
   history to build the target and the same selected dates only for metrics.
2. Confirm both paths pass the same `hybrid` execution policy, commission,
   slippage, parameters, and allocations.
3. For a combination, confirm both paths derive relative roles over the same
   optional date window and pass the same intrabar fill-price timeline.
4. Run the regression that deep-compares each standalone card with
   `runBacktest(...)` and compares combination metrics/rebalances with a rebuilt
   applied timeline.

## Screening rank does not match the expected metric

1. Check the selected optimization target before starting the run.
2. Changing the target clears prior results; rerun screening to compare
   parameters under the new target.
3. Confirm the target is balanced score, maximum return, or maximum Sharpe.
   Return/drawdown and minimum drawdown are intentionally unavailable.
   Balanced score must equal `0.45 * current-window return +
   8 * clamp(current-window Sharpe, -5, 5) +
   0.35 * current-window max drawdown`; trade count must not change it.
4. The candidate/observe-only badge does not affect sorting. Candidate requires
   positive total return, positive Sharpe, and at least two trades; hover the
   badge to see every failed condition.
5. When target values tie, total return, drawdown, Sharpe, and balanced score
   are applied as deterministic tie-breakers in that order.

## Applied strategy is not visible on the chart

1. For a strategy configured directly in the lab, use the lab's Apply button
   and confirm the page scrolls to the main chart. This action must not create
   a saved shortcut.
2. For a screening result, click the result row and confirm it restored the
   selectors and scrolled to the main chart. Enter and Space should provide
   the same keyboard action while the row is focused.
3. Confirm the result's A and B values match the two strategy-lab allocation
   selectors. Dual plans must be 60/40 or 40/60; the two strategy parameter
   sections should sit directly below their own selectors.
4. Reference lines exist only for strategies with a continuous price
   reference; a candle/oscillator rule may legitimately add no line.
5. Confirm both selectors contain the complete strategy registry, duplicate
   IDs are unavailable, and the lab shows A/B as relative long or short based
   on the selected range's average active-run length. Changing dates or
   parameters must recalculate those roles.
6. Confirm the chart legend prefixes follow the derived relative roles, not
   the strategy catalog's fixed horizon metadata.
7. For a partial/combined plan, inspect allocation transition markers rather
   than expecting generic round-trip trade markers. The only strategy labels
   are open (relative-long buy), short buy, short sell, and close. A gated final
   clear is one close marker even though its rebalance record retains both exit
   events.
8. Confirm the selected date range has at least one allocation change.
9. If markers appear on nearly every bar while the target state is unchanged,
   inspect `plannedAllocation`; ordinary price drift must not trigger a
   maintenance rebalance.

## Live execution label or condition price looks wrong

1. Confirm the strategy exposes `buildOrders` before expecting today's entry
   or exit condition price.
2. Confirm today's order uses only data through the prior completed bar.
3. A touched stop is a same-bar fill; an untouched displayed condition remains
   pending. A gap beyond the stop uses the bar open.
4. Close-confirmed strategies never show a known next-open price and retain the
   following-open label.
5. Inspect `MarketSeries.latestBarStatus`. In-progress or unknown daily bars
   intentionally freeze close-confirmed live targets at the preceding state;
   causal resting stops still use the active high/low.

## Saved shortcut history is slow or shows the wrong instrument

1. Confirm IndexedDB contains `quantscope-market-cache` for the current
   `127.0.0.1:3000` origin. Browser storage is isolated by origin.
2. Confirm the key matches provider, `secid`, and `1d`; fallback providers use
   their normalized provider identity.
3. A first open without a cache entry still performs the normal complete
   history request. Subsequent opens can render the saved series first.
   Cache age does not suppress this preview; use the displayed cache time to
   judge how old it is.
4. The full history request always continues after a hit. A source or
   adjustment mismatch retains the existing compatible series and shows a
   warning instead of merging.
5. If IndexedDB is blocked or cleared, the application intentionally falls
   back to a bounded in-memory session cache and the network without changing
   backtest meaning.
6. A cached-first chart intentionally shows a provisional warning until a
   compatible network history refresh completes.

If a development hot update reports `Cannot read properties of undefined
(reading 'at')`, confirm the workspace uses `readCachedMarketSeriesEntry(...)`
for timestamped reads and retains `readCachedMarketSeries(...)` as the
direct-series compatibility API. Current code also validates retained React
state and refs before reading `bars`.

## Commodity search or history is empty

1. Search the exact Yahoo symbol (`GC=F`, `SI=F`, `CL=F`, or `HG=F`) to use the
   deterministic catalog.
2. Confirm `/api/search` returns `assetType: commodity` and `provider: yahoo`.
3. Confirm `/api/market` accepts `commodity` and Yahoo is reachable.
4. Do not route commodity symbols to Nasdaq; there is intentionally no fallback.
5. Remember that these are futures quote proxies, not spot or contract-chain
   records.

## Saved shortcut bar cannot load

1. For local use, confirm `.wrangler/state` exists and run
   `npm run local:db:migrate`.
2. For hosted use, confirm `.openai/hosting.json` declares the `DB` D1 binding.
3. Confirm `drizzle/` contains the `saved_backtests` migration.
4. For hosted use, confirm the request includes the injected user identity
   headers.
5. Inspect `/api/saved-backtests` for `AUTH_REQUIRED`,
   `INVALID_PAYLOAD`, or `PERSISTENCE_UNAVAILABLE`.
6. If drag ordering reverts, inspect the `PATCH /api/saved-backtests` response
   and confirm migration `0004_real_ulik.sql` added `display_order`.
7. Do not fall back to browser storage for failed durable writes.
8. Existing core/maximum plan JSON should be converted to A/B when read; a
   failure here indicates invalid stored JSON rather than a missing migration.
9. If a second strategy saved for the same instrument replaces the first,
   apply migration `0002_flawless_korvac.sql`; it removes the old unique
   instrument index and creates the non-unique lookup index.
10. If a newly searched ETF loads through Yahoo but Save returns
   `INVALID_PAYLOAD`, inspect the provider-resolved instrument name. Market and
   saved-record validation must both use
   `MAX_MARKET_INSTRUMENT_NAME_LENGTH`; `159558.SZ` currently resolves to an
   82-character English name.

## Screening, lab, and shortcut ranges disagree

1. Confirm the period input calls `updateSharedRangeFromSessions(...)` and both
   lab date inputs call `updateSharedRangeFromDates(...)`.
2. Confirm `resolveTradingSessionRange(...)` snaps calendar inputs to actual
   loaded bars and `resolveTrailingTradingSessionRange(...)` derives the
   requested count from the current end date.
3. On a newly loaded instrument, confirm `sharedRangeSessionsRef` is retained
   while the calendar dates are rebuilt from that instrument's bars.
4. Confirm opening a saved shortcut does not restore `saved.startDate` or
   `saved.endDate`; creation-time dates remain persistence provenance only.
5. For the active instrument, inspect `savedBacktestRangeMetrics` and verify
   each saved plan uses the shared start/end dates plus its saved cost
   assumptions. Inactive instruments intentionally show no numeric return
   until their history is loaded.
6. Period result rows must use the synchronized N-session range. Range rows
   must use the custom interval. Rolling rows use the configured total interval
   while their selection score equals the arithmetic mean of all window rank
   scores. Earlier bars may affect indicators and opening state but never the
   reported performance boundary.

## Commands

```bash
npm test
npm run typecheck
npm run build
```

`npm test` includes strict TypeScript checking, analysis/unit tests, a
production build, and rendered/source tests. Minimal local Cloudflare ambient
types live under `types/` so `npm run typecheck` covers `db/` and `worker/`
without depending on the deployment build.
