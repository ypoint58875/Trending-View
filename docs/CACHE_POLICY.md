# Cache Policy

## Expanded overlay window grids

`research/nikkei-overlay-stability/data/block-cache/` contains146 bounded numeric
grids for the declared5..16 menu and11 lengths, about46 MiB plus a single full
grid partial checkpoint. Atomic replacement and source/design identity make
same-command resume idempotent. These are derived local Git-ignored caches;
retain original source snapshots and previous experiment output. No automatic
TTL or deletion is introduced. Explicit research regeneration may remove only
these derived caches after an incompatible implementation/design change.

## 2000-session overlay stability research

`research/nikkei-overlay-stability/data/input.json`, `data/raw/bars.bin` and its
source registry are immutable local reproducibility artifacts, not TTL caches.
Retain them. The bounded signal checkpoint is one overwrite record; one5839-row
grid uses46 atomic binary chunks of at most128 rows, roughly94 MiB total.
Only derived `output/cache/` may be manually regenerated after an incompatible
design/implementation error; no raw source or original engine job is deleted.
The source/design identity rejects accidental stale reuse. Compact summary,
CSV, PNG/SVG and HTML outputs are replaceable and bounded by the declared menu.
No automatic deletion, new refresh interval or scheduler is introduced.

## Overlay preferences and derived features

Current `quantscope-position-overlay-v3:research` and `:cycle` store the three
independent boolean choices for model `ema7-sma11-wma14-v1`. First load preserves
v2 explicit choices, otherwise v1 choices with the third flag default true.
Older keys remain recoverable. The current model is explicit in active settings
and ordinary cache identities, while old saved plans without a model retain
legacy behavior. Feature WeakMaps isolate current/legacy models per bar array.

`quantscope-sma12-position-overlay-v2:research` and `:cycle` each retain one
set of three booleans, with no history or automatic expiration. Version-1
preferences retain the older two explicit choices and initialize the new gate
to true. Explicit version-2 false values override the defaults. Legacy keys
remain recoverable; storage failures are shown.
Pure indicator arrays and original cycle report signals use WeakMaps keyed by
immutable bar/snapshot identities; garbage collection bounds their lifetime.
No disk cache, raw-source deletion, new endpoint or durable queue is added.
Ordinary checkpoint/library/history identities include enabled settings;
cycle task identity excludes report-only overlay choices.

## Missed-rally research retention

Retain `research/nikkei-cycle-rallies/data/input.json` and its source registry as
reproducibility inputs, without TTL or automatic deletion. The bounded variant
checkpoint is one overwrite record; the fixed ledger outputs, summaries,
diagnostics and allocation CSV are derived and regenerable. Limit source reads
to 2048 jobs, 10000 bars, 16 MiB per result and 32 MiB for frozen inputs. No
additional production cache, server process or market-data refresh is added.

## Retired parameter-library storage

The quick-screening modules and all runtime library reads/writes have been
removed. Existing `quantscope-screening-parameters` browser records are inert;
no destructive browser-database cleanup is performed. New result-model6
identities prevent old optimizer/results/tasks from being reused as the new
six-finalist/all-family search. Historical source/research/job artifacts retain
their existing retention policy and are not relabeled or overwritten.


## Nikkei fixed-primary date-gap repair

Nikkei repair uses existing refresh cadence and canonical IndexedDB state.
There is no new expiring server cache, source-switch schedule or cleanup job.
An unresolved recent gap triggers an uncached official ten-bar tail request;
after insertion, the canonical dates themselves make repeated repair
idempotent. Holiday hints may re-probe on later normal refreshes but never
insert dates absent from official data. Existing completed OHLC stays locked.
Per-bar official OHLC source/fetched-time metadata follows the canonical bar's
retention; the small committed wire-row fixture is traceability data and is
not deleted automatically.

## Nikkei cycle close-replay update

Explicit cycle start/continue requests only five latest daily bars when full
canonical history is present. Source validation and immutable completed-bar
merging remain shared with the main workspace. Incomplete current bars remain
in canonical storage but are excluded from cycle inputs until complete.
Cached history can still restore reports and evaluation bounds. The cycle
model signature `nikkei-completed-close-v3` prevents restoration of old reports
under changed timing; optimizer checkpoints and engine protocol are unchanged.
Task signatures additionally require conflict policy
`incoming-current-signals-on-conflict-v1`. Same-model tasks with the previous
policy key migrate their signature and rebuild the report from saved winners;
screening results, frozen parameter tuples, and queue mappings are preserved.

`research/nikkei-cycle-conflicts/data/input.json` is a frozen reproducibility
artifact, not an expiring cache. Its state checkpoint is one bounded overwrite
record, and `output/` is replaceable derived data. Retain frozen inputs and raw
source hashes; no automatic deletion is authorized. If local screening caches
expire, reruns remain possible from the frozen input. No network refresh or
scheduled execution occurs in this study.
The delayed-confirmation study keeps its own bounded `data/delayed-state.json`
checkpoint and replaceable `output/delayed-*.json` summaries under the same
retention policy. Its implementation is not part of product execution.

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
- `quantscope-screening-checkpoint` keeps one overwrite-in-place optimizer
  checkpoint per instrument/interval namespace. A matching interrupted run
  resumes it; successful completion deletes it, and a changed request replaces
  it on the next checkpoint write. It contains compact optimizer state, not raw
  source data or display equity/trade arrays.
- Stage completion waits for the checkpoint transaction before replacing the
  Worker. The next Worker reads the same record and successful end-to-end
  validation removes it.
- Local screening defaults to `data/state/screening-engine/<job-id>/`. The
  compact request metadata and typed `bars.bin` are written once,
  `checkpoint.bin` is atomically replaced,
  and `result.json` is compact. A successful child removes its checkpoint.
  Incomplete and completed job directories expire after seven days during the
  next coordinator submission. This state is reproducible cache/continuation
  data and is excluded from Git.
- Screening result model version6 includes six execution finalists per family
  and100% eligible-family participation. A changed result-model signature cannot resume an older checkpoint or
  restore an older latest-result cache into the new search domain.
- Strategy-cycle validation may pre-submit up to its bounded 2048 units to this
  same directory. The coordinator executes an adaptively bounded child pool; queued
  requests reference one immutable batch-scoped columnar bar file plus their
  exact prefix count instead of duplicating one `bars.bin` per unit. Same-
  decision jobs share one entry-filter derivation file. Active queued/running
  references protect the batch directory from cleanup; after completion it
  follows the existing seven-day retention. Explicit Pause cancels computation
  but keeps reproducible requests/checkpoints for deterministic Continue. An
  atomic batch `queue.json` restores unfinished jobs after relay restart, while
  per-job cancellation markers keep paused work dormant until resubmission.
- `checkpoint/manifest.json` atomically commits separately serialized metadata,
  finalist, entry-filter, pair, triple, higher-order, and result sections.
  Windows rename locks receive bounded retries and a recoverable old-manifest
  backup swap; startup may read a surviving temporary or backup generation.
  Superseded generations are removed after the manifest swap. `derived.bin`
  retains request-fingerprinted entry-filter eligibility arrays.

- `lib/analysis/screening-result-cache.ts` keeps exactly one device-local
  IndexedDB record containing the latest completed full screening result. It is
  restored only for the same canonical instrument and interval, cleared when a
  replacement run starts, and overwritten when that run completes. Browser
  site-data controls can remove it.

Future retention limits must be based on measured browser storage use and must
not silently delete the only canonical copy.
