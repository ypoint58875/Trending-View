# Cache Policy

This file documents the caching that exists now and separates it from future
recommendations. QuantScope uses HTTP caching, a page-memory history/latest
merge, and a bounded device-local IndexedDB cache of normalized daily series.
It has no server-side market-data disk cache or scheduled cleanup job.

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
delete cached responses. Commodity quote-proxy history uses the same policy
and a cache key containing its Yahoo provider symbol and `commodity` type.
The current daily history response begins at 2000-01-01 when the provider has
coverage and is capped at 10,000 normalized bars.

### Latest bars

`/api/market?mode=latest` passes `cache: no-store` to supported upstream
requests and returns:

```text
Cache-Control: no-store, no-cache, must-revalidate, max-age=0
CDN-Cache-Control: no-store
Cloudflare-CDN-Cache-Control: no-store
```

For finite numeric `limit` requests, the API clamps latest windows to between
2 and 10 bars; the current daily UI explicitly requests five.
The newest provider bar may still be delayed or unfinished even though
QuantScope does not cache the response.

### Search

`/api/search` currently returns
`Cache-Control: public, max-age=30, stale-while-revalidate=120`. Search caching
does not cache market history or analysis output.

## Current device-local history cache

`lib/market/client-cache.ts` stores successful normalized histories in the
browser's IndexedDB database `quantscope-market-cache`. The key contains the
provider, provider symbol (`secid`), and interval. A shortcut open first reads
this cache so its chart can appear before the network history request
completes; the normal history and latest requests still run and replace the
cached view after source/adjustment validation. The cached-first view displays
an explicit provisional warning until that compatible network refresh
completes.

The shortcut restore boundary first checks the non-empty successful active
series. If its canonical instrument and interval match the saved shortcut,
that exact in-memory series is preserved and no cache lookup or market reload
is started merely because the saved provider alias differs. Only a different
canonical instrument or missing active series enters the cached-first flow.

When provider fallback resolves a request to another provider symbol, the
successful series is stored under both the requested key and the resolved
key. This preserves cache hits for older shortcuts that still carry the
original provider identity without mixing unrelated instruments. New fallback
responses persist the resolved provider symbol inside the series itself.
Legacy cache or shortcut records that already combine `provider: yahoo` with
an Eastmoney-shaped identifier remain readable because the Yahoo adapter
translates that identifier before the network request.

The same module keeps a bounded in-memory copy for the current application
session. This fallback covers privacy settings, embedded browsers, and storage
policies that disable IndexedDB. It still accelerates repeated shortcut
switches within that session, while IndexedDB provides cross-restart
persistence when available.

The cache stores at most 32 series and has no time-based expiry. The oldest
surplus entries are deleted after a successful write. Cache reads preserve the
last successful write timestamp for display and recalculate the latest daily
bar's complete/in-progress/unknown status against the current time. IndexedDB
failure is non-fatal: the in-memory fallback and network pipeline remain
available.

The cache contains processed `MarketSeries` objects, not provider raw
responses. It is same-origin browser state, not D1 user data, and can be
removed through browser site-data controls. A cache hit never suppresses the
background full-history refresh, so gaps longer than the five-bar latest
window are repaired.

## Current page-memory merge

The browser keeps the current normalized history in React/ref memory. A latest
window with the same source, interval, and `priceAdjustment` replaces matching
`time` keys, appends new keys, sorts by timestamp, and retains the configured
newest-bar limit (10,000 in the current workspace). Reapplying the same
compatible latest response is idempotent.

The UI does not merge bars from different sources or price-adjustment modes.
On either mismatch it retains the complete existing/history series until a
complete compatible refresh succeeds. On an initial latest failure it
continues with history; on a later latest failure it leaves the displayed
series intact and shows a warning. Switching instruments clears page memory
before reading the requested instrument's isolated persistent cache.

`MarketSeries.priceAdjustment` remains the series-level authority. The merge
requires identical modes and never downgrades or combines adjusted/raw bars.
It does not independently recalculate adjustment factors or rescale volume.

## Current retention and cleanup

- HTTP response retention is governed by the response directives above and the
  behavior of the browser/CDN runtime.
- The active merged series lasts only in the page session and is replaced when
  the instrument changes or the page reloads.
- IndexedDB processed history is bounded to 32 series without an age limit.
  Cleanup removes only the oldest surplus processed entries.
- Committed `data/raw/` fixtures are source samples, not runtime cache entries.
- D1 saved backtests are durable user records, not cache.
- No scheduled server cache cleanup or raw-archive deletion exists in
  application code.

## Future recommendations

The following items are not implemented:

- Measure provider correction frequency and user freshness needs before
  changing the one-hour history policy.
- Add an explicit response-schema version and adjustment mode to the cache key
  before a future adapter can return multiple schemas or adjustment modes for
  the same provider symbol.
- Add metrics for cache hit rate, stale serves, latest-fetch failures, source
  changes, and corrected-bar replacements.
- Consider a user-visible cache inspection/clear action only if the shortcut
  collection becomes large enough to justify it.
