# Cache and retention

SOX uses a fixed historical snapshot, retained indefinitely and reused without
TTL expiry once it reaches the requested end. Explicit `--refresh` performs only
the trailing overlap; raw backups are never automatically deleted. Source
registry entries deduplicate by URL/raw hash. No separate disposable source
cache is needed. Abandoned `.tmp` and ignored browser artifacts are eligible
for manual cleanup; no cleanup or background process is installed.

The `singleton-*` run/context outputs and one completion state are replaceable
derived files, not a new source cache. Source/raw retention stays unchanged.
Interrupted `.tmp` and ignored browser QA artifacts may be manually cleaned;
the runner performs no automatic deletion. No new download TTL is needed.

Adaptive outputs use `adaptive-*` and `data/state/adaptive-completion.json`.
They are reproducible derived outputs, with no new source cache or TTL. Raw
backups and accepted prices are retained; only abandoned `.tmp` files and local
visual-QA artifacts are eligible for manual cleanup. No cleanup runs by default.

The relative-operation study adds only replaceable `relative-*` derived outputs
and one atomic `data/state/relative-completion.json`. It reads the existing
accepted snapshot with no acquisition or cache refresh. Its state/output temp
files follow the existing `.tmp` recovery policy. It never deletes raw backups.

The revised MA-interval analysis reads the existing accepted snapshot and adds
only reproducible `ma-interval-*` outputs plus a single atomic
`data/state/ma-interval-completion.json` checkpoint. No source cache, raw backup,
or TTL is added. A same-input rerun replaces derived artifacts deterministically;
the final manifest detects incomplete publication. Its temporary writes are
covered by the existing output/state `.tmp` retention rule below.

- Source TTL: 24 hours; explicit `--refresh` overrides the TTL.
- Raw seed/Yahoo responses: content-addressed, locally retained, Git-ignored.
  Never automatically delete raw backups. Unchanged payloads reuse the same hash
  path. Only a short trailing update is requested on each fresh acquisition.
- Official raw CSV: not retained at all; validation happens in memory.
- Processed outputs: latest reproducible snapshot, atomically replaced. Earlier
  source hashes remain in the append-only registry. No automatic raw-price purge.
- Runtime state: one latest sync state and one completed-output checkpoint.
  Incompatible schema/configuration is rejected explicitly.
- Temporary output/state files left by interrupted writes: removed on the next
  run only when their filename ends in `.tmp` inside this study's `output/` or
  `data/state/`. This is the sole automatic deletion, and removes incomplete
  disposable writes rather than raw or processed data.
- QA screenshots / Playwright session logs: local, ignored, disposable. Keep
  latest screenshots for delivery verification. No browser storage from the
  application is read or modified.

This is a manually run small research job, not a service. Raw retention is
preserve-until-user-review. If long-term scheduled execution is later requested,
add a user-approved raw retention policy and registry compaction before enabling
it; neither is needed for the present one-off analysis.
