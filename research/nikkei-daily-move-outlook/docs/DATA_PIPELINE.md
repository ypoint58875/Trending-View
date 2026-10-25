# Independent data pipeline

## SOX source and block pipeline

Initial SOX acquisition requests December-1999 through the fixed analysis end.
It checks symbol/type/timezone, rejects missing/nonpositive OHLC rather than
filling zero, validates envelopes/dates, and deduplicates through a locked-date
merge. Raw JSON and registry entries commit before normalized data and sync
state. Accepted bars are immutable; observed revisions are explicitly recorded.
A compatible state contains bars and data hash; regenerate derived normalized
CSV from committed state after interruption. Incompatible/corrupt state stops.

A snapshot already covering the fixed end requires no network refresh. Explicit
`--refresh` requests a fourteen-calendar-day overlap and new tail only. `--offline`
never fetches. Block counts always recompute from the bounded accepted snapshot;
output-completion state commits last after all artifact hashes. Recovery reruns
the same command. US own-session blocks do not share Nikkei calendar boundaries.

## Daily-run context pipeline

`analyze-singletons.mjs` reads the unchanged accepted snapshot, builds the exact
old completed daily runs, partitions duration, learns descriptive amplitude
terciles, attaches prior-close SMA context and actual forward endpoints, and
publishes `singleton-*` artifacts. There is no new acquisition. Atomic artifacts
are hashed in a source/config/code manifest; completion state commits last.
Bounded derived full recalculation is the recovery command, with no new service.

## Adaptive distribution pipeline (current primary)

`analyze-adaptive-thresholds.mjs` reads the unchanged source CSV and verifies the
original manifest hash. It builds SMA intervals, learns early-only partitions
and candidate ratios, records mature first-crossing evidence, chooses group
thresholds and small-reference exclusions on validation, then freezes later
accounts. Full derived recomputation is bounded and intentional; acquisition
remains unchanged. Artifacts are atomic; the manifest hashes source, config,
code and every output; the completion checkpoint is committed last. Recovery
reruns the same command and validates hashes. No background scheduler is added.

## Adjacent-relative operation pipeline (current primary)

`analyze-relative-exits.mjs` validates the same accepted source and manifest
hashes, without modifying acquisition state. It builds causal SMA intervals,
links valid immediately adjacent pairs, groups by prior amplitude, and writes
full pair statistics before fitting any ratio. Early grouped positive peaks
produce candidate distributions; sparse-group pooling is recorded explicitly.
Validation selects entry/exit quantile ranks, which remain fixed in later data.

Every threshold uses only a completed prior interval. New-period endpoints are
used only for descriptive outcome measurement, never to generate a signal or
fill. Close signals fill next open; incomplete terminal signals remain pending.
Derived outputs publish atomically, then `relative-manifest.json`, then
`data/state/relative-completion.json`. Replay is fast, deterministic and bounded;
no per-trade progress checkpoint or background job is justified. Prior outputs
are retained independently. There are no raw-source or retention changes.

## Revised MA interval pipeline

`analyze-intervals.mjs` does not acquire data. It verifies the accepted processed
CSV against the original run manifest and then runs these dependent stages:

1. Compute causal SMA(7)/SMA(20) signs and maximal equal-direction intervals.
2. Summarize complete intervals before selecting any amplitude threshold.
3. Derive threshold candidates using only aligned intervals confirmed by the
   calibration end; keep the numeric thresholds fixed in the later period.
4. Record each interval/threshold's first observed crossing, regardless of its
   eventual end return or whether the interval is still active.
5. Measure complete post-event horizons, censored counts, opposite/continued/flat
   outcomes, path risk, benchmarks and non-overlapping sensitivity.
6. Publish separately prefixed artifacts, then the independent manifest and
   completion checkpoint last. Replay from the same snapshot is idempotent.

The source acquisition pipeline below remains unchanged. Refresh it only when
a newer analysis date is explicitly wanted; rebuilding the MA report requires
no full-history request or network call.

1. Read existing compatible `data/state/sync.json`; on first run, copy the
   previous study's normalized source and provenance without changing them.
2. Reuse source acquisition younger than 24 hours, or request a 14-calendar-day
   overlap plus new dates. A refresh never downloads full history again.
3. Validate symbol/type, dates, positive finite OHLC, envelopes, uniqueness and
   configured row/response limits. Filter incomplete Tokyo sessions using a
   conservative 15:45 JST cutoff. Reject null rows, not just numeric NaNs.
4. Merge missing dates idempotently. Keep accepted prices locked; record any
   provider revisions for manual review. Keep raw JSON before committing state.
5. Compare the recent publisher overlap in memory. A failed check remains visible
   in provenance and the report; it cannot masquerade as successful validation.
6. Atomically publish sync state, processed prices, tables, charts and report.
   Commit the output manifest and completion checkpoint last. Their hashes detect
   partial/interrupted output publication.

There is no schedule. Use the default command for a cached normal update,
`--refresh` for an explicit incremental request, and `--offline` for recovery or
reproduction with no network. A failed Yahoo acquisition stops rather than
silently using stale data; select `--offline` explicitly when desired.

State stores schema version, configuration hash, source acquisition timestamps,
seed provenance, price hash and latest accepted date. Incompatible configuration
or schema stops explicitly; preserve the study and create a separate directory
for experiments rather than deleting original state. Durable state includes
the normalized history, so later runs do not require the parent seed directory.

The 20,000-bar cap, response-byte cap and 2,520-session lookback bound memory and
work. Full recomputation of small derived tables is intentional: appending a new
date can mature an older outcome and change a rolling-window distribution, so
incrementally appending only final statistics would be incorrect. Source
acquisition, the expensive external boundary, remains incremental.

Sync checkpoints commit after safe raw writes; the separate output-completion
checkpoint commits only after every artifact is safely written. SIGINT/SIGTERM
aborts pending network and asynchronous writes; synchronous calculation may
finish its bounded work before delivery. Recovery reruns derived computations
from the last valid data snapshot. Temp-only cleanup is documented separately.
