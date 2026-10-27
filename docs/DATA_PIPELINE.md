# Data Pipeline

## Adopted rule synchronization across both workspaces

Shared hydration checks each dynamic account against the current overlay, reuses
an available preview or runs one bounded worker, then promotes settings/report
with a backup and CAS. No new market fetch or strategy selection. Commit requires
the source account to exist at the expected revision; stale work refreshes rather
than overwriting or recreating it. Failed writes preserve old data. Refresh/unmount
cancels unfinished work; the next open safely resumes from the unchanged account
or cached preview. One upgrade per refresh is committed before rereading shared
records; subsequent appends/repairs inherit current rules and preserve the backup.
Ordinary static saved plans are outside this migration.

## Nonblocking cycle restore and preview cache

Restore local task/accounts before depending on optional static shortcut API.
Replay current overlay from existing bars, winners and explicit decision calendar;
do not refresh data or re-screen. Save derived report atomically only after full
success and a transaction-time identity check. Interruption/navigation discards
unfinished preview and retains the confirmed account. A bounded deterministic
replay is the recovery path; no per-bar checkpoint is needed for this short task.
One worker/10000 bars/snapshots/120s timeout bounds work. One cached preview per
profile is replaced on identity change. Confirmed incremental updates and gap
repair remain untouched.

## RSI first-pullback short research run

rsi-first-pullback.ts verifies frozen input/source and ordered decision hashes,
then replays55 bounded policies with current v8 and shared Wilder RSI10. Reuses
existing raw data without network refresh. Writes one atomic summary containing
source/code identity, events and omission audits under research/nikkei-overlay-
stability/output/rsi-first-pullback/. Full deterministic rerun is short-lived;
checkpoint infrastructure would add disproportionate complexity. No live account
or prior checkpoint updates; maximum10000 bars/16MiB per input.

## v8 overlay adoption and replay

No new source fetch or data transformation is required. Production and frozen
research reuse completed local bars and shared Wilder RSI. New calculations
select v8 and isolate screening results by existing model-aware identities.
Existing dynamic accounts continue incrementally with their stored model;
confirmed history, pending-day replacement and missing-bar repair rules remain
unchanged. Frozen integration uses the existing2000-bar fixture and selected
RSI research output; research manifests and raw inputs are preserved. Runtime
feature memory remains bounded by input arrays and weak caches; no new long job
or checkpoint format is introduced.

## RSI parameter chunk checkpoints

Run rsi-parameter.ts then rsi-parameter-audit.ts under research/nikkei-overlay-
stability. For each source/code/menu identity, single and combined phases retain
128-row chunks under data/rsi-parameter/<identity>/ with an atomic manifest.
Commit a chunk before advancing manifest completed count. Resume validates chunk
hashes, identity, safe filenames, ordered policy prefix and manifest totals;
missing committed chunks are errors, not silently skipped work. At most one
unmanifested chunk is recomputed. Use one writer per identity. Source backup and
prior experiment identities remain immutable; no external price refresh.
Bounds:16MiB per input/chunk,10000 bars,30000 policies per phase,4096 cached metric
paths and2GiB RSS. No target arrays are retained per result. Interruption flushes
the current safe chunk before stopping. Summary/audit files are derived outputs,
not the durable progress authority. No automatic deletion is introduced.

## Descending sequence extension resume

Run npx tsx research/nikkei-overlay-stability/descending-sequence.ts.193 bounded
policy rows commit atomically to data/descending-sequence/<identity>/rows.json;
same-command resume checks ordered policies and skips all committed work.
Source/bar/code hashes, v7 target parity and24 legacy paths prevent silent drift.
Existing16MiB input,10000-bar and2GiB RSS limits apply. Output summaries are
derived; retain checkpoints and frozen source backups, with no automatic deletion
or market-data refresh. Event omissions may cause later rolling triggers and
must not be interpreted as reverting the full account to baseline.

## Shape priority research resume

Run npx tsx research/nikkei-overlay-stability/shape-priority.ts. Sequential bounded
rows commit atomically under data/shape-priority/<source-code-menu-identity>/.
Same-command resume validates ordered base/combination policies and reuses all
committed rows. Different code identities use separate directories, preserving
previous research rather than rewriting incompatible checkpoints. Input files
are capped16MiB, bars10000, rows1000 and RSS2GiB; interruption stops between rows.
Only derived summaries/reports are replaced; source backups and engine state
are untouched. No automatic retention deletion is introduced for this finite study.

## Incremental validated-cycle continuation

The local dynamic registry persists original market input, selected snapshots,
model/policy, execution settings, confirmed end date, provisional tail, revision
and update time. Research runs reuse their existing normalized MarketSeries and
winner; no new market source or optimizer is introduced. Each confirmed write
advances exactly one available session. Gaps list missing dates and require
cycle-validation repair, which reuses frozen snapshots and computes missing
scheduled units only. Repair retains the original evaluation start and account.
Whole-record IndexedDB transactions commit the replay result before revision
advances; concurrent tabs retry from the latest durable revision. Reload reads
that checkpoint; failed writes retain the previous record. Provisional entries
replace only the same unconfirmed day, and confirmed-date repeats are no-ops.

## Bounded cycle queue acknowledgements

Cycle submission sends sequential chunks of at most64 units and persists each
acknowledged ID/window/date mapping in the existing IndexedDB task before the
next chunk. Later failures preserve completed/queued progress; resubmission
reuses deterministic IDs and committed results. Each HTTP batch retains its
existing atomic queue manifest and shared bars, and the coordinator performs
existing maintenance once per batch rather than once per unit. Completed-job
reconciliation precedes restarting a previously cancelled job on resubmission.
No external source, protocol migration or historical-signal rewrite is added.
An interrupted unacknowledged request may still have a durable manifest;
deterministic retry resolves that ambiguity without inventing completion.

## Seven-date six-leg versus five-leg rerun

Run `node --import tsx research/nikkei-overlay-stability/six-vs-five.ts`.
Read frozen full-screen-6-15 input/signals and the seven exact local request
files; verify source/bar/request hashes and original two-bar signal parity.
Use the shared screening API with maxCombinationStrategies5, otherwise the
original settings/config/exclusions. Process one prefix at a time, max10000
bars, abort on RSS>2GiB or interruption. Commit only completed jobs atomically
to data/six-vs-five/rows.json with source/request/code identity and ordered date
checks; interrupted active work is recomputed, at most one unfinished job.
Final summary under output/six-vs-five/ retains both max5 and exactly5 winners
and same-pre-decision v7 targets. No external source, shared queue mutation,
rescheduling, raw cleanup or whole2000 max5 comparison is introduced.

## Earlier-risk exit robustness replay

Run `node --import tsx research/nikkei-overlay-stability/risk-exit-validation.ts`.
Reuse frozen full-screen-6-15 input/signals and exit-priority summary; no network
refresh. Validate ordered decisions, source/design/code identities and20 prior
anchor matches. Atomically save every20 of292 cases to
`research/nikkei-overlay-stability/data/risk-exit-validation/grid.json`;
the same command resumes compatible rows (292-row resume verified).
Process scalar rows and selected detailed ledgers under a1.5GiB heap guard;
interrupt handlers preserve completed progress. Outputs in
`research/nikkei-overlay-stability/output/risk-exit-validation/` include grid
summary, selected event/target ledgers, next-open/cost sensitivities, evaluator-
only episode omissions and first1500-selected final500 deployment. No raw
source or production target is changed. Reject incompatible checkpoints;
retain old raw inputs and use a distinct reviewed run for changed experiments.

## Original-sell priority and independent risk-exit scan

Run `node --import tsx research/nikkei-overlay-stability/exit-priority-study.ts`,
then `node --import tsx research/nikkei-overlay-stability/exit-priority-audit.ts`.
Reuse frozen full-screen input/signals and oscillator-filter target references;
validate source/bars/ordered decisions and all four baseline target hashes.
Scan212 whole-account cases. Atomic20-case state under data/exit-priority/
grid.json validates source/code/design/ordered-menu identity; SIGINT/SIGTERM/
RSS1.5GiB persist complete work. Bounds16MiB/input,10000 bars,2048 decisions,
212 policies; same-command resume verifies212-row reuse. Output/exit-priority
retains all scalar cases, selected events/pending-origin blocks, dated DD and
matched costs/next-open/development checks. Separate short audit checks common
entry/extra-stop date and exact final500 target tails without a new checkpoint.
All outputs publish atomically. No external fetch, raw deletion, scheduler,
rescreening or production changes. Evaluator date comparisons are never live gates.

## Rolling-window peak extension

Run `node --import tsx research/nikkei-overlay-stability/peak-window-study.ts`.
Reuse frozen full-screen source/signals and old peak-liquidation summaries.
Verify source/bars/decision identity plus44 old baseline/rolling20 target hashes.
Scan644 actual-account cases, committing complete scalar rows every20 to
research data/peak-window/grid.json. Exact source/code/design/ordered-policy
identity is required; SIGINT/SIGTERM and RSS1.5GiB save valid progress. Bound
16MiB/input,10000 bars,2048 decisions,644 cases. Same-command resume verified644
reuse. Separate atomic output/peak-window stores all cases/GRID, selected full
ledgers, costs/next-open and development selections. COMPARISON is a finite
human-readable interpretation, not a new optimization. Old164-row checkpoint
is preserved; shared type-only edit changes its code fingerprint, so do not
bypass its rejection. No fetch, scheduler, raw deletion or product migration.

## Four-model peak-liquidation scan and audit

Run `node --import tsx research/nikkei-overlay-stability/peak-liquidation-study.ts`,
then `node --import tsx research/nikkei-overlay-stability/peak-liquidation-audit.ts`.
Reuse full-screen-6-15 input/signals and oscillator-filter baseline target hashes.
Validate source/bars/ordered decisions and exact four unchanged control paths.
Replay164 whole-account configurations with held episode/rolling20 peaks,
fixed thresholds and wait0/5. Scalar checkpoints commit every20 under research
data/peak-liquidation/grid.json; strict source/code/design/policy-prefix checks
reject incompatible resume. SIGINT/SIGTERM and RSS1.5GiB commit completed rows.
Bounds16MiB/input,10000 bars,2048 decisions,164 cases. Resume verified164 reuse.
Matching output directory holds all scalar rows and selected ledgers/sensitivities.
The separate finite audit verifies selected target hashes and shows actual4/6/8%
cut dates, not only unchanged best cases; it reruns without another checkpoint.
Outputs are atomic. No new data fetch, raw deletion, scheduler or product change.

## Actual signal-source event shares

Run `node --import tsx research/nikkei-overlay-stability/signal-share-study.ts`.
Read frozen full-screen-6-15 input/signals and contribution/dynamic-v6 ledger;
verify source/bars/decision identities and every2000 target against production.
Replay causal pending-zero-request origins and persist dated actual changes
under output/signal-share/events.json, proportions in summary.json and REPORT.md.
Windows inherit one account, count by actual execution date and never fabricate
boundary fills. Bound16MiB/input,10000 bars,2048 decisions. This short finite
read-only replay safely reruns rather than adding a checkpoint; outputs publish
atomically. No new market fetch, scheduler, raw/source changes or product edits.

## Frozen-winner contribution accounting

Run `node --import tsx research/nikkei-overlay-stability/contribution-study.ts`.
Read existing full-screen-6-15 input/signals; verify source/bars hashes, decision
alignment and sampled production signal extraction. Generate causal two-bar
signals for the first-known fixed winner and preset SMA10/30 on the same1293
decision dates. Commit complete rows atomically every64 to research
data/contribution/signals.json; exact source/code/control/index identities
are required. Both same-command resumes reuse1293 rows. Initial draft state
is retained as signals-initial-398d05c795ba.json, not silently migrated.

Bound16MiB/input,10000 bars,2048 decisions/control,2 fixed controls,9 account
cases and RSS1.5GiB. Long signal generation checks SIGINT/SIGTERM/memory and
commits valid progress; short finite ledgers rerun after interruption. Separate
atomic output/contribution ledgers/summary/report retain fees, next-open,
double-cost, native target-hash parity and conditional2x2 effects. No new
external source, rescreening, production rule changes, scheduler or raw deletion.

## Production no-RSI rebound integration

Run `node --import tsx --test research/nikkei-overlay-stability/rebound-integration.test.ts`
to compare new v6 and archived v5 targets against frozen full-screen-6-15 input/
signals and dual-return goal/baseline ledgers. Validate source/bars hashes and
decision indexes before exact2000-bar parity and close/next-open metrics.
This short bounded read-only verification needs no checkpoint or external fetch.
Earlier research production-baseline callers pin v5 explicitly. Preserved
research progress contains old implementation hashes and intentionally rejects
the changed source on rerun; do not overwrite identities to bypass validation.
The adopted controller scans at most ten actual-flat closes plus ten pre-low
closes per candidate day, using existing10000-bar input bounds and per-model
feature caches. No scheduler, raw-source changes or recovery-state migration.

## RSI/Bollinger entrances and auxiliary filters

Run `node --import tsx research/nikkei-overlay-stability/oscillator-entry-study.ts`,
then `node --import tsx research/nikkei-overlay-stability/oscillator-filter-study.ts`,
then `node --import tsx research/nikkei-overlay-stability/oscillator-filter-audit.ts`.
Reuse full-screen-6-15/input.json and signals.json; validate source/bars/decision
alignment, original control hashes and production baseline. Existing RSI14 and
Bollinger20/2 use completed-bar data; historical evidence excludes today and
held observations. Keep full/final500/recent boundaries and inherited state.

Separate61/23-case scalar checkpoints commit atomically every10 under research
data/oscillator-entry/grid.json and data/oscillator-filter/grid.json. Exact
source/code/design/ordered-policy identity is required; reject incompatible
state without deleting it. Same-command resumes verified61/23 reuse. Bound
sources16MiB, bars10000, decisions2048 and RSS1.5GiB; SIGINT/SIGTERM safely stop
after completed work. Retain only selected full ledgers; all scalar failures
remain visible. Separate atomic output directories hold reports and identities.
Finite attribution needs no checkpoint: interrupted runs rerun from frozen
source. Omission bounds and common-state forks are evaluator-only; no live
date switches, scheduler, external fetch, raw-data deletion or growing cache.

## Hard dual-return confirmation and scoped exits

Run `node --import tsx research/nikkei-overlay-stability/dual-return-study.ts`,
then `node --import tsx research/nikkei-overlay-stability/dual-return-extension.ts`.
Reuse frozen full-screen input/signals. Validate source/bars/decision alignment,
all2000 production baseline targets and earlier reference target hashes. Never
shift evaluation boundaries: full2018-08-09..2026-10-26, final500 from2024-10-04.
Hard acceptance requires strictly higher full and final500 returns; drawdowns,
postJuly21, failed cases and chronological selection remain visible.

Initial91 and separate baseline+54 extension rows persist atomically every10
cases under research data/dual-return/grid.json and data/dual-return-extension/
grid.json. Source/implementation/design/menu/order drift rejects resume. Both
same-command resumes verified91/55 completed-row reuse; SIGINT/SIGTERM/RSS
checks commit completed rows and replay unfinished work. Bound16MiB sources,
10000 bars,2048 decisions,145 combined cases,RSS1.5GiB. No fetch/scheduler.

Selected full ledgers, reports, source/code identities, doubled costs and
next-open baselines are separate atomic outputs. Common-state forks retain1936
unchanged targets throughJuly21; dated added-episode exclusions are evaluator-
only actual-account counterfactuals, not live date switches or additive alpha.
Keep original91 and their state unchanged when evaluating the second stage.
Preserve raw backups and previous studies; no cleanup is introduced.

## SMA20 fallback and event attribution

Run `node --import tsx research/nikkei-overlay-stability/sma20-fallback.ts`,
then `node --import tsx research/nikkei-overlay-stability/sma20-fallback-audit.ts`.
Validate frozen source/bars/signal alignment,2000 production baseline targets,
summary/full-ledger agreement and1936 common-state prefix targets. Keep one
inherited account and unchanged native exit/stop/recovery semantics. Compute
rolling lows from preceding completed flat closes and peaks strictly before
the low. Future5/10 returns, MFE/MAE, known episode exclusions and dated
drawdowns are evaluator-only. No new market fetch or source modification.

Twenty cases publish atomic per-case ledgers and final summary/report under
research output/sma20-fallback. The audit verifies all20 target hashes and
publishes six explicitly post-result background variants, bounded single-turn
unlock replays and candidate episode omissions separately under output/
sma20-fallback-audit. Preserve source/code/design/menu identities and settings.
The short finite run has no growing cache or new durable checkpoint; rerun
both commands after interruption. Outputs commit atomically, summary last.
Bound16MiB source inputs,10000 bars,2048 decisions,20+6 policy comparisons,
at most2000 diagnostic turns and RSS1.5GiB; stop checks apply between cases.
No scheduler or raw cleanup is introduced.

## Explicit-mode supplemental repair and attribution

Run `node --import tsx research/nikkei-overlay-stability/supplemental-repair.ts`,
then `node --import tsx research/nikkei-overlay-stability/supplemental-repair-audit.ts`.
Reuse frozen full-screen input/signals; validate source/bars identities and
production parity for2000 main targets. Main and supplemental controllers
produce one actual target ledger. Record causal close decisions and next-bar
mode eligibility without backfill; preserve positive main targets in all577
policies. Full, chronological, cost, next-open and common-state diagnostics
are evaluator outputs, never live date switches.

Persist ordered scalar cases atomically every20 under research data/
supplemental-repair/grid.json; source/code/design/menu drift rejects resume.
Same-command restart has verified577-row reuse. SIGINT/SIGTERM/RSS checks
save completed cases; unfinished cases rerun. Bounds16MiB per input,10000 bars,
2048 decisions,577 policies,RSS1.5GiB. Selected full ledgers, mode-intervals.csv,
reports and audit attribution are separate atomic derived outputs. The short
finite audit reruns selected candidates and episode omissions, so needs no
additional durable cursor. No network fetch, scheduler or raw-source mutation.

## Historical segmentation and derivative diagnostics

Run `node --import tsx research/nikkei-overlay-stability/ma-atr-segmentation.ts`
and `python research/nikkei-overlay-stability/ma-atr-segmentation-plot.py` for
the initial12 fixed MA/confirmation comparisons. Then run
`node --import tsx research/nikkei-overlay-stability/ma-derivative-study.ts`
and `python research/nikkei-overlay-stability/ma-derivative-plot.py` for8
EMA20 backward-difference variants and plots. Reuse the immutable full-screen
input, validate source/bars hashes and cover all6566 bars once including warmup.
Record source access and design/code hashes. No fetch/rescreen or queue changes.

Derived JSON, segment CSV and reports are atomic; PNGs regenerate from local
JSON under the matching output directories. Keep initial segmentation separate
from derivative refinement. Background CSV is distinct from detailed bursts;
store known-at-close and next-bar effective labels. Future prices only score
warnings, with final10 sessions censored. Small8/12-case bounded runs need no
durable checkpoint or scheduler:16MiB input,10000 bars,RSS1.5GiB, deterministic
reruns. Preserve source, existing checkpoints and earlier research artifacts.

## Supplemental regime sizing and attribution

Run `node --import tsx research/nikkei-overlay-stability/regime-sizing.ts`.
Reuse frozen full-screen input/signals and prior descriptive analogue indexes;
validate source/bars hashes and decision alignment. Commit321 ordered scalar
cases in atomic20-row updates to data/regime-sizing/grid.json under the research
folder. Exact source/implementation/policy identities are required on resume.
SIGINT/SIGTERM/RSS checks save completed rows between cases; incomplete work
replays safely. Same-command rerun verifies321 completed rows are reused.
Selected complete ledgers and costs/next-open summaries are separate output.

Run `node --import tsx research/nikkei-overlay-stability/regime-sizing-review.ts`
for the321 finite common-state forks. It preserves baseline controller history
throughJuly21, changes policy afterward without resetting state, and asserts
all1936 prefix targets per policy. This date fork is diagnostic only. Atomic
derived outputs under output/regime-sizing-review regenerate on rerun; no new
checkpoint is needed. Preserve original sizing results and frozen source.
Both studies bound inputs16MiB,bars10000,decisions2048,cases321,RSS1.5GiB.
Neither fetches prices, reruns screening or creates a scheduled job.

## V-bottom missed-entry research

Run `node --import tsx research/nikkei-overlay-stability/v-recovery-study.ts`.
Validate the existing full-screen input/signals hashes and schedule alignment;
do not fetch prices or repeat screening. Confirm386 rules with exact production
baseline parity and atomic25-row source/design-checked progress in
data/v-recovery-confirmed/grid.json under the research folder. Incomplete
chunks repeat; SIGINT/SIGTERM/RSS checks stop safely between candidates, with
event-loop yielding after commits. Resume rejects incompatible identities.
Bound files16MiB, bars10000, decisions2048, candidates1000 and RSS1.5GiB.
Selected detailed ledgers/reports are separate under output/v-recovery-confirmed.
Preserve initial v-recovery and v-recovery-sequenced exploratory artifacts,
raw inputs and previous studies. No scheduled job or growing cache is added.

## Cumulative stop-loss research

Run `node --import tsx research/nikkei-overlay-stability/cumulative-stop-study.ts`.
The finite1368-case study reuses frozen full-screen input/signals, commits
successful scalar metrics every50 cases atomically to
`research/nikkei-overlay-stability/data/cumulative-stops/grid.json`, and writes
reports/selected ledgers separately to `output/cumulative-stops/`. Source/design
hashes and ordered rule IDs must match on resume. Incomplete chunks repeat;
SIGINT/SIGTERM/RSS checks stop between candidates. Limits are16MiB per file,
10000 bars,2048 decisions and1.5GiB RSS. No price refresh, scheduler or queue
mutation occurs. Preserve shared raw/frozen sources and all earlier output.

## Expanded overlay drawdown research

`node --import tsx research/nikkei-overlay-stability/drawdown-expansion.ts`
reuses the immutable full-screen bars/plans/signals and computes975 bounded
rule replays. It atomically commits scalar rows every50 completed cases under
`research/nikkei-overlay-stability/data/drawdown-expansion/grid.json` after
each completed replay; incomplete chunks repeat. Source/design/implementation
hashes and ordered rule IDs must match on resume. Output is separately stored
under `output/drawdown-expansion/`. Only the current ledger and bounded scalar
rows are retained in memory;16MiB files,10000 bars,2048 decisions and1.5GiB RSS
limits apply. Safe stop checks occur between candidates. No network refresh,
scheduler, screening queue mutation or raw-data deletion is involved.

## Completed full-screen overlay comparison

Run `node --import tsx research/nikkei-overlay-stability/full-screen-grid.ts`.
The explicit completed batch is frozen once, then signal extraction commits
each 32 decisions and the 8000-row grid commits each 128 candidates atomically
under `research/nikkei-overlay-stability/data/full-screen-6-15/`. Repeating
the command resumes committed work; source/design/implementation changes
reject stale checkpoints. Output is separately stored under
`output/full-screen-6-15/`. A single bounded source result is read at a time;
inputs cap at 10000 bars, 2048 jobs and 16 MiB per file, with a 1.5 GiB RSS
guard. Interruption stops between units; incomplete chunks replay safely.
Only one finite batch is retained; no scheduled refresh or production write.

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
