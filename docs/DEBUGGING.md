# Debugging

## Local launcher does not open QuantScope

1. Confirm `node --version` reports 22.13.0 or newer and `npm --version`
   succeeds.
2. Confirm port 3000 is free. The launcher refuses to open a different
   application that already owns the port.
3. Read the visible `QuantScope Local Server` window for vinext errors.
4. Run `npm run local:db:migrate` if the saved-backtest API reports
   `PERSISTENCE_UNAVAILABLE`.
5. Keep `.wrangler/state` to retain local saved backtests. Removing that
   directory resets local persistence.
6. Run `npm ci` if `node_modules` is missing or dependencies are damaged.

The launcher never falls back to the hosted site. The local UI and saved
records do not require login, but live market-data providers still require
internet access.

## Market route returns `UPSTREAM_UNAVAILABLE`

1. Call the provider URL from the same network.
2. Check whether Eastmoney changed `QuotationCodeTable.Data` or `data.klines`.
3. Confirm daily rows use `YYYY-MM-DD` and minute rows use
   `YYYY-MM-DD HH:mm`.
4. For global daily history, check Yahoo query1/query2 status and then Nasdaq
   `status.rCode`.
5. Check for provider rate limiting before increasing timeouts.

## Search returns an individual equity

Inspect the source classification fields and update the adapter-level asset
filter. Do not add UI-only filtering: unsupported asset types must never cross
the API boundary.

## Empty chart

1. Inspect `/api/market` and confirm `bars` is non-empty.
2. Confirm every bar has finite OHLC values and a valid timestamp.
3. Check the browser console for ECharts initialization errors.

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

1. Confirm the selected date range is not larger than needed.
2. Reduce the per-strategy parameter cap from 2,500 for a faster exploratory
   pass.
3. Use the stop action to retain the best results found so far.
4. Confirm progress continues to advance. The optimizer intentionally yields
   after small batches so chart and stop controls remain responsive.
5. If a production workload regularly needs larger grids or concurrent users,
   move execution to a Web Worker or durable server queue rather than removing
   the cap.

## Screening rank does not match the expected metric

1. Check the selected optimization target before starting the run.
2. Changing the target clears prior results; rerun screening to compare
   parameters under the new target.
3. `Minimum drawdown` maximizes the drawdown value, so zero is better than a
   more negative percentage.
4. `Return/drawdown` divides total return by at least 0.1 percentage points of
   absolute drawdown to keep the objective finite.
5. When target values tie, total return, drawdown, Sharpe, and balanced score
   are applied as deterministic tie-breakers in that order.

## Applied combination is not visible on the chart

1. Confirm the result's Apply button restored both selectors and scrolled to
   the main chart.
2. Reference lines exist only for strategies with a continuous price
   reference; a candle/oscillator rule may legitimately add no line.
3. Confirm the chart legend includes separate long- and short-horizon prefixes.
4. For a partial/combined plan, inspect allocation increase/reduction markers
   rather than expecting round-trip trade markers.
5. Confirm the selected date range has at least one allocation change.

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
6. Do not fall back to browser storage for failed durable writes.

## Commands

```bash
npm test
npm run build
```

The starter's standalone `tsc --noEmit` command reports missing Cloudflare
ambient types in `db/` and `worker/`; the deployment build supplies those
runtime types and is the authoritative compile check.
