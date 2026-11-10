# Debugging

## Latest worksheet,context and switch recovery

Current trend UI shows11 retained indicators in one worksheet row,using the
same34px/12px tab style as research. Footer tabs are centered. This supersedes
the historical two-row miniature-card description below. The strip remains
within reserved chart-local672..724px space,clear of plots/date labels.
Desktop-only policy is explicit in AGENTS/README;no mobile acceptance applies.

Cycle backgrounds require contextHistoryBars from the entire completed input
in BOTH fresh-report and saved-profile display paths. Missing history must not
silently become a fresh replay starting at evaluationStartTime. Compare the
first visible area's color with the full weekly observation on that date.
Areas are visual only;verify marker data/tooltip outputs and returns unchanged.

Switch storage:quantscope.workspace-switches.v1,version1,max4096 characters.
Reload/route changes restore context visibility and A/B/C enabled/filter drafts.
New tab choices are intentionally not stored. Malformed state falls back safely;
blocked/full storage warns once and retains only an in-session value. Clearing
this exact key resets these preferences but does not delete accounts or cached
prices. Do not clear whole localStorage or IndexedDB to repair one preference.

Recovery remains whole bounded local recomputation;there is no new worker,
queue,remote write or long-running job. App and relay lifecycles are unchanged.
Browser QA used an isolated17-day temporary profile,deleted only that key and
restored original switch preferences in finally. Screenshots/report are under
output/cycle-context-*. Existing user data and running jobs were not reset.


## Desktop-only worksheet layout

The application now targets desktop computers only. AGENTS.md is the policy
source;do not reintroduce phone/tablet CSS or mobile-specific QA. Test desktop
window widths such as1440/1600/1920. Below1180px the desktop canvas may scroll
horizontally;chart and monitor remain side by side. Historical mobile checks in
older state entries describe previous versions,not current acceptance scope.

Flat worksheet tabs are shared across footer,PriceChart indicators,trend
indicators and weekly/close mode. TrendAnalysisWorkspace uses workspace-grid
with the research-style372px right column. Its indicator control band still
occupies chart-local672..724px,below the plotting grid and above the date axis.
Do not move it over a series. Only overflow arrows are conditional.

Removed seven max-width layout branches at700,760,820,900 and1120px. The1800px
desktop adjustment and reduced-motion accessibility remain. There were no
Android/iOS/native/PWA mobile application sources to delete. No business logic,
market adapter,account cache or stored task was removed. Backups and SHA256
manifest are in output/worksheet-layout-backup-20261110,with .backup suffixes.


## Integrated trend page operation and recovery

Open /trend-analysis on the existing local app. The application/market-relay
ports and launch procedure are unchanged. Three bottom links navigate native
routes. After refresh/reboot, canonical prices reload from the existing
IndexedDB and primary refresh continues; the root memory bridge is disposable.
Cycle jobs/checkpoints retain their existing coordinator/store recovery. Page
navigation does not reset saved records or deliberately pause a durable job.

Historical auxiliary refresh is explicit: run import-trend-auxiliary with the
completed candidate and JGB input paths, then rebuild/reload the app. Source
hash/raw backups are preserved and identical imports do not duplicate ledger
entries. A partial .tmp is overwritten by a whole bounded rerun. Snapshot API
metadata/source end dates distinguish missing history from loading failure.
No per-day queue or new credential is required.

Limits:10000 bars per series,two root references,40 prior weekly closes,
2000 breadth rows,10000 external rows,16MiB importer input. API snapshot is
about466KiB. Shared cache/refresh preserves full history, and stale/shortened
root inputs cannot replace a newer same-instrument series. Browser aborts
cancel obsolete requests; ResizeObserver/event subscriptions are disposed.

The compact card is at chart-local top672px,below the indicator plot ending
at665px; the lower date axis is offset62px. The control band is reserved, not
a cover over the indicator. Overflow arrows occupy reserved right padding;
rows that fit hide them. If layout changes, verify these bounds at desktop window sizes. New modules pass scoped lint; existing cycle-page set-state-in-
effect warnings/errors predate this display refactor. Local HTTPS favicon
console failures are a pre-existing metadata-origin issue, not a chart failure.

Before this change,19 existing files were backed up in
output/trend-integration-backup-20261110 with a SHA256 manifest. EChart has an
additional backup. TypeScript backups use .backup suffix to avoid accidental
compiler inclusion; remove that suffix when selectively restoring. Never
restore the whole tree over later user work. Existing uncommitted changes
were preserved; no commit/reset/cleanup or process replacement was performed.


## Strict screening-skip audit recovery

Run `npx tsx research/nikkei-screening-skip-audit/run.ts --limit 128`, then
rerun without the limit to resume. Atomic data/<identity>/progress.json stores
accepted daily controller/account/plan state, completed decision rows, pending
days, attempts, time and lastError. Complete identity
6654c78a46edb5f8250a274da271cddda8fb3aa4657f81072c21a4187c3c2219
has 2,000 days and 1,293 decisions complete, pending zero. Source/code changes
create a fresh identity; malformed progress fails explicitly. Crash/cancel/
reboot/timeout repeats only uncommitted days and has no external side effects.

Run model.test.ts with tsx --test and audit.py with Python. output/latest.json
locates decision branches, summary and date-classification.csv. The strict
comparison includes the carried plan, not only full risk/account state. Of
1,247 same-fill dates, only 157 also preserve every required state after the
winner is known. This retrospective label cannot be used before computing the
winner. No rule-only skip is certified. See FINDINGS for overlapping categories,
valid counterexample limits and exact combined hindsight replay verification.
Do not clear browser data, cancel optimizer jobs or edit production rules to
run or recover this local audit. Frozen source ends 2026-10-26.

## Downtrend signal-review recovery and interpretation

Run `npx tsx research/nikkei-downtrend-signal-review/run.ts --limit 16`,then
rerun without --limit to resume. Atomic data/<identity>/progress.json records
completed/pending dates,attempts,time and lastError;output/latest.json locates
complete results. Complete identity1601f4b0768a9c27cdfbad3cd527a56a4f98ca444a116c3dc6aedd9b59255467
has322/322 extracted dates,pending0. Crash/reboot/timeout/cancellation repeats
only uncommitted extraction work;code/source changes use a new identity.
Corrupt state fails explicitly. No network,queue cancellation or browser write.

Run research/model.test.ts plus tests/strategy-cycle-validation.test.ts with
tsx --test;run research/audit.py with Python. Verify exact production baseline,
not archived v10:463.09228%/128fills. A discovered sell may remain pending under
native guards. Check days are not unique signals;checked-day risk fills are not
necessarily caused by extra requests. Same-state probe fields distinguish them.
Bearish bodies,close-to-close declines and MA2 trend are separate definitions.
Current code can skip a bullish-to-bearish body transition during strong-down
MA2;do not assume a simple sign-flip calendar. Frozen source endsOct26;never
label this study the current browser-account result. See research/FINDINGS.md.

## v11 same-day holding-add activation

Refresh the existing page;current model suffix is sameclose-v11 and UI states
same-day holding-add prohibition/release with no SMA20 slope combination.
Static saved plans intentionally retain v10;dynamic validated accounts upgrade
through current-rule replay and retain one prior-rule backup. Cancellation or
storage failure leaves the prior account intact;reopen to retry. Do not clear
browser data or rescreen providers to repair an interrupted rule replay.

Run npm test;focused suites:same-close-bias-position-policy,range-position-
policy,bias-add-position-policy,validated-cycle-strategy-store. Frozen actual
v11 report463.0922799282711%/128 fills matches researched same-close BIAS;
archived v10 remains458.4631387547417%/129. These are2000 days throughOct26,
not newer browser-account metrics. Prefix/serialized report recovery and atomic
v10->v11 backup/idempotence are covered. Live health/validation return200 and
show same-day strings. Log:output/same-close-bias-v11-npm-test.log.

## Individual/joint same-day gate study recovery

Run research/nikkei-bias-six-sizing/gate-run.ts via npx tsx with --limit2
(two separate arguments: `--limit 2`),then rerun without the limit. Atomic
progress/input backups live in data/gates/<identity>,derived case outputs in
output/gates/<identity>;changed input/implementation gets a fresh identity.
Complete8/8,pending0,peak132.83MiB for identity
9d56f7f9ecb3b8ff9651b2cff299e18e729c3ed244d209e6c93644510f0bde4b.
Use gate-model.test.ts and gate-audit.py to verify no shared-cache leakage,
native parity,independent masks,all16000 equity observations and all fills.
If the production-derived feature seam changes,the research must fail;do not
weaken its shape check or modify the shared feature cache. No gate was adopted.

## BIAS/six-curve sizing research recovery

Run `npx tsx research/nikkei-bias-six-sizing/run.ts --limit 2`, then rerun
without --limit to resume at a completed case boundary. Pure native replay
also checks serialized controller/account recovery and causal prefixes.
Ignored data/<identity>/progress.json records completed/pending counts,status,
attempts,timestamp,lastError and peakRSS. Inputs and results commit by atomic
replacement. A changed input or implementation starts a separate identity.
Never repair results by manually changing saved metrics; preserve failed state
and reproduce from source. Bound violations stop with an assertion.

Verify with5 focused tests and `python research/nikkei-bias-six-sizing/audit.py`.
Audit independently checks all30000 daily equities,economic fills,context
formulas/states and weak-target multipliers. Final completed identity is
50427ff9eca63478f0b7e9553d612a9498a8384c5519e0984ff31a63f6fc2f34,15/15,
pending0,peak356.47MiB. Full application log is local research npm-test.log.
Do not compare frozen458.46% endingOct26 directly with a newer browser account.

## v10 range3 protection, execution provenance and recovery

Current default v10 defers original ordinary full clears below3% post-entry
range; archived v9 BIAS_ADD options retain the old policy. Do not confuse this
with research base-clear-priority, which did not improve range3. New range unit
cost includes buy fee/slippage. Adds and partial sells keep anchor; actual full
flat resets it. Check actual ledger callbacks, including summary-only paths,
before diagnosing a missing range. Unknown inherited entry has no invented
historical range. Actual open entries observe that bar after completion; close/
intrabar entries do not use earlier extrema. Price orders use completed context.

Missing/malformed v10 range checkpoint must fail rather than silently continue.
Reopen/refresh to replay frozen saved selections through the existing bounded
worker and atomic current-rule upgrade; one prior-rule backup remains. Failure,
cancellation, crash/reboot or revision conflict cannot partially promote settings
without the report. Successful migration is idempotent; later appends preserve
range and pending state. No new external jobs, source calls or persistence schema.
At most one within-day snapshot/partial amount is serialized, cleared at close;
normal10000-bar/120s worker bounds and resource release remain in force.

Run tests/range-position-policy.test.ts for risk, partial, cost, price-order,
serialization and frozen458.46% target/fill parity. Frozen research tests skip
explicitly when their ignored local source fixture is absent; synthetic tests
always run. Full gate/log: npm test / output/range3-v10-npm-test.log. Initial
interrupted pass is retained in range3-v10-before-partial-fix.log. Existing
output/verify-speed-turn.ts needed an explicit Map type to restore the global
typecheck; no calculation changed. Prior v9 archived studies now pin BIAS_ADD.

## Range-exit integration priority and restart audit

Run npx tsx research/nikkei-range-exit-integration/run.ts --limit 1 then rerun
without limit; python audit.py independently verifies cash/episodes and10000
daily signal/priority/risk/state traces. Atomic ordered hashed progress resumes
completed matching-identity cases, at most one unfinished policy repeats after
crash/reboot/cancellation. Missing/corrupt/incompatible files fail. Bounds5 serial
cases,10000 bars,2048 decisions,2000 trace rows/case,16MiB/JSON,1.5GiB RSS.
Raw and derived outputs remain separate/ignored; no external job or side effect.

If a return changes after preserving original signal priority, compare the
contract before blaming execution: blanket range3/10 vetoes ordinary original
clears, whereas base-priority controls exempt explicit/necessary pending clears.
Capture after-original-request allocation to retain accepted partial sells when
native close adds a full exit. Probe without pending from identical state to
diagnose necessary lineage; duplicate controller clears do not remove base
lineage, but native increases cancel it even without a fill. Never bypass native
hold7/WMA/SMA guards, early4% age5,ATR or cooldown. Audit real cycle report445.34%
against all baseline fills, not a next-open or lag0 headline. The frozen source
endsOct26 and does not reproduce the newer browser account throughNov5.

## Small-move exit recovery and baseline mismatch

Run npx tsx research/nikkei-small-move-exit/run.ts --limit 3, then without limit;
repeat with --current for separate v9. Atomic hashed cases reuse only matching
source/design/code/model identity and ordered menu. Complete21/21 manifest follows
fresh audit. Missing/corrupt/incompatible files fail. Crash/reboot/cancellation
repeats at most one case, no external effects. Bounds10000 bars,2048 decisions,
16MiB/JSON,one replay,21 cases/version,1.5GiB RSS. Python audit.py with/without
--current independently checks cash/episode state.

On baseline change inspect concurrent model adoption before touching source.
Archived v8 uses explicit RSI_SHAPE_POSITION_OVERLAY_OPTIONS and440.980703%;
v9 cycle uses lag1/445.342093%, not lag0 diagnostic444.102592%. Preserve concurrent
work; use separate manifests/reports. Next-open sensitivity reuses lag1 close
decisions, not ordinary v9 lag0. Entry-day extrema must not precede actual entry;
adds retain episode, full flat clears. Protected full exits retain pending0;
partial/risk sales pass. Native4% keeps its original first-five-session coverage.

## v9 BIAS20 add restriction and account recovery

Rule definition: four valid adjacent trailing3 BIAS20 values strictly decreasing
mean three declines. Third decline confirms at close; restriction is for the
following session. Flat/rising values release it on the next session. It blocks
holding adds, not flat entries/reductions/exits, and never queues an automatic buy.
If a cycle restriction appears early, check constructor lag1; if an ordinary
next-open restriction appears late, check that its default lag0 was not shifted
again. All other cycle execution stays at the existing close proxy.

New default is v9; static v8 plans retain archived behavior. Current dynamic
accounts replay on open using saved original winners and costs, promote only
after success, and retain one previous-rule backup. Close/reopen after worker
cancellation or storage conflict; existing atomic/revision checks prevent partial
upgrades. Derived gate requires no checkpoint schema migration and adds only a
bounded per-bar feature array. Existing10,000-bar and worker120s limits remain.

Run npx tsx --test tests/bias-add-position-policy.test.ts for local boundaries;
run research/nikkei-context-entry-gates/adoption-check.ts and its integration
tests for frozen timing parity. Historical studies must import explicit v8
options, not the new default. Never label445.34% cycle replay as473.38%.

## Post-reduction cooldown recovery and scope

Run npx tsx research/nikkei-reduction-cooldown/run.ts --limit 2 then rerun without
limit. Seven hashed policy checkpoints resume in fixed order; missing completed
case, wrong source/design/code identity, corrupt hash or reordered rows fails.
Only atomic completed records are reusable. Crash/reboot/cancellation repeats
at most one case; no external job, network data fetch or stored account write.
10000 bars,2048 decisions,16MiB/JSON,one live replay,1.5GiB RSS ceiling.

Clock starts on an economic partial/full/risk sale, not pending sell intent.
The nextX trading sessions are blocked; dayX+1 can buy only from native conditions.
All reentry sources are covered, including flat and stop recovery. Native risk
exits pass and waits overlap. Equal-target buy signals can still cancel pending
sells. If observed buys violate the deadline, check target versus actual cash
execution; runner verifies both complete fill equality and every buy deadline.
python research/nikkei-reduction-cooldown/audit.py independently checks112 metric
groups/economic fills. Main close clock and next-open sensitivity are separate.

## Declining context increase-gate resume and semantics

Run npx tsx research/nikkei-context-entry-gates/run.ts --limit5 then rerun without
the limit to verify5 completed/185 resumed. Identity-scoped atomic case reports
store verified target hashes, policy and controller state. Incomplete manifest
is not success; changed source/code/design starts a new identity. latest.json
locates current state. Bounds:16MiB files,10,000 bars,2,048 signals,190 serial
cases,1.5GiB RSS. Hash mismatch must fail, not silently fetch new history.

Speed3 decline onset requires today's value below yesterday AND yesterday at
least the preceding value. A positive speed can qualify; a negative-speed
crossing is a different event. Onset gate blocks only that day, ongoing gate
persists while down. Entry/add scope must use actual accepted allocation.
Blocked entry cannot create phantom entry age; blocked add cannot reset it.
Do not queue a rejected buy for automatic execution. Hard stops/reductions must
retain native recovery/cooldown behavior. Small same-sample qualification gains
and numerical equality of final500 are not prospective confirmation.

## Strategy replacement turnover research recovery

Run npx tsx research/nikkei-switch-turnover/run.ts --limit 2 for a bounded safe
stop, then rerun without --limit. Missing frozen sources fail explicitly; no
network or rescreening fallback. Atomic decisions.json contains a hash-validated
contiguous prefix and may be ahead of coarse progress.json after interruption.
Resume those completed decisions, then ordered policy rows. Source/design/code
changes create a new identity and preserve old state. Incompatible/copied,
corrupt or reordered checkpoints fail. Never use temporary files as progress.
output/latest.json identifies the authoritative complete run; superseded draft
results must not be mixed with current results. Bounds10000 bars,2048 decisions,
16MiB/JSON,seven policies,one live plan timeline and1.5GiB RSS. Actual stop/resume,
prefixes, controller serialization and fresh metrics were verified.

Plan changes do not reset inherited allocation. Compare old/new signals on the
same date; track pending requests into later fills. A small-allocation band must
not veto an equal-target increase: it can cancel a pending reduction, leading to
MORE fills if suppressed. Vetoed occupied days retain original signal presence
so they cannot synthesize fallback buys. Local switch labels and overlapping
opposite fill pairs do not prove an unnecessary trade or additive avoided loss.

## Weighted BIAS90 study diagnostics

Run npx tsx research/nikkei-bias90-exit/run.ts --weighted for37 bounded cases.
Output is isolated from initial/combined studies and supports deterministic
whole-study restart via atomic manifests. Tests serialize both controller and
arming state. C0 disables only the context point; it does not disable other
score exits. No-op C0 threshold5 can equal baseline because the remaining
maximum is4; exclude it from claimed qualifying candidates. Raw/SMA3 are
alternatives, never simultaneous points. Native-full exits are already complete;
executed-reduce applies only to a surviving partial position. Preserve original
increase priority and distinguish local score improvement from original-strategy
improvement. Next-open full-return gains alone do not establish robustness.

## BIAS90 exit research recovery and interpretation

From repo root run npx tsx research/nikkei-bias90-exit/run.ts, then the same
command with --combined. Initial12 and combined23 outputs are isolated; raw
backups retain source/implementation identity. On interruption rerun bounded
cases deterministically; never treat a running manifest as complete. Input
hash mismatch, missing source and oversized input must fail explicitly.
RSS is limited to1.5GiB at case boundaries. Mid-account resume also serializes
the armed flag; tests verify exact targets/state after restart and prefixes.

Raw speed is a one-session SMA20 difference; SMA3 speed averages those values.
A positive speed declining does not mean SMA20 declined. Armed memory can
survive BIAS falling below P90; same-day cases cannot. Native flat resets memory.
No extra cooldown means fast reentry is expected. Partial caps preserve entry
age and record blocked adds separately from actual reductions. Forward price
windows overlap and must not be described as avoided portfolio losses. Declared
combination screening uses1e-8 percentage-point tolerance for numeric noise.

## Rebound-gate review recovery and historical rule scope

Run npx tsx research/nikkei-rebound-gate-review/run.ts from the repository root.
On interruption or RSS-limit failure rerun all bounded nine cases; output
replacement is atomic, input backups retain identities and incomplete manifests are
not successful runs. Missing frozen inputs or hash mismatch must fail rather
than silently fetch/replace data. README documents limits and verification.
If a variant appears to improve an identical final500 path, check floating-point
noise with1e-8 percentage-point tolerance. Current v8 has only one nonoverlapping
fallback entry here; do not reuse archived v6 entry counts. WMA14 was the old
flat-entry gate, current WMA7 replaces it; holding adds were exempt. Adding WMA14
only to rebound research does not reinstate a global all-increase prohibition.

## Whipsaw research checkpoint and filter interpretation

Run npx tsx research/nikkei-chop-filter/run.ts --limit 2 for a bounded stop;
rerun without the limit to resume only newly pending configurations. Source/
design/implementation changes use distinct data identity directories; old
progress is preserved. Copied incompatible identity or reordered parameter rows
fail before reuse. A stopped candidate reruns from its initial inherited account;
only completed153-row prefixes are durable. One candidate is at most2000 bars.

Run audit.ts to recompute all targets and metrics, then report.ts to append
idempotent diagnostic tables. Atomic writes replace temporary files. Bounds:
10000 bars,2048 decisions,16MiB/JSON,153 rows,1.5GiB RSS,one process. There are
no external jobs to reconcile. SIGINT/SIGTERM stops between completed candidates.
Runtime failures remain visible; prior committed rows stay usable.

ATR price buffer is measured from the first ordinary request, using priorATR14;
transient/no-op/opposite requests reset the wait. Regime confirmation requires
consecutive eligible v8 requests, not a synthetic buy created later. Both may
remove entries entirely. Their lower fill counts must be assessed alongside
lost upward blocks and return. Risk exits remain immediate. Do not interpret
lower transaction counts alone as an improved strategy or deploy a failed row.

## Independent context tabs and disagreement-study recovery

BIAS tab series are raw, SMA3 and four percentile lines; SMA-slope tabs have
raw and SMA3 only. Quantiles are missing before 252 valid earlier raw values.
That warmup is longer than the monitor's 204-bar direction warmup, especially
for BIAS200. Bands use earlier three-calendar-year data, not chart-visible bars;
dragging zoom must not change their historical values. Hover tab controls for
the quantile policy. Tabs scroll from the first item on narrow screens.

Research recovery: rerun npx tsx research/nikkei-context-disagreement/analyze.ts.
A running manifest or .tmp file is unfinished state; never trust it as complete.
The bounded job rebuilds deterministically from the hash-pinned raw CSV, atomically
replaces each output and commits complete manifest hashes last. Simulated
interruption with a running manifest and truncated summary temporary file was
recovered with all eight output hashes unchanged. Independent Python validation
passed event identities, chart values (1e-7 tolerance), six threshold-policy
accounts and manifest hashes. Bounds: 10000 rows, 4MiB CSV, 128KiB source registry,
fixed horizons and at most two event records per input date; no background queue.
Missing complete future windows are censored. Raw single-flat events are zero
in this snapshot; do not invent a flat-case estimate from synthetic tests.

## Coordinator concurrency assertion under runner load

The queue integration fixture previously kept running markers for only 500ms.
A delayed sibling process could start after the first marker disappeared,
reporting peakRunningChildren=1 even though the coordinator allows two workers.
The final-run reproduction passed all job-completion assertions and failed only
the observed peak. The first two fake children now wait for a file acknowledgement
written only after the parent observes both markers. The wait has a 10-second
bound; missing acknowledgements fail explicitly. The test retains the exact
peak=2 assertion, autonomous completion, shared bars, cancellation and result
checks. No production coordinator/protocol behavior changes. A standalone
six-test run passed after the fixture fix.

## Six-curve monitor date, warmup and recovery

The monitoring date is the latest completed Nikkei bar, independently of the
strategy evaluation end. A currently forming bar is excluded even after the
clock passes close until the provider marks it complete. Data under 204 closed
bars cannot produce all six daily directions. Refresh canonical history rather
than resetting the strategy account. A flat component or disagreement resets
the candidate counter but retains the previous confirmation. One or two opposite
days do not replace it. Hover the monitor for the exact formulas and rule.

No monitor checkpoint is necessary: its durable progress units are canonical
closed daily bars in the existing market cache/account record. Reopening after
cancellation, crash, reboot or network failure deterministically replays the
available history, with no duplicate writes or trade effects. Cached data may
be stale; the explicit input date discloses that. Page-closed notification or
unattended scheduling is not added. Reopen/refresh to catch up after closure.
The existing visible-page session-aware refresh updates after close.

History is capped at 10000 bars. Computation is O(n), with six aligned output
arrays and bounded replay rows; there is no queue, growing log or new cache.
Invalid data and oversized input produce an actionable localized UI diagnostic.
Verify with npx tsx --test tests/market-context.test.ts and npm test.

## Validated cycle stops after volume becomes available

The 2026-10-31 incident identified 2026-10-27 volume as the first mismatch in a
completed 1294-selection account. Canonical series may backfill a completed
bar's zero volume; that is compatible only when date, OHLC and amount match.
Validated alignment retains the account's original bars, including zero volume,
for historical replay and continued cycle screening. The chart's canonical
volume remains enriched. Do not rewrite the ledger or clear tasks to repair it:
volume-sensitive winners could otherwise change historical signals/returns.
Continue the existing task after loading the fix. Actual corrections remain
blocked, with the first date and field now included in the localized error.


## Consecutive clearing arrows without an intervening entry

Check report.rebalances fromAllocation/targetAllocation before assuming duplicate
execution.2020-06-25 is100%->30% and2020-07-01 is29.879988%->0 on frozen v8.
The original marker builder mislabelled a component long-exit as full liquidation.
Portfolio action must follow actual allocation; component signals are provenance.
No re-screen, account migration or financial-return correction is needed.

## Cycle page waits for shortcuts or shows an old rule return

Do not combine local task restoration and /api/saved-backtests with Promise.all.
The static endpoint supplies optional instruments, not the dynamic ledger. Local
profiles/task can open without it; a10-second network bound must not block form
or results. Wait for shared profile hydration before attempting task replay.

An old v7 account contains393.14% while current v8 on the same frozen2000 bars
yields440.98%. User adoption now requires shared-account promotion, not a cycle-
page-only preview. Check shared-hook migration, source/preview revision, worker
error and CAS commit. Shortcut/report/settings must agree, with v7 retained in
ruleBackup. Other dates/windows may yield different returns. A first replay takes
seconds; later opens reuse the promoted report without shortcut dependency.
Repeated shortcut clicks must reset the view to128 sessions, not retain a previous
manual zoom. The validated chart banner/exit action was explicitly removed.

## Cycle queue submission fails while engine health is ready

Check both application /api/health and relay /health, then compare protocol
against config/screening-engine-protocol.json. A healthy relay does not prove
that a large POST completed. Previously ordinary2000-day queues used one large
request and coordinator maintenance scanned the state directory once per unit.
The client also discarded HTTP error details behind one generic message.

Uploads now use <=64-unit chunks for all queues, not just candidate-library
uploads. Acknowledge and persist each chunk immediately, so a failed later chunk
or explicit pause retains known job IDs. Retry uses identical IDs. Coordinator
cleanup runs once per incoming batch; explicitly resubmitting a cancelled job
clears its cancellation flag before checking its durable completed result, so
an existing result is reused rather than spawning duplicate computation.
Explicit cancellation itself remains durable until resubmission.

HTTP submission failures now include status and a bounded server error detail
in the localized page error. Network/unavailable failures retain the generic
message. Do not clear tasks, results or checkpoints as a recovery step.
The2026-10-27 live1294-unit queue was accepted as21 chunks in2.557 seconds with
exact deterministic ID parity;1291 completed results and3 remaining jobs were
preserved. The project relay was restarted in place; protocol/endpoints did
not change. The original browser tab disconnected during verification, so
reopen the validation page and Continue to restore its report collection.

## Price chart suddenly shows only a few candles

Inspect the lower zoom slider and `.price-chart` data-zoom-start/end attributes
before suspecting lost history. Wheel input over the chart directly zooms the
visible range, as requested; Ctrl is not required. A closed market does not
prevent view changes. Use the bottom slider to restore a wider range.
Reload restores the default latest60-bar view when no explicit
screening focus range is applied. Do not erase source data or cycle tasks.

## Current cycle result cleanup

Run `npx tsx scripts/compact-current-cycle-results.ts` for a read-only audit of
the retained 356-result N225 batch. The script checks the exact batch ID,
unique job IDs, objective, shared bar file, contiguous decision indexes,
result count, and a 16 MiB per-result input bound before changing anything.
`--apply --one-result` compacts one result and stops; repeating it should
report zero further changes. `--apply` finishes compaction, asks the local
coordinator to cancel unfinished old jobs, and deletes only directories outside
the verified retained batch. Re-running the script after an interruption is
safe: already compact results are skipped and already removed directories are
absent from the new inventory. The retained `result.json` files are still
readable by the existing coordinator endpoint and browser task. Unused
historical candidates and other job directories are not recoverable from this
maintenance run.

## Strategy-cycle validation does not resume or exceeds its limit

The page stores one versioned task in the
`quantscope-strategy-cycle-validation` IndexedDB database after each complete
decision/window optimization. Resume requires the same canonical instrument,
latest market bar and bar count, screening windows, update intervals,
evaluation length, objective, and cost settings. A changed signature starts a
new task deliberately. Task version 2 also stores every deterministic local
job ID. All incomplete units are submitted before result collection, so the
loopback coordinator continues them without browser polling. Reopening the page
automatically reattaches a task that was still marked `running`; paused or
errored tasks continue only when the user presses Continue.

If progress stops overnight, check `http://127.0.0.1:3001/health` and the
matching directories under `data/state/screening-engine/`. A queued or running
job with changing checkpoint timestamps means computation is continuing even
if the page is temporarily busy. Closing, reloading, navigating away, or a tab
discard does not cancel submitted work. Only explicit Pause, reset, or task
replacement writes cancellation markers and stops children.
Screening-engine protocol version 8 accepts up to 2048 jobs and persists a batch
queue manifest and explicit-cancellation markers, so restarting the local relay
automatically resumes unfinished, non-paused jobs. Reopen the page and press
Continue only to reattach report collection immediately; it is not required to
keep the computation queue advancing.

If the page says it is running but CPU remains idle, distinguish computation
from stale presentation before changing data:

1. Read `/health` and compare `screeningEngineVersion` with
   `config/screening-engine-protocol.json`.
2. Check for active `screening-engine-child.ts` processes and sample their CPU
   delta rather than relying on cumulative process CPU.
3. Count the current batch's `result.json`, `checkpoint.bin`, and `cancelled`
   files. A complete result count with no child and no changing checkpoint means
   calculation has ended even if the browser still says it is running.
4. On a version mismatch, rerun `open-quantscope.bat`. The launcher replaces
   only an identified stale relay from this checkout. Return to cycle validation
   and press Continue; completed deterministic results are read from disk.

Batch collection must not retry a protocol rejection indefinitely. A non-404
4xx status response now marks the task as an error and displays the restart
instruction. When changing this behavior, update the shared version config,
client, coordinator, launcher, localized copy, maintenance scripts, tests, and
the protocol linkage entries in `FEATURE_MAP.md` and `MODULE_PATTERNS.md`
together.

If the page reports too many units, reduce the evaluation length or increase
the screening window. The update interval is always one trading day. It rejects schedules above 2048
units before screening and keeps no unbounded queue. Clearing the task cancels
its submitted jobs and removes the device-local validation record. If a task cannot be read, inspect
whether browser site-data policy disabled or cleared IndexedDB; saved backtest
shortcuts and market sources use separate persistence boundaries.

If the development server becomes slow while the local children continue to
use CPU, compare the application process handle count with the directory count
under `data/state/screening-engine/`. Vite must exclude that runtime directory
through `server.watch.ignored`; request, checkpoint, derived-data, and result
writes are not source changes. Restart the local launcher after changing this
setting so existing watcher handles are released. Do not remove the directory
to fix watcher pressure: it contains resumable task state and completed
results. Closing or reloading the page leaves unfinished cycle jobs running;
reopening the page automatically reattaches a stored running task.

If strategy-cycle validation says the complete market history is unavailable,
first open the instrument in the research workspace and verify that its
canonical daily chart loads. The cycle page reads that provider-validated
IndexedDB series before requesting the network, and a successful network load
is written back through the same canonical profile gate. If both paths fail,
inspect the primary and ordered backup health rather than reducing the history
limit or accepting a partial series.

## Browser memory grows during an otherwise bounded screening run

First compare the local-engine memory shown in the screening status with the
Edge renderer working set. If the child remains bounded but the renderer grows,
instrument the price canvas while progress advances. Screening progress must
not call `ECharts.setOption` unless chart inputs changed. In particular, never
pass a new empty array or object literal into a memoized chart dependency on
each `MarketWorkspace` render. The no-applied-backtest path uses
`EMPTY_PRICE_CHART_TRADES`; replacing it with `[]` causes every 200 ms progress
update to rebuild the complete chart option. In the 6,544-bar N225 reproduction
that defect caused 131 canvas clears in 20 seconds and linear renderer growth.

## Viewing another instrument cancels or misplaces a screening result

Instrument navigation must call
`clearScreeningPresentationForInstrumentChange()` and must not abort
`screeningAbortRef`. The active job owns an immutable `runSeries` and
`runInstrumentKey`; completion may update the visible result tables only when
`visibleInstrumentKeyRef` still matches that key. The device-local result is
also written with the run key, so returning to the original instrument can
restore it. Only the explicit stop action or page teardown may abort the job.

## KRX KS11 screening exhausts memory

Confirm the loaded series length and local engine telemetry. Yahoo `^KS11`
returned 6,680 daily rows in the 2026-09-21 read-only probe, crossing the shared
long-history boundary. Both the browser Worker and local child must use
`screeningCheckpointInterval(...)`; at least 6,000 bars or at most 9 GiB
physical memory checkpoints every 2,048 evaluations. The atomic checkpoint
resumes the exact traversal in a fresh heap. Do not shorten history, reduce
finalist limits, or change strategy domains. If memory still grows, retain the
job directory and record stage, bar count, RSS, checkpoint bytes, and restart
count.

## 164824 changes source or price while Shenzhen is closed

The verified profile must resolve legacy `164824.SHE`/`OTHER` and Eastmoney
aliases to Tencent `sz164824` as the fixed raw canonical primary. Eastmoney
`0.164824` remains a raw verified backup only. If the source label differs,
inspect canonical-cache primary metadata and allow the primary-change migration
to replace an old adjusted or Eastmoney cache as one unit; never merge price
adjustment modes. The 2026-09-21 probe observed Eastmoney `rc=102` and a valid
Tencent response, so adding more Eastmoney off-hours retries is not the
recovery path.

## One-click screening appears stuck

Check the engine telemetry below the progress bar first. A changing candidate
count, non-zero evaluations/second, or updating memory value means the current
high-order stage is active even when its percentage moves slowly. The local
coordinator restarts a child automatically after 60 seconds without any
heartbeat and resumes `data/state/screening-engine/<job-id>/checkpoint.bin`.
After three consecutive no-progress restarts it reports an error instead of
spinning indefinitely. Normal 8,192-evaluation and stage checkpoints can also
increase the restart count; they never change or skip candidates.
Protocol-v3 status responses remain small; the completed result is read once
from `/screening/jobs/<job-id>/result`. `bars.bin`, `derived.bin`, and the
checkpoint manifest can be inspected independently when diagnosing disk cost.
On Windows, an `EPERM` rename error for `checkpoint/manifest.json` indicates a
transient file lock during replacement. The writer retains the last committed
manifest, retries the rename, and falls back to a recoverable backup swap; press
Continue once to restart a job that exhausted its retries before this fix.

## Shortcut batch period screening stops or resumes

1. The left screening button uses the first configured period-window session
   count and processes only shortcut instruments whose asset type is `index`.
2. Progress is committed after the strategy record is saved and assigned to
   its `N日` folder. Pressing Stop leaves the last complete checkpoint intact.
3. Reopen the page and press the same button with unchanged period, objective,
   costs, and entry-filter mode to resume. A changed configuration starts a
   fresh pass.
4. Failed instruments remain pending and are retried. The bounded checkpoint
   stores only keys, status, timestamps, and a safe last error—not market data.
5. If an index group cannot be dragged, confirm nested record/folder drop
   handlers return without stopping propagation for a group drag.

## Local launcher does not open QuantScope

1. Confirm `node --version` reports 22.13.0 or newer and `npm --version`
   succeeds.
2. Read any reported port-owner PID. The launcher manages its own unhealthy
   listeners on ports 3000 and 3001, but refuses to stop an unrelated owner.
   It also removes an exact-current-checkout Vinext process left on a historical
   fallback port. Vite now uses strict-port mode, so new launches fail instead
   of silently moving from 3000 to 3002.
   Loopback health probes bypass configured HTTP/HTTPS proxies; those proxy
   values remain enabled only for Node's external market requests.
3. Read the visible `QuantScope Local Server` window for vinext errors.
   The browser should open once port 3000 listens. Application readiness is a
   lightweight `/api/health` request and no longer waits for full workspace SSR.
   A cold vinext compile may exceed the initial 60-second startup window. If
   port 3000 is already listening and the server process is still alive, the
   launcher reports that compilation is continuing and grants one bounded
   120-second grace period. It still fails after that period rather than
   waiting indefinitely, then stops the failed launch tree and checks for exact
   current-checkout leftovers.
4. If a previous launcher is already serving QuantScope, launch again: the
   readiness check now reuses that server before touching the D1 migration
   state.
5. Run `npm run local:db:migrate` if the saved-backtest API reports
   `PERSISTENCE_UNAVAILABLE`.
6. Keep `.wrangler/state` to retain local saved backtests. Removing that
   directory resets local persistence.
7. Run `npm ci` if `node_modules` is missing or dependencies are damaged.

If the console previously stopped after `No migrations to apply!`, Wrangler had
completed the no-op migration but left its Windows process tree alive. The
launcher now relays migration output and allows a two-second exit grace period
after that exact terminal message. It then closes only the migration process
tree and continues startup. Windows may report that one child exited during
that cleanup; the launcher now verifies the exact root process and continues
when it has already stopped. A root process that remains alive, or a migration
that times out without the success message, remains a hard failure and is never
skipped.

The launcher never falls back to the hosted site. The local UI and saved
records do not require login, but live market-data providers still require
internet access.

## Port 3000 or 3001 is already used

The runtime-port registry contains every persistent local listener:

- port 3000: the vinext QuantScope application;
- port 3001: the loopback market relay.

On startup, the launcher reuses a healthy service. If a service is unhealthy,
it resolves the listener PID and stops it only when the `node.exe` command line
matches this checkout and the expected application or relay command. Another
project checkout, a wrong role or port, and an unrelated listener are never
stopped automatically. The conflict message includes the remaining owner PID
so it can be inspected explicitly.

Port 3002 is not a valid QuantScope application port. If an older development
server is found there, rerun the launcher: it will stop that process only when
the executable path and fixed Vinext arguments identify this exact checkout.

## Market route returns `UPSTREAM_UNAVAILABLE`

If `164824` appears as exchange `OTHER` or only has a short adjusted history,
the record came from the legacy EODHD `164824.SHE` discovery path. Reload the
instrument normally: canonical resolution now repairs it to `SZSE`/`0.164824`
and requests full raw history. No saved-record or browser-database deletion is
required. If Eastmoney is unavailable, Tencent supplies the replacement raw
history; when both public endpoints fail, the existing cache is retained and
the normal retry backoff applies.

1. Read the chart's source label and call the preferred provider with
   `strictProvider=1`; then call each configured backup strictly in profile
   order. A promoted backup should display `VERIFIED_BACKUP_ACTIVE`.
2. For a Yahoo primary, check the always-on loopback relay first, then query1,
   query2, and direct routing. Yahoo may
   return regional 403/429 responses even when another route succeeds.
   Eastmoney may close a Node TLS socket during burst traffic; confirm the
   same-host HTTP retry and avoid repeatedly bypassing history cache.
   The relay returns `RELAY_REQUEST_FAILED` with HTTP 502 when an allowlisted
   request or screening handler throws before sending a response. This is a
   contained request failure; confirm `/health` still reports `ready: true`
   before restarting the relay.
3. Check whether Eastmoney changed `QuotationCodeTable.Data` or `data.klines`.
4. Confirm daily rows use `YYYY-MM-DD` and minute rows use
   `YYYY-MM-DD HH:mm`.
5. For global daily history, check Yahoo query1/query2, the official Nikkei CSV
   for N225, then configured EODHD, Twelve Data, Financial Modeling Prep,
   Alpha Vantage, Marketstack, Zhitu, and Nasdaq status in profile order.
6. Check source-health attempts, availability, latency, last error, latest
   date, and quality before increasing timeouts.
7. If history succeeds through Yahoo but every latest refresh fails, inspect
   `series.instrument.secid`: a resolved Yahoo series should carry a Yahoo
   symbol such as `^N225`, not an Eastmoney identifier such as `100.N225`.
   Legacy saved values are translated at request time; a fresh history response
   should normalize the stored identity.
8. For gold, check strict providers in canonical order: Yahoo `GC=F`, FMP
   `GCUSD`, AllTick `GOLD`, then Eastmoney `101.GC00Y`. FMP/AllTick/Eastmoney
   are overlap-required and cannot recover an empty chart. An AllTick 401 is a
   credential problem, not a price-quality failure.
9. In the source-health tooltip, compare the independent 7-day and 30-day
   rates. A temporary demotion is expected after three consecutive failures;
   the configured primary is probed hourly and does not restore until the
   seven-day hysteresis gate passes.

## Search returns an individual equity

Inspect the source classification fields and update the adapter-level asset
filter. Do not add UI-only filtering: unsupported asset types must never cross
the API boundary.

## Empty chart

1. Inspect `/api/market` and confirm `bars` is non-empty.
2. Confirm every bar has finite OHLC values and a valid timestamp.
3. Resolve the canonical profile. N225 must request Yahoo `^N225`, SOX must
   request Yahoo `^SOX`, and gold must request Yahoo `GC=F`. FMP `GCUSD`,
   AllTick `GOLD`, and Eastmoney/Nasdaq
   identifiers are backup definitions and must not be mistaken for a successful
   Yahoo primary response.
4. If the preferred source is down, inspect
   `quantscope-canonical-market`. A cached canonical series should remain
   visible. A promoted backup may append missing dates but must not change any
   confirmed cached OHLC date.
5. For a Chinese index, verify Zhitu is ordered before broad credentialed
   providers. For ETF `513310`, verify EODHD resolves the SSE listing; Twelve
   Data, Alpha Vantage, Marketstack, and Zhitu are not accepted substitutes
   unless their strict response and mapping pass the profile policy. For the
   current-session overlay, verify Tencent is tried first and Juhe last. A
   Tencent history response can recover an empty chart; Juhe should be skipped
   after a valid Tencent result and can never become the effective primary.
6. Check the browser console for ECharts initialization errors.
7. If the chart disappeared only after opening a saved strategy for the same
   index, inspect `canReuseSavedBacktestMarketSeries(...)`. The saved, active,
   and active-series canonical keys should match (for example, Eastmoney
   `100.N225` and Yahoo `^N225`) and the successful non-empty series should be
   preserved. Provider alias differences alone must not clear market state.

If Juhe returns a quota warning, inspect only the safe error code and the local
`JUHE_API_USAGE_DATE`/`JUHE_API_USAGE_OFFSET` metadata; never log the key or
upstream body. The in-process counter resets on server restart, while the
provider's 50-call account bucket does not, so the configured same-day offset
must include any external or prior-process calls that need local accounting.

## Global index uses the wrong close time

1. Inspect `lib/market/exchanges.ts`.
2. Eastmoney market `100` is only an overseas bucket; never map the whole
   bucket to JPX.
3. Add a known code mapping only when the index venue is verified. Unknown
   symbols must remain `OTHER`.
4. Update `MarketExchange`, session-close metadata, API validation, and saved
   record validators together.

## Live coverage regression

Start the local server, then run:

```bash
npm run verify:market
```

The Windows launcher always ensures a loopback-only, source-allowlisted market
relay. The relay lets proxy-preferred providers such as Yahoo use a configured
route without exposing the proxy address or credential to the application
runtime or logs. Development uses the fixed loopback URL even without a proxy.
Port 3001 must be free or owned by a healthy QuantScope relay.

The script checks 16 indexes, 11 ETFs, and four commodity proxies. A failure
reports the source, exchange, bar count, and upstream error. It is intentionally
outside `npm test` because public endpoint reachability and regional blocks are
not deterministic.

## Indicator visibility or parameters do not restore

1. A fresh browser profile intentionally starts with every indicator hidden.
2. Click an indicator once to show it and again to hide it; a focused hidden
   button uses a neutral style and is not active on the chart.
3. Device-local parameter memory uses
   `quantscope.indicator-preferences.v1`. Invalid stored values are discarded
   and safe registry defaults are used.
4. A saved shortcut restores only the indicators visible when it was saved,
   with their saved parameters. Rows created before migration
   `0003_heavy_nemesis.sql` intentionally restore no indicators.
5. If new saves return `PERSISTENCE_UNAVAILABLE`, run
   `npm run local:db:migrate` and retry.

## Daily chart does not reach 2000

1. Confirm the instrument existed in 2000; later-listed ETFs begin at their
   first provider-available bar.
2. Confirm the history request uses `limit=10000` and `mode=history`.
3. Check the provider URL for Eastmoney `beg=20000101`, EODHD
   `from=2000-01-01`, Yahoo `period1=946684800`, or Nasdaq
   `fromdate=2000-01-01`.
4. If Eastmoney starts later, confirm the longer-history EODHD/Yahoo attempts
   run and that the longer valid series wins without merging providers.
5. Do not treat the five-bar `mode=latest` overlay as the history response.

For an Eastmoney LOF such as `164824`, confirm the canonical primary remains
the original Eastmoney `secid`, the request uses `fqt=0`, and the returned
adjustment label is `raw`. A guessed Yahoo `.SZ`/`.SS` history can return only
one or a few recent rows and must not become the LOF primary.

If both Eastmoney history hosts fail, request Tencent with the same exchange-
local symbol and `mode=history`. A valid `164824` backup is raw, starts at
2018-08-01, and is capped at 2,000 requested rows. Do not merge it with an
adjusted cache unless the existing overlap/scale gate accepts the replacement.

## Today's daily bar is missing in Asia/Shanghai

1. Confirm the displayed and cached update timestamps use `Asia/Shanghai`.
2. Inspect Yahoo `regularMarketTime`, price, open, day high, and day low. A
   valid snapshot with an Asia-Shanghai date at least as new as the daily array
   should append or replace only the unconfirmed last bar.
3. Keep exchange-local time only for refresh windows and close timing; do not
   derive display dates from the browser or server default zone.
4. For SSE/SZSE indexes and ETFs, confirm the concurrent Tencent quote remains
   available when Yahoo metadata is absent. Commodity proxies use Yahoo's
   validated current-session metadata.
5. Never fabricate a completed close. Invalid or incomplete metadata is
   ignored and the latest status remains conservative.

## Latest strategy guidance does not update

1. Confirm the page is visible; background tabs intentionally do not poll.
2. Check the displayed update time and use the refresh button once.
3. Confirm `/api/market?mode=latest` returns `Cache-Control: no-store` and a
   newer `fetchedAt` value. History mode should remain cacheable.
4. Remember that the guidance uses the provider's newest bar. A web endpoint
   may still be delayed even when the application does not cache it.
5. Confirm an end-of-range diamond is labeled as a valuation close, not a
   strategy sell.
6. If the bar touched a displayed entry price but no buy appears, inspect the
   strategy's entry-filter summary. The guidance card should report that the
   entry condition was touched but the moving-average slope filter failed.
   This is a blocked hypothetical entry, not a missing executed fill.

## A closed daily chart keeps changing after refresh

1. Confirm the newest canonical bar reports `latestBarStatus: "complete"`.
2. A same-provider refresh must not rewrite that bar's OHLC. It may only
   backfill missing published volume on completed dates.
3. For verified LOFs such as `164824`, confirm the canonical Eastmoney series
   remains raw and that a Tencent temporary quote is rejected when the same
   completed trading date already exists.
4. If an older cache still oscillates, reload once so the locked canonical
   series replaces the displayed in-progress copy.

## Chart timeline cannot be dragged

1. Confirm the slider data zoom has `brushSelect: false`; ECharts otherwise
   reserves the selected fill for brush selection instead of moving the window.
2. Drag the green selected range to move it, or drag either bright handle to
   resize it.
3. Confirm `EChart` is initialized only once and reapplies the captured zoom
   window when trade markers or indicators update.
4. Confirm the reset key changes only when the instrument or interval changes.
5. Run the chart configuration test, apply a screening result, and repeat the
   drag in a real browser.
6. If a visible price tooltip disappears during a scheduled refresh, confirm
   chart updates use component `replaceMerge` and do not recreate tooltip or
   axis-pointer state with `notMerge: true`.

## Browser shows an empty pane to the right

The workspace already uses the full webpage viewport. A gray vertical divider
with a second empty region is a browser split pane, not unused page width.
Close the split pane or launch the site through `open-quantscope.bat`, which
opens a new maximized Edge window when Edge is installed.

## Backtest has no trades

The selected parameters may produce no entry signal in the chosen date range.
Expand the range or change the strategy. Do not weaken assertions or inject a
trade only to make a test pass.

## A breakout trade appears one bar late

1. Confirm the strategy is registered with `buildOrders`, not only
   `buildTarget`.
2. Confirm each order at bar N uses data ending at bar N-1.
3. For a long stop, require `high >= stop` and fill at `max(open, stop)`.
4. For a long exit stop, require `low <= stop` and fill at
   `min(open, stop)`.
5. Confirm the configured tick is present after loading an older saved
   backtest; defaults are merged into saved parameter snapshots.
6. Run the synthetic stop, gap, and prefix-invariance tests before comparing
   live provider data.

## Parameter screening is slow

1. Signal targets intentionally scan complete loaded history so persistent
   strategy state is not reset at an arbitrary warm-up boundary. The selected
   range limits performance measurement, not signal construction.
2. The first stage intentionally evaluates all 45,196 registered parameter
   combinations. There is no production cap or sampling control.
3. Confirm only compact metrics and reusable execution state for each eligible
   strategy's top 60 unfiltered
   candidates survive into the EMA stage. The top six final parameter sets
   per strategy should retain complete execution state for pair replay.
4. Confirm the unified run advances through parameter, entry-filter, pair, and allocation
   stages. The single-strategy column is produced by the parameter stage; the
   combination column is available after allocation replay.
5. Confirm EMA(5-8) runs only for the explicit trend/breakout/momentum family.
   Channel BreakOut and Price Channel must participate; reversal and
   candlestick families must remain unfiltered.
6. Confirm all completed standalone family winners are ranked with the active
   objective and only the all completed families enter combination stages. With 57
   strategies this retains all57 and permits at most1,596 unordered pairs before
   declared-equivalence exclusions. Each eligible pair must still cross its
   top six retained parameter sets, use the exact independent A/B entry
   filters, retain the best of all 36 crossings before allocation replay,
   and compare 50/50, 60/40, 40/60, 70/30, and 30/70.
7. Use the stop action when a run is no longer useful.
8. Confirm `screening.worker.ts` was emitted by the production build and that
   progress messages continue while the main page remains interactive. The
   stop action should send cancellation and terminate the Worker promptly.
9. For rolling mode, confirm the selection pool retains up to ten candidates
   per strategy for every window and collapses to one displayed winner only
   after equal-window ranking.
10. Run `npm run analyze:screening-pruning` before lowering the percentile.
    A lower value must be supported across total-return, balanced, and Sharpe
    jobs with an explicit acceptable-loss rule; short-window speed alone is not
    evidence that complementary lower-ranked legs are irrelevant.
11. If screens must survive page closure or run concurrently across devices,
   move the same protocol to a durable server queue without changing the
   registered candidate domain.

## Screening card changes after Apply

1. Confirm both screening and the active workspace use the complete market
   history to build the target and the same selected dates only for metrics.
2. Confirm both paths pass the same `hybrid` execution policy, commission,
   slippage, parameters, and allocations.
3. For a combination, confirm both paths derive relative roles over the same
   optional date window and pass the same intrabar fill-price timeline.
4. Run the regression that deep-compares each standalone card with
   `runBacktest(...)` and compares combination metrics/rebalances with a rebuilt
   applied timeline.

## Screening rank does not match the expected metric

1. Check the selected optimization target before starting the run.
2. Changing the target clears prior results; rerun screening to compare
   parameters under the new target.
3. Confirm the target is balanced score, maximum return, or maximum Sharpe.
   Return/drawdown and minimum drawdown are intentionally unavailable.
   Balanced score must equal `0.45 * current-window return +
   8 * clamp(current-window Sharpe, -5, 5) +
   0.35 * current-window max drawdown`; trade count must not change it.
4. The candidate/observe-only badge does not affect sorting. Candidate requires
   positive total return, positive Sharpe, and at least two trades; hover the
   badge to see every failed condition.
5. When target values tie, total return, drawdown, Sharpe, and balanced score
   are applied as deterministic tie-breakers in that order.

## Applied strategy is not visible on the chart

1. A fresh daily or one-minute workspace intentionally starts with Strategy A
   and Strategy B empty and no strategy applied to the chart. Selecting
   "Do not use" in both slots and pressing Apply intentionally clears every
   strategy-linked pane, reference, marker, and latest-guidance calculation.
2. For a strategy configured directly in the lab, use the lab's Apply button
   and confirm the page scrolls to the main chart. This action must not create
   a saved shortcut.
3. For a screening result, click the result row and confirm it restored the
   selectors and scrolled to the main chart. Enter and Space should provide
   the same keyboard action while the row is focused.
4. Confirm the result's A and B values match the two strategy-lab allocation
   selectors. Dual plans must be 50/50, 60/40, 40/60, 70/30, or 30/70; the two strategy parameter
   sections should sit directly below their own selectors.
5. Reference lines exist only for strategies with a continuous price
   reference; a candle/oscillator rule may legitimately add no line.
6. Confirm both selectors contain the complete strategy registry, duplicate
   IDs are unavailable, and the lab shows A/B as relative long or short based
   on the selected range's average active-run length. Changing dates or
   parameters must recalculate those roles.
7. Confirm the chart legend prefixes follow the derived relative roles, not
   the strategy catalog's fixed horizon metadata.
8. For a partial/combined plan, inspect allocation transition markers rather
   than expecting generic round-trip trade markers. The only strategy labels
   are open (relative-long buy), short buy, short sell, and close. A gated final
   clear is one close marker even though its rebalance record retains both exit
   events.
9. Confirm the selected date range has at least one allocation change.
10. If markers appear on nearly every bar while the target state is unchanged,
   inspect `plannedAllocation`; ordinary price drift must not trigger a
   maintenance rebalance.

## Live execution label or condition price looks wrong

1. Confirm the strategy exposes `buildOrders` before expecting today's entry
   or exit condition price.
2. Confirm today's order uses only data through the prior completed bar.
3. A touched stop is a same-bar fill; an untouched displayed condition remains
   pending. A gap beyond the stop uses the bar open.
4. Close-confirmed strategies never show a known next-open price and retain the
   following-open label.
5. Inspect `MarketSeries.latestBarStatus`. In-progress or unknown daily bars
   intentionally freeze close-confirmed live targets at the preceding state;
   causal resting stops still use the active high/low.

## Saved shortcut history is slow or shows the wrong instrument

1. Confirm IndexedDB contains `quantscope-market-cache` for the current
   `127.0.0.1:3000` origin. Browser storage is isolated by origin.
2. Confirm the key matches provider, `secid`, and `1d`; fallback providers use
   their normalized provider identity.
3. A first open without a cache entry still performs the normal complete
   history request. Subsequent opens can render the saved series first.
   Cache age does not suppress this preview; use the displayed cache time to
   judge how old it is.
4. The full history request always continues after a hit. A source or
   adjustment mismatch triggers one `strictProvider=1` full-history request
   for the latest successful source. The warning remains only if this recovery
   fails; inspect that request before clearing cache.
5. If IndexedDB is blocked or cleared, the application intentionally falls
   back to a bounded in-memory session cache and the network without changing
   backtest meaning.
6. A cached-first chart intentionally shows a provisional warning until a
   compatible network history refresh completes.

If a development hot update reports `Cannot read properties of undefined
(reading 'at')`, confirm the workspace uses `readCachedMarketSeriesEntry(...)`
for timestamped reads and retains `readCachedMarketSeries(...)` as the
direct-series compatibility API. Current code also validates retained React
state and refs before reading `bars`.

## Nasdaq 100 is empty or shows stale volume

1. Inspect the selected search result and the canonical profile. Eastmoney may
   return code `NDX100`, while Yahoo and Nasdaq use `NDX`; all must resolve to
   canonical key `index:NDX`.
2. Confirm the primary Yahoo request uses `^NDX` and the Nasdaq backup uses
   provider `secid` `NDX`, not the selected alias `NDX100`.
3. Do not reject a parsed Yahoo series merely because its returned code is
   `NDX`. Canonical profile validation must compare the shared alias key.
4. Yahoo currently publishes nonzero NDX daily volume; Nasdaq's index-history
   response may publish zero. Never synthesize volume or copy it across dates.
   Same-session merge may retain an already accepted positive value. A full
   same-source refresh may also repair an older cached zero for the same date
   without changing OHLC. A recent isolated gap automatically requests that
   history once before browser site data would need clearing.

## Commodity search or history is empty

1. Search the exact Yahoo symbol (`GC=F`, `SI=F`, `CL=F`, or `HG=F`) to use the
   deterministic catalog.
2. Confirm `/api/search` returns `assetType: commodity` and `provider: yahoo`.
3. Confirm `/api/market` accepts `commodity` and Yahoo is reachable.
4. Do not route commodity symbols to Nasdaq; there is intentionally no fallback.
5. Remember that these are futures quote proxies, not spot or contract-chain
   records.

## Saved shortcut bar cannot load

1. For local use, confirm `.wrangler/state` exists and run
   `npm run local:db:migrate`.
2. For hosted use, confirm `.openai/hosting.json` declares the `DB` D1 binding.
3. Confirm `drizzle/` contains the `saved_backtests` migration.
4. For hosted use, confirm the request includes the injected user identity
   headers.
5. Inspect `/api/saved-backtests` for `AUTH_REQUIRED`,
   `INVALID_PAYLOAD`, or `PERSISTENCE_UNAVAILABLE`.
6. If drag ordering reverts, inspect the `PATCH /api/saved-backtests` response
   and confirm migration `0004_real_ulik.sql` added `display_order`. The route
   must update the complete order in bounded 25-record chunks; one large
   conditional statement can exceed D1's bind-parameter limit near 200 rows.
7. Do not fall back to browser storage for failed durable writes.
8. Existing core/maximum plan JSON should be converted to A/B when read; a
   failure here indicates invalid stored JSON rather than a missing migration.
9. If a second strategy saved for the same instrument replaces the first,
   apply migration `0002_flawless_korvac.sql`; it removes the old unique
   instrument index and creates the non-unique lookup index.
10. If a newly searched ETF loads through Yahoo but Save returns
   `INVALID_PAYLOAD`, inspect the provider-resolved instrument name. Market and
    saved-record validation must both use
    `MAX_MARKET_INSTRUMENT_NAME_LENGTH`; `159558.SZ` currently resolves to an
    82-character English name.
11. If rolling returns are missing, apply `0007_bright_jackpot.sql` and inspect
    `PUT /api/saved-backtests` for a complete set of current rolling evaluations.
    The legacy rank columns from that migration are intentionally inert: current
    screening archives never read, backfill, or append shortcut ranks.
12. If only some shortcuts receive a rolling-return update, verify the update
    includes every saved ID in the canonical instrument group. Validation prompts
    are computed from the latest available 30-session and 63-session evidence and
    do not depend on a screening archive write.
13. If first-level group deletion fails, inspect
    `DELETE /api/saved-backtests?instrumentKey=...`; the server resolves stored
    provider aliases to the canonical key before deleting owner-scoped rows.
14. If shortcut folders fail to load or rename, apply
    `0008_sour_rage.sql`, then inspect `/api/saved-backtest-folders`. Folder
    deletion should unfile records; it must not delete saved backtests.

## Adjacent daily K-lines appear out of order

1. Inspect `bar.time` and `bar.timestamp` separately. Daily ordering must use
   the canonical `YYYY-MM-DD` trading key; timestamps are provider metadata and
   may use different epochs or timezones.
2. Confirm all initial/latest/fallback/temporary-quote paths call
   `normalizeMarketBars(...)` after merging.
3. Confirm duplicate trading dates retain one validated bar and that the last
   item is selected only from the normalized array.
4. Run the conflicting-provider-timestamp regression in `analysis.test.ts`.

## Numeric input is hard to replace

1. Confirm the field uses the shared `app/components/CommittedNumberInput.tsx`, not an eager
   `value={number}` plus `onChange={Number(...)}` binding.
2. Focus should select the full current value. Empty draft text is valid until
   blur or Enter; Escape restores the committed value.
3. Validation, integer rounding, and min/max clamping belong in the commit
   boundary, not each keystroke.

## Screening, lab, and shortcut ranges disagree

1. Confirm the period input calls `updateSharedRangeFromSessions(...)` and both
   lab date inputs call `updateSharedRangeFromDates(...)`.
2. Confirm `resolveTradingSessionRange(...)` snaps calendar inputs to actual
   loaded bars and `resolveTrailingTradingSessionRange(...)` derives the
   requested count from the current end date.
3. On a newly loaded instrument, confirm `sharedRangeSessionsRef` is retained
   while the calendar dates are rebuilt from that instrument's bars.
4. Confirm opening a saved shortcut does not restore `saved.startDate` or
   `saved.endDate`; creation-time dates remain persistence provenance only.
5. Shortcut comparison is intentionally separate from the lab/screening range.
   Inspect `savedBacktestRollingGroups` and verify every daily saved plan uses
   `SAVED_BACKTEST_ROLLING_SESSIONS` plus its saved cost assumptions. An inactive
   instrument should show its last persisted rolling return, then its
   creation-time fallback, until usable history is loaded again.
6. Period result rows must use the synchronized N-session range. Range rows
   must use the custom interval. Rolling rows use the configured total interval
   while their selection score equals the arithmetic mean of all window rank
   scores. Earlier bars may affect indicators and opening state but never the
   reported performance boundary.

## Commands

```bash
npm test
npm run typecheck
npm run build
```

`npm test` includes strict TypeScript checking, analysis/unit tests, a
production build, and rendered/source tests. Minimal local Cloudflare ambient
types live under `types/` so `npm run typecheck` covers `db/` and `worker/`
without depending on the deployment build.
# One-click screening out-of-memory recovery

- Discovery backtests should have empty `equity`, `trades`, and `rebalances`
  arrays while retaining finite ranking metrics. Displayed finalists should be
  detailed after materialization.
- A stopped, crashed, or OOM-terminated Worker leaves its most recently
  committed checkpoint in `quantscope-screening-checkpoint`. Starting the same
  instrument/configuration resumes it; any bar, cost, range, mode, objective,
  filter, or exclusion change invalidates that snapshot.
- Successful completion deletes the checkpoint. Browser site-data controls can
  also remove it; the fallback is a clean full run.
- The Worker process is expected to change after each completed optimization
  stage. This is deliberate heap isolation, not a crash. Progress must continue
  at the next stage without replaying completed candidate calculations.
- If a higher-order discovery stage stops with a multi-gigabyte Edge renderer
  and no CPU progress, verify that finalist retention uses keyed binary
  insertion. Reintroducing full-pool sorting per candidate causes extreme
  temporary allocation without changing the intended top-16-per-primary rule.
- Screening table results intentionally contain empty detail arrays. Apply the
  row to regenerate its detailed equity and transaction data.
# Intra-stage screening OOM

If a long high-order discovery stage advances for a while and then the renderer
shows `Out of Memory`, check whether the Worker is running a whole stage without
an intra-stage restart. High-order summary evaluation must use the alternating
streaming timeline states and persist an exact checkpoint every 4,096 candidate
evaluations. The Worker then restarts and resumes after the saved ordinal. This
bounds transient heap pressure without pruning candidates or changing ranking.
The same retention and restart path is shared by balanced, total-return, and
Sharpe objectives and by sample, range, multi-range, and rolling validation.
Objective and validation configuration remain part of the checkpoint signature,
so state from one scoring method or period cannot be resumed by another.
Entry-filter discovery data (`rawTarget` and `rawOrders`) must be cleared as
soon as that stage ends. Per-finalist order-fill maps are required through pair
allocation replay only; checkpoints at later stages strip them because
three-through-nine-strategy summary evaluation uses close targets, while final
detailed results rebuild execution from the retained parameters.

## Strategy-cycle checkpoint recovery

Continue validation reuses completed task selections when the previous market input is an exact prefix and screening settings still match. The task stores its SHA-256 input digest and snapshots together in IndexedDB. A task saved before the digest was introduced may require a fresh screening for dates without published selections.

Each published report keeps the latest close checkpoint and up to two preceding closes per window. Matching history, selections, start date and settings allow replay to resume before the first changed bar. Older records and incompatible report inputs use a full replay. An appended session may still need full parameter screening when the cycle schedule calls for a decision. Market prefix validation, schedule construction and indicator preparation may still read historical bars.

Explicit validation refresh accepts revised primary quotes for the newest two completed sessions. Re-screen from the first changed session according to the normal decision calendar. Earlier validated history still uses strict alignment. When the recent request cannot overlap the cached or validation anchor, fetch history and verify the bridge before processing every missing completed session.

A known correction to either of the last two saved sessions can still be repaired after an interruption that spans more sessions. The market refresh itself only replaces the latest two completed primary sessions.
