# Independent research module patterns

The SOX block study reuses the same pure `dailyDirectionBlocks` calculation and
CSV conventions as Nikkei. A separate `sox-source.mjs` normalizes Yahoo identity,
New York dates and locked incremental merging; SOX config, locale, raw/state and
output names are isolated. The standalone HTML follows the established block
report layout. Historical Nikkei generators/artifacts are preserved unchanged.

Each study has an isolated JSON configuration, pure English logic module,
standalone report module, Chinese copy JSON and runner with atomic publication.
Reuse `core.mjs` for return conventions, daily runs, quantiles and CSV writing,
and `intervals.mjs` for SMA sign definitions/IDs. Never alter old artifacts to
make a new study appear consistent; reconcile identities and report differences.

The daily-run context study adds only `singletons.mjs` and its report/runner.
It groups row-level observations before summarizing, keeps invalid ratio
denominators visible, and separates retrospective classification from already
observable features and post-confirmation endpoints. Parent interval joins use
the prior-close context ID, not an assumed same-day interval membership.

Full-snapshot descriptive terciles must not be called predictive thresholds.
Chart/table UI copy lives in the isolated locale JSON. New output prefixes
prevent collisions with older report families. Hash manifests and tests link
the computation, report and exact source snapshot.
