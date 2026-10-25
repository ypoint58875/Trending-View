# Data Pipeline

## Exact screening recovery without replaying completed work

The optimizer restores cumulative evaluated/failed/total progress from the
existing checkpoint metadata and reads finalized stage pools directly.
Completed stages no longer enumerate their old candidate ordinals. Within the
active stage, ordered row offsets or finalist/weight division seek to the next
unevaluated candidate. Original tie order and pending-result commitment remain
unchanged. Existing atomic child checkpoint storage, job identity, restart
policy, cancellation, retention and browser/relay protocol are unchanged.

Three-to-six-leg summary timelines may skip a historical prefix only after a
proven zero-allocation reset preceding the first requested state. Full-history
signals, risk warm-up and inherited execution remain reproducible. This adds
no external requests, persistent cache, growing state or cleanup policy.

## Expanded overlay segmentation search

Run `npx tsx research/nikkei-overlay-stability/block-study.ts`. Reuse the frozen
2000-session source and verified decision cache; no new market or screening
request occurs. Complete13824-row training windows commit compact numeric
return/drawdown/trade-count arrays atomically under `data/block-cache/` in that
study. The full2000 grid additionally checkpoints every512 candidates. Source
and implementation/design hashes reject incompatible resume; interruption stops
at work-unit boundaries.146 finite grids are about46 MiB, with one window in
working memory and1.5 GiB RSS stop. Then regenerate `block-report.ts` and
`block-plot.py`; raw inputs, earlier experiments and original jobs are retained.

## 2000-session overlay stability recovery

Run `npx tsx research/nikkei-overlay-stability/analyze.ts`. Initial collection
reads existing complete quick jobs without queue mutation, verifies every
causal market prefix, checks schedule completeness and atomically freezes
normalized bars/plans/source hashes. A separate raw shared-bars backup is
retained. Later runs reuse this input. `data/signals.json` commits every32
completed signals with source/implementation identity; `output/cache/grid-N.bin`
commits each complete128-candidate chunk with source/design identity. Invalid
identity fails explicitly; incomplete work units replay, committed work resumes.
SIGINT/SIGTERM are handled at work-unit boundaries. Output commits precede
progress markers. Grid histories use roughly94 MiB; per-input and1.5 GiB RSS
limits stop safely. Adaptive policy and age stages are small bounded replays.
Generate the user report with `report.ts`, then `plot.py` in that directory.
Post-hoc one-parameter output is identified separately. No update schedule,
network collection or automatic cleanup is installed.

## Expanded average-type overlay research

Run `npx tsx research/nikkei-cycle-rallies/ma-threshold-grid.ts`. The frozen
source/model checks and SMA fill reconciliation precede calculation. Each of
eight thresholds has 27 atomic 729-row chunks in
`research/nikkei-cycle-rallies/output/ma-threshold-grid/t*/`; chunk source and
implementation/design hashes, exact expected IDs and finite returns/drawdowns
are checked before reuse. Restart the same command after interruption. A crash
inside a chunk repeats only that chunk. Incompatible chunks fail explicitly.
Each threshold summary commits after its chunks; final index after selected
full ledgers and next-open sensitivity. Keep only one 19683-row threshold and
bounded selected leaders in memory. Raw inputs remain intact. Compact outputs
are regenerable and follow the existing research retention policy, without a
new source fetch, schedule or automatic deletion. Earlier narrower grid outputs
remain provenance; the final 157464-configuration index is authoritative.

## Missed-rally research recovery

`entry-slope-gate.ts` sequentially replays 20 fixed SMA3..12 entry gates using
the frozen input and verified signal cache. It reconciles both ungated baselines
before atomic per-variant output and summary/CSV replacement. Whole-run restart
is bounded and idempotent; no new source refresh or checkpoint is necessary.

`exit-guard.ts` reuses the source/model-verified SMA signal cache and reconciles
the entire no-guard fill ledger against SMA12. It sequentially replays 34
bounded guards, writes each ledger atomically, then commits the summary/CSV.
Rerun the same command after interruption; this few-second local calculation
needs no new checkpoint, market refresh, source retention policy or scheduler.
Older longer-average derived ledgers are retained but excluded from the new
summary after the user's SMA12 cap. Fixed input and output counts bound memory.

`sma-flat-entry.ts` uses the frozen source and a source/model-verified derived
decision-signal cache; six ledger files and summary/trade CSV are atomically
regenerated. The complete source is bounded to 32 MiB, 10000 bars, 2048
decisions. No network refresh or screening repetition occurs. Future-incompatible
cache/model identity fails explicitly; existing raw input is never overwritten.

`joint-cycles.ts` commits each date's five causal longer-window selections
before `data/joint-state.json`; input/menu/design fingerprints reject stale
checkpoints. It resumes those 298 dates idempotently. `joint-confirmation.ts`
reuses the same frozen selections and verifies source/menu identity, then
atomically replaces its twenty-one confirmation-rule outputs/summary/CSV.
The candidate timelines, one prefix and one ranking context per period are
bounded; there are no additional market requests or local-engine queue changes.

Run `npx tsx research/nikkei-cycle-rallies/analyze.ts`. The first run freezes
verified current request/result winners and shared bars. Later runs read that
input, validate its model/hash, and reuse atomically committed per-variant
results listed in `data/state.json` in the research folder. Output commits
precede checkpoint commits; interrupted work resumes without duplicate rows.
The short archived-cycle comparison uses the prior frozen input and atomic
output; whole-file replay is proportional (102 decisions per cycle).
No network refresh, background schedule or mutation of screening state occurs.

## Full-only screening recovery

Search result model6 identifies six execution finalists per family and100%
family participation. New exact checkpoint identities, optimizer metadata and
cycle task signatures isolate older search results. Interrupted current-model
runs continue from their committed checkpoint; obsolete models recompute.
Parameter-library collection and reuse have been removed. Existing raw source,
research snapshots, old task records and engine job files are retained under
existing policies; no migration deletes them or schedules new work.


## Fixed-primary Nikkei tail reconciliation

Active workspace, background shortcuts and the ordinary Yahoo API path call
the shared Nikkei supplementation helper after a successful primary response.
Current canonical data is merged first in browser flows, so a previously
repaired newest date stops another unnecessary probe. Recent missing-weekday
hints cause one official ten-bar tail query; only published completed missing
dates are inserted. No full-history overwrite or synthetic holiday bar occurs.
The existing explicit/session-aware refresh schedule drives this incremental
and idempotent update; no scheduler or durable job is added. Market values
remain bounded to 10,000 retained bars. Supplemental OHLC source/time metadata
persists with canonical bars; screening's numeric transfer format is unchanged.

## Nikkei cycle same-day replay and conflict study

The cycle page filters canonical data to complete Nikkei daily bars, reuses
full history, and refreshes only five latest bars on explicit start/continue.
It retains the existing immutable-bar merge, provider validation, durable queue,
and IndexedDB progress mechanisms. Only the cycle report model/signature changes;
engine protocol and optimizer ranking do not. No scheduled execution is added.

`npx tsx research/nikkei-cycle-conflicts/analyze.ts` freezes verified source
inputs once, then resumes by completed period/cohort group from
`research/nikkei-cycle-conflicts/data/state.json`. The checkpoint records the
input hash and cycle model and is atomically committed only after the group's
events are complete. SIGINT leaves the last committed group available; replay
is idempotent. Missing decisions are excluded from consecutive-winner analysis;
continuous comparisons require complete trigger coverage between endpoints.
The final evaluation is recomputed deterministically from that durable state.

Raw normalized inputs, derived `output/` files, and continuation state are
separate files. Work is sequential and bounded to the local frozen archive,
with one causal timeline at a time; it does not enumerate new strategy grids.
No automatic source update, raw-data deletion, or cleanup job is introduced.

`npx tsx research/nikkei-cycle-conflicts/delayed-confirmation.ts` reuses the same
frozen input. Its separately versioned `data/delayed-state.json` commits complete
groups atomically, validates the input hash/timing model/study rule, and resumes
idempotently. Only conflicting decisions wait one trading session; confirmation
requires that exact next day's archived winner. Missing next-day results are
excluded explicitly. Output is `output/delayed-{events,summary}.json`. Product
execution uses the user-selected incoming-winner policy, not this delay.

## Local screening compute flow

The browser submits binary columnar bars, settings, validation configuration,
and a request fingerprint once to the loopback coordinator. A deterministic job
directory separates compact immutable `request.json`, typed columnar
`bars.bin`, replaceable `checkpoint.bin`, and compact `result.json`.
Disposable children read the bars and latest checkpoint from disk;
child-to-parent messages contain throttled progress and memory scalars only.
An atomic batch queue manifest and per-job cancellation markers distinguish
restart-resumable submitted work from explicitly paused work.
Status polling never carries the result payload. After completion the browser
performs one compact-result read; chart equity and transactions remain
selection-time replay data.

Stage ownership is deliberately narrow: parameter evaluation owns transient
indicator/target/order state; entry-filter evaluation consumes and releases raw
target/order state; pair allocation consumes and then releases fill state; the
three-to-nine-leg stages carry only retained parameters, compressed targets,
scalar metrics, set keys, and exact cursors. Rejected candidates and display
equity/trade/rebalance arrays never cross a stage boundary. Only compact ranked
winners return to the browser, where a selected result is replayed for chart
detail. Standalone parameter and EMA enumeration stays complete. The completed
family winners are then ranked once under the active objective, and only the
all eligible families flow into pair and higher-order stages. The same gate
is inside the shared optimizer, so every screening orchestration follows it.

This file separates QuantScope's current runtime behavior from possible future
ingestion work. The application has no scheduled server-side market-data job
or server checkpoint. The local browser does persist canonical series,
provider-isolated source snapshots, reference snapshots, fingerprints, and
source health.

## Current runtime flow

1. The browser selects one index, ETF, or commodity proxy. The workspace fixes
   the interval at `1d`.
2. `resolveCanonicalMarketProfile` normalizes provider aliases and chooses one
   primary plus independent backup/reference definitions. Yahoo is primary for
   N225, SOX, built-in commodity proxies, Yahoo-discovered instruments, and
   verified Yahoo index/ETF mappings. Unsupported mappings retain the selected
   provider.
3. The browser reads `quantscope-canonical-market` by canonical instrument and
   interval without rejecting an otherwise valid locked record solely because
   its historical primary differs from the current source policy. A valid hit
   renders immediately, but never prevents a primary network refresh.
4. The browser requests primary daily history with `strictProvider=1`, the
   shared 2000-01-01 boundary, and a 10,000-bar cap. History is cacheable even
   though strict-provider routing disables provider fallback.
5. The primary response is fingerprinted and written to its provider-specific
   source-snapshot store. Lifetime counters plus bounded recent attempts,
   latency, quality, and demotion state are recorded. Rolling 7/30-day health
   can temporarily select a qualified backup while retaining hourly configured-
   primary recovery probes and seven-day restoration hysteresis.
6. `mergeCanonicalMarketSeries` keeps confirmed OHLC immutable. It may replace
   only an existing final bar that was not confirmed complete, append newer
   dates from the preferred source, or fill a cached zero-volume value from the
   same source and date without changing any locked OHLC field. A recent
   isolated gap triggers at most one full-history repair attempt per browser
   session so permanently volume-less instruments do not poll repeatedly.
7. Backup histories and close-only references are fetched independently for
   audit or recovery. They receive separate snapshots and fingerprints. Their
   gaps, latest date, adjustment mode, and OHLC/close differences are measured
   against the canonical series.
8. A five-bar `mode=latest` primary refresh is uncached. If the primary fails,
   backups are tried sequentially. A deterministic identity mapping may recover
   an empty chart; other candidates need sufficient overlap and bounded price
   error. Promotion can append missing dates or replace only an unconfirmed
   last bar. If no backup qualifies, the chart stays fixed and a temporary
   quote may be shown.
9. The resulting canonical `MarketSeries.bars` is the single input for chart
   history, volume, indicators, strategy references, current guidance,
   stability, screening, and backtesting.
10. Positive-volume coverage is measured independently. Price-only analysis
    remains available, but volume-dependent indicators and strategies are
    excluded unless at least 20 bars exist and at least 90% contain positive
    volume. A saved cohort containing a volume-dependent plan is not partially
    ranked when that instrument lacks reliable volume.

Opening a saved shortcut is a restore operation before it is a market switch.
When the saved instrument, active instrument, and non-empty successful active
series have the same canonical key and interval, the workspace preserves the
active series and restores only strategy/indicator/metric/marker state. A
different canonical instrument or missing active series restarts the normal
cache/network flow above.

After the initial load, manual refresh and a visible-page session policy request
the primary latest window. Known regular venues refresh every five minutes from
open through 30 minutes after close and then stop. COMEX/NYMEX proxies follow
their Sunday-Friday Globex session, 30-minute close grace, daily maintenance
break, and weekend closure; unknown venues use 15 minutes. Window focus and
restored visibility share the same last-attempt timestamp and therefore cannot
bypass the minimum interval. A failed primary immediately enters ordered
backup recovery. Only an all-source failure increments the 15-, 30-, then
60-minute global backoff.
The manual header action and each scheduled active-instrument refresh cycle
de-duplicate all saved shortcuts by canonical instrument and refresh every
inactive instrument sequentially.
Active and background results replay every daily shortcut for that instrument
over its latest 128 trading sessions, persist rolling returns, and warm
canonical storage without changing the active chart. Rank history changes only
after a completed one-click screening, which submits and validates the complete
saved-strategy cohort for the active canonical instrument. Each row receives
its native standalone/combination rank when the exact plan is present or a
`null` not-ranked event when absent. All optimization objectives append to the
same five-event history. The action shows progress and updated/retained counts
and has a 60-second cooldown. If an
automatic request arrives while that pass is active or cooling down, its
request version remains pending and is consumed when the pass can start.
Credential-free backup audits are limited to once per 30 minutes per active
instrument. Credentialed backups are normally called only during recovery.
The explicitly integrated FMP/AllTick gold candidates may also receive the
same 30-minute active-gold audit so their rolling health and overlap quality
can become measurable. An AllTick 401 suppresses another audit for 24 hours in
the current page session; reload permits validation after credential rotation.
Expected audit failures are recorded without changing the chart.

The market route classifies upstream failures before returning them. Only a
non-sensitive code reaches the browser source-health record:
credential-invalid, access-denied, quota-limited, not-configured, or generic
upstream-unavailable. Request URLs, response bodies, and credentials never
enter IndexedDB health records.

## Current provider normalization

### Eastmoney

- Requests the configured interval with `fqt=1`; extended daily history adds
  `beg=20000101` and permits up to 10,000 rows.
- Prefers HTTPS and retries the same public host over HTTP after a TLS transport
  failure; no credentials are transmitted.
- Marks the resulting series `corporate-action-adjusted`.
- Preserves provider volume without rescaling.
- Resolves Eastmoney's overseas market bucket by known index code, so DAX,
  FTSE, CAC, SPX, NDX, KOSPI, SENSEX, Bovespa, SMI, TWII, and STI use their
  actual exchange sessions instead of JPX.

### EODHD

- Is disabled unless the server runtime provides `EODHD_API_TOKEN`.
- Supports daily index/ETF search and history only; it never receives commodity
  fallbacks.
- Uses the shared 2000-01-01 boundary for extended history and a short explicit
  date window for latest refresh.
- Adjusts all OHLC rows only when every accepted row has a finite positive
  `adjusted_close / close` factor; otherwise the complete result stays raw.
- Retries one transient network, HTTP 429, or 5xx failure and never logs the
  token.

### Yahoo Finance

- Supplies the active provider-native one-minute workspace path with a
  provider-supported recent range and a 1,500-bar application bound. The UI
  exposes no other intraday interval and performs no resampling.
- Uses explicit daily `period1`/`period2` boundaries starting at 2000-01-01
  for extended history; retained internal intraday requests keep their
  provider-supported ranges.
- For daily bars only, computes a factor as `adjclose / raw close` for every
  accepted row. It adjusts all accepted OHLC rows only when every row produces
  a finite positive factor.
- If any accepted row lacks a valid factor, keeps every accepted row on the raw
  OHLC scale and marks the whole daily series `raw`; adjusted and raw rows are
  never mixed within one `MarketSeries`.
- Scales provider previous close by the first accepted factor only for an
  all-adjusted parsed series. After limiting bars, previous close becomes the
  immediately preceding normalized bar when available.
- Keeps intraday output raw and never rescales volume.
- Accepts `FUTURE` instruments as backup commodity quote definitions and uses
  the same daily normalization when that regional network route is available.

### Nasdaq

- Supplies supported daily history from 2000-01-01 when extended history is
  requested and is marked `raw`.
- Acts as a fallback, not an intraday provider.
- Preserves published volume without rescaling.

### Additional daily backups

- Nikkei Indexes supplies official no-key N225 OHLC CSV history.
- Twelve Data and Financial Modeling Prep resolve exchange identity before
  returning daily OHLC; both require server-side keys.
- Alpha Vantage candidates require overlap validation because symbol search and
  index coverage can be ambiguous or plan-dependent.
- Marketstack is enabled only for ETFs and prefers adjusted EOD fields.
- Zhitu is enabled only for SSE/SZSE indexes. It is ordered immediately after
  the original provider so a local Chinese index source is tried before broad
  global credentialed services.
- Tencent supplies no-key SSE/SZSE index or ETF raw daily history capped at
  2,000 requested rows and a separate session quote. An empty chart can accept
  the history under verified exchange identity. Latest-only recovery keeps the
  single-bar response as a validated current-session overlay.
- Juhe supplies the final credentialed SSE/SZSE quote-only attempt when Tencent
  fails. It is skipped after any valid Tencent quote, excluded from routine
  audits and effective-primary selection, and protected by a 50-call
  Shanghai-day gate. Its one bar remains display-only under the same temporary-
  quote validation and persistence boundary.

`MarketSeries.priceAdjustment` is the authoritative UI metadata. For ETFs,
normalized prices reduce mechanical distribution/split gaps where the provider
supplies valid adjustment data. For indexes, the provider symbol/methodology
defines price-index versus total-return-index semantics; the pipeline neither
converts between them nor ingests constituent operating-company events and
fundamentals. It does not maintain separate distribution cash flows or a
synthetic total-return ledger.

`MarketSeries.latestBarStatus` is the authoritative daily completion metadata.
Past-date bars are complete. A same-date bar uses Yahoo's published regular
session end when available, otherwise the exchange's documented regular close;
unknown exchanges remain `unknown`. Close-derived live target changes are
frozen at the prior completed state while the latest bar is in-progress or
unknown. Causal prior-day stop orders may still fill inside that bar.

## Current fallback behavior

- A canonical primary is deterministic for one instrument definition.
- Reference failures affect only health records.
- Identity-verified backups may recover an empty chart. Overlap-gated backups
  require at least five matching dates and bounded OHLC errors; ETF adjustment
  mismatches use a stricter overlap threshold.
- A promoted backup may add missing or newer dates and replace only an
  unconfirmed final date. It never rewrites confirmed history.
- A rejected backup can become only a temporary quote after identity, date, and
  relative-price checks.
- A temporary quote may append a newer session or replace only an unconfirmed
  same-day bar in the active in-memory series. It updates chart OHLC, market
  statistics, live guidance, and current shortcut calculations, but is never
  written to canonical history. The newest accepted quote remains available
  across a later transient all-source failure until a newer quote or completed
  canonical bar supersedes it.
- A primary outage with cached canonical data leaves the chart and completed
  bars unchanged.
- A preferred-source outage without canonical data produces an explicit
  unavailable state only when no identity-verified backup succeeds.
- Provider aliases in saved shortcuts are compared through the canonical key;
  opening the same instrument restores strategies without reloading the chart.

## Current storage and traceability

`data/raw/` contains committed reference samples used for parser tests and
incident comparison, and `data/source_registry.jsonl` records those samples.
Runtime browser data is stored separately in IndexedDB:

- `canonicalSeries`: the locked chart series and fingerprint;
- `sourceSnapshots`: normalized exact-provider history/latest snapshots;
- `referenceSnapshots`: close-only reference observations;
- `sourceHealth`: attempts, availability, latency, error, and quality.

The browser store is source-auditable local state but not a literal archive of
the provider's original wire payload. There is no server-side cursor,
watermark, or `data/state/` checkpoint.

Saved backtest shortcuts use D1 and are a separate product-record pipeline.
They are not a market-data cache or a raw-source archive.

Completed screening runs also use D1, but only as compact traceability records.
Each row records the normalized canonical series source, optional temporary
quote provider/date/fetched time, adjustment mode, fetched time, last bar, bar
count, SHA-256 bar fingerprint, screening configuration, and retained compact
ranking. It does not store provider raw payloads or full equity/trade arrays
and is never read as an optimization cache.

The screening archive insert and all saved-row rank updates execute in one D1
batch. Shortcut rolling-return updates and first-level group deletion likewise
use one conditional statement or atomic batch so an interrupted request cannot
leave a partially updated cohort.

## Future recommendations

The following items are not implemented:

- Replace public website endpoints with a licensed source and record its usage,
  adjustment, and redistribution terms.
- If durable ingestion is added, archive raw responses with source URL,
  request parameters, access time, content hash, and provider adjustment mode.
- Add an explicit per-instrument daily watermark and idempotent processed-bar
  upsert only when a server-side incremental pipeline exists.
- Define a reviewed correction workflow before unlocking or revising a
  confirmed canonical bar.
- Add monitored recovery for partial writes and source outages before adding
  scheduled execution.
- Define retention and cleanup only after storage, privacy, licensing, and
  recovery requirements are known. Do not delete raw archives implicitly.
