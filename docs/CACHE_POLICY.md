# Cache Policy

QuantScope uses HTTP caching, one page-memory canonical series, and
device-local IndexedDB stores for canonical history, provider snapshots,
references, fingerprints, and source health. It has no server-side market-data
disk cache or scheduled cleanup job.

## HTTP behavior

### History

`/api/market?mode=history` uses the default upstream request cache and returns:

```text
Cache-Control: public, max-age=3600, stale-while-revalidate=86400
CDN-Cache-Control: public, max-age=3600, stale-while-revalidate=86400
Cloudflare-CDN-Cache-Control: public, max-age=3600, stale-while-revalidate=86400
```

`strictProvider=1` controls provider routing but does not disable history
caching. The route key includes provider, provider symbol, asset type, interval,
and mode. Daily history begins at 2000-01-01 when the provider has coverage and
is capped at 10,000 normalized bars. Native one-minute history uses the
provider-supported recent range and is capped at 1,500 bars; it is never
resampled from another interval.

### Latest bars

`/api/market?mode=latest` passes `cache: no-store` upstream and returns
`no-store` response directives. Latest limits are clamped to 2-10 bars; the
workspace requests five. A provider may still publish a delayed or incomplete
bar even though QuantScope does not cache the response.

The caller schedules these requests only while the page is visible. Known
regular venues use five minutes until 30 minutes after close and then stop.
The visible one-minute workspace uses a one-minute minimum during the same
session boundary and refreshes only the current instrument; daily shortcut
refresh and backup/reference audits do not run from that mode.
COMEX/NYMEX proxies follow the Sunday-Friday Globex session and skip their
daily maintenance break and weekend closure; unknown venues use 15 minutes.
Focus and visibility events cannot bypass that interval. A primary
failure immediately tries backups, and only a complete-chain failure invokes
15/30/60-minute backoff. This scheduling is request control, not HTTP caching.

### Search and audits

`/api/search` is fresh for 30 seconds and stale-while-revalidate for 120
seconds. Backup audits use strict provider routing. An expected upstream audit
failure is returned as an error payload without a browser resource error, then
recorded in source health; primary requests retain normal failure status.

## Canonical IndexedDB

`lib/market/canonical-cache.ts` owns
`quantscope-canonical-market` with separate stores:

- `canonicalSeries`: canonical key, interval, series, fingerprint, write time;
- `sourceSnapshots`: provider/mode/date-isolated normalized source snapshots;
- `referenceSnapshots`: close-only reference observations;
- `sourceHealth`: lifetime attempts/success/failure, bounded 31-day individual
  attempts, rolling 7/30-day availability inputs, latency, safe error,
  persistent demotion time, and quality.

Daily source health uses the canonical instrument key. One-minute source
health uses a separate `canonical-key:1m` namespace so a short-lived minute
endpoint failure cannot demote the daily source. The health error value is a safe classification rather than an upstream
response body. Credential-invalid/expired, access-denied, quota-limited,
not-configured, and generic upstream states remain distinct.

Automatic effective-source selection requires enough recent observations.
Configured-primary degradation is triggered by three latest consecutive
failures or at least five 7-day attempts below 80%. A candidate backup needs at
least three 7-day and five 30-day attempts, at least 95% and 90% availability,
and a passing price-quality snapshot. A demoted configured primary is probed no
more often than hourly and is restored only after seven elapsed days plus a
95%-healthy 7-day window. Recent samples retain 31 days (maximum 2,048);
lifetime counters remain for diagnostics.

Canonical writes require an exact profile key and current-primary source
match. Reads key by canonical instrument and interval, so a locked record from
a deliberately superseded primary may render before the new-primary refresh
completes. Completed OHLC cannot be overwritten. A refresh from the same source
may enrich a cached zero-volume date with a newly published positive value
without changing any locked price field. One recent isolated gap triggers at
most one full-history repair attempt per browser session. Provider audits write
only their provider-specific store. Every stored series or reference carries a
SHA-256 fingerprint.

The source snapshots are exact normalized provider series, not literal wire
payloads. They are same-origin device state and can be removed through browser
site-data controls. They are not D1 user records.

## Legacy migration

`lib/market/client-cache.ts` remains for older browser profiles. It previously
stored at most 32 provider/symbol/interval series. The canonical workspace may
migrate one legacy entry only when:

- it has at least 120 bars;
- its canonical instrument key matches.

A same-instrument legacy entry from a deliberately superseded primary may seed
the locked display history. It is not written as a new-primary canonical record
until a successful current-primary response is merged.

## Page-memory merge

`mergeCanonicalMarketSeries` accepts new data only from the configured primary
with matching canonical identity and interval. Existing locked history may
have been created under a prior deliberate primary assignment.

- Completed existing dates are immutable.
- The existing final date may be replaced only when its stored status was not
  `complete`.
- Newer preferred-source dates may be appended.
- A declared identity-verified or overlap-validated backup may add missing or
  newer dates and replace only an unconfirmed final date. It never rewrites a
  confirmed date.
- Rejected backups and incompatible adjustment modes never enter chart OHLC.
- Reapplying the same primary response is idempotent.

On preferred-primary failure, the page retains the canonical series and tries
configured backups sequentially. The first promotable backup may extend the
locked series; otherwise a same-key, non-stale, price-plausible temporary quote
may be shown. A validated current-session quote is merged only into the active
in-memory view as an unconfirmed bar. It is never written to canonical storage;
the retained canonical base is used again on the next refresh. The current
session also retains the newest accepted temporary quote and reapplies it when
a later refresh yields no valid replacement; a newer accepted quote or a
completed canonical bar supersedes it. Inactive shortcut refreshes use the same
separate canonical/display result and keep temporary quotes only in page
memory. Switching instruments reads a different canonical key and never
aliases unrelated data.

## Retention

- HTTP response retention follows the directives above.
- IndexedDB canonical/source/reference/health records currently have no
  time-based cleanup job.
- Committed `data/raw/` files are parser and incident fixtures, not runtime
  cache.
- D1 saved backtests, their latest 128-session return and bounded five-event
  rank/not-ranked history, and screening archives are durable user/provenance
  data, not market caches. History is capped in application code rather than
  expired by a cleanup job.
- Screening target, indicator, and order caches exist only for one Worker run
  and are discarded with that Worker.
- `lib/analysis/screening-result-cache.ts` keeps exactly one device-local
  IndexedDB record containing the latest completed full screening result. It is
  restored only for the same canonical instrument and interval, cleared when a
  replacement run starts, and overwritten when that run completes. Browser
  site-data controls can remove it.

Future retention limits must be based on measured browser storage use and must
not silently delete the only canonical copy.
