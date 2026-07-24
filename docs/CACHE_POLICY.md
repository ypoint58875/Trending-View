# Cache Policy

This file documents the caching that exists now and separates it from future
recommendations. QuantScope currently relies on HTTP caching plus page-memory
history/latest merging. It has no application-managed market-data disk cache or
cleanup job.

## Current HTTP behavior

### Market history

`/api/market?mode=history` uses the default request cache mode for provider
requests and returns all three response directives:

```text
Cache-Control: public, max-age=3600, stale-while-revalidate=86400
CDN-Cache-Control: public, max-age=3600, stale-while-revalidate=86400
Cloudflare-CDN-Cache-Control: public, max-age=3600, stale-while-revalidate=86400
```

These headers permit HTTP/browser/CDN caches to treat a successful history
response as fresh for one hour and stale-while-revalidate for one day. The
application does not maintain a separate history file cache or explicitly
delete cached responses.

### Latest bars

`/api/market?mode=latest` passes `cache: no-store` to supported upstream
requests and returns:

```text
Cache-Control: no-store, no-cache, must-revalidate, max-age=0
CDN-Cache-Control: no-store
Cloudflare-CDN-Cache-Control: no-store
```

The API bounds latest windows to between 2 and 10 bars; the current daily UI
asks for five.
The newest provider bar may still be delayed or unfinished even though
QuantScope does not cache the response.

### Search

`/api/search` currently returns
`Cache-Control: public, max-age=30, stale-while-revalidate=120`. Search caching
does not cache market history or analysis output.

## Current page-memory merge

The browser keeps the current normalized history in React/ref memory. A latest
window from the same source and interval replaces matching `time` keys, appends
new keys, sorts by timestamp, and retains the configured newest-bar limit
(1,000 in the current workspace). Reapplying the same latest response is
idempotent.

The UI does not merge bars from different sources. On an initial latest failure
it continues with history; on a later latest failure it leaves the displayed
series intact. Page memory is not durable across a reload or process restart.

`MarketSeries.priceAdjustment` remains the series-level authority. History and
latest are fetched through the same provider normalization contract; the merge
does not independently recalculate adjustment factors or rescale volume.

## Current retention and cleanup

- HTTP response retention is governed by the response directives above and the
  behavior of the browser/CDN runtime.
- The active merged series lasts only in the page session and is replaced when
  the instrument changes or the page reloads.
- Committed `data/raw/` fixtures are source samples, not runtime cache entries.
- D1 saved backtests are durable user records, not cache.
- No market-data cache size limit, disk TTL, eviction routine, scheduled
  cleanup, or raw-archive deletion exists in application code.

## Future recommendations

The following items are not implemented:

- Measure provider correction frequency and user freshness needs before
  changing the one-hour history policy.
- Add explicit cache keys that include provider, instrument, interval,
  adjustment mode, and response schema version if application-managed caching
  is introduced.
- Set separate TTL and maximum-size limits for disposable processed cache while
  preserving any licensed raw archive under its own retention policy.
- Add metrics for cache hit rate, stale serves, latest-fetch failures, source
  changes, and corrected-bar replacements.
- Implement and test cleanup only after a concrete persistent cache exists;
  cleanup should target disposable cache before traceability data.
