# Independent study state

Date: 2026-10-20, Asia/Shanghai.

## SOX 200-session comparison

Added `analyze-sox-blocks.mjs`, `sox-config.json`, `sox-copy.zh-CN.json`,
`lib/sox-source.mjs` and five source/provenance/aggregation tests. Reuse the pure
`dailyDirectionBlocks` implementation; preserve all older reports unchanged.
The new report is `output/sox-200-session-report.zh-CN.html`, with CSV/JSON.

Accepted source: Yahoo `^SOX`, INDEX/PHLX Semiconductor, America/New_York dates.
The official Nasdaq page verifies identity, not all historical close values.
No independent full-history price cross-check is claimed. Source access on
2026-10-20 uses the same fixed calendar endpoint as Nikkei, 2026-10-13.
Daily analysis starts 2000-01-04; December-1999 data supplies earlier closes.
There are 6,734 analyzed sessions, 3,529 up, 3,202 down, three flat; 33 full
200-session blocks and a 134-day tail. Provider invalid/rejected rows: zero.

Sync state is `data/state/sox-sync.json`; original raw JSON is under
`data/raw/sox/`; normalized prices are `data/processed/sox-daily.csv`.
The state is authoritative after interruption; a normalized CSV is regenerated
from its committed bars. Raw and registry entries precede state commit. Fixed
complete snapshots are reused without another request. Explicit refresh uses
a fourteen-day overlap, appends new dates and records revisions without altering
accepted bars. Incompatible source identity/schema or state hash fails explicitly.
Atomic derived publication precedes `sox-200-session-manifest.json` and final
completion state. Bounded calculation is short; no per-block checkpoint or
background schedule is justified. Network timeout is thirty seconds, response
limit twelve MB, normalized data limit 20,000 bars.

All 77 independent tests pass, preserving old artifact hashes. Offline replay
leaves normalized source and numerical CSV SHA-256 unchanged and does not add
a registry entry (four entries total after first SOX acquisition).

Visual verification: Edge/Playwright inspected the SOX report at 1500x1100
and 390x844. All 34 interval rows and the total footer are present; mobile
document width stays 390 pixels while the table scrolls internally. No browser
errors or warnings. No parent application files or old Nikkei outputs changed.

## Fixed 200-trading-session directional counts

Added `analyze-daily-blocks.mjs`, `lib/daily-blocks.mjs`, isolated Chinese copy
and three boundary/aggregation/artifact tests. Open
`output/daily-200-session-report.zh-CN.html`; the matching CSV/JSON contains all
33 blocks (32 full blocks and a 157-day tail), starting 2000-01-04. Full totals
are 6,557 sessions, 3,409 up, 3,147 down, one flat. The prior close for the first
included day is 1999-12-30; all later block boundaries also retain their outside
reference. No old result, source or parent app file changed.

This small bounded local computation needs no per-block resume checkpoint.
Atomic output replacement precedes a hash manifest and final state at
`data/state/daily-200-session-completion.json`. Rerun the same command after
interruption; no source refresh or cleanup occurs. Existing retention rules
apply to derived reports and temporary files. No scheduled service is installed.

Verification: all 72 independent tests pass, including the three new boundary,
tail/count reconciliation and artifact-completion checks. Existing artifact
hash tests confirm that older reports remain unchanged.

## Latest request: singleton patterns, run durations and SMA context

The latest report is `output/singleton-report.zh-CN.html`; run
`analyze-singletons.mjs` with no arguments. Source, prior reports and app files
are unchanged. New files: `singleton-config.json`, isolated Chinese locale,
`lib/singletons.mjs`, `lib/singleton-report.mjs`, runner and independent tests.
Earlier parent app edits were already present on entry and are out of scope.

User clarification: single up/down means completed one-session daily return
runs with opposing daily signs on both sides, exactly the old 802/883 sample.
The proposed peak-recovery excursion design was superseded before implementation;
it is not the population in this report. Add exactly two and at least three
sessions separately; all direction/duration buckets exhaust completed runs.
Up counts 802/433/440 total 1,675; down 883/428/363 total 1,674. The user-pasted
denominators were reversed; exact original CSV reconciliation is tested.

Direction/duration-specific amplitude terciles use the fixed full sample as
descriptive statistics. Context is prior-close MA slope; countertrend runs with
any opposite MA sign through the reversal confirmation are turn-associated.
Transient flips are counted, not called durable regime changes. Same-trend
samples stay separate. Original parent SMA IDs, daily/run date anchors,
three-date singleton MA sequences and all row-level forward endpoints are
exported. Relative trend ratios use only observed cumulative movement at entry.
Post-confirmation returns exclude the reversal already required by the pattern.

Visual verification: Edge/Playwright at 1500x1100 and 390x844 checked MA7 to
MA20 and one-day to exactly-two-day control changes. Headers and horizons
update together; mobile document width stays 390 pixels with internal table
scrolling. No JavaScript warnings/errors. Hash comparison preserved every
pre-existing modified parent-app file. The application suite was not run because
no application feature changed; the independent 69-test suite passed instead.

This calculation is short, in memory and capped at 20,000 bars. It reuses the
accepted local snapshot with no network refresh. Derived full recalculation is
intentional and takes under a second. Atomic output publication and a manifest
with source/config/code/artifact hashes precede the last completion-state write
at `data/state/singleton-completion.json`. On interruption rerun and check all
hashes; partial outputs are not complete. No per-run checkpoint or scheduler.

All 69 independent tests pass, including old artifact preservation, exact run
population reproduction, disjoint durations, group boundaries, context sums,
causal labels, next-day confirmation and post-confirmation forward anchors.

## Current primary: adaptive partitions and passive benchmark

Use `analyze-adaptive-thresholds.mjs`, `adaptive-config.json`, the isolated
Chinese copy JSON and `lib/adaptive-{thresholds,report}.mjs`. Primary output:
`output/adaptive-report.zh-CN.html`. The 5%-10% example is not a fixed group.
Optional direction bins, per-group ranks and reference floors extend the existing
relative simulator without changing old callers. All writes stay in this study.

Training partitions use predecessor amplitudes known by 2009; candidate outcome
labels must also be confirmed by then. Group ranks and zero/one/two-smallest-group
exclusion variants are selected on 2010-2015 only, then frozen for 2016 onward.
Main chosen variants retain all references. MA20/two-group exclusion is ineligible
because validation has fewer than 20 complete trades. Blank later metrics are
intentional. Accuracy-first variants require ten validation events per group or
disclose a lowest-rank fallback. Probabilities are descriptive, not guarantees.

Main later CAGR: MA7 3.5074%, MA20 6.1805%; holding 12.6249%. Complete trades
69/52; outperforming years 1/11 and 3/11. One-group exclusion: 7.0900%/6.2514%.
These improvements cannot be selected using later returns. No stable excess
threshold established. Current prices end 2026-10-13; no new market-data request.

Short, bounded derived calculation takes seconds with a 20,000-bar limit. Full
recalculation is intentional as labels mature and configuration affects complete
accounts. Each artifact is atomically replaced; `adaptive-manifest.json` hashes
all artifacts and relevant source modules. `data/state/adaptive-completion.json`
commits last. Interrupted hash failures require rerunning from the accepted
snapshot. Same-input numeric outputs are deterministic; generated timestamps
change. Per-search checkpoints are unnecessary for this bounded computation.

Merging is only a documented future causal design: confirmation must precede
merging, executed signals cannot be erased retrospectively, and changed anchors
require retraining. It is not an implemented or claimed backtest result.

Verification: all 58 independent tests pass, including original artifacts,
adaptive source/config/artifact hashes, minimum-count/tied partitions, frozen
validation schedules under future extension, reference-floor suppression,
actual next-open fills, fees and terminal account compounding. Edge/Playwright
checked 1500x1100 desktop and 390x844 mobile, MA/sample controls, mature evidence
tables and exclusion details. Mobile document width remains 390 pixels, wide
tables scroll within containers, and no console errors/warnings were observed.
The parent tracked diff is empty; only this study directory is untracked.
No application feature changed, so the independent suite is used instead of
the application build/test command, which writes unrelated app outputs.

## Earlier primary: fixed-group relative thresholds

The latest primary report is `output/relative-report.zh-CN.html`. The user
requires current movement relative to the previous opposite interval, grouped
by prior magnitude such as 5%-10%, and wants entry/exit thresholds themselves
to drive operation. This supersedes fixed-percent, fixed-horizon and MA-entry
assumptions as the primary answer. Earlier reports remain intact.

Use `analyze-relative-exits.mjs`, `relative-config.json`, `relative-copy.zh-CN.json`,
and `lib/relative-{intervals,exits,report}.mjs`. Source prices/manifests are
read-only. Prefix `relative-*` outputs and the atomic completion checkpoint are
separate from earlier studies. Data still ends 2026-10-13.

The primary formula divides the new return percentage by absolute prior return
percentage. Do not substitute point retracement; the calculator exposes both.
Only an already-confirmed, actual direction-aligned prior interval supplies
scale; failed next intervals are retained. Group boundaries are lower-inclusive.
Small group training samples use disclosed pooled estimates. MA endpoint lag
and first-observed ratio overshoot are visible rather than backpainted fills.

Entries and exits are close-confirmed relative crossings, filled next open.
Long/flat only; no orders or personal account access. Group-dependent ratios
come from early distributions; quantile ranks are selected in validation and
then frozen. Participation is descriptive because threshold entry intentionally
filters opportunities. Every grid, signal, trade, cost assumption and conditional
entry/exit cohort is written to local output.

For previous amplitude 5%-10%, candidate entry/exit ratios are 41.7116%/84.0625%
for SMA7 and 15.8124%/64.8958% for SMA20. Early positive group samples are
19/25 and 12/12. Neither policy passes the declared later-period comparison:
SMA7 raises return but deepens drawdown; SMA20 underperforms its controls.
These are candidates with tradeoffs, not a validated optimum or instruction.

The complete independent suite passes 42 tests. Tests include correct ratio
conventions, group edges, valid previous denominators, failed next intervals,
training-only fitting, sparse pooling, first crossing, threshold-driven entry,
next-open gap fills and two-sided costs, source-prefix invariance, pending
last-bar signals, actual artifact hashes, and validation-only rank selection.
The workload is bounded (20k bars, two MAs, six magnitude groups, a 5x5 rank grid)
and completes in about one second; safe full derived replay from committed source
is sufficient. No new acquisition, schedule or application test/build is needed.

Relative-report QA: headless Edge inspected 1500x1100 desktop and 390x844 mobile
views, operation comparisons and calculator. MA/sample controls update the
selected group thresholds; a 100 -> 105, 40% ratio example calculates 102.90
under return ratios versus 103.00 under point retracement. Narrow document width
remains 390 pixels; wide result tables scroll locally. No console errors were
observed. Temporary preview service is closed after verification. Original
delivered artifact hashes still pass their tests.

## Revised primary analysis: intervals before thresholds

The user corrected the workflow to require intervals first and return thresholds
second, and selected MA(7)/MA(20) as noise-reducing interval definitions. The
primary deliverable is now `output/ma-interval-report.zh-CN.html`, generated by
`analyze-intervals.mjs`. Previous daily analysis is preserved as supplementary
context rather than overwritten.

SMA slope sign alone labels intervals; no magnitude or percentage reversal gate
participates in segmentation. Up/down MA intervals can finish with opposite
price returns. The report therefore presents actual price-direction agreement,
signed magnitude, duration and time/count shares before any threshold table.
Threshold candidates come from 25/50/75/90/95/99% quantiles of direction-aligned
completed interval magnitudes confirmed by 2015 end. Their numeric values stay
frozen for later-sample event analysis. All segments, including those with an
eventually opposing return and the active segment, remain eligible for causal
first-crossing events. Each interval/threshold contributes only its first close.

The new script reads the accepted source snapshot without network calls or source
mutation. Its separate manifest and atomic completion checkpoint reference the
source manifest/data hashes; all artifacts use an `ma-interval-` prefix.
Computation is bounded by the existing 20,000-bar cap, two MAs, six quantile
candidates per direction and five horizons. It currently completes in about
one second, so deterministic replay from the accepted snapshot is the recovery
mechanism. No new long-running job or raw-data retention rule is needed.

The full independent test suite now passes 29 tests, including new MA direction,
causal event, calibration cutoff, denominator, censored horizon, non-overlap,
actual event reconstruction and artifact-hash verification. The original
14 tests still pass against the unmodified earlier outputs.

The daily-magnitude and outlook research is implemented entirely inside this
directory. The parent application has no new feature, integration or dependency.
Parent feature/status documents are deliberately unchanged to honor isolation.

The initial accepted analysis date is 2026-10-13; official validation extends
through 2026-10-14, while that Yahoo row has null OHLC fields and is excluded.
The main sample is 2000 onward. Existing 1965 onward normalized history is
preserved for provenance and causal warm-up; early synthetic-looking OHLC is
never used for intrahorizon excursion statistics.

Restore context from README, TECH_RESEARCH, FEATURE_MAP, DATA_SOURCES, and the
output run manifest. Outputs, source hashes and configuration hashes are linked.
Inspect the manifest before calling any snapshot current. Source revisions are
recorded; previously accepted prices are not silently overwritten.

## Recovery and resource assessment

Source acquisition can be interrupted, but the workload is small and bounded
(20,000 bars, 12 MB per response, 2,520 training sessions). Initial observed peak
RSS was about 220 MiB. Full deterministic recomputation takes under a minute on
this host; an analysis-stage per-item checkpoint would add unjustified complexity.
Atomic sync state commits after the corresponding raw data is written. Output
completion commits last against the exact manifest hash. Interrupted output sets
must be treated as incomplete until artifact-hash checks pass. Rerun with
`--offline`; no source refresh or repeated full-history download is needed.

The process handles SIGINT/SIGTERM during asynchronous work. The synchronous
bounded calculation can delay signal delivery until it yields; no sub-second
cancellation claim is made. No background service is installed. Source TTL,
cache/temporary cleanup, state compatibility and raw retention are in
DATA_PIPELINE and CACHE_POLICY.

## Verification scope

Independent unit tests check conditional magnitude, forward anchors, causality,
purged historical availability, fallbacks, pivot confirmation, unfinished-run
exclusion, invalid data and exact bin boundaries. Artifact tests check hashes,
completion state, actual evaluation endpoints, non-overlap, metric aggregation,
report dates and finalized wave confirmation. Repeated online-cache/offline runs
are compared for numerical idempotence. Desktop and narrow-screen report layouts
are inspected with local headless Edge through Playwright.

The application's `npm test` is not run: no application feature was changed,
and its build would write application outputs contrary to this task's isolation
goal. Git status and diff must show only this new study directory.

## Original daily-study verification (retained)

- `node --test research/nikkei-daily-move-outlook/tests/*.test.mjs`: 14 passed,
  0 failed, including generated-artifact and actual forward-endpoint checks.
- Repeated cache/offline runs: accepted-price hash and all numerical CSV hashes
  unchanged; registry remains three entries, with no duplicate source append.
- Desktop: 1440 by 1100; narrow screen: 390 by 844. Important outlook and
  evaluation sections visually inspected. On the narrow screen, document width
  remains 390 pixels; wide tables/charts scroll within their own containers.
- The only browser resource error observed was the original missing favicon;
  the final standalone report uses a data URI favicon. No report JavaScript or
  external asset dependency exists.
- Parent tracked-file diff and whitespace checks are empty. Git status shows
  only `research/nikkei-daily-move-outlook/` as a new directory.

## Revised MA interval report verification

- All 29 independent tests pass, including hash preservation for the original
  daily study and source manifest.
- Playwright/Edge verified the SMA(7) to SMA(20), all-sample/later-sample and
  horizon control changes against generated result tables. The same pure
  renderer produces initial and interactive table content.
- Desktop view 1500 by 1100: the primary reversal table fits its 1,284-pixel
  container without horizontal clipping. Important interval/threshold sections
  and the mobile view were visually inspected. Section links account for the
  sticky controls.
- Mobile view 390 by 844: document width remains 390 pixels; wide tables/charts
  scroll inside their containers. No console errors or warnings were observed.
- Candidate-threshold labels are rounded for display only; full-precision CSVs
  and computation remain unchanged.
