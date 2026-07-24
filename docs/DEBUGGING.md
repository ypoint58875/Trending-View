# Debugging

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

## Backtest has no trades

The selected parameters may produce no entry signal in the chosen date range.
Expand the range or change the strategy. Do not weaken assertions or inject a
trade only to make a test pass.

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

## Saved shortcut bar cannot load

1. Confirm `.openai/hosting.json` declares the `DB` D1 binding.
2. Confirm `drizzle/` contains the `saved_backtests` migration.
3. Check that the request is authenticated and includes the injected user
   identity headers in production.
4. Inspect `/api/saved-backtests` for `AUTH_REQUIRED`,
   `INVALID_PAYLOAD`, or `PERSISTENCE_UNAVAILABLE`.
5. Do not fall back to browser storage for failed durable writes.

## Commands

```bash
npm test
npm run build
```

The starter's standalone `tsc --noEmit` command reports missing Cloudflare
ambient types in `db/` and `worker/`; the deployment build supplies those
runtime types and is the authoritative compile check.
