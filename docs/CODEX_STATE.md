# Codex State

## 2026-10-25 exact screening replay and direct resume implemented

- User authorized the two measured speedups with unchanged best-strategy
  selection. `lib/analysis/strategy-combinations.ts` now initializes three-
  or-more-leg summary replay after a strictly earlier proven zero caused by
  an inactive core or zero volatility cap. One subsequent transition preserves
  signal attribution; complete causal targets, role/risk warm-up, inherited
  holdings and full-history fallback remain. Two-leg order replay is unchanged.
- Recovery restores evaluated/failed/total counters from committed progress,
  skips completed stages and seeks ordered candidate rows or finalist/weight
  offsets within the active stage. The old scalar skip branches are replaced,
  not the search domain. Six finalists, all families, beams, weights, ranking,
  tie order and execution rules are unchanged. Existing checkpoint, result-
  model and wire versions remain compatible; no queue/cache/data reset occurs.
- Added `tests/screening-exact-performance.test.ts` and a synthetic pre-edit
  fixture. All 36 complete pre-change output hashes, 144 interior/boundary
  checkpoint continuations, repeated interruption/failure-count recovery and
  five complete-grid interior allocation cursors pass. Independent before/
  after comparisons pass 200 actual-data timeline/chart cases (108 inherited
  positions) and 12 complete validation mode/objective outcomes.
- Finishing the real 4,677-bar checkpoint's remaining 100,000 allocations
  produces identical complete final results at 1,256,829 cumulative
  evaluations: 31.068 s before versus 3.698 s after. Zero-new-work recovery is
  3.244 versus 0.023 s. These are bounded stage measurements, not whole-search
  guarantees. Local scripts, frozen references, timings and logs are retained
  under ignored `outputs/performance-integration-2026-10-25/`.
- Full `npm test` passes typecheck, all 384 unit tests, production build and
  all four rendered/source tests. Scoped ESLint and diff checks pass. The
  rendered source contract was added to the plan after it rejected obsolete
  loop syntax; replacement assertions retain subsequent-candidate traversal
  and exact row-seek coverage. No assertions/tests were deleted.
- Architecture, functions, module patterns, feature map, data pipeline and
  technical research document the equivalent shared behavior. Existing raw
  data and untracked research work are preserved. Live relay health remains
  ready with seven children; the observed batch has no error jobs.

## 2026-10-25 screening performance audit without production changes

- Reviewed the current full-only model-7 optimizer, disposable local children,
  checkpoint recovery and active seven-child pool on the eight-CPU/64-GiB
  host. All prescribed project context files exist. Existing untracked market
  and research artifacts are preserved. No production source, job, queue,
  historical winner, market input or runtime setting is changed.
- A frozen committed checkpoint supplies 4,677 Nikkei bars and a ten-session
  window. The audit-only prototype starts three-to-six-leg streaming replay
  after a preceding guaranteed zero, preserving full signals/risk warm-up,
  inherited state and full-history fallback. 200 exact timeline/chart/metric
  cases pass, including 108 inherited positions. Both same-cursor 8,227-new-
  evaluation samples preserve complete returned-result hashes: 5.613/6.138 s
  baseline versus 3.356/3.605 s prototype. A separate 8,192-candidate kernel
  takes 2.592 versus 0.292 s with matching hashes. These are local sample
  speedups, not full-job guarantees or a shipped feature.
- A near-empty resume probe takes 3.348 s through its first 35 new evaluations;
  previous completed-stage loops still revisit 1,156,829 ordinals. Recommend
  exact state initialization first, then direct completed-stage/cursor restore,
  then materializing compact state only for retained scalar-ranked candidates.
  Keep all six finalists, all eligible families and deterministic ranking.
- `docs/TECH_RESEARCH.md` records approaches, official references, evidence,
  limitations and the follow-up validation scope. Reproduce with
  `node --import tsx outputs/performance-review-2026-10-25/audit.mjs` while the
  reviewed source hash matches. Local frozen input, generated modules, profiles
  and `summary.json` are Git-ignored, bounded review artifacts. No feature
  linkage/status changes require a feature-map edit. Audit assertions pass;
  no production regression suite is claimed for this documentation-only task.

## 2026-10-25 canonical MACD and Supertrend strategy selection

- Active strategy selection and full screening expose 55 families, retaining
  the familiar built-in MACD (`tv-macd`) and Supertrend (`tv-supertrend`).
  Historical `macd-momentum` and `supertrend-trend` definitions remain available
  through `getStrategy` for saved plans and archived result replay, but are
  removed from active menus, horizon lists and default parameter enumeration.
- `LEGACY_STRATEGY_ALIASES` records the shared catalog policy. Both retained
  strategies use the same parameter spaces as their aliases. Supertrend stop
  orders remain a distinct active strategy. Six execution finalists and 100%
  eligible family participation remain unchanged.
- Result-model version 7 prevents old catalog checkpoints and latest results
  from restoring as current searches. No protocol or endpoint change, market
  refresh, historical winner migration, raw-data deletion or batch job is added.
  This is a bounded registry change; no additional checkpoint mechanism is needed.
- Saved-plan and screening-history validators share `KNOWN_STRATEGY_IDS`, so
  historical IDs remain accepted independently of new menu/grid eligibility.
- Verification: signal/grid/legacy compatibility checks pass on flat, rising,
  falling and oscillating data with boundary and common parameters. Full
  `npm test` passes typecheck, 343 unit tests, production build and 4 rendered
  route tests. Daily grids shrink from 45,196 to 40,148 candidates (34,886 when
  volume-dependent strategies are excluded). Documentation and diff checks pass.

## 2026-10-25 full-only screening with six finalists and all families

- User explicitly removed quick screening and expanded full search to six
  execution finalists per family and100% eligible family participation.
  `COMBINATION_FINALISTS_PER_STRATEGY` is6; family selection is100; each pair
  crosses up to36 parameter combinations. Existing full-mode parent beams,
  allocations, execution timing, volume exclusions and mathematical-equivalence
  rules remain. This supersedes earlier top-three/top95% policy entries.
- Removed both page controls/state, reusable parameter-library client/storage
  modules, metadata capture, quick transport fields and top-thirty quick
  expansion. Shared overlay checkbox CSS uses neutral overlay class names.
  Compatibility-only guards explicitly reject obsolete quick requests instead
  of silently computing a restricted candidate search as a full result.
- Search result model is6. Optimizer checkpoints include its shared constant;
  browser/child identities, latest-result cache and cycle task restoration
  reject old model/task signatures. Old task records, engine jobs, browser
  library records, research snapshots and reports are retained without being
  resumed or relabeled as new full-search results. Protocol version/endpoints
  are unchanged; coordinator/relay/launcher keep their shared protocol source.
- Deleted `screening-parameter-client.ts` and `screening-parameter-library.ts`
  because their sole runtime purpose was the removed feature. Recoverable
  pre-edit copies live under Git-ignored `outputs/full-screening-migration/`
  with `.bak` extensions. The existing parameter-library test file is preserved
  and repurposed into13 full-only policy/removal/resume tests; overlay identity
  tests now exercise active screening checkpoints instead of deleted libraries.
- Focused tests confirm complete family grids, six finalists,36 pair crossings,
  weakest eligible-family retention, exact current-model resume, obsolete model
  restart, legacy-mode rejection and full-stage recovery. Final `npm test`
  passes342 unit tests, the production build and4 rendered-route tests;
  typecheck and final source/diff audits pass. The13 repurposed policy tests
  also pass independently. No historical market data,
  strategy-cycle return ledger or prior research source was changed.

## 2026-10-25 full-screen versus quick-screen return reconciliation

- User correctly recalled91.4477% for original EMA7/SMA11/WMA14/0.125%.
  Reproduced it from the old full-screen504-session snapshot,2024-09-27..
  2026-10-23,45 fills and8.2619% drawdown. The new45.8243% is the final500
  segment of a different quick-screen2000-session account; it must not be
  presented as the earlier full-screen result. Underlying OHLC arrays match.
- Matched dates2024-10-03..2026-10-23, both starting flat: full-screen original
  parameters91.9439%, new EMA8/SMA10/WMA14/0.10%73.1478%; quick-screen original
  38.2139%, new50.2945%. Thus the new combination improves only the tested
  quick path and worsens the original full-screen path. Four extra days and
  inherited state do not account for the principal source-path difference.
- Narrowed report labels to the actual quick-screen provenance and added the
  matched-source caveat. The earlier broad implication that the new parameters
  upgrade the original full-screen strategy is not supported. No product
  settings, source data, strategy winners or existing research results change.

## 2026-10-25 expanded5..16 grid and adaptive segmentation research

- User clarified the desired direct train-block/next-block experiment and that
  100/300 sessions were illustrative. Added `BLOCK_DESIGN.md`, `block-study.ts`,
  four focused tests, localized report generator and matplotlib chart in the
  existing isolated overlay study. Only research/docs change; no production
  rule, preference, source request/result or active queue is modified.
- Full grid is13824 independent EMA/SMA/WMA5..16/eight0.025%..0.2% thresholds,
  all three controls on. Full2000 best remains EMA8/SMA10/WMA14/0.10%,166.2851%
  return/-29.0334% drawdown, versus holding176.7222%/-31.7989%.
- Compare equal training/update lengths40,60,80,100,126,160,200,252,300,400,500.
  Common1500 deployment starts2020-09-02. Training starts empty in each past
  window with causal full-history indicator warm-up; one actual live account
  preserves holdings/pending sells across updates. Winner ties prefer current
  settings and report their count. Full-grid plus145 training windows means
  2,018,304 candidate-window evaluations;146 atomic numeric caches use46 MiB.
- Only development1000 days select length252: development36.9597%, final500
  17.0804%, common1500 60.3530%, drawdown25.8075%. Holding respectively62.5570%,
  65.8165%,169.5463%; current fixed common63.0324%. None of11 policies beats
  holding over common1500 or final500.100-day common22.8515%, last20.0059%;
  300-day common27.1982%, last8.0081%. This does not support profitable periodic
  retuning within the tested equal-length policy class.
- 252-day winners beat holding in1/6 actual deployment blocks. Empty-start
  frozen versions have median relative holding wealth+0.3486% at20 days,
  +0.0159% at40,-2.1894% at60,-4.9653% at126; small overlapping cohorts prevent
  reliable expiry inference. Age tables also isolate development-only outcomes.
- Report: `research/nikkei-overlay-stability/output/blocks-5-16/report.html`.
  Run `block-study.ts`, `block-report.ts`, then `block-plot.py`. Four new tests
  and five existing research tests pass. Full `npm test` passes341 unit tests,
  build and4 rendered-route tests. Same-command resume reuses all146 grids;
  all5832 overlapping old-grid settings match within1e-9, every policy's fold
  returns compound to its actual continuous return, and report links/source
  identities pass. Historical quick-library vintage limitations
  and previously explored dates remain explicit.

## 2026-10-25 2000-session mixed-overlay stability research

- Added isolated `research/nikkei-overlay-stability/`: declared design, bounded
  actual quick-job reconstruction, frozen raw bars/plans/hashes, atomic signal
  and 128-candidate grid checkpoints, focused tests, Chinese report locale,
  report generator and matplotlib chart export. Production rules, preferences,
  local engine and original results are unchanged; pre-existing working changes
  remain intact. No network price refresh or new screening is performed.
- Source is1293 actual decisions over2000 sessions,2018-08-08..2026-10-23.
  Exact market prefixes, completed results and matching costs are verified.
  Quick candidates change159->171 on2024-11-22. Historical training vintages
  are unverified; final500 overlaps previously studied dates. These are
  conditional historical checks, not an independent end-to-end holdout.
- Current controls128.6533%/-30.3825%; all off48.3488%/-26.4044%;
  holding176.7222%/-31.7989%. Current500-block returns40.3264%,-1.2027%,
  13.1001%,45.8243%. Full-grid best EMA8/SMA10/WMA14/0.10% returns166.2851%
  with29.0334% drawdown, but nearby81-setting median118.8389% exposes fragility.
- All70 rolling policies use past-only training, a common1244-session interval,
  development offsets756..1499 and final500 separate. Development-selected
  return/756-history/252-update gives29.8558% development and10.0244% final500;
  fixed current gives1.5542% and45.8243%. Automatic updating is not supported.
- Post-hoc single-dimension follow-up finds EMA8 alone as the first1500's
  best entry period: full152.5533%/-28.4933%, last50058.0582%. Matching
  next-open sensitivity120.1782% versus current106.7989%. Keep it as a small
  prospective research candidate; the website's EMA7 constant was not changed.
- Frozen age analysis uses50 overlapping252-day vintages per history/score.
  756-day return-selected settings show only0.16..0.29 percentage point mean
  advantage over current in the first120 days, then-1.6795 points in121..252.
  No fixed useful lifetime or reliable cadence can be inferred from these
  overlapping historical samples. Report complete policy/fixed menus and costs.
- Reproduce with `npx tsx research/nikkei-overlay-stability/analyze.ts`, then
  `npx tsx research/nikkei-overlay-stability/report.ts` and
  `python research/nikkei-overlay-stability/plot.py` (matplotlib required).
  All8 controls reconcile2000 daily targets with production. Five focused
  research tests pass. Full `npm test` passes341 unit tests, production build
  and4 rendered-route tests; typecheck passes. A second matching-identity run
  reuses all46 grid chunks successfully; stale-identity rejection was also
  observed and only this task's reproducible derived chunks were regenerated
  after a script type fix. Report links, source/design identities and absence
  of undefined content pass. The existing extensive user work is not reverted.

## 2026-10-25 EMA8..14 fallback entry comparison

- User requested backup EMA8..14 entry after EMA7 is vetoed by negative WMA14.
  `ema-fallback-entry.ts` compares seven backup positive turns, same-day versus
  strictly-later confirmation, and persistent versus invalidation-aware intent.
  Backup supplements bypass WMA; original buys and SMA11 exit policy stay intact.
  This is28 variants plus a complete91.44772% baseline fill reconciliation.
- Persistent same-day backups return75.14/75.14/75.14/73.04/73.69/77.85/77.85%,
  drawdown11.22-11.23%. Strictly-later returns91.45/89.48/89.48/88.33/88.33/
  88.33/88.33%, drawdown8.26%. Cancelling invalid later intents yields current
  equality for EMA8..10 and90.29% for EMA11..14. None beats current.
- Four monitored rally metrics remain unchanged within numerical tolerance.
  July31 same-day backups clear August3; strict persistent EMA9..14 buy August5
  then clear August6. Two tests cover all28 modes' causality and selective
  execution; typecheck passes. Outputs are `output/ema-fallback-entry*` under
  the rally study. No production change, source refresh or queue reset occurred.

## 2026-10-25 deferred EMA7 entry comparison

- User proposed remembering EMA7 turns rejected by negative WMA14 and buying
  after WMA14 turns positive. `deferred-ema-entry.ts` compares persistent waiting
  with cancellation on nonpositive EMA7 or any original reduce signal. Deferred
  execution requires flat/no raw signal/positive WMA; newer blocked turns renew
  intent and any normal entry consumes it. No production rule was changed.
- Full control fill ledger reconciles91.44772%/8.26194% drawdown/45 fills.
  Persistent intent gives89.37312%/8.26194%/53; cancellation-aware intent
  92.35439%/8.26194%/49. Four rally coverage/returns remain identical.
  August5,2026 buy clears August6 in persistent mode; conservative mode cancels
  July31 intent on August3's original sell. Next-open sensitivity99.40
  ->91.25/96.22%, so the small close-proxy gain is not robust to timing.
- Three research tests and typecheck pass. Atomic ledgers/events and summary
  are under `research/nikkei-cycle-rallies/output/deferred-ema-entry*`.

## 2026-10-25 WMA3 exit-assist comparison

- User asked for WMA3 assistance on clears. `wma-exit-assist.ts` compares
  nonpositive slope releasing pending original reductions, and a positive-to-
  nonpositive crossing forcing flat with same-day buy suppression. Original
  EMA7/SMA11/WMA14 entry policy remains the primary base; prior unadopted EMA
  priority is tested separately. Both baseline full fill ledgers reconcile.
- Current base91.44772%/8.26194% drawdown/45 fills becomes66.91016%/8.87415%/64
  for pending-only release and33.98694%/11.18295%/80 for forced clear.
  May21,2026 buys clear May28 instead of June8; fourth rally coverage
  90.91 ->45.45%, account return10.84 ->4.77%. Faster signals interrupt rallies
  under current reentry rules. EMA-priority comparison also worsens70.70
  ->48.82/20.95%. No production rule was changed.
- Three focused tests and typecheck pass. Full ledgers, transitions, sensitivity
  and summary are `research/nikkei-cycle-rallies/output/wma-exit-assist*`.

## 2026-10-25 EMA7 supplemental-entry priority comparison

- User asked to let an EMA7 positive-turn supplement bypass a negative WMA14.
  `ema-entry-priority.ts` preserves original flat-buy WMA filtering, raw-signal
  precedence, inherited partial adds and SMA11 >0.125% deferred-exit behavior.
  No production option, queue or source was changed.
- Full baseline fill reconciliation passes. Return91.44772 ->70.70105%,
  drawdown magnitude8.26194 ->13.02249%, fills45 ->66. Twelve supplemental
  entries bypass negative WMA in the altered path. Four monitored ranges stay
  unchanged. July31,2026 buys but the original strategy clears August3.
- Next-open sensitivity99.40 ->86.72%. Two causality/priority tests and
  typecheck pass. Atomic ledgers and summary live under
  `research/nikkei-cycle-rallies/output/ema-entry-priority*`.

## 2026-10-25 downward-turn menu expanded to3..12

- User specified3..12 rather than the initial7..15 range. Updated diagnostics
  and causality tests for30 profiles /60 warning-confirmation combinations.
  Final summary is `output/downturn-signals-3-12-summary.json`; earlier output
  remains provenance. Same frozen source,22 retrospective peak labels.
- WMA3:74 signals,22/22 coverage within ten sessions, mean1.55-session delay,
  18/22 before the first3% decline. EMA3:78 signals, same coverage/timing.
  WMA4:67 signals,22/22,1.77 sessions,17 timely; WMA5:62,22/22,2.09,16 timely.
  These suggest short-period research candidates, not general predictive accuracy.
- Forward-ten-day endpoint losses>=2% occur after about22-25% of these signals;
  greater sensitivity includes recoveries/ordinary pullbacks. No exit-return
  simulation, production replacement or active-job change occurred. Two tests
  and typecheck pass with the final expanded menu.

## 2026-10-25 downward-turn slope diagnostics

- User requested SMA/EMA/WMA periods for more downward turning points.
  `downturn-signals.ts` compares7..15:27 positive-to-nonpositive confirmations
  and27 still-positive weakening warnings. It uses frozen504-session data;
  no production model, trade rule, queue or source changed.
- Retrospective local-peak/next-ten-session3% decline labels yield22 targets.
  EMA7/WMA7 confirm22/22 within ten sessions at mean2.27-session lag, but
  only14/22 before the first3% drop. Counts are60/52 respectively. WMA9
  confirms22/22 at2.95 sessions with46 signals and13 timely labels.
  SMA11 confirms17/22 at4.41 sessions with37 signals and6 timely labels.
- Coverage is not predictive accuracy. Roughly one-fifth of EMA7/WMA7 signals
  precede a10-day endpoint loss>=2%. Historical label criteria and overlapping
  forward windows are disclosed. No automatic clear/override was backtested.
- Two causality/label tests and typecheck pass. Summary and complete signal
  dates are `research/nikkei-cycle-rallies/output/downturn-signals-summary.json`.

## 2026-10-25 entry/exit timing review

- User asked for earlier entries/clears on the current mixed model. Research
  `timing-review.ts` checks matched WMA13/WMA7 gate, SMA10 exit, threshold0.15%,
  and a new EMA7-positive / WMA14-negative-to-nonnegative unlock supplement.
  It preserves raw signal priority and current gate through the production
  controller. No production rule change or optimization rerun was issued.
- Current 91.45%/8.26% drawdown fully reconciles. Alternatives return 75.04,
  75.18, 73.78, 65.84 and83.02%, respectively. Unlock draws down10.88%, adds
  six supplemental entries in its path, and leaves all four monitored ranges
  unchanged. Threshold0.15 clears Oct23,2025 instead of Nov12, lowering that
  rally's coverage from100% to20%. Earlier is not a consistent improvement.
- One focused test and typecheck passed. Full ledgers and summary are under
  `research/nikkei-cycle-rallies/output/timing-review*`; short atomic reruns
  need no new checkpoint. Existing source bars and active task remain unchanged.

## 2026-10-25 WMA14 gate scope comparison

- User requested comparison of negative WMA14 blocking all adds/entries instead
  of only flat entries. `wma-add-gate.ts` preserves current mixed-model rules,
  source winners, costs, original signal priority and pending-sell cancellation.
  No production rule or checkbox changed.
- Full baseline fill ledger reconciles. Expanded gate returns 91.0546315%
  versus 91.4477169%; maximum drawdown stays -8.2619391%; fills 44 versus45.
  Only August 25, 2026's 60% ->100% add is blocked (slope -0.15467595%).
  Original next-day clear was profitable; all four monitored rally coverage
  and returns remain unchanged. Next-open sensitivity 99.40 ->98.08%.
- Three focused research tests and typecheck passed. Atomic full ledgers and
  summary live under `research/nikkei-cycle-rallies/output/wma-add-gate*`.
  This is a one-event same-sample difference, not evidence of general superiority.

## 2026-10-24 current controls adopt mixed averages

- User selected EMA7 positive-turn flat supplement, SMA11 daily slope >0.125%
  deferred reductions/clears, and WMA14 negative-slope flat-entry prohibition.
  Both page controls retain independent choices and default checked.
- Added explicit `ema7-sma11-wma14-v1` in shared overlay options, feature cache,
  saved-plan validation, settings/cache identities and page memo dependencies.
  No-model old plans preserve the legacy SMA formulas. Shared UI setters always
  choose the new model when applying old flags, so labels match active behavior.
- Preference v3 preserves v2/v1 booleans without deleting recoverable keys.
  Ordinary ledgers remain next-open; cycle close-proxy timing and original
  signal priority/pending-sell semantics remain unchanged. Existing-position
  increases are still exempt from the flat-entry gate.
- Production mixed controller fully reconciles the frozen research result:
  91.44771689225757% / -8.261939052687188%, all 45 fills identical.
  Four new focused tests plus ten legacy tests passed. Final `npm test` passed
  typecheck, 341 unit tests, production build and four rendered tests. One earlier
  full attempt hit the existing coordinator stall/restart test's timeout; the
  final full rerun passed without modifying that test or engine behavior.
- Browser verified both pages' three checked new labels and research independent
  gate toggling, false persistence after reload and restoration to all checked.
  Current running 40/80 cycle task remains active; no queue restart was issued.

## 2026-10-24 positive accelerating SMA12 entry research

- User asked to supplement on an SMA12 positive turn OR a positive daily
  normalized slope strictly greater than yesterday. `accelerating-entry.ts`
  reuses the production controller, so raw-signal priority, SMA11 gate and
  SMA12 >0.2% pending-exit behavior remain unchanged. No production change.
- Frozen cycle10 control fully reconciles. Extension gives 72.3968133%
  versus 83.0576889%, drawdown -9.6757634% versus -8.1092907%, 70 versus57
  fills. Range coverage improves to 71.05/80/78.57/90.91%, but range returns
  are 9.65/0.46/17.37/10.84%. Six acceleration entries are path-specific.
- Without SMA11 gate, return also falls 74.62731 ->65.09698%. Gate-on
  next-open sensitivity falls 79.00647 ->77.16046%. This is same-sample
  research; increased coverage is not evidence of better overall performance.
- Outputs and complete ledgers: `output/accelerating-entry*` under the study.
  Design and focused tests cover equality, negative improvement, causality,
  raw-signal precedence and independent gate enforcement.

## 2026-10-24 SMA/EMA/WMA overlay research

- User expanded all three overlay periods to 7..15 and exit thresholds to
  0.025/0.05/0.075/0.1/0.125/0.15/0.175/0.2 percent. This supersedes the earlier
  12-session cap. Frozen cycle10 winners and costs remain unchanged.
- `research/nikkei-cycle-rallies/ma-type.ts` shares registry average formulas,
  causal cached features and the production-equivalent account semantics.
  `ma-threshold-grid.ts` computes 157464 combinations in 216 atomic chunks;
  restart validates identities and reuses completed chunks. One threshold's
  compact metrics remains in memory; selected leaders retain complete ledgers.
- Current SMA12/SMA12/SMA11 0.2% fully reconciles 83.0576889% and all fills.
  Fixed-period uniform EMA/WMA return 36.8643/29.4912%. Uniform-type grid bests
  are SMA12/SMA8/SMA11 0.075%: 83.43%; EMA15/EMA13/EMA13 0.15%: 53.21%;
  WMA7/WMA11/WMA14 0.025%: 82.87%.
- Exploratory best: EMA7 supplemental entry, SMA11 exit guard >0.125%, WMA14
  nonnegative flat-entry gate. Return 91.4477169%, drawdown -8.2619391%,
  45 rebalances; coverage 73.68/100/89.29/90.91%. Next-open sensitivity 99.40%.
  Threshold 0.075% on the same averages gives 88.14% / -6.98% drawdown.
  Period neighborhood has only 2/18 above current control, median 62.38%.
  Results are repeatedly inspected history, not independent validation.
- Thirty focused research tests and typecheck passed. Full compatible-chunk
  resume reproduced the final summary SHA-256 exactly. No production options,
  preferences, screening task state or source bars were changed. Standalone
  Chinese report and complete CSV are in this thread's visualization directory.

## 2026-10-24 SMA11 gate controls and cycle explanation

- Added an independent SMA11 negative-slope flat-entry checkbox to both pages.
  User explicitly requested default checked, matching the existing two defaults.
  Version-2 preferences migrate the older two choices and default the third
  flag to true; explicit new false choices persist. Saved-plan validation and normalized cache identities carry
  `entrySlopeGate`; disabling it preserves previous two-flag behavior.
- The shared state machine blocks original and supplemental entries only while
  flat and close(t)<close(t-11); zero slope is allowed. Existing-position adds
  and exits are unchanged. Native orders consult completed previous bars, and
  rejected buys cannot bypass the ledger gate. No automatic delayed entry.
- User requested deletion of the overlay explanation text and the unused
  parameter-traversal display box. Removed that explanatory paragraph from the
  shared controls and the display box from research; retained the controls.
- Reconciled all dates/targets/prices: three flags on the frozen cycle10 give
  83.0576889336516% (57 fills); gate alone 36.48897124790938% (27 fills);
  previous two flags 74.62731173084941% (75 fills). Benchmarks unchanged.
- Clarified schedule: evaluation has 504 account dates, warmup comes from prior
  source history, and 206 strong-trend/same-direction candles skip reoptimization,
  leaving 298 tasks. The gate depends on bars, not trailing screening length.
- Audited the user's screenshot against completed cycle128 (+28.4434%). It
  held 60% from 2026-01-26; actual close weights were 60.2504% on April 6 and
  60.2575% on April 7. SMA12 was falling April 6 and turned positive April 7,
  but the account was not flat, so no supplemental entry was permitted.
- Final `npm test` passed: typecheck, 337 unit tests, production build and four
  rendered/source tests. Updated the obsolete traversal-box assertion to expect
  its user-requested removal. Browser verified three default-checked controls,
  deletion of the explanation/box, independent gate toggling and persistence
  of explicit false after reload; restored the requested all-checked state.

## 2026-10-24 negative SMA slope flat-entry research

- User requested cycle10 with no flat-account entry while SMA X slope <0,
  X=3..12. `entry-slope-gate.ts` reuses the production state machine and frozen
  298 signals; tests original cycle10 and supplement+0.2%-guard bases separately.
  Original and supplemental flat entries are gated; existing-position adds and
  exits are unchanged. Equality permits entry; rejected requests are not queued.
- Ungated ledgers reconcile all executed dates/targets/prices and returns:
  33.46158% and 74.62731%. All 20 variant ledgers, blocked attempts, summaries,
  range/subperiod metrics, next-open sensitivity and comparison CSV are atomic.
- Historical best original-only gate is SMA10: 39.57%/-3.67% drawdown. Best
  combined-account gate is SMA11: 83.05769%/-8.10929%, 57 fills, 19 original
  and 2 supplemental attempts blocked. Four range coverage/returns unchanged
  from the 74.63% control: 63.16/20/78.57/90.91% coverage. Improvements arise
  outside the four monitored ranges. Not every block is an avoided loss.
- Nearby SMA10/12 combined returns 68.04/72.29%, so the SMA11 optimum is not
  a broad stable plateau. These are repeatedly seen data, not independent
  validation. No production option or live screening task was changed.
- Verification: 25 research tests and typecheck passed; baseline fills tie out.

## 2026-10-24 trade legend proportions

- Wide 28x6 global legend boxes flattened built-in triangle/diamond symbols;
  the sell legend also lost its series rotation. `buildPriceChartLegend`
  now supplies square custom paths for trade markers, explicit sell direction,
  aspect preservation and 10px icon height while retaining 28px line samples.
  Chart marker positions, trade behavior and indicator line styles are unchanged.
- Verification: browser shows upright buy, downward sell and regular diamond
  legend symbols. Full `npm test` passed: typecheck, 334 unit tests, production
  build and four rendered/source tests.

## 2026-10-24 production SMA12 position overlays

- User requested independent checkboxes on the research workspace and cycle
  validation, then explicitly changed both defaults to checked. Shared controls
  retain each page's explicit choices in versioned localStorage preferences.
- `lib/analysis/sma-position-overlay.ts` owns one account's SMA12 positive-turn
  supplemental entry and daily normalized slope >0.2% deferred exit. Sell
  requests remain pending until protection fails; an original increase cancels
  stale requests. Original signals block supplemental entry, even when unfilled.
- Ordinary single/allocation ranking, applied charts, live allocation guidance,
  shortlist plans, saved plans and screening history carry overlay settings.
  Close-derived overlay intent executes at the following open; native price
  orders retain fill prices and consult only the preceding completed SMA.
  Daily-only guards fail explicitly for legacy intraday callers. Both flags
  absent/off preserve legacy behavior and identity. Full/quick parameter
  libraries and screening/shortcut checkpoints isolate enabled configurations.
- Cycle flags only replay inherited account decisions from existing selected
  winners. They do not rerank winners, change task signatures, modify queued
  requests or restart active jobs. Completed results recompute on flag changes;
  current active runs keep configuration locked. Same-close proxy timing and
  two-bar sequence rules remain intact; holding benchmark stays unmodified.
- Production cycle replay of the frozen 298 selections reconciles all 75
  executed dates, targets and prices against the 0.2% research ledger:
  return 74.62731173084941%, holding 57.32493037836347%.
- Final full `npm test`: typecheck, 333 unit tests, production build and four
  rendered/source tests passed, including rendered default-checked controls.
  Browser confirmed defaults on both pages, independent toggling and
  reload persistence on research; cycle controls correctly lock during the
  user's active 128-session validation run. The active queue was not changed.

## 2026-10-24 supplemental-entry deferred exit study

- User capped guard averages at 12 sessions. `exit-guard.ts` replays the frozen
  SMA12 entry account with 30 guards (SMA7..12 x slope 0/0.1/0.2%, price, both)
  and four explicit scope/discard/hysteresis/persistence diagnostics. Initial
  longer-average outputs are superseded and excluded from the current summary.
- Guarded sell requests remain pending and execute at the first unprotected
  completed close, including skipped screening dates. A fresh original increase
  cancels pending sells. The guard never opens a flat account by itself.
- Coverage-oriented candidate SMA12 slope >0.1% daily: return 71.35%, drawdown
  -12.85%, 63 fills; range coverage 68.42/100/78.57/90.91%; range returns
  9.03/4.42/17.37/10.84%. Unguarded SMA12: 71.82%, -11.76%, 90 fills.
  Slope >0.2% gives 74.63%/-11.83% but only 20% second-range coverage.
  Slope >0 gives 50.98%/-19.46%; discarding protected sells (price + slope)
  gives 47.64%/-25.10%. Do not equate improved rally coverage with better risk.
- Candidate slope-0.1% returns -5.23% in 2026-06-30..10-23, versus unguarded
  SMA12 about +9.25%; all subperiods are reused data, not fresh holdouts.
  Source/model identity, full baseline fill/return tie-out, atomic bounded
  replay and next-open sensitivity are retained. No production or queue change.
- Verification: twenty research tests and `npm run typecheck` passed.
  Tests cover prefix invariance, pending/released exits, new-buy cancellation,
  partial targets, scope and hysteresis/persistence.

## 2026-10-24 SMA flat-account entry comparison

- User requested six overlays on the actual ten-session selections: SMA7..12
  slope turns positive, account empty and no original signal -> full entry.
  `research/nikkei-cycle-rallies/sma-flat-entry.ts` preserves all 298 selections
  and resolves later original signals on the actual inherited holding.
- Primary no-signal definition is no last-two-bar signal on a screening date;
  even an unfilled reduce or a sequence-suppressed signal blocks supplementation.
  Skipped screening dates have no permitted execution signal. No new SMA exit,
  fund split, screening run or production change is introduced.
- Same-source/cost comparison: SMA7..12 total returns respectively
  33.82/33.51/43.62/31.85/36.55/71.82%; drawdowns
  -9.20/-7.22/-9.55/-14.50/-13.74/-11.76%. SMA12 beats historical holding
  57.32% and prior 40/80 prototype 48.89%, but all six miss the second rally.
  Prior 40/80 has 73.68/100/75/100% holding-day coverage of the four ranges;
  SMA12 has 34.21/0/10.71/27.27%. Do not equate coverage with captured price return.
- Signal cache is source/model-verified, all outputs atomic, resource bounds
  and retention reuse the prior frozen study. Baseline fills/return and prior
  40/80 source identity are checked before comparison. Original live tasks,
  production modules and preexisting changes remain untouched.
- Verification: all fourteen research tests and final typecheck passed;
  no-supplement ledger and previous 40/80 input identities reconcile. Repeated
  replay summary SHA-256 is unchanged:
  `b237db3d66a747a265547adea2df1078b4e69d0a0d83577e21c3ec51cecc7ef6`.
  Standalone Chinese comparison report/chart were rendered and inspected,
  including the complete nine-row coverage table. Comparison and trade CSVs
  expose exact interval return/coverage counts and supplemental dates.

## 2026-10-24 configurable cycle monitoring ranges

- Validation settings support zero or more inclusive date ranges, initially
  2025-04-21..2025-06-16, 2025-10-21..2025-11-04,
  2026-03-30..2026-05-12 and 2026-05-20..2026-06-03.
- `strategy-cycle-monitoring.ts` computes held trading sessions divided by
  available evaluation sessions from the selected report's executed rebalances.
  A positive partial allocation counts as held after the close; entries count
  that date and exits do not. State carries into each monitoring range.
  Overlapping ranges are independent. Dates outside the evaluation are excluded;
  actual covered dates and counts are shown, and no-data is distinct from 0%.
- One versioned localStorage preference (`quantscope-cycle-monitoring-ranges-v1`)
  retains edits including an empty list. Changes recompute completed results
  without changing screening task identity, queues or recovery. Invalid date
  drafts show an error until corrected. Storage failures are visible.
- This is a synchronous calculation over the existing bounded evaluation bars;
  no new source, cache, background job or progress checkpoint is required.
  Preferences are one replaceable user configuration, with no TTL/history.
- Verification: typecheck, all 326 unit tests in a serial pass, production
  build and all four rendered/source tests passed. Browser inspection confirmed
  all four default ranges and unclipped date controls. Initial parallel
  `npm test` passed 325/326; the existing launcher process-exit test timed out
  under load and passed unchanged in the complete serial rerun.

## 2026-10-24 ten-session missed-rally study

- Current user objective supersedes the initial fund-split/fixed-switch framing:
  independently screened longer-cycle strategies jointly judge one account's
  rebalances with cycle10. Strategy identity changes over time; the causal
  selection/decision procedure is fixed. See `JOINT_DESIGN.md` and follow-ups.
- The research prototype ranks 22 fixed registered trend tuples over five
  longer windows at each of 298 exact-prefix dates. It uses the shared ordinary
  next-open ranking ledger, durable atomic per-date choices and current target
  evidence on skipped screening days. This is a bounded standalone menu, not
  an exhaustive full-family/combination result presented as such.
- Thirty joint rules were compared. 40/80 plus ADX/DMI direction confirmation
  gives 48.89%/-12.16% under the primary close proxy; cycle10 remains
  33.46%/-8.28%, holding 57.32%/-22.70%. Four-rally candidate returns are
  3.98/4.42/11.37/14.38%. The primary outperformance goal is not achieved.
  Next-open sensitivity is 66.62% versus holding 60.19%; do not mix conventions
  or describe the alternative fills as validated China-product execution.
- Current hero evidence is `output/joint-confirmation-summary.json` and
  `output/joint-confirmed-decision-plan.csv` within the research folder. Earlier
  blended allocation CSV and fixed-switch results are retained experiments.
- Joint selection resume produced the identical summary SHA-256
  `705debe8cfe38e68be0d9a67eb956e2540baa950e5cbcfa269c8c2b208f3fabc`.
  A standalone Chinese reader report and comparison chart were generated in
  the task visualization directory; its date selector was browser-verified
  against the 2026-04-08 40-day Donchian / 80-day ROC joint decision.
- Independent monitoring source/test files appeared in the shared checkout
  during this research. They and all earlier production edits were preserved;
  this study only adds research files and updates its linked documentation.
- Verification: full `npm test` passed (320 unit tests, production build, four
  rendered/source checks); all ten additional research checks and final
  typecheck passed. Prefix causality, single-account decisions and baseline
  ledger equivalence are covered. Raw/archive inputs and preexisting code
  changes are preserved; no live queue or product task was touched.

- Added isolated research in `research/nikkei-cycle-rallies/`; no production
  screening/execution behavior, active task, or queue is changed. Frozen input
  reproduces all 298 decisions and the live 33.46% return / 62 fills exactly.
- Four user-selected rally windows expose inherited empty positions, reversal
  exits, and no recent entry despite a theoretically long selected plan.
  Simply checking signals daily or synchronizing target state worsens the full
  historical return. Thirty disclosed trend/core/weight diagnostics do not beat
  matched-convention buy-and-hold. A 70% EMA10/30 + 30% cycle10 research candidate
  returns 40.80% versus 33.46% for cycle10 and 57.32% for holding, with greater
  drawdown than cycle10. A 504-row CSV makes the candidate targets reproducible.
- Archived 20/40 horizons have 102 verified shared decisions over 185 sessions;
  both miss the fourth rally. They use older ranking model/max-three settings,
  so the report distinguishes this from a same-model period comparison.
- Atomic per-variant output/checkpoint enables idempotent reruns. Inputs are
  bounded, hash-verified, frozen and retained; no scheduled refresh or cleanup.
  Main data/summary and source hashes are in the research folder. The live UI
  still shows separate period reports and has no blended-target trading feature.

## 2026-10-24 incoming-winner execution and chart navigation

- Supersedes the earlier retained-previous policy below: the user selected the
  incoming winner on conflicting signals. Main return and all chart markers
  now use that account; the old-policy return card and comparison copy were
  removed at the user's request. Internal research totals remain reproducible.
- Same-close-model tasks migrate the previous conflict-policy signature to
  `incoming-current-signals-on-conflict-v1`, preserving completed snapshots,
  frozen quick parameters, settings, and queue mappings. The live completed
  298-unit task restored without rescreening: execution +33.46%, benchmark
  +57.32% for the selected complete period.
- Cycle canvas dragging moves the date window in the drag direction. Native
  inside panning is disabled, custom panning starts only inside a plot grid,
  and slider/legend interactions remain independent. Other charts retain
  their default content-pan direction. Live right drag increased window start
  from 55.40% to 58.04% with unchanged width; slider right drag also moved later.
- Regression coverage includes main-policy fills/return, signature migration,
  both pan directions and boundaries, and cycle inside-zoom configuration.
- Verification: typecheck passed; all 320 tests passed with test concurrency
  limited to one; production build and all four rendered/source checks passed.
  Standard `npm test` first hit the pre-existing timing-sensitive coordinator
  intentional-stall assertion under parallel load. No assertions were removed.

## 2026-10-24 opt-in top-three quick screening

- Added a checkbox in research Optimization scope and cycle Validation settings.
  Full future screens collect compact per-family top-ten complete tuples without
  changing ordinary full mode. Quick mode uses three distinct execution finalists
  per family, all covered eligible families, 3 x 3 pair crossings, and the
  previous category's top thirty allocated results for each subsequent layer.
- Shared period-specific IndexedDB libraries match instrument, window, objective,
  costs, filters, exclusions and model/grid versions. Missing profiles are an
  actionable error, never an implicit full traversal or missing-family search.
- Cycle tasks freeze candidate lists and include them in recovery identity.
  Worker and local engine receive identical candidate lists; exact disk restart
  carries compact ranking metadata. Cycle winner compaction preserves metadata.
- Existing queued requests/required protocol and ordinary task identity are
  unchanged. Current legacy results cannot reconstruct all families' top ten;
  the user chose future full screenings as the source and no supplementary rerun.
- Libraries retain the newest full single-window decision for each key (at most
  32 keys). Quick mode cannot train itself. Multi-range/rolling quick mode is
  explicitly unsupported. Historical profile reuse is adaptive research.
- Work is bounded to ten metric rows per family plus the existing finalists;
  IndexedDB writes/eviction are atomic, out-of-order older decisions do not replace
  newer profiles, frozen cycle lists survive pause/refresh, and quick uploads are
  bounded to 64 units per batch. No background monitor or external source added.
- The user reduced quick mode from ten to three tuples per family to avoid
  the 10 x 10 pair-search expansion. Full libraries still retain ten compact
  metric rows for compatibility; quick mode loads and executes only three.
  For the current 53 volume-excluded families this is 159 versus 39,934
  standalone evaluations. Category expansion remains top thirty per layer;
  whole-run time savings remain workload-dependent.
- Layout follows the clarified request: the research checkbox sits below the
  optimization objective; the cycle checkbox is a 40px field below initial cash
  with a 20px checkbox. Quick mode is distinct from ordinary exhaustive mode.
- Verification: typecheck, all 318 unit tests in a serial final pass, production
  build and all four rendered/source checks passed; 17 targeted parameter/local
  child checks passed. Browser checks confirmed both checkbox positions, 40px
  cycle field/20px checkbox, missing-library failure before compute, durable
  profile round-trip/newest-decision protection and bounded tuple replay.
  Default parallel `npm test` intermittently hits the existing coordinator
  intentional-stall timing assertion under the seven-child active workload;
  that suite passed independently, and the final serial suite passed unchanged.
- The active 298-unit batch was never cancelled or restarted. A cost audit
  found 25 units with 53 eligible families and 273 with 57. For a captured
  57-family/five-strategy ordinary checkpoint the projected full evaluation
  count is 665,896; the quick-mode conservative bound is 50,733 (92.38% fewer
  evaluations, not a measured wall-clock speedup). Detailed formulas and the
  aggregate estimate are preserved in `TECH_RESEARCH.md`.


## 2026-10-24 Bollinger visibility and SMA coexistence

- Fixed clipped Bollinger tracks by including finite enabled price-indicator
  line values in the current visible OHLC range. Offscreen values, warm-up
  nulls, pane studies, strategy references, and trade markers are excluded.
- Bollinger boundaries use blue (#2196F3), its basis uses orange (#FF9800),
  and all three remain solid. SMA uses aqua (#00BCD4) and yellow (#FDD835),
  automatically dashed only while Bollinger is enabled. Wider legend samples
  match the actual strokes. No saved configuration or formulas change.
- Palette reference checked on 2026-10-24:
  https://www.tradingview.com/pine-script-docs/concepts/colors/
  This adopts named Pine colors rather than claiming a fixed TradingView
  indicator preset, which users can customize.
- The change is a short synchronous chart calculation over existing bounded
  bars; it adds no network calls, cache, background job, or recovery state.
- Verification: typecheck, all 305 unit tests, production build, and all four
  rendered/source tests pass. Live N225 chart shows complete bands and dashed
  dual SMA; existing pan/zoom, strategy styles, and precision checks pass.

## 2026-10-24 missing 2026-10-23 Nikkei candle

- Reproduced a stale successful Yahoo response ending at 2026-10-22 while the
  official Nikkei source had published the complete 2026-10-23 candle. Primary
  transport success had prevented missing-date recovery.
- Added one shared fixed-primary supplement used by active workspace refresh,
  background shortcuts and the non-strict Yahoo API used by cycle validation.
  Recent date gaps trigger an official tail probe. Two completed overlapping
  OHLC bars must match within 0.01%; only missing completed dates are inserted.
- The primary remains Yahoo; existing OHLC is immutable and supplemental bars
  carry provider/time provenance. Official volume is not invented; later Yahoo
  catch-up can fill zero volume without rewriting prices. Source failures retain
  existing data with a classified warning, and abort propagates normally.
- Runtime work uses the existing incremental refresh and canonical persistence,
  bounded to a ten-bar official query and 10,000 retained bars. No full refresh,
  separate scheduler, durable job, new cache or automatic raw-data deletion is
  needed. Unresolved older gaps remain outside the bounded tail repair.
- Live verification now shows 6,565 bars, 2026-10-23 close 62693.16, primary
  Yahoo Finance, and one officially supplemented bar. The latest API returns
  five bars through 2026-10-23 with per-bar official provenance. Raw tail sample
  and source registry preserve the original public evidence.
- Verification passed: full `npm test` (TypeScript, 303 unit tests, production
  build and four rendered route/source tests), all six targeted supplement
  tests, and `git diff --check`. Live API and browser both show 2026-10-23 while
  retaining Yahoo as the primary. Existing user edits remain intact.

## 2026-10-24 retained previous strategy on conflict

- After testing conflict-only next-day confirmation, the user explicitly chose
  to retain the previous strategy on conflict. Product `updateReturn` and chart
  `rebalances` now use that executed account. `newOnConflictReturn` is the
  incoming-winner comparison; `oldOnConflictReturn` remains a compatible alias
  of the selected executed total. Signal labels come from the actual chosen
  branch. The usual two-bar sequence constraints and same-day close proxy stay.
- Only the conflicting decision follows the previous chronological winner's
  CURRENT-date signals; subsequent screens reconsider normally. There is no
  product wait/three-bar workflow. Task signatures/restoration now require
  `previous-current-signals-on-conflict-v1` as well as the existing timing model.
- `research/nikkei-cycle-conflicts/delayed-confirmation.ts` evaluates the user's
  clarified experiment: hold only on conflict, then use the exact next trading
  session's newly selected winner and its final three bars. Ordinary decisions
  still use two bars. The two-bar-delay control isolates waiting from lookback.
  The existing reduce-before-later-increase hold constraint extends to three
  bars explicitly; due confirmation takes precedence over another day's wait.
- Of 37 conflicts, 27 on 14 dates have a next-session archived winner; ten are
  excluded. At 10 sessions, three-bar delay versus two-bar delay is 0 wins,
  14 losses, 13 ties. Among 13 complete continuous histories with conflicts,
  three-bar delay loses to previous-on-conflict in nine and wins in four.
  Overlap, sparse dates, archived hybrid rankings and missing-next-day selection
  limit the evidence. The detailed report retains all assumptions and outcomes.
- The extension reuses frozen input and has its own atomic hash/model-validated
  group checkpoint and bounded sequential replay. No existing raw data or prior
  study results are removed. The original study reads `newOnConflictReturn`
  explicitly so its historical baseline remains reproducible after this choice.
- Verification passed: full `npm test` (TypeScript, 297 unit tests, production
  build, four rendered route/source tests), all four research tests, and
  `git diff --check`. Both original and delayed studies resume successfully;
  both summary hashes are unchanged after excluding generation timestamps.

## 2026-10-24 Nikkei same-day cycle execution and conflict analysis

- The user clarified that cycle validation is only for Nikkei 225. Japan's
  present 14:30 UTC+8 close permits analysis before China's 15:00 close.
  Completed Nikkei daily closes are an explicitly requested same-day proxy;
  domestic ETF prices, FX/premiums, different holidays and computation delay
  are not modeled. JPX's 2024-11-05 session extension is documented.
- The cycle page now filters non-Nikkei instruments and incomplete/future bars.
  Explicit start/continue merges five latest bars into canonical full history
  through shared primary/fallback validation. Cached restoration remains fast.
- Cycle-only close-price executions reuse the allocation ledger. First and
  final evaluation-day decisions can execute at their own close, with fees,
  slippage, and no earlier signal-day return attributed to new exposure.
  Ordinary backtests, historical optimizer ranking, and engine protocol stay
  unchanged. `nikkei-completed-close-v3` isolates task/report identity.
- The user explicitly retained reduce-then-increase hold and
  increase-then-reduce reduce-only. Same-direction signals use their final
  target; a quiet newest completed bar falls back to the previous bar. All
  signals belong to the final two complete bars of the CURRENT decision prefix.
- The full-period candle chart and establish/increase/reduce/clear markers
  remain. The page also displays opposite-intent count and continuous
  old-on-conflict return. Only conflict dates use the previous chronological
  winner's current signals; later screens reconsider. Policies never select
  branches based on subsequent returns.
- `research/nikkei-cycle-conflicts/` freezes 1,573 exact-prefix-verified archived
  winners across 12 windows and replays both event branches and continuous
  policies. Replacement conflicts: 37 on 19 dates; cross-window conflicts: 73
  on 11 dates. Among 21 complete histories containing conflicts, old-on-conflict
  wins 15 and incoming-winner wins six. The report discloses overlapping
  periods, only 19 distinct replacement dates, archived hybrid rankings, cost
  and inherited-position sensitivities, and unstable five-session subperiods.
  This supports a visible comparison, not a universal automatic policy switch.
- Inputs and resumable group state are hash-validated and atomically persisted;
  processing is sequential with bounded jobs, bars, input bytes, and one causal
  timeline at a time. Existing source caches/research are not modified.
- Verification passed: full `npm test` (TypeScript, 297 unit tests, production
  build, four rendered route/source tests), the research ledger-equivalence
  test, `git diff --check`, and a resumed study run with an identical complete
  summary hash after excluding its generation timestamp. The first page test
  run exposed an obsolete subtitle expectation; it was updated to the new
  Nikkei close-replay title and the full rerun passed.

## 2026-10-24 cycle replacement signal catch-up verification

- Confirmed the rolling report already checks both final trading sessions of
  each selected plan, including yesterday's signal when today has none. The
  existing directional sequence rules and next-open execution remain intact.
- Added end-to-end report regressions for inherited-position liquidation,
  delayed establishment, repeated-signal deduplication, the two-session cutoff,
  actual fill dates, and slippage. The page now explains catch-up explicitly.
- This bounded replay uses the existing task snapshots and needs no additional
  checkpoint, cache, or long-running resource mechanism.
- Verification passed: full `npm test` (TypeScript, 294 unit tests, production
  build, four rendered route/source tests) and `git diff --check`. The initial
  run hit the coordinator restart timing assertion; its isolated six-test
  suite and the complete rerun both passed without coordinator changes.

## 2026-10-18 shortcut display rollback with bug fixes retained

- Verification passed: full `npm test` (TypeScript, 293 unit tests, production
  build, four rendered route/source tests) and `git diff --check`.
- Reverted the new signal-date/operation-price presentation and automatic
  rebalance projection feature at the user's request. The original shortcut
  layout, single/dual per-slot prices, and multi-leg support/risk fields are
  restored. Forecast workers, queue/cache code, feature-only tests, and their
  documentation were removed. No existing research data or user database was
  deleted; an earlier browser forecast cache, if present, is now unused.
- Retained `BacktestPerformance.executedAllocation`. Current shortcut position
  reads actual executed exposure from the same replay as chart fills, rather
  than a newest-close target still waiting for the next open. Inherited
  exposure remains held without a synthetic entry. Existing multi-leg action
  text identifies pending changes explicitly.
- Retained venue-local daily completion in `market/session.ts`. Shanghai's
  midnight must not prematurely complete a still-trading US daily bar.
- `tests/execution-state.test.ts` preserves regression coverage for pending
  entry/exit versus fills, inherited exposure, intrabar allocations, and Japan,
  China, and US closing boundaries. Forecast-specific tests were removed only
  because the corresponding feature was explicitly rolled back.

## 2026-10-03 evidence-based combination-family pruning

- Added `scripts/analyze-screening-rank-pruning.mjs` and
  `npm run analyze:screening-pruning`. The read-only report inspected 215 local
  checkpoint generations and found 27 usable jobs covering 85 current two-
  through six-strategy result categories.
- The evidence rejects aggressive standalone-rank pruning: the median category
  winner needed a rank-22 component and the 90th percentile needed rank 53 of
  57. A 90% family cutoff changed the objective in 8.2% of categories and lost
  as much as 0.284 return percentage points; 80% was worse.
- The smallest tested cutoff with an objective-equivalent stored alternative in
  every category was 95%. The central combination optimizer now ranks completed
  standalone family winners under the active objective and lets only the top
  `ceil(95%)` enter pair and forward-expansion stages. The current 57-family
  registry therefore contributes 55 families to combinations while standalone
  and EMA screening remain exhaustive.
- The screening result model is now version 5, preventing pre-cutoff
  checkpoints and latest-result caches from joining the changed search domain.
  All screening entry points inherit the rule through
  `optimizeStrategyCombinations(...)`.
- This is intentionally conservative: the measured theoretical pair-space
  reduction is about 7.1%, and end-to-end savings will be smaller. The existing
  data does not support a lower universal x or a claim of dramatic speedup.

## 2026-10-02 disconnect-safe cycle execution

- Screening protocol version 8 makes the persisted coordinator queue the owner
  of submitted cycle work. Closing a streaming response no longer writes
  cancellation markers or kills children.
- Strategy-cycle validation no longer translates `beforeunload` or `pagehide`
  into cancellation. A restored task whose status is `running` automatically
  reattaches to its deterministic jobs after the page loads.
- Explicit Pause, reset, and replacement by a different task retain immediate,
  durable batch cancellation. A resumed task with persisted local job IDs will
  not silently fall back to a duplicate browser Worker run while the local
  engine is unavailable.
- Protocol, coordinator, rendered-route, launcher, restart-recovery, and full
  application verification cover this ownership change.

## 2026-09-30 screening-state watcher isolation

- The Vite development server now excludes
  `data/state/screening-engine/**` from file watching. Cycle validation can
  create thousands of request, checkpoint, derived-data, and result files;
  these are runtime state rather than source inputs and previously caused the
  application process to retain a file-watcher handle for each directory.
- Page-close behavior from this historical entry was superseded by protocol v8
  on 2026-10-02; disconnects now preserve unfinished local jobs.
- Cancellation now publishes the in-memory `cancelled` status only after its
  durable marker is written. A status read can no longer report cancellation
  before restart recovery is guaranteed to keep that job dormant.
- The rendered source contract now verifies both the existing Wrangler-state
  exclusion and the screening-state exclusion.
- Strategy-cycle validation now shares the research workspace's device-local
  canonical daily-series fast path. Selection bounds, completed-report replay,
  and a new validation run read the same provider-validated full history from
  IndexedDB before making a remote request; a successful network fallback is
  written back through the canonical profile gate. This avoids repeated slow
  full-history calls without shortening or synthesizing K-line data.

## 2026-09-28 detailed full-period rebalance actions

- The strategy-cycle full-backtest chart now classifies every actual allocation
  change as establish, increase, reduce, or clear from its prior and target
  allocations. This changes chart labels and marker grouping only; execution,
  fills, costs, and the continuous-account report are unchanged.
- The research workspace's `One-click N-day` batch already creates or reuses an
  `N日` strategy folder inside each instrument, saves the best single or
  combination result for the active objective, and promotes that result to the
  top of the matching folder. A 10-session setting therefore produces `10日`.
- Verification passed: strict TypeScript, 289 TypeScript tests, production
  build, four rendered route/source tests, and `git diff --check`.

## 2026-09-26 screening protocol compatibility guard

- The local screening protocol version now has one source of truth at
  `config/screening-engine-protocol.json`. The browser protocol export, Node
  coordinator, Windows launcher, current cycle maintenance script, and tests
  consume the shared value instead of repeating protocol `7` literals.
- Batch result collection now treats non-404 4xx status responses as protocol
  incompatibility and exits immediately. Strategy-cycle validation leaves its
  running state, persists an error, and displays localized instructions to
  restart QuantScope and continue reading completed disk results.
- Project rules, architecture, feature linkage, module patterns, README, and
  debugging guidance now define the protocol compatibility boundary and require
  its clients, health contract, launcher, queue recovery, UI copy, maintenance
  tools, and regression tests to change together.
- Verification passed: strict TypeScript, 289 TypeScript tests, production
  build, four rendered route/source tests, and `git diff --check`.

## 2026-09-26 trend-triggered strategy-cycle validation

- The screening-period control is now an inclusive start/end range with an
  integer step. For example, `8-20` with step `2` evaluates
  `8/10/12/14/16/18/20` independently on the same causal trigger dates. The
  2048-unit guard counts every `period x trigger-date` job.
- Cycle validation now has a maximum combination-size control from two through
  six strategies. The bound is part of task/checkpoint identity and is passed
  through both browser Worker and loopback-engine protocols, so stages above
  the selected size are not computed.
- Completed reports retain one continuous-account return and rebalance list per
  screening period. Period buttons above the full-backtest candlestick chart
  switch its totals and actual rebalance markers without rerunning the task.
- Loopback screening protocol version 7 raises the coordinator batch, status,
  cancellation, and lease boundaries from 512 to 2048 job IDs. The launcher
  rejects an already-running v6 relay so the expanded frontend queue cannot be
  submitted to a stale 512-job process.
- This change is isolated to the strategy-cycle validation product. The main
  research workspace, ordinary backtests, saved-shortcut refresh, and global
  execution policy are unchanged.
- The adjustable screening-period endpoints accept 5 through 491 trading
  sessions; both defaults remain 128 sessions.
- The fixed screening-interval control was removed. Every exhaustive run still
  uses the configured trailing screening window. One screen occurs before the
  evaluation range; later screens occur only for a neutral normalized MA(2), a
  doji, or a candle opposing a trend of at least 30 degrees. Strong-trend
  continuation candles retain the current plan, and the final evaluation bar is
  not submitted because it cannot affect a later fill.
- The replacement plan inherits the continuous account allocation. Only its
  last two bar-to-bar target signals can adjust that position. Increase-only or
  reduce-only sequences use the last target, reduce then increase does nothing,
  and increase then reduce may only reduce. Directional clamps prevent a signal
  from reversing the inherited position.
- The report now contains only `Every update` and the buy-and-hold benchmark.
  Its existing full-period candlestick chart remains and plots the actual
  rebalances of the every-update account.
- Verification passed: strict TypeScript, 287 TypeScript tests, production
  build, four rendered route/source tests, and `git diff --check`.

## 2026-09-25 cycle numeric-input commit behavior

- Strategy-cycle `Screening window` and `Evaluation history (days)` now use the
  same shared committed-number control as the main research workspace. Focus
  selects the existing value, typing edits an independent string draft, blank
  text remains temporarily valid, and blur or Enter performs integer and
  min/max normalization. Escape restores the prior committed value.
- The former eager `onChange` handlers no longer rewrite each keystroke, so an
  intended value such as `1000` cannot be appended to or transformed by the
  previous controlled value while it is being entered.
- Final verification passed: 281 TypeScript tests, production build, four
  rendered/source checks, and `git diff --check`.

## 2026-09-25 dynamic cycle evaluation-history limit

- The strategy-cycle page now loads the selected instrument's daily history
  when its shortcut group is selected and sets the `Evaluation history (days)`
  input maximum to the returned K-line count. Restored values and manual edits
  are clamped to that instrument-specific bound instead of a fixed 512 days.
- The independent 512 optimization-unit safety bound is unchanged. A long
  history can therefore be selected when its screening interval keeps the
  generated decision count within that queue limit.
- Final verification passed: 281 TypeScript tests, production build, four
  rendered/source checks, and `git diff --check`.

## 2026-09-25 six-strategy screening ceiling

- New one-click and cycle-validation screening stops after the six-strategy
  discovery and allocation stages. The seven- and eight-strategy result groups,
  progress labels, allocation candidate inputs, and optimizer stages are
  removed, so a complete optimization now has twelve stages.
- Existing saved A-G, A-H, and A-I plans remain readable and replayable for
  backward compatibility, but fresh screening cannot create a plan with more
  than six strategies. Screening-engine protocol version 6 prevents older
  completed jobs that may contain seven- or eight-strategy winners from being
  reused as fresh results. Screening result-model version 4 likewise rejects
  the previous device-local latest-result snapshot.
- The result navigator and stacked result tables now expose standalone through
  six-strategy categories only. Tests assert that a seven-strategy candidate is
  not produced even when eight distinct strategy inputs are available.
- Final verification passed: 281 TypeScript tests, production build, and four
  rendered/source checks.

## 2026-09-25 full-period cycle trade charts

- The five total-return results remain based on four separate continuous
  allocation accounts and one buy-and-hold benchmark. Each of the four
  accounts now retains its backtest's actual rebalance records, including the
  cost-bearing first-day entry; switching candidates without an executed
  allocation change creates no trade marker.
- The cycle page displays a full-evaluation candlestick chart below the five
  totals. Four buttons select the latest, previous, higher-return, or
  lower-return account's buy/sell markers. The full evaluation range stays in
  place, and the slider/drag controls preserve zoom while switching accounts.
- Chart markers are reconstructed from completed local screening snapshots;
  the persisted task schema and screening coordinator are unchanged. The chart
  adds at most the bounded evaluation-bar series and four bounded rebalance
  lists in browser memory. A focused chart test checks full-period candles,
  first/last markers, direction, and exclusion of out-of-range records.
- Final verification passed: 281 unit tests with test-file concurrency set to
  one, production build, four rendered HTML tests, targeted ESLint, and
  `git diff --check`. The default parallel `npm test` run hit the existing
  coordinator lease-cancellation timing test once under load; that test passed
  alone and in the complete sequential run without changing its code.

## 2026-09-25 interval cycle validation totals

- The strategy-cycle page now accepts one integer screening interval (default
  five sessions) above the screening-window input (default 128 sessions).
  Evaluation history is the actual trading interval; it requires the full
  screening window before its first session. For 504 evaluation sessions and
  a five-session interval, 101 winners are needed: one before evaluation and
  one after each of the first 100 completed intervals. The final four-session
  segment trades from its preceding decision without a terminal screen.
- Each update compares only the current and immediately previous screening
  winners on the same trailing window, with configured commission and
  slippage. Four uninterrupted allocation accounts apply latest, previous,
  higher-return, and lower-return choices; a fifth value is the same-period
  buy-and-hold benchmark. Initial entries execute at the first evaluation
  open and pay costs. Previous winners expire after one comparison round.
- A new task signature keeps legacy completed daily transition tasks separate
  from this interval report. Existing winner-only checkpoints, local-engine
  lease/cancellation, and the 512-screening-unit cap remain in use. No saved
  market data or completed screening results were rewritten.
- Verification: `npm test` passed with 280 unit tests, a production build,
  and four rendered HTML checks. Focused rolling-schedule and replay tests
  cover the first decision, partial final interval, adjacent-winner aging,
  continuous-account ordering, entry-cost benchmark, and incomplete results.
- Remaining risk: the five returns are historical walk-forward estimates for
  one instrument and chosen parameters. The lower-return rule is a hypothesis,
  and optimization/search configuration can affect which plan wins each
  screen. A full fresh N225 screening run was not performed in this change.
- A read-only replay of 71 available five-session winners from the retained
  N225/128-session/total-return task, evaluated 2025-03-12 through 2026-08-24,
  produced benchmark +78.16%, latest +27.06%, previous +12.96%, higher +27.21%,
  and lower +12.80% under 0.03% commission and 0.02% slippage. These results
  verify the new report path on saved data; they do not represent a newly run
  optimizer or an independent out-of-sample confirmation.

## 2026-09-25 shortcut numbering and batch placement

- Each strategy shortcut displays its one-based position within its strategy
  folder or unfiled section. The number reflects the current persisted order,
  including manual drag or keyboard reordering.
- After one-click screening saves and assigns a strategy, it reloads the
  persisted shortcut list and moves that strategy to the top of its matching
  session folder through the existing order API. A failed ordering request
  leaves the instrument pending in the existing local batch checkpoint, so a
  retry can finish the placement without creating a duplicate strategy.
- The one-click button, screening window, and destination folder all use the
  first sample-validation period's trading-session count. For example, changing
  that field from 128 to 96 changes the action to 96 days and targets `96日`.
- The shortcut list remains bounded by the existing 200-record API limit; a
  saved record outside that limit produces an actionable batch failure instead
  of silently claiming it was placed first.
- `npm test` passed: typecheck, 278 unit tests, production build, and four
  rendered HTML checks.

## 2026-09-25 current cycle result retention

- The current completed N225/128-session/total-return cycle task has 356
  decision results (indexes 6169-6524) in batch
  `batch-e9746526351c7207958a7e7b`. Its task record reports 356/356.
- `scripts/compact-current-cycle-results.ts` verified that exact manifest,
  compacted all 356 existing result files to their selected winners, then
  removed 782 other job directories and 19 other batch directories.
- The retained results total 3.83 MiB; the entire screening-engine state
  directory is 6.95 MiB. Exactly 356 readable one-winner `result.json` files
  and their one shared batch directory remain. An interrupted one-result run
  was repeated successfully before the full run, demonstrating idempotent
  resume. The discarded old jobs and unused candidates were intentionally
  removed at the user's request; there is no archive of them.
- A temporary, read-only browser database audit copy remains at
  `%TEMP%/quantscope-cycle-audit-20260925` (about 23 MiB). Automatic approval
  review rejected both attempted cleanup commands. It is outside the project
  and should be removed manually when convenient.

## 2026-09-25 configurable cycle validation and compact results

- The cycle screening window is adjustable from 20 to 491 sessions, defaulting
  to 128; decisions remain daily. Minimum evaluation history and the pair price
  chart span both use `screening window + 20 + 1` sessions. The 128-session
  default therefore requires 149 evaluation sessions and 504 sessions yield
  356 optimization units.
- Cycle job result files now retain only the selected winner and summary
  metadata. Existing full result files remain readable and are not rewritten.
  The legacy daily-schedule signature token is retained so completed 128-session
  tasks with matching settings reuse their existing selection snapshots.
- The pair explorer shows instrument price candles and old/new rebalance points
  through the change day. Future price candles carry no rebalance points.
  Pair navigation sits beneath the chart; 5/10/15/20-session returns remain
  visible above it. A completed task still rebuilds its report on page load.
- Full `npm test` passed: typecheck, 278 unit tests, production build, and
  four rendered HTML checks. A sampled legacy 1,162,028-byte result shrank to
  10,663 bytes (109x) with the winner-only representation.

## 2026-09-24 pairwise cycle-return explorer

- The cycle-validation report now keeps only the new/old return-comparison
  presentation. The daily-winner stability cards, aggregate recommendation
  card, and recent-20 transition list are no longer rendered.
- Each 5/10/15/20-session aggregate reports old and new median returns plus the
  median, mean, range, and sign counts of `new - old`. The same future
  difference is separately summarized for events where the incoming plan did
  or did not beat the outgoing plan over their shared 128-session window.
- Up/down controls traverse every adjacent winner pair. Its cumulative-return
  chart starts `148 + outgoing-winner duration + 1 incoming day` sessions before
  the change boundary and extends up to 20 sessions after it. Old/new rebalance
  arrows appear throughout the pre-change window through the incoming day, but
  never in the appended future section.
- A completed persisted task now fetches its instrument and rebuilds the newest
  report automatically when the page opens; users no longer need to press
  Continue merely to reveal previously completed snapshots. The conditional
  128-session groups have a dedicated visual heading inside every horizon card.
- Conditional 128-session groups now translate the sign of their mean forward
  `new - old` return into an explicit new-strategy-better, old-strategy-better,
  or tied label and show that signed mean. Their zero-dominated median is no
  longer rendered.
- All displayed transition aggregates exclude strict-zero observations. Old
  and new median returns independently omit their zero returns; difference
  medians, means, ranges, counts, and conditional groups omit zero `new - old`
  events. Displayed sample counts therefore mean non-zero-difference events.

## 2026-09-24 maximum-return screening defaults

- Fresh research-workspace intervals and strategy-cycle validation tasks now
  default to the shared `totalReturn` screening objective. Balanced score and
  Sharpe remain available as explicit user selections, and restored workspace
  snapshots retain their previously selected objective.
- Both pages expose the same Chinese objective labels: `综合评分`, `最大收益`,
  and `最大夏普`; strategy-cycle validation also uses the same `优化目标`
  field label as the research workspace.

## 2026-09-24 daily strategy stability and switching evidence

- This historical page-close cancellation design was replaced by protocol v8
  on 2026-10-02. Disconnects now preserve the durable queue; only explicit
  Pause, reset, or task replacement cancels unfinished jobs.
- Daily strategy-cycle validation now requires at least 148 evaluation sessions
  and 148 available bars before scheduling work. This minimum combines the
  fixed 128-session screening window with the longest 20-session forward-return
  comparison; shorter requests are rejected without running screening units.
  The progress total is exactly `evaluation sessions - 148`, so the maximum
  504-session input schedules 356 daily optimization units rather than 504.
- Strategy-cycle validation now fixes its method at one 128-session screening
  on every historical trading day. The update-interval and screening-window
  controls and their interval comparison report were removed.
- Exact consecutive daily winners form stability episodes. Per-plan reporting
  exposes completed episode count, median, average, maximum, and the probability
  of remaining the winner for at least 5, 10, 15, and 20 sessions. The current
  unfinished episode is right-censored rather than allowed to understate the
  completed average.
- Every daily winner change freezes the old and new plan and replays both from
  one cash baseline for 5/10/15/20 sessions with existing next-open/intrabar
  execution, commission, and slippage. Later winner changes do not truncate the
  pending comparison.
- Aggregate complete events now produce an explicit adjustment conclusion:
  switch after the earliest sufficiently supported horizon, keep the old plan,
  avoid both, observe longer, or wait for at least five complete events.

## 2026-09-24 cycle-validation comparison controls

- The cycle-validation price chart now uses the research workspace's two
  rebalance arrows: an upward triangle below the bar for increased allocation
  and a downward triangle above the bar for reduced allocation. Marker color,
  rather than five unrelated shapes, separates correct-direction hits,
  opposite-direction adjustments, missed adjustments, and extra signals.
- The combined window/interval result selector and wide 15-column matrix were
  replaced by independent screening-window and single-update-interval
  selectors. With one update interval fixed, compact cards compare every
  configured screening window and switch the chart directly.
- The chart tooltip still exposes both candidate and retrospective reference
  dates and target allocations, so removing the duplicate reference marker
  layer reduces clutter without discarding event detail.

## 2026-09-24 shortcut-batch stop and resume semantics

- The period-derived shortcut batch previously wrote its localStorage
  checkpoint after every successful instrument. An explicit Stop therefore
  left an ordinary partial checkpoint, and the next 128-day click repeatedly
  opened at a stale saved count such as `4/6`.
- Batch checkpoint version 2 is now explicitly failure-backed. A fresh run does
  not create a resumable batch checkpoint until an instrument fails; subsequent
  successful saves advance that failure checkpoint so retry progress remains
  accurate. Old version-1 checkpoints are rejected.
- Clicking Stop marks the abort as user-requested and immediately removes the
  batch checkpoint. The aborted run also enforces the removal before settling,
  so the next click starts at `0/N`. Each fresh batch also receives a new run
  identity for its underlying screening jobs, preventing a stopped job's local
  engine checkpoint or completed result from being silently reused. A failed,
  non-stopped run retains that run identity and its successful instrument keys,
  then resumes only the pending instruments.

## 2026-09-24 cycle-validation price overlay

- The strategy-cycle validation report now retains the individual candidate
  and next-vintage reference rebalance events behind every aggregate matrix
  cell without changing the existing chronological matching or metric rules.
- A selectable candlestick chart displays only the current evaluation range.
  It overlays next-vintage reference adjustments, correct-direction candidate
  adjustments, opposite-direction adjustments, missed reference events, and
  extra candidate signals as distinct marker layers. The result selector and
  screening-window buttons in the detail table switch the chart cell, and the
  shared ECharts controller preserves zoom and direct horizontal pan.
- Verification passes strict TypeScript, all 273 TypeScript tests (including
  event-detail classification and chart-layer coverage), the production build,
  all four rendered route/API tests, and ESLint with only the two pre-existing
  `MarketWorkspace` unused-function warnings.

## 2026-09-23 cycle progress reconciliation

- The local coordinator can finish cycle jobs out of submission order, while
  the page previously waited for one job at a time. Durable results could
  therefore show more than one hundred completed files while IndexedDB and the
  visible counter remained blocked behind the first unfinished job.
- The coordinator now exposes one bounded batch-status read. The page polls the
  whole pending set, imports every completed result immediately, and persists
  each recovered snapshot idempotently. A chunked single-job fallback keeps an
  already-running version-4 relay usable until it is restarted.
- A second recovery defect could leave an atomically committed `result.json`
  classified as queued or running in coordinator memory, especially when a
  child outlived an earlier relay instance. Status and result reads now
  reconcile against the durable result, stop duplicate work, and expose the
  disk-completed unit immediately. This explained the observed 103 durable
  results versus 46 page-visible completions.

## 2026-09-23 direction-first cycle validation

- Opposite-direction adjustments no longer count as event hits or contribute
  to lead/lag, allocation-error, or timing-hit statistics. They are exposed as
  a separate severe-error count.
- Two- and five-session hit rates now use the full reference-event count as the
  denominator and require both correct direction and timely execution. A late
  rate among correct-direction hits makes delayed action visible separately.
- The ex-post next-vintage account-return gap was removed from the report. It
  replayed a future-selected plan over the preceding segment and therefore was
  an oracle guardrail rather than isolated execution regret.
- Same-direction return regret now uses paired paths from the prior reference
  rebalance through the later compared event date. Both paths share the start
  allocation, reference target allocation, and terminal price; only their
  rebalance execution date and fill differ.
- Verification passes strict TypeScript, all 271 TypeScript tests, the
  production build, and all four rendered route/API tests.

## 2026-09-23 divisor-grid cycle reuse

- Cycle decision dates already use a de-duplicated union and each candidate
  cadence subsamples immutable `(decision, window)` snapshots. A minimum
  interval that divides all larger intervals is therefore the only candidate
  grid computed; a one-session interval covers every integer cadence and the
  five-session retrospective reference grid.
- A regression now fixes both the one-session and five-session divisor cases,
  and the validation page explains the reuse contract.

## 2026-09-23 Windows checkpoint manifest replacement

- A live cycle job completed a checkpoint generation but Windows returned
  `EPERM` while renaming `checkpoint/manifest.tmp` over the existing
  `manifest.json`. The old manifest remained valid and the new section files
  were intact, so no committed checkpoint was corrupted, but repeated child
  restarts exhausted the coordinator retry limit.
- Local screening now retries transient `EPERM`/`EACCES`/`EBUSY` rename
  failures, then moves the prior target to a uniquely named recovery backup
  before publishing the new manifest. A failed publish restores the old target;
  startup can read a surviving backup or completed temporary manifest if a
  process stops inside the two-step Windows replacement.
- Manifest temporaries are unique per process, stale temporary/backup files and
  superseded sections are cleaned up best-effort after commit, and shared
  derived-data publication uses the same replacement primitive.
- Verification passes strict TypeScript, all 269 TypeScript tests, the
  production build, and all four rendered route/API tests.

## 2026-09-23 next-rebalance event validation

- Strategy-cycle validation no longer ranks screening-window/update-interval
  cells by realized return. Screening windows remain configurable and are not
  fixed at 128 sessions.
- Every configured window is screened on a shared five-session historical
  vintage grid. For each interval, the next same-window vintage is replayed
  retrospectively over the preceding segment to form an explicitly ex-post
  reference event stream; candidate refresh policies use only their selected
  causal vintages.
- The initial report showed reference/matched/missed/extra rebalance events,
  direction agreement, signed and absolute session error, two- and five-day
  hit rates, target-allocation error, timing-only return difference in basis
  points, and an ex-post account-return guardrail. The later direction-first
  revision above removed that oracle-like account comparison and tightened hit
  semantics. It still makes no automatic refresh-cadence recommendation.
- The first selected-range initialization is excluded from event scoring, the
  final vintage without a following label is right-censored, and event matching
  is chronological and one-to-one within a ten-session tolerance.
- Verification passes strict TypeScript, all 267 TypeScript tests, the
  production build, and all four rendered route/API tests.

## 2026-09-23 restart-safe strategy-cycle queue

- Root cause of the reported cycle-validation interruption was split across
  two lifecycle gaps: the coordinator kept its submitted batch queue only in
  memory, so a relay restart orphaned durable requests until the page manually
  resubmitted them; page teardown also recorded its polling abort as an
  explicit pause even though the local queue continued.
- Screening-engine protocol version 4 writes an atomic batch `queue.json` and
  per-job cancellation markers. Coordinator startup reconstructs unfinished,
  non-cancelled batch jobs from their durable request/shared-bar files and
  resumes the bounded process pool without browser involvement. A later
  explicit Continue clears cancellation markers through idempotent submission.
- Strategy-cycle teardown now only detaches polling. Only the Pause action
  cancels local jobs and persists the task as paused.
- Full verification passes: strict TypeScript, all 265 TypeScript tests,
  production build, and all four rendered route/API tests. Coverage includes a
  coordinator-recreation regression that proves a submitted missing result is
  regenerated from the persisted batch queue and a cancelled result stays
  dormant.

## 2026-09-23 adaptive multi-CPU screening queue

- The loopback screening coordinator now runs independent queued optimization
  units in parallel Node child processes. Each unit retains its existing exact
  checkpoint, watchdog, restart, cancellation, and process-level heap isolation.
- Pool size is detected at relay startup from Node's available parallelism and
  physical memory. It reserves one logical CPU, reserves 25% of memory with a
  2 GiB minimum, budgets 4 GiB for each active child, and caps concurrency at
  eight. Low-memory and low-core machines safely remain at one child.
- Parallelism is intentionally between independent jobs. Candidate traversal
  inside one screening job remains ordered and single-child, preserving exact
  tie behavior and avoiding duplicated finalist graphs.
- Focused verification covers 8/16/64/128 GiB policy cases and observes a
  two-slot coordinator completing a three-job batch with exactly two children
  active at peak.

## 2026-09-23 unattended strategy-cycle queue

- Strategy-cycle validation now pre-submits every incomplete bounded unit in
  one compact full-series request to the existing loopback screening
  coordinator before collecting results. The coordinator materializes each
  causal prefix and continues its bounded child-process queue without browser
  polling, so a sleeping, backgrounded, or closed tab no longer blocks the
  next unit.
- IndexedDB task version 2 stores deterministic local job IDs alongside
  completed selection snapshots. Reopening and pressing Continue reattaches to
  completed/running jobs; an explicit Pause cancels all submitted unfinished
  jobs, while component teardown leaves them running.
- Cycle batches now retain one immutable columnar bar file instead of one copy
  per optimization unit. Each request stores a causal prefix count, each child
  constructs only that prefix, same-decision windows reuse entry-filter
  derivations, and the browser hashes their shared prefix once. Window-specific
  ranking and combination beams remain isolated, preserving exact results.
- Verification passed strict TypeScript, all 264 TypeScript tests (including a
  three-job no-browser-polling and causal-prefix regression), the production
  build, all four rendered route/API tests, and lint with only two pre-existing
  `MarketWorkspace` unused-variable warnings.

## 2026-09-22 strategy-cycle validation workspace

- Added `/strategy-validation`, reachable from the research workspace. It
  selects canonical instruments already present in the saved-backtest shortcut
  bar and jointly compares configurable screening windows and strategy update
  intervals.
- Every historical screening request receives only bars through its decision
  close. Shared decision snapshots avoid rerunning the same window for each
  update interval, and every matrix cell uses one continuous allocation
  backtest so update boundaries retain holdings and transaction costs.
- The latest task is stored in the
  `quantscope-strategy-cycle-validation` IndexedDB database after every
  completed decision/window unit. Matching market/configuration signatures
  resume without duplicate work. This initial page-driven scheduling boundary
  was superseded by the 2026-09-23 coordinator queue above.
- Input counts are capped at eight windows and eight intervals, and a schedule
  above 512 optimization units is rejected before execution. Default values
  are 64/128/256 screening sessions, 5/10/20/40/60 update sessions, and 504
  evaluation sessions.
- Verification passed the complete 263-test TypeScript suite, four rendered
  route/API tests, strict TypeScript, production build, lint with only two
  pre-existing workspace warnings, and live in-app-browser rendering with
  eight shortcut instruments.

## 2026-09-21 bounded chart memory during screening progress

- Screening progress no longer rebuilds the full price-chart option when no
  strategy backtest is applied. `MarketWorkspace` now passes one stable empty
  trade collection instead of allocating a new array on every progress render.
- The reproduced 6,544-bar N225 run previously redrew the canvas 131 times in
  20 seconds while the renderer working set grew from 376 MB to 449 MB in 47
  seconds. After the stable-input fix, the same progress path produced zero
  canvas clears in 20 seconds and the renderer stayed between 269 MB and 295
  MB across the following 45-second sample. The shared chart boundary also
  covers shortcut-batch progress without running its record-writing workflow.

## 2026-09-21 non-interrupting screening and stable long-history sources

- Changing the visible instrument or opening another saved strategy no longer
  aborts an active one-click screening job. The job retains its original
  immutable series and instrument key, continues through the existing exact
  checkpoint path, and publishes results only when that original instrument is
  visible. Its cached result remains keyed to the original instrument.
- Verified Shenzhen LOF `164824` now uses Tencent `sz164824` raw daily history
  as its fixed canonical primary, with Eastmoney `0.164824` retained as a raw
  verified backup. A 2026-09-21 read-only probe returned Eastmoney `rc=102`
  while Tencent returned valid daily rows and quote `1.264`, matching the
  reported source instability outside the active session.
- Screening checkpoint cadence is now one shared browser/local policy. A
  history of at least 6,000 bars, including the observed 6,680-bar Yahoo
  `^KS11` series, checkpoints every 2,048 evaluations; a machine with at most
  9 GiB physical memory uses the same bound. Candidate order, full history,
  ranking, and resume identity are unchanged.
- Exact current TOPIX remains unavailable from the reviewed no-key paths:
  Yahoo `^TOPX` returned 404 on 2026-09-21, while JPX publishes current exact
  index data through licensed/login services. Search therefore continues to
  disclose `1306.T` as a TOPIX-linked ETF proxy rather than label it as TOPIX.
- Verification passed strict TypeScript, 30 focused market/local-engine tests,
  and all three rendered workspace/API contract tests. Browser interaction,
  production build, and a complete `^KS11` screening run were intentionally
  left for user verification.

## 2026-09-15 default 60-session daily chart window

- A daily price chart now initializes to the latest 60 trading sessions,
  including after opening a saved shortcut. Shortcut metrics, guidance, and
  marker replay continue to use the latest 128 sessions; that calculation
  range no longer expands the initial chart viewport. Explicit screening
  results still focus their selected scoring-window envelope.

## 2026-09-15 Asia-Shanghai current bars and search coverage

- Saved multi-strategy shortcuts now calculate their current position, tactical
  support, core-role state, action, volatility cap, rolling return, and chart
  marker replay from the same latest-128-session range. The reproduced
  `164824` Vortex six-strategy shortcut therefore shows `60%` in both the
  shortcut and applied backtest instead of pairing a current `Opening position`
  marker with a stale `0%` value from the record's creation dates. Verification
  passed strict TypeScript, all 258 TypeScript tests, the production build, both
  rendered/source tests, ESLint, `git diff --check`, and a live browser check of
  the exact saved shortcut. One pre-existing coordinator timing test failed on
  the first full run, then passed alone and in the final complete run.
- `164824` now resolves through a deterministic verified-fund catalog to the
  Shenzhen `0.164824` Eastmoney LOF identity even when an older saved/search
  record says `164824.SHE` and `OTHER`. That compatibility path also replaces
  a short adjusted legacy cache with complete Tencent raw history instead of
  mixing price scales, so both the 2018 start and current Shanghai date recover
  without deleting saved records.
- Eastmoney daily history now tries both reviewed history hosts within one
  24-second request deadline. For SSE/SZSE indexes and ETFs, Tencent supplies
  an independent raw daily-history backup capped at 2,000 requested rows while
  retaining its one-bar latest quote path. A live Tencent `164824` request
  returned 1,971 bars from 2018-08-01 through 2026-09-15 after both Eastmoney
  hosts were independently observed closing TLS connections.
- Verification passed the focused Eastmoney/Tencent adapter and empty-cache
  recovery tests, strict TypeScript, all 255 TypeScript tests, the production
  build, both rendered/source tests, ESLint, and `git diff --check`. Live local
  API checks returned current Tencent history and quotes for `164824` and
  `513800`, plus current Yahoo gold and TOPIX-proxy daily series.
- Yahoo daily normalization now uses the explicit `Asia/Shanghai` display
  date and accepts a validated current-session OHLC snapshot from Yahoo chart
  metadata when the daily row array has not published that date yet. Exchange-
  local calendars still control refresh and close timing.
- Eastmoney-discovered LOF instruments remain on their verified Eastmoney
  identity and request raw `fqt=0` history. This avoids incomplete guessed
  Yahoo histories such as `164824.SZ` while keeping adjustment metadata honest.
- `TOPIX` and its Chinese query alias resolve immediately to the loadable,
  explicitly named `1306.T` TOPIX-linked ETF proxy. Yahoo `^TOPX` was rejected
  because its chart response contained metadata but no usable OHLC rows; the
  free JPX historical workbook ends at 2025 and is not a current feed.
- Verification passed 145 focused analysis tests after the cache-boundary
  addition, strict TypeScript, all 251 TypeScript tests, the production build,
  and both rendered/source tests. Local live checks passed both TOPIX aliases
  plus current daily API responses for gold, `513800`, and `1306.T`. Two prior
  full runs each exposed a different pre-existing launcher timing test; both
  passed individually and the final complete run passed without failures.

## 2026-08-27 strict and recoverable local startup

- The Windows launcher now probes a small versioned `/api/health` response
  instead of repeatedly rendering and buffering the complete workspace during
  cold startup. The browser opens once registered port 3000 begins listening,
  while application readiness retains the existing bounded 60-second window
  plus one 120-second listening grace period.
- Vinext development uses strict-port mode and can no longer move silently from
  the fixed 3000 origin. Before launch, exact executable path and fixed-command
  checks remove current-checkout Vinext processes left on fallback ports without
  touching another checkout or unrelated Node process. Timeout and early-exit
  paths stop the launched process tree, sweep verified leftovers, and report
  incomplete cleanup explicitly.
- Verification passed PowerShell parsing, 18 focused launcher tests, strict
  TypeScript, all 248 TypeScript tests, the production build, two rendered/source
  tests, and `git diff --check`. A live cold start found the reproduced exact-
  checkout PID 9360 on ports 3002 and 9230, removed only that process tree, and
  reached readiness in 26.6 seconds. The new health response and full root both
  returned HTTP 200; the final listeners were the new application on 3000 and
  the existing healthy relay on 3001, with no listener on 3002 or 9230. Existing
  proxy-detection and large-chunk build warnings remain non-fatal.

## 2026-08-27 proportional direct chart panning

- Direct left-button chart panning now maps pointer travel to the current
  visible data-window span instead of the complete-history span. A 100-pixel
  drag across a 1,000-pixel chart with a 20% visible window therefore moves
  that window by 2 percentage points rather than 10, matching the visual
  grab-and-drag rate while preserving synchronized panes and boundary clamps.
- Verification passed all 22 focused chart tests, strict TypeScript, all 246
  TypeScript tests, the production build, and both rendered/source tests. The
  automated local-browser refresh was blocked by the browser URL policy, so a
  fresh automated pointer-drag smoke check was not run in this task. Existing
  proxy-detection and large-chunk build warnings remain non-fatal.

## 2026-08-27 bounded cold-start readiness grace

- The Windows one-click launcher no longer reports a false 60-second failure
  when the exact vinext server process is still alive and port 3000 has begun
  listening during a cold compile. That specific progress signal grants one
  bounded 120-second grace period; a process exit, absent listener, or failure
  after the grace period still terminates startup.
- The reproduced launcher had left the exact-checkout application and relay
  running after its timeout. Both later passed the launcher's native loopback
  probes (`200` with the QuantScope title and protocol-v3 relay health), which
  isolates the defect to the fixed readiness window rather than a crash or
  port-owner mismatch.
- Verification passed PowerShell parsing, all 16 focused launcher tests, all
  246 TypeScript tests, strict TypeScript, the production build, and both
  rendered/source tests. The existing build chunk-size and proxy-detection
  warnings remain non-fatal.

## 2026-08-27 direct chart panning with visible-range auto scaling

- The price chart now supports direct left-button horizontal dragging across the
  plot. The shared chart boundary dispatches one clamped zoom window to the
  inside controller and slider, preserving the visible span and keeping every
  price, volume, and indicator pane synchronized.
- Interactive option updates preserve the live data-zoom controller while
  React recalculates the price-axis range from only the visible OHLC bars. The
  y-axis therefore continues to auto-adjust throughout a drag instead of
  freezing or interrupting the gesture.
- The shared resize observer now coalesces resize work into one animation frame
  and skips unchanged dimensions, preventing the development error overlay that
  previously obscured chart interaction.
- Verification passed with 22 focused chart tests, 245 TypeScript tests, the
  production build, two rendered/source tests, and TypeScript checking. A live
  N225 daily-series drag moved from the current 66,000-74,000 range to historical
  19,000-20,000 prices and back, with the y-axis adjusting both times and no
  browser console warnings or errors. ESLint and `git diff --check` also passed;
  Git reported only the repository's existing LF-to-CRLF conversion warnings.

## 2026-08-27 local startup and relay failure containment

- Windows migration cleanup now treats a non-zero `taskkill` result as a
  recoverable child-exit race only when the exact verified root process is no
  longer alive. A failed cleanup with a still-running root remains a hard
  startup error.
- Application and relay health probes use a bounded native Node HTTP request
  that ignores external proxy settings for their fixed `127.0.0.1` endpoints.
  External Node market requests retain the configured proxy path, preventing a
  proxy-generated loopback 503 from being misclassified as a dead service.
- The loopback market relay contains every asynchronous request failure at the
  HTTP boundary. Before response headers, failures return a stable 502 code;
  after a partial response, the affected socket is closed without creating an
  unhandled rejection.
- Relay headers, request receipt, keep-alive lifetime, and requests per socket
  are explicitly bounded. Existing 32 KiB relay-body and 15-second upstream
  limits remain unchanged; no queue or unbounded runtime history was added.
- Verification passed 18 focused launcher/relay tests, all 244 TypeScript
  tests, strict TypeScript, the production build, two rendered-source tests,
  ESLint, PowerShell parsing, and `git diff --check`. A live Windows cold start
  recovered the reproduced Wrangler no-op hang and reached HTTP readiness in
  25 seconds; an immediate second launch reused it in about six seconds. With
  proxy routing enabled, both loopback probes remained ready, and a malformed
  relay request returned the bounded 502 response while `/health` stayed 200.

## 2026-08-22 eight-strategy ceiling and fresh-run correctness

- One-click screening now stops at eight strategies. The ninth-strategy discovery/allocation stages and result group are removed, reducing optimization from eighteen to sixteen stages while leaving one-through-eight ranking precision unchanged.
- An identical completed screening request reuses its completed local-engine result. The checkpoint identity hashes every OHLCV bar together with the objective and full screening configuration, so appended/corrected market bars, objective changes, or configuration changes force a new calculation.
- Screening result model version 3 invalidates pre-change cached results and checkpoints after removing ninth-strategy screening.
- A completed local-engine calculation now retries transient final-result reads. Optional IndexedDB cache-write failures no longer overwrite a valid completed screen with the generic interrupted-run state.
- The local coordinator now automatically restarts an unexpectedly exited screening child up to three times, resuming from its latest disk checkpoint. Explicit validation errors are not retried, and repeated unexpected exits terminate cleanly instead of looping forever.
- Clicking a saved-backtest instrument group now opens the instrument with no selected or applied strategy and resets the chart to the workspace range. The existing indicator collection remains untouched, while child shortcut rows still restore their saved strategy plans.

## 2026-08-22 lossless screening pipeline completion

- Protocol version 3 uploads one binary columnar request directly from the
  browser, eliminating the remaining full market-bar JSON boundary.
- Exact checkpoints are atomic manifests over independently versioned sections.
  Frozen entry-filter, standalone, pair, and triple sections are reused during
  higher-order stages; filter eligibility arrays are derived once and persisted.
- Polling carries status and telemetry only. The compact outcome has a dedicated
  one-time result endpoint. Price and backtest charts are lazy client chunks.
- Checkpoint cadence adapts to physical memory and bar count, and the dedicated
  child uses a coarser yield cadence than the browser fallback. Candidate
  enumeration, comparison order, objective values, and rankings are unchanged.
- Fault injection proves a stalled child restarts and serves its result. The
  complete suite now contains 241 passing tests.

## 2026-08-22 screening liveness and transport hardening

- Local engine progress IPC is throttled to four updates per second instead of
  emitting optimization and validation JSON for every candidate. The UI now
  shows stage throughput, stage ETA, child resident memory, and exact restart
  count so a long high-order stage is distinguishable from a stalled process.
- A 60-second no-heartbeat watchdog terminates and resumes a child from its
  latest exact checkpoint. Three consecutive no-progress recoveries become an
  explicit error instead of an indefinite spinner.
- Immutable market bars are stored once as a typed columnar `bars.bin`; every
  resumed child reads that file rather than reparsing the original JSON object
  graph. Local checkpoints now cover 8,192 evaluations plus every stage
  boundary, halving full-state serialization/restart frequency without changing
  traversal, rankings, or completed output.

## 2026-08-22 process-isolated local screening engine

- Local one-click screening now defaults to a loopback coordinator attached to
  the existing market relay. It executes the shared core in disposable Node
  children, atomically resumes exact disk checkpoints, and limits all browser
  tabs to one heavy child at a time. The browser Worker remains a pre-start
  fallback when the loopback engine is unavailable.
- The browser transfers bars/settings once. Stages retain only state needed by
  their successors: raw entry state ends after filtering, fill state ends after
  pair allocation, rejected candidates and chart arrays never enter higher
  stages, and the UI receives progress scalars plus compact winners.
- Candidate enumeration, finalist breadth, allocation grids, scoring,
  validation periods, execution rules, and ranking precision are unchanged.
  A process-level regression test forces disk continuation and proves the final
  JSON result equals the original in-process shared core.

## 2026-08-22 core-satellite multi-strategy positioning

- Three-through-nine-leg plans now use the longest average active-run strategy
  as a long-cycle gate for a 60% core position. Remaining positive allocation
  weights form one tactical-support score that selects 60%, 80%, or 100% with
  outer thresholds and inner no-trade bands; an inactive core selects 0%.
- A causal 5-versus-20-bar EWMA true-range ratio caps exposure at 80%, 60%, or
  0% under elevated, high, or severe volatility. Risk tightening is immediate,
  so one rebalance may reduce or clear the position; cap recovery needs two
  consecutive completed bars.
- Full and summary-only timelines share the same state transition rules. Live
  shortcut guidance shows actual position, tactical support, core state, and
  volatility cap. Candidate grids and ranking precision are unchanged.
- Screening checkpoints and the latest-result cache include positioning model
  version 2, preventing binary-consensus results from resuming under this model.

## 2026-08-22 exact high-order finalist maintenance

- Three- through nine-strategy discovery no longer copies and fully sorts the
  retained pool after every evaluated candidate. A keyed index, stable binary
  insertion, and exact worst-member removal preserve the existing unordered-set
  deduplication, global limit, per-primary top-16 limit, objective tie-breaks,
  and traversal semantics.
- The shared screening comparator now short-circuits scalar comparisons instead
  of allocating a comparison array. Higher-order summary replay counts active
  legs and weights in one scalar pass and reuses empty/event constants rather
  than allocating an active-leg array and state objects for every bar.
- Candidate counts, finalist limits, allocation grids, performance formulas,
  execution prices, and displayed results are unchanged.

## 2026-08-22 streaming screening and stage-isolated workers

- Summary-only pair and three-through-nine-strategy candidates now execute from
  a monotonic allocation reader. They no longer allocate complete target,
  signal-event, intrabar-execution, layer-state, or higher-order slice arrays.
- Retained binary strategy targets use `Uint8Array`; price-order fills use a
  sparse index map; selected-window signal horizons are calculated once per
  finalist and reused across allocation candidates. Pair finalist insertion
  uses keyed lookup plus binary sorted insertion instead of repeated full-array
  scans and sorts.
- Screening input bars cross the Worker boundary as one transferable
  `Float64Array` plus times. Ranked results cross back without chart equity,
  trade, or rebalance arrays; applying a result remains the detailed replay
  boundary.
- Multi-range and rolling validation stream normalized-rank totals and retain
  only scalar per-fold rank maps. The selected report candidate is replayed
  after selection instead of retaining every candidate result for every fold.
- Every completed optimization stage atomically writes its compact checkpoint,
  aborts the stage Worker, and continues in a new Worker. This gives each stage
  a fresh JavaScript heap while preserving all candidate/finalist limits and
  exact ranking semantics.


## 2026-08-22 OOM-safe screening and stage continuation

- One-click discovery preserves the complete candidate and finalist limits but
  uses the shared execution engine in summary-only mode. Online drawdown/return
  statistics replace per-bar equity objects, and complete trade/rebalance
  objects are omitted until displayed finalists are materialized.
- Each scoring window reuses one selected-bar and intraday-session execution
  context. Multi-range and rolling fold retention keeps compact performance and
  rank evidence rather than full fold curves.
- The Worker persists versioned optimizer maps and stage ordinals to a
  request-fingerprinted IndexedDB checkpoint. The same request skips completed
  evaluations after interruption; changed inputs cannot reuse the checkpoint,
  and successful completion removes it.
- Pair/higher-order finalist caps, candidate traversal, fill semantics,
  objective comparison, and displayed detailed results remain unchanged.

## 2026-08-21 latest screening result persistence

- The latest completed one-click screening result is stored as one device-local IndexedDB record and restored after a page refresh for the same canonical instrument and interval. Starting another screening clears the prior temporary record, and successful completion writes its replacement; server-side compact audit archives remain unchanged.
- Four- through nine-strategy candidate replay now builds indicators and raw strategy targets once over full history for causal warm-up, but slices each combination execution to the selected scoring window plus one preceding bar. A backward consensus-state resolver preserves the exact inherited opening state without rebuilding thousands of out-of-window equity points for every candidate. Full-history replay equivalence covers return, Sharpe, drawdown, and trade count.
- Strict TypeScript and the complete `npm test` workflow verify the implementation.

## 2026-08-21 multi-strategy search/display diversity split

- One-click screening now retains the top 16 intermediate candidates for each Strategy A primary inside every three-through-nine-strategy level. Triple parent-pair selection, triple finalists, and higher-order forward-expansion finalists all use this per-primary search pool, with an internal level bound of the registered strategy count multiplied by 16 (912 with the current 57 strategies).
- Final results are handled separately: each three-through-nine-strategy category is globally objective-ranked, retains at most five rows for the same Strategy A primary, and retains at most 30 rows overall. The existing one-best-result-per-unordered-strategy-set rule remains in force. All retained discovery candidates still receive complete allocation replay, so the display cap cannot hide a candidate before weight optimization. Single- and dual-strategy results, candidate backtests, allocation searches, and consensus thresholds are otherwise unchanged.
- The complete `npm test` workflow passes: strict TypeScript, all 231 TypeScript tests (including 135 analysis tests and the Windows launcher suite), the production build, and both rendered/source checks. Repository-wide ESLint and `git diff --check` also pass.

## 2026-08-21 compact multi-strategy presentation and chart-window fix

- Three-through-nine-strategy plans use one concise `Strategy A name · N-strategy consensus` presentation in the chart header, shortlist, saved shortcut, and result table. Full component names remain in hover/accessibility text. Multi-strategy result rows use one combined strategy cell with at most two gray lines of remaining names, omit per-leg parameters and role badges, and collapse weights to Strategy A plus the aggregate remainder; single and dual rows remain detailed.
- Strategy application, screening-result application, and saved-shortcut opening no longer add strategy-declared indicator panes or restore stored indicator snapshots. Indicator visibility and parameters are exclusively controlled by the manual indicator UI; persisted shortcut indicator JSON remains backward-compatible provenance.
- `PriceChart` now initializes ECharts' real data-zoom window from the same applied focus window used for the visible OHLC y-axis range. This removes the x/y window mismatch that could clip or omit candles after applying a screening result.
- Strict TypeScript, repository-wide ESLint, 25 focused chart/indicator tests, the production build, and both rendered/source tests pass. The full TypeScript suite reached 230/231 twice; its only failure was the pre-existing Windows launcher process-cleanup test when `taskkill.exe` reported that an already-exited child could not be terminated. That test passes 14/14 when run independently.
- A local browser check loaded 6,524 N225 bars, confirmed no document or result-group horizontal overflow, kept the chart at 544 pixels with zero lower panes after applying the KDJ strategy, and reported no console warnings or errors.

## 2026-08-21 six- through nine-strategy screening and shortcut guidance

- One-click screening now continues through bounded six-, seven-, eight-, and nine-strategy forward-expansion stages. The shared plan/result/persistence/archive contract is A–I, each one-through-nine category retains at most 30 independently ranked results, and higher-order allocation searches cover 126/84/36/9 positive tenth-based compositions for six/seven/eight/nine legs.
- Three-through-nine-leg plans remain one weighted-consensus decision rather than independent sleeves. Saved shortcuts for these plans no longer render per-leg entry/exit prices; they show current 0%/100% consensus, active strategy count and weight, current action, and the 40%-weight/count exit condition. Single- and dual-strategy shortcut price guidance is unchanged.
- A selected backtest range can legitimately inherit an already-open position, so its first in-range transaction may be a clear. Allocation backtests now expose this inherited state as a chart-only `Opening position` marker at the first selected open. The marker creates no rebalance, cost, trade, or performance change.
- Repository-wide ESLint, strict TypeScript, all 232 TypeScript tests, the production build, and both rendered/source tests pass. The previous ECharts module-registration `use` false positive remains resolved through the `registerEChartsModules` import alias.
- A local browser check loaded the existing shortcut data and confirmed that a three-strategy row renders `Current consensus / Support strength / Current action / Exit condition`, while single/dual rows still expose current allocation and entry/exit price fields.

## 2026-08-21 four- and five-strategy screening update

- One-click screening now continues through bounded four- and five-strategy forward-expansion stages. It expands retained winners from the preceding strategy count instead of exhaustively enumerating every catalog tuple, rejects identical/equivalent legs, and independently retains the top 30 results for each of the one-, two-, three-, four-, and five-strategy categories.
- Three-to-five-strategy allocations are judgment weights rather than independent tradable sleeves. Screening evaluates all positive 10% compositions once: 36 three-leg, 84 four-leg, and 126 five-leg candidates. A strict strategy majority plus 60% weighted support opens one 100% position; support at 40% or less, or an insufficient active-strategy count, closes it; the intermediate band holds the prior state and avoids partial rebalancing.
- Result panels are five vertically stacked disclosures with independent numbering. A–E selections, allocations, filters, archive keys, saved plans, linked indicators, shortlist membership, chart application, and live allocation replay now share the same five-slot contract while legacy A/B and A/B/C data remains valid.
- The misleading repository-wide ESLint failure was removed by aliasing ECharts' module-level `use` registration function to `registerEChartsModules`; the three unused test imports were also removed. Repository-wide ESLint, strict TypeScript, and all 231 TypeScript tests pass.
- The production build and both rendered tests pass. A local in-app browser confirmed exactly five ordered result disclosures, no document-level horizontal overflow, independent four-strategy collapse from 164 pixels to 44 pixels without changing sibling panels, and no console warnings or errors.
- The weighted-consensus update preserves direct single-strategy and hierarchical dual-strategy execution. Regression coverage confirms binary three-strategy consensus targets, no rebalance while consensus remains valid, 36/84/126 three-to-five-leg weight compositions, and independent top-30 retention; strict TypeScript, repository-wide ESLint, all 231 TypeScript tests, the production build, and both rendered tests pass.

## 2026-08-21 screening result layout update

- One-click screening results render as full-width, vertically stacked disclosure groups. Each group is independently collapsible, preserves the optimization engine's existing order within that category, and numbers its own rows from one.
- The original three-panel layout passed strict TypeScript, all then-current tests, the production build, rendered/source tests, and browser interaction checks. The later five-strategy update supersedes its panel count and resolved the previously documented ESLint findings.

## 2026-08-20 strategy and screening update

- The registry contains 57 strategies and 40 indicators. Twenty strategies from the supplied TradingView collection are causal, long-only, registered in finite parameter spaces, and included in standalone and combination one-click screening. Ten indicators were added through the shared community registry, including an explicit-date Anchored VWAP and a developing Session Volume Profile.
- S/R Break matches the supplied TradingView logic: confirmed 15/15 pivots, EMA(5)/EMA(10) volume oscillator with a configurable default threshold of 20, close crossovers, and both wick markers. Levels begin only on the confirmation bar.
- One-click screening labels multi-range mode as `Multi-period screening`, with two default explicit date intervals and `+`/`-` controls for two through eight periods. Every interval is replayed independently and contributes an equal-weight normalized rank. Applying a screening result replays chart trade/rebalance markers only in that method's exact window or independent windows and focuses their envelope. Opening a saved shortcut instead uses the latest 128 trading sessions. Mode and ranges persist locally.
- HalfTrend, QQE Mod, and Schaff Trend Cycle are price-only strategies and remain available when a market has unreliable volume. The initial parameter traversal is 45,196 candidates with reliable volume and 39,934 candidates without it; only MFI Reversal, VWAP Reversion, Volume-Weighted MACD, and MFI + RSI are excluded in the latter case. Pair and allocation stages extend the displayed total after standalone optimization.
- Combination screening retains the top three final parameter sets per strategy and evaluates all `3 x 3` parameter crossings for each of the 1,594 non-equivalent strategy-ID pairs. It keeps the best parameter crossing per pair before replaying all ten allocation/tactical-mode choices, so a second- or third-ranked standalone parameter set can win through complementary pair behavior.
- Combination screening continues from the best 128 pair parents through bounded three-, four-, and five-strategy discovery. Retained multi-strategy sets replay positive 10% judgment-weight compositions once and each strategy-count category keeps its own top 30.
- Strategy plans, saved shortcuts, screening archives, linked indicators, chart overlays, and live allocation guidance accept optional Strategy C–E while continuing to parse legacy A/B and A/B/C JSON. Pair rows retain core/tactical roles; three-to-five-strategy rows label the longest-duration leg as the primary reference and all other legs as supporting judgments.
- A post-screening comprehensive assessment combines up to five diversified standalone, pair, and triple shortlist candidates. Rank-weighted previous/current target allocations produce a rounded 10% target, buy/add/hold/reduce/sell/wait action, agreement, and confidence card above the existing recommendation shortlist.
- Shortcut matching requires the same strategy count and complete ID set, so a standalone strategy never matches a saved combination containing it. Combination names put the detected relative long cycle first.
- Chart action copy uses `清仓` consistently. The separate header advice card is removed. Every shortcut preserves its rolling return and shows muted labels with red/green current allocation plus separate A-long/B-short entry and exit values; added time and redundant adjustment metadata are not rendered.

## Current status

The daily-only index, ETF, and commodity-proxy QuantScope version is
implemented and buildable. The 1-minute workspace was removed on 2026-09-16;
the market API now rejects non-daily intervals, while legacy non-daily saved
records remain readable and reopen against daily bars.

Completed canonical daily bars are immutable even when a refresh comes from
the same provider. Later refreshes may backfill missing published volume but
cannot rewrite completed OHLC, preventing closed 164824/Tencent charts from
oscillating between repeated responses.

The screening panel now includes a period-derived batch button (128 days by
default). It serially screens all saved shortcut instruments across indexes,
ETFs, funds, and commodity proxies, checkpoints each
completed instrument, saves the current-objective winner, and assigns it to an
instrument-local `N日` strategy folder. Shortcut index drops now bubble past
nonmatching nested record/folder targets. The loopback relay sends reviewed
Eastmoney and Tencent hosts over a bounded direct no-proxy connection while
leaving foreign-provider routing unchanged.

Verification on 2026-09-16: typecheck, production build, and all three rendered
workspace/API contract tests pass. The complete unit-test phase passes 260 of
261 tests; the unrelated Windows launcher 1 ms grace-period timing test fails
in the full parallel run but passes when rerun alone. A live Tencent CSI 300
request also returned HTTP 200 with an intentionally unusable proxy configured,
confirming the direct domestic route; Eastmoney reset its direct probe.

Implemented:

- The Windows launcher captures and relays local D1 migration output. When
  Wrangler prints the exact no-pending-migrations terminal message but leaves
  its process tree alive, the launcher waits a two-second exit grace period,
  closes only that completed migration tree, and continues startup. Normal
  success and failure exit codes are preserved; a timeout without the terminal
  success message still fails startup.
  Minute zoom keeps at least 120 bars visible when that many are available,
  preventing an accidentally over-zoomed sparse K-line view; daily zoom is
  unchanged. While the venue refresh policy is active, a newest-bar lag of
  three minutes or more is displayed as a prominent estimated minute-data
  delay. A live N225 check at 2026-08-14 09:55 +08:00 measured exactly 15
  minutes between the latest bar epoch and the Yahoo fetch time.
  Combination names in the strategy lab, applied chart summary, and saved
  shortcuts place the selected-range relative long-cycle strategy before the
  relative short-cycle strategy. Saved shortcut names wrap to additional lines
  instead of being truncated by the return column, and their recent-validation
  badge sits immediately to the right of the return in the shortcut row's
  upper-right control area, above the folder selector and delete action. The
  strategy name keeps the complete main-content column across both grid rows;
  the outcome column uses 12 pixels of that column's reserved right padding so
  return values are not left-clipped. Validation-state changes cannot resize
  the name or introduce a horizontal scrollbar. One-click screening result
  tables and recommendation cards retain their existing A/B presentation.
- Screening result tables use compact six-column and eight-column fixed layouts
  without an internal horizontal scrollbar and remain side by side above 1,120
  pixels with a 45/55 single/combination width split. Standalone results omit
  redundant horizon badges; combination badges
  use concise `Long cycle` / `Short cycle` labels. Shortcut badges compare only
  saved plans for the screened canonical instrument and interval. A combination
  is labelled only when both strategy IDs match the same saved plan; one shared
  component is insufficient. Badges show only `Added` or `Same type exists`,
  while the complete parameter comparison remains in the hover title.
- Recent-validation badges use the compact labels `Recent valid`, `Evidence
  differs`, `Recent weakness`, and `Insufficient sample`. A shared note below
  the screening tables explains the execution-count and multi-window evidence
  rules, while hover titles retain the result-specific figures.
- The chart runtime registers only the line, bar, candlestick, and scatter
  ECharts modules plus the components used by the workspace. The production
  client workspace chunk is 843.2 KiB, down from 1,364.1 KiB before modular
  registration (38.2% smaller). Initial mount also skips the search endpoint
  while the search query is empty, leaving market history and saved-plan
  loading as the only startup requests.
- Index/ETF/commodity-proxy search with individual-equity filtering. A local
  major-index catalog resolves common exact symbols before network discovery;
  public remote discovery is time-bounded and credentialed providers are used
  only when public discovery returns nothing.
  Deterministic Eastmoney entries expose gold, silver, WTI crude, and copper.
  Yahoo exact-symbol results are preferred during de-duplication.
- Canonical market profiles prefer Yahoo for N225, SOX, the four continuous
  commodity proxies, Yahoo-discovered instruments, and verified Yahoo
  index/ETF mappings. Unsupported mappings retain their selected provider.
  The official Nikkei CSV, Eastmoney, Nasdaq, optional server-token EODHD,
  Twelve Data, Financial Modeling Prep, AllTick, Alpha Vantage, Marketstack,
  Zhitu, Tencent, Juhe, and FRED are stored independently where supported. Gold adds
  FMP `GCUSD` and AllTick `GOLD` behind mandatory overlap/error validation.
  The supplied FMP credential returned current daily gold OHLC through
  2026-07-28. The initial AllTick token returned HTTP 401; its replacement
  seven-day trial token returned current `GOLD` daily bars through 2026-07-28
  and carries an explicit 2026-08-04 15:04:45+08:00 expiry. Expiry is checked
  before network access.
  During a
  preferred-source
  outage, identity-verified or overlap-validated backups may recover an empty
  chart or append missing dates without rewriting confirmed canonical bars.
  Empty-chart recovery promotes the selected verified backup, while equally
  fresh candidates prefer the longer history. Backup source-health promotion
  requires at least 500 observed historical bars.
  For SSE/SZSE indexes and ETFs, Tencent raw daily history may recover an empty
  canonical base under verified identity, while a latest-only Tencent session
  quote may append one in-memory current-day bar. If Tencent fails, the credentialed Juhe
  stock product is the final quote-only candidate and is protected by a
  50-call Shanghai-day gate. A live strict `513310` request returned a complete
  2026-07-28 Juhe bar. Juhe is skipped after a valid Tencent quote, is excluded
  from routine audits, cannot recover an empty chart, and cannot become the
  effective primary. The newest valid temporary quote is
  retained across a later transient all-source failure and is cleared only by
  a newer accepted quote, a completed canonical bar, or an instrument switch.
- A canonical browser database stores canonical series, provider-isolated
  history/latest snapshots, close-only references, SHA-256 fingerprints, and
  lifetime counters plus bounded recent attempt samples, rolling 7/30-day
  availability, and persistent demotion state. Three consecutive failures or
  a 7-day rate below 80% can demote a source. A backup needs at least 95% over
  seven days, 90% over 30 days, enough observations, and valid source quality;
  the configured primary is probed hourly and needs seven stable days before
  restoration. Completed canonical dates are immutable; only an
  unconfirmed final primary bar may be replaced, and newer primary dates may be
  appended. A same-instrument locked record remains readable across a deliberate
  configured-primary change instead of being discarded.
- Shared global exchange resolution maps major overseas index codes to their
  actual venue and close session. Eastmoney market `100` is no longer
  interpreted as JPX for every overseas index.
- The Windows local launcher always ensures a loopback-only,
  provider-allowlisted relay. Development mode defaults to its fixed localhost
  endpoint even when the launcher did not inject a binding. Proxy addresses and
  credentials remain outside application bindings and logs. One runtime-port
  registry covers the application on 3000 and relay on 3001. On every start,
  the launcher reuses healthy services and stops an unhealthy listener only
  after its Node command, current-checkout path, and role arguments are
  verified; unrelated listeners remain untouched.
- A one-instrument, daily-only workspace. Intraday selectors and requests are
  no longer user reachable. The workspace keeps the current indicator and
  applied-strategy selections but
  aborts old screening results and reloads market state on a tab switch.
  Daily multi-source recovery/reference audits remain daily-only; minute mode
  uses the configured primary and exposes missing provider volume rather than
  synthesizing it. Yearly rolling validation is disabled for bounded minute
  history; period and custom-range screening remain available in K-line units.
- New strategy-lab sessions default to a one-way commission of `0.05%`
  (five ten-thousandths). Saved shortcuts retain and restore their explicitly
  stored commission instead of being migrated to the new default.
- Authoritative adjustment metadata on every `MarketSeries`: Eastmoney
  `fqt=1` is adjusted, valid EODHD daily OHLC is scaled by
  `adjusted_close / close`, valid Yahoo daily OHLC is scaled by
  `adjclose / raw close`, Yahoo intraday is raw internally, and Nasdaq is a raw
  daily fallback. Volume is never rescaled. ETF adjustment covers
  distribution/split price gaps; index price-versus-total-return methodology
  remains provider-defined. Yahoo normalizes provider `previousClose` to the
  returned scale and resets it to the preceding normalized bar after slicing.
- Every initial, latest, fallback, and temporary-quote merge deduplicates and
  orders bars by canonical trading `bar.time`; provider timestamp epoch/unit
  differences can no longer reorder adjacent daily sessions.
- Candlestick/line switching, provider volume, shared zoom, and an ordered
  visible collection drawn from 40 indicators.
- Volume coverage is measured independently from price validity. When fewer
  than 90% of at least 20 bars have positive volume, VWAP/MFI/CMF/OBV and their
  dependent strategies are unavailable; missing volume is never synthesized
  or spliced across sources or dates. A same-source refresh repairs an older
  cached zero for the same date without changing locked OHLC. One recent
  isolated gap can trigger one full-history repair attempt per browser session.
- Metadata-driven settings for every parameterized indicator, including SMA,
  with six controlled category menus that keep only one open, per-item outline
  stars, a separate-row device-local favorites strip, separate
  focused/visible/favorite state, per-indicator parameter memory, all-hidden
  defaults, and one-click default restoration. The default favorite
  is an independent confirmed-pivot support/resistance-break overlay; it becomes
  visible only after right-side confirmation, never backpaints, and breaks each
  plotted level at a pivot-value change so separate horizontal levels are never
  joined by diagonal or vertical connectors.
- Controlled numeric fields keep an editable text draft, select all on focus,
  allow a temporary blank value, and commit a finite clamped value only on blur
  or Enter. Escape restores the last committed value.
- KDJ exposes period, K smoothing, and D smoothing with `9 / 3 / 3` defaults.
  Legacy stored configurations that contain only period inherit the two new
  defaults without losing their saved period.
- A reusable community-analysis intake layer under `lib/analysis/community/`
  records provenance/compatibility, owns community IDs and parameter defaults,
  and merges them into the main registries. The first batch adds nine
  indicators and three long-only strategy ports from user-provided TradingView
  files. Catalog coverage, aligned output, and input-prefix causality are
  tested; the MTF support/resistance port currently uses the chart timeframe.
- Overlay indicators on the price axis and one lower pane per visible pane
  indicator, with price, volume, and all panes sharing zoom. Every configured
  series name reports its actual parameters in a scrolling legend.
- Independent indicator and strategy state so strategy changes preserve the
  visible studies while actual strategy buy/sell fills remain overlaid.
  Applied strategies may explicitly declare an exact lower-pane study; those
  derived studies are merged into chart output without mutating manual
  indicator preferences or shortcut snapshots.
- Buy markers anchor below the matching candle low, while strategy and
  range-exit markers anchor above the matching candle high; all receive
  outward pixel clearance and never cover the candle body or wick. Marker and
  strategy-reference overlays are pointer-silent, and explicit inside-zoom
  drag settings keep single- and dual-strategy price charts equally pannable.
- Pure, bar-aligned strategy price references for 21 price-based strategies.
  Price-order references reuse their exact order plans; all returned references
  render as thin 1.5-pixel dashed lines matching the ECharts legend, all-null
  references are omitted, and strategies without a continuous price reference
  return no lines. Long/short entry and exit references use four localized
  action labels. Technical Ratings exposes the EMA-20 and SMA-50 references
  used by its price votes.
- Cacheable full preferred history plus uncached five-bar refresh on page open,
  manual refresh, and a visible-page session policy: known regular venues use a
  five-minute cadence until 30 minutes after close, COMEX/NYMEX proxies follow
  their Sunday-Friday Globex session plus daily maintenance break, and unknown
  venues use 15 minutes. Focus and visibility obey the same minimum interval.
  A primary failure immediately
  tries ordered backups; only an all-source failure starts 15-, 30-, then
  60-minute backoff. Credential-free audits run every 30 minutes, and
  credentialed backups remain recovery-only.
- The all-shortcut refresh runs after the manual header action and after an
  scheduled active-market refresh cycle. It de-duplicates unique inactive
  instruments, processes them sequentially, reports progress plus
  updated/retained counts, and enforces a 60-second cooldown.
- Provider failures are classified without exposing response bodies or
  credentials. A 401 or explicit invalid/expired-key response is recorded as a
  credential issue; 403 access denial, 429 quota limitation, missing
  configuration, and generic upstream failure remain distinct states.
- Every stored credential now has a dated allowance note in `.env.example`,
  `SECRETS.md`, and `DATA_SOURCES.md`. Officially published free/starter
  baselines are kept separate from dashboard-specific entitlements. Small
  runtime gates are applied only where QuantScope consumes the known bucket;
  unused keys are not probed merely to discover a plan.
- The guidance card labels its timestamp as a market-data fetch and includes
  the actual series source, keeping successful backup freshness separate from
  preferred-source health.
- Controlled migration from the legacy 32-series provider cache requires at
  least 120 bars, the same canonical key, and the exact configured primary;
  fallback-provider legacy rows cannot seed the canonical chart.
- Shared daily history beginning at 2000-01-01 with a 10,000-bar safety cap.
  Every active daily adapter translates the boundary to provider-specific date
  parameters or documented provider limits; later-listed instruments begin at
  their first available bar. Internal intraday requests retain smaller caps.
- A current-bar long-only strategy guidance card that reports the target
  allocation plus increase, reduce, hold, or remain-flat state from the newest
  available provider bar.
- An explicit green-up/red-down legend. Selected-range backtests inherit an
  already-open position without a transaction or cost and mark any ending
  position to the final close without a forced exit.
- Dedicated sky-blue buy and orange sell markers with light borders and dark
  label backgrounds, visually separated from green-up/red-down candles.
- A directly draggable 22-pixel chart timeline selection with visible resize
  handles; parent rerenders and applied screening results preserve the active
  zoom window for the current instrument and interval. Periodic market option
  updates replace only variable axes, grids, zoom, and series components, so
  an active crosshair price tooltip is preserved across a refresh.
- Thirty-seven non-built-in strategies, independent equivalents of all 20 official
  TradingView built-in strategy templates, including twenty-three community-script ports.
- Explicit horizon metadata for all 57 strategies: 33 long-horizon trend,
  breakout, channel, and persistent-momentum rules plus 24 short-horizon
  reversal, candle, pivot, oscillator, and volatility rules. Standalone
  results expose this descriptive metadata; Strategy A/B selectors and
  combination eligibility do not use it as a filter.
- Date-range manual-history backtesting with one shared hybrid execution
  contract. Close-confirmed targets fill at the following open. Donchian
  Intrabar, Supertrend Stop, Channel BreakOut, Momentum, Parabolic SAR, Pivot
  Reversal, Price Channel, and Volty Expan Close build causal price orders from
  completed data and fill on the touched bar, using the open for gaps. Greedy
  executes open-only gaps at that open and completed-candle direction at the
  following open. A target already active before the selected start initializes
  exposure at the first selected open without a transaction or cost. If a flat strategy's entry and exit
  stops are both touched on one daily bar, the engine records the conservative
  entry-then-exit sequence. Selected-range initialization for price-order
  strategies is derived from the full executed order timeline rather than a
  separate close-target approximation.
- Long-only positions, costs, metrics, equity, drawdown, and chart-level
  buy/sell markers derived from actual fills. A single-strategy entry executed
  inside the selected range remains visible while the final position is still
  open; inherited opening exposure still has no synthetic entry marker.
- Recent-effectiveness badges show the exact latest-30-session execution count
  against the two-execution minimum instead of a context-free insufficient
  label.
- An optional cross-strategy SMA/EMA/WMA slope entry-filter subsystem shared by
  the strategy lab, stability diagnostics, one-click standalone/combination
  screening, applied metrics, live guidance, and saved shortcuts. Manual
  Strategy A/B drafts remain off by default with an EMA(7), 0%/session preset;
  the one-click screening draft starts enabled so its eligible families compare
  EMA(5-8). The filter uses normalized causal slopes, delays only new buys, and
  never forces a sell. Lab and screening drafts are independent; Strategy A and
  Strategy B retain and replay independent filter states. One-click screening
  first ranks the complete unfiltered grid. It then
  compares EMA(5), EMA(6), EMA(7), and EMA(8), at a 0% slope, only for each
  explicit trend/breakout/momentum strategy family's top 60 unfiltered
  parameter sets. Channel BreakOut and Price Channel are included; reversal
  and candlestick families remain unfiltered.
- Nearby-parameter sensitivity diagnostics that perturb one parameter at a
  time to the adjacent configured domain value, require exact finite in-range
  parameter keys, integer lookback/count/vote values, and cross-field
  validity, omit invalid combinations, and never choose or apply parameters.
  Workspace inputs use the same integer-key semantics and round those values
  to an integer of at least one while preserving decimal price/level inputs.
- Stability evidence with explicit invalid-parameter, observation, trade, and
  nearby-variant reasons. Stable/sensitive requires 120 selected-range daily
  observations, two completed base trades, and a valid nearby variant before
  applying the inclusive 75% return-sign, 15-point return-range, and 10-point
  drawdown-deterioration thresholds. Regimes retain causal pre-range warm-up.
- Exhaustive parameter-grid optimization across all 57 strategies, with all
  45,196 valid finite strategy-parameter combinations, no sampling control,
  cancellation, and best-per-strategy result retention. A dedicated module Web
  Worker owns the full optimizer and its run-local target/indicator caches, so
  progress and cancellation messages do not depend on main-thread calculation.
  Rolling channel and Ichimoku extrema use shared linear-time monotonic queues,
  price-order candidates build only their authoritative order-derived target,
  and the Worker yields every 128 evaluations instead of paying a timer-task
  boundary after every eight.
  Screening
  builds targets from complete loaded history and restricts only performance
  metrics to the selected range. The EMA phase retains compact Top-60 metrics;
  each strategy's top three final parameter sets keep complete execution state
  for pair replay.
- Three deterministic screening objectives: balanced score, maximum return,
  and maximum Sharpe. Return/drawdown and minimum-drawdown targets are not
  exposed. Balanced score is `0.45 * current-window return +
  8 * clamp(current-window Sharpe, -5, 5) + 0.35 * current-window drawdown`.
  Trade count is excluded from rank and remains only a displayed metric and
  candidate/observe-only condition.
- A unified strategy plan with optional Strategy A through Strategy E selections,
  independent parameters and allocations, and the complete registry available
  in every selector. Any selection can be empty, and duplicate or declared
  equivalent legs are rejected pairwise. Each parameter section is nested directly
  below its own selector. New daily and one-minute workspaces start with both
  selectors empty and no applied chart strategy. Applying an empty draft is a
  supported action that clears strategy-linked panes, price references, trade
  markers, and latest guidance from the trend chart.
  Selected-range average active-run length still determines stable display roles.
  One strategy directly controls exposure and two strategies retain the existing
  core/tactical hierarchy. Three through five strategies instead form one
  weighted consensus with 60% entry, 40% exit, count confirmation, and a
  hold-state hysteresis band; their portfolio exposure is only 0% or 100%.
- One unified one-click strategy screen with one objective, one progress
  stream, and one stop action. The progress bar maps the ten optimizer stages
  plus one segment per rolling selection window; period, range, and rolling
  completion all resolve exactly to 100%. Its left result
  column returns exactly one best parameter set per standalone strategy. The
  same run ranks all standalone family winners, retains the top 95% of
  families for combinations, and keeps their top three final parameter sets.
  It automatically ranks all nine crossings for every eligible unordered pair
  of non-equivalent strategy IDs, keeps the best crossing per pair and up to 4,096
  pair finalists, then compares 50/50, 60/40, 40/60, 70/30, and
  30/70 under both tactical modes. Holdings remain 0%, 30%, 40%, 50%, 60%,
  70%, or 100% for pairs. The best 128 pair parents then generate bounded
  triples, then bounded forward expansion adds four- and five-strategy sets;
  retained three-to-five-leg sets replay every positive 10% judgment-weight
  composition once (36/84/126 candidates). The current 55 eligible families
  produce at most 1,485 unordered pairs before equivalence exclusions, so
  every retained pair reaches the allocation stage. Its right result column
  keeps one best result per complete
  unordered component set, retains 30 results independently for every one-to-five
  strategy category, displays A–E plus pair core/tactical or multi-leg
  primary/supporting judgment roles, and applies a complete result to the
  lab and chart.
- Three one-click recent-adaptive modes: default period screening runs the
  complete parameter/EMA/combination/allocation workflow only on one adjustable
  trailing window; the default 128 sessions share one constant with the lab.
  Range screening uses one custom start/end interval. Rolling screening forms
  its retained pool over one custom total interval and equally averages tied
  percentile ranks from fixed-width calendar windows that advance one year.
  Complete earlier history remains available for indicator and opening-state
  continuity, but only active-window performance enters any objective. The
  modes have no training/test stage and make no out-of-sample claim. Completed
  results remain visible in the current page but are never restored as a
  calculation cache.
- Each completed screen persists a compact owner/instrument-scoped run archive
  with market source, adjustment, fetch time, last bar, bar count, SHA-256 data
  fingerprint, validation configuration, objective, settings, retained candidates,
  and compact validation report. The UI shows prior-run and Top-10 overlap
  comparisons. Each owner and canonical instrument retains only its newest six
  runs; read and write boundaries permanently delete older rows. Archives are
  audit records and never seed a later screen.
- Saving an identical instrument/plan/range/cash/cost setup replaces its
  existing record, including visible-indicator changes, while preserving record
  identity and order. A materially different setup still inserts a new record.
- The strategy lab initializes a newly loaded instrument to its latest 128
  trading bars, using the same default constant as period screening.
  The period-session input and lab start/end dates are bidirectionally
  synchronized over actual loaded trading bars. A session-count edit derives a
  trailing range from the current end date; a date edit normalizes the range
  and updates the count. A new instrument preserves the session count while
  using that instrument's own latest dates.
  The one-click panel groups optimization scale, fixed right-side filtering,
  validation controls, and the run action into separate responsive regions.
- A post-screening shortlist that merges eligible standalone and combination
  candidates. Period-sample mode honors the trailing-window rank score; range and
  rolling modes use earlier selection results rather than displayed holdout
  metrics. The active objective winner is the primary strategy. Up to two
  deputies must
  share no strategy component with the selected recommendations and must have
  measurable maximum daily equity-return correlation below 0.75;
  quality/diversity scoring ranks only candidates that pass that gate.
  High-overlap candidates can appear only as same-family alternatives, and the
  UI reports when fewer than two independent deputies exist instead of
  relabeling duplicates. Its horizontal row sits above the single and
  combination result columns, and its cards apply directly to the chart
  without browser hover tooltips.
  Each entry also receives an independent 30-session recent-effectiveness
  review with a 63-session excess-return confirmation and a two-execution
  evidence gate. That review is a monitoring prompt and never changes the
  in-sample ranking.
  A prior N225 browser run verified the three-card layout and direct Apply
  behavior before the independence rule became a hard gate; current tests
  separately cover both independent deputies and high-overlap alternatives.
- A partial-allocation backtest that executes close-confirmed combination
  targets at the next open and causal price-order changes on the touched bar.
  Multiple same-bar entry stops run from lower to higher, followed by exit
  stops from higher to lower, so different touched prices are not discarded.
  It acts only when the planned allocation state changes, applies
  commission and slippage to allocation transitions, and reports rebalances
  plus common return/drawdown/Sharpe/equity metrics. Ordinary price drift does
  not create maintenance trades. Strategy-driven rebalances retain relative
  long/short entry/exit attribution; the chart maps each fill to exactly one of
  open, short buy, short sell, or close. A relative-long exit closes any active
  relative-short layer at the same fill and renders as one close.
- Latest guidance that labels causal price orders as same-bar conditional
  execution, shows today's entry and exit condition prices, and labels
  close-confirmed signals as following-open instructions. Greedy exposes its
  newest completed-candle direction as a pending next-open action and warns
  that an opposite qualifying gap can override it. Untouched conditions are
  not recorded as fills. Every provider series carries complete,
  in-progress, or unknown latest-daily-bar status. Close-confirmed live changes
  ignore an incomplete/unknown latest bar, while prior-day resting price orders
  remain active. A touched entry rejected by the moving-average slope filter
  keeps its displayed condition price and reports a distinct blocked state
  instead of looking like an ordinary wait. This guidance is rendered within
  each saved shortcut instead of a separate instrument-header card.
- Per-user D1-backed saved backtests with a dedicated upper-right shortcut bar
  that contains the Save current strategy action and restores
  index/ETF/commodity identity plus the complete A/B strategy plan. New JSON
  uses generic Strategy A/B fields. Prior long/short and core/maximum JSON
  converts at read time; legacy rows without plan JSON derive a
  full-allocation Strategy A plan. Single-strategy plans always normalize to
  100%. Each save inserts a separate snapshot, allowing one instrument to keep
  multiple strategies; only the shortcut matching the complete current setup
  is highlighted. Project-local D1 writes are ignored by the Vite file watcher,
  so saving does not reload the page or clear completed screening results.
  The POST response is inserted into the bounded client list immediately, so a
  successful durable write does not depend on a second list request before the
  new shortcut becomes visible. Provider-resolved instrument names use a
  shared 256-character boundary; Yahoo's 82-character name for `159558.SZ`
  therefore remains a valid new ETF shortcut instead of failing the complete
  payload at the older 80-character saved-record boundary.
  Each saved strategy row displays its original `createdAt` value as a
  localized added date and time; replacement updates do not relabel
  `updatedAt` as the initial join time. Shortcut metadata uses a higher-contrast
  12-pixel functional-text size and omits default daily, single-strategy 100% allocation,
  disabled-indicator, and disabled-entry-filter rows. Dual allocations and
  enabled optional settings remain visible.
  Each new snapshot also stores the ordered indicators visible at save time and
  their exact parameters; legacy rows restore an empty indicator collection.
  The shortcut bar has no separate saved-count row or pagination. It reads a
  bounded 200-row collection into a scroll region, canonicalizes provider
  aliases into one collapsed disclosure per instrument, and reveals concrete
  strategy/indicator snapshots on expansion. Group and within-group drag or
  keyboard ordering is persisted in the owner-scoped `display_order` column.
  Renameable owner-scoped folders organize canonical instrument groups at the
  root and strategy snapshots inside one instrument. Assignments are nullable;
  deleting a folder unfiles its contents without deleting saved records. Both
  folder levels expand/collapse independently, and sibling folder drag or
  Up/Down keyboard ordering persists context-local `display_order` values.
  Each first-level group has a confirmed delete action that removes all
  canonical aliases for that owner in one API operation.
  Opening a shortcut preserves the shared date range. When its canonical
  instrument matches the successful non-empty active series, the workspace
  also preserves that exact price series across provider aliases and restores
  only plan-derived state; only a different instrument or unusable active
  series reloads market data. The header refresh action updates the active
  chart and then serially refreshes every other unique shortcut instrument
  without changing the visible chart. Scheduled active-instrument updates also
  queue the same inactive-shortcut pass. Active and successfully refreshed daily
  shortcuts are recalculated from each saved plan and cost assumptions over the
  latest 128 trading sessions. The owner-scoped rolling API persists each
  return without changing history. Screening archives no longer read, write,
  or backfill saved-plan ranks. Each shortcut instead shows a validation prompt
  from its latest available 30-session/63-session evaluation. If a current calculation is
  unavailable, the UI uses the last durable
  rolling return and then the creation-time return. Indicator
  focus and visibility do not affect either return source. Creation-time dates
  and metrics remain durable record provenance rather than a second active
  workspace interval.
- The main chart derives its explicit visible price-axis bounds from OHLC candle
  highs and lows only and updates them on data zoom. Strategy reference lines
  and markers do not change those bounds, so the same instrument and zoom window
  keep one K-line vertical scale while users switch saved strategies. Axis
  bounds and ticks use integers when the visible high exceeds 20. When the
  visible high is at most 20, daily and minute charts use no more than two
  decimals. K-line detail tooltips and the price-axis crosshair label display
  one decimal place.
- A lower research area that places the strategy lab and automated screening
  together. The lab edits a draft plan and its backtest; the trend chart,
  markers, and latest guidance retain a separate applied plan until the user
  presses Apply. Apply accepts an empty draft so the user can explicitly clear
  the applied chart strategy. Screening-result and saved-shortcut row actions
  update both states. Durable saving remains only in the shortcut panel. Screening controls span a
  horizontal bar above equal-width standalone and combination result columns;
  every retained compact, keyboard-focusable result row applies directly,
  tables do not
  use horizontal scrollbars, built-in strategy names omit a redundant prefix,
  combination Strategy A/B use separate compact columns with inline
  name/horizon labels, and combination results do not repeat the equity preview
  already available under the strategy lab. The strategy-lab eyebrow and
  selected strategy name occupy separate rows, horizon badges and actions use a
  third row, entry-filter columns follow label length, and redundant parameter
  and screening-action helper labels are omitted. Range mode shows the
  inclusive count of available trading sessions beside its start and end dates.
  Result tables omit visible ordinal ranks/objective scores and show explicit
  recent validation plus exact/same-type shortcut differences. Opening a
  same-canonical, same-interval shortcut preserves active and completed screen
  state. The sample-period result report is not rendered; range and rolling
  summaries remain. Screening archives stay backend-only for reproducibility.
- Chinese responsive UI with centralized locale copy.
- A one-click Windows local launcher that applies project-local D1 migrations,
  binds vinext to `127.0.0.1:3000`, requires no account, reuses an
  already-running QuantScope server before attempting D1 migration, and opens
  a new maximized Edge window when Edge is available. If the registered
  application or relay process is present but unhealthy, the same identity-
  verified port reconciliation releases it before restart. This ordering
  prevents a second launch from waiting on the live `.wrangler/state`.

## Verification status

- Guarded local migration execution passed 14 focused Windows launcher tests,
  all 217 TypeScript tests, strict TypeScript, the production build, and both
  rendered/source tests on 2026-08-13. A live Wrangler 4.92.0 run reproduced
  the post-success hang after `No migrations to apply!`; the new two-second
  grace path returned `RecoveredNoOp` and left no migration processes alive.
- Community catalog/registry integration, all nine indicator and three strategy
  ports, validation-first result/shortcut presentation, exact and same-type
  shortcut matching, conditional screening preservation, sample-report removal,
  and low-price axis precision passed strict TypeScript, all 213 TypeScript
  tests, the production build, both rendered/source tests, warning-free ESLint,
  and `git diff --check` on 2026-08-11.
- Controlled one-open indicator menus, the dedicated quick-indicator row,
  per-item favorite stars, and collapsible/reorderable shortcut folders passed
  strict TypeScript, all 203 TypeScript tests, the production build, both
  rendered/source tests, scoped warning-free ESLint, and `git diff --check` on
  2026-08-09. The in-app browser confirmed category switching closes the prior
  menu, a hollow SMA star turns amber and adds/removes SMA without selecting
  it, the quick row sits below the menu row, and the existing `风控` strategy
  folder collapses while exposing a draggable handle; no console warnings or
  errors were recorded.
- Linear-time rolling extrema, single-build price-order screening, and
  128-evaluation cooperative chunks passed strict TypeScript, all 196
  TypeScript tests, the production build, both rendered/source tests, and
  `git diff --check` on 2026-08-02. On 1,000 deterministic synthetic daily
  bars, full-domain signal construction across all 37,131 parameter sets fell
  from about 20.5 seconds to about 3.5 seconds (about 83%) without changing
  the exhaustive domain or tested signal, execution, cancellation, and ranking
  behavior.
- Native standalone/combination shortcut ranking, shared cross-objective
  histories, not-ranked events, date-independent duplicate replacement, and
  first-save/archive backfill passed strict TypeScript, all 195 TypeScript
  tests, the production build, both rendered/source tests, warning-free ESLint,
  and `git diff --check` on 2026-08-02. The live API migrated all existing rows
  to rank-history v5. The in-app browser confirmed six N225 shortcuts, one
  retained BarUpDn + Stochastic Slow row, visible `未` entries for exact plans
  absent from four archived runs, and no console errors.
- Complete fallback promotion, long-history selection, local major-index
  search, volume eligibility, atomic shortcut cohorts, and benchmark cost
  parity passed strict TypeScript, all 195 TypeScript tests, the production
  build, both rendered/source tests, warning-free ESLint, and
  `git diff --check` on 2026-08-02. Live search returned CSI 300, NDX, and SOX
  catalog hits in 9-23 ms. Strict Yahoo history returned 128 bars through
  2026-07-31 for NDX, SOX, and N225: NDX and N225 had 128 positive-volume bars,
  while SOX had none. The in-app browser kept N225 volume tools available and
  explicitly disabled VWAP/MFI/CMF/OBV plus their two strategies for SOX, with
  no console errors. It also confirmed the contextual commodity-
  proxy disclosure. The saved-backtest API returned non-empty rank history for
  all 12 current rows: six N225, three gold, and three SOX.
- Fixed guidance height, canonical shortcut-group deletion, complete
  one-click rank capture, latest-128-session return refresh, and integer
  OHLC-only chart scaling passed strict TypeScript, all 186 TypeScript tests,
  the production build, both rendered/source tests, and `git diff --check` on
  2026-08-02. ESLint reported no errors and retained one unrelated existing
  unused-variable warning in `MarketWorkspace.tsx`. A live in-app browser
  confirmed a 126-pixel guidance card, no shortcut horizontal overflow,
  integer price-axis labels, and visible rank histories for all 12 saved rows:
  six N225, three gold, and three SOX strategies.
- Unified runtime-port reconciliation for application port 3000 and relay port
  3001 passed PowerShell parser validation, all 12 focused launcher tests, all
  184 TypeScript tests, the production build, both rendered tests,
  warning-free ESLint, and `git diff --check` on 2026-07-28. A live regression
  began with the current checkout's vinext PID 20140 returning HTTP 500 on port
  3000: the launcher identified and stopped only that process, preserved the
  migrated local D1 state, restarted QuantScope, and returned HTTP 200 with the
  expected title while the relay health endpoint remained ready. A subsequent
  launch reused the running application without migration or a duplicate
  server.
- Rolling source health, the FMP/AllTick gold integration, Juhe final-quote
  recovery, and the provider allowance register passed strict TypeScript, all
  181 TypeScript tests, the production build, two rendered tests,
  warning-free ESLint, registry JSON validation, and `git diff --check` on
  2026-07-28. Strict local API requests
  returned ten FMP `GCUSD` bars under canonical `GC=F` through 2026-07-28 and
  safely returned `PROVIDER_CREDENTIAL_INVALID` for the initial AllTick token.
  The replacement trial token returned nine AllTick daily bars through
  2026-07-28. A strict Juhe request returned one complete `513310` bar through
  2026-07-28 while provider ordering tests kept Tencent first and Juhe last.
  Ten real
  Yahoo/FMP common dates had 0.113% mean close error and 0.262% mean OHLC
  error; nine Yahoo/AllTick dates had 0.164% and 0.268% error. Both passed the
  2%/3% promotion gate.
- Always-on local relay, session-aware active-market refresh, immediate ordered
  recovery, 15/30/60-minute all-source backoff, manual shortcut progress and
  cooldown, and safe provider credential/access/quota classification passed
  strict TypeScript, all 175 TypeScript tests, the production build, two
  rendered/source tests, warning-free ESLint, and `git diff --check` on
  2026-07-28. The live local relay health endpoint returned ready, the
  application and persistence endpoints returned HTTP 200, strict latest
  requests for `513310.SS` and `GC=F` returned five bars through 2026-07-28,
  and the full live Yahoo matrix passed all 31 indexes, ETFs, and commodity
  proxies. `.env.local` remains ignored and untracked.
- The readable-functional-text, mobile-refresh, all-shortcut refresh, and
  temporary-quote retention/provenance changes passed strict TypeScript,
  all 172 TypeScript tests, the production build, two rendered/source tests,
  and ESLint with the one pre-existing `lib/market/series.ts` unused-parameter
  warning on 2026-07-28.
  A real local browser confirmed 12-pixel latest-guidance and shortcut text,
  no desktop overflow, a visible refresh action labeled for current plus all
  shortcuts, active-update advancement, background spinning through five
  shortcut groups, completion, and no console errors. Local migration
  `0006_curved_fenris.sql` applied successfully, and the migrated screening-run
  GET endpoint returned HTTP 200.
- The new-session `0.05%` one-way commission default passed strict TypeScript,
  all 170 TypeScript tests, the production build, two rendered/source tests,
  `git diff --check`, and a live in-app browser reload on 2026-07-28. Existing
  saved shortcuts still restore their own stored commission values.
- Temporary current-session chart merging and the compact strategy-lab layout
  passed strict TypeScript, all 170 TypeScript tests, the production build, two
  rendered/source tests, and a live in-app browser check on 2026-07-28. A
  `513310` refresh changed the active series from 242 completed bars through
  2026-07-27 to 243 bars with a 2026-07-28 Tencent quote, current OHLC, updated
  guidance, and recalculated shortcut returns. The 372-pixel strategy panel
  kept all three entry-filter labels on one line with zero page overflow; the
  redundant parameter and screening helper labels were absent.
- Saved-shortcut readability cleanup passed strict TypeScript, all 167
  TypeScript tests, the production build, two rendered/source tests, and a
  real-browser 372-pixel panel check on 2026-07-28. The browser confirmed
  11-pixel strategy titles, 10-pixel higher-contrast metadata, conditional
  display of only meaningful optional settings, and no horizontal metadata
  overflow in the inspected saved records.
- Saved-shortcut added-time display passed strict TypeScript, all 167
  TypeScript tests, the production build, two rendered/source tests, and
  `git diff --check` on 2026-07-28. Source assertions link each row's
  localized `createdAt` display to the existing API field and semantic
  `<time>` element without a schema or migration change.
- Current-project orphan relay cleanup passed PowerShell parser validation,
  nine dedicated launcher tests, strict TypeScript, all 167 TypeScript tests,
  the production build, two rendered/source tests, and a live Windows check on
  2026-07-28. The live check launched the relay with its absolute script path,
  let its parent exit, verified the orphan identity, stopped only that relay,
  and released port 3001. The obsolete manual port-cleanup scripts and legacy
  relative-command compatibility were removed.
- Proxy-relay command generation now keeps `Start-Process` and its required
  `-FilePath` argument in one parsed command. The regression passed the
  generated-command AST check, the Windows launcher tests, all 166 TypeScript
  tests, strict TypeScript, the production build, two rendered/source tests,
  and `git diff --check` on 2026-07-27.
- Yahoo-first canonical selection passed all 162 TypeScript tests, strict
  TypeScript, the production build, two rendered/source tests,
  repository-wide ESLint, and `git diff --check` on 2026-07-27. Live
  strict-provider coverage passed all 31 configured cases: 16 global indexes,
  11 ETFs, and four commodity proxies. The default market route returned 6,506
  Yahoo `^N225` bars through 2026-07-27, and Yahoo-first search returned the
  same exact identity. Cross-primary tests confirmed that locked historical
  closes remain unchanged while Yahoo owns the new primary refresh.
- Saved-shortcut return fallback passed all 160 TypeScript tests, strict
  TypeScript, the production build, two rendered/source tests, and
  repository-wide ESLint on 2026-07-27. A real local Edge run
  expanded the four N225 shortcuts, confirmed their stored +30.51%, +31.02%,
  +32.75%, and +28.87% returns while no N225 history was active, then enabled
  EMA and confirmed every value and saved-range label remained unchanged.
- Canonical market locking, provider-isolated backups, global exchange mapping,
  proxy-capable loopback relay, and source-health/backoff behavior passed 159
  TypeScript tests, strict TypeScript, the production build, two
  rendered/source tests, repository-wide ESLint, and `git diff --check` on
  2026-07-27. Live read-only coverage passed 16 Yahoo global indexes, 11 Yahoo
  ETFs, 11 Nasdaq ETFs, four Yahoo commodity aliases, and the 6,828-bar Nasdaq
  SOX canonical history. A real local browser loaded Gold through its Yahoo
  canonical profile with 6,499 bars, a current quote, chart, strategy guidance,
  and backtest metrics. The Eastmoney direct matrix passed earlier in the
  session, then its public endpoint rate-limited the burst run; cached
  Eastmoney-primary bars remained unchanged and primary retries entered bounded
  backoff.
- Continuous range-boundary accounting, independent A/B filters, EMA Top-60,
  rolling Top-10 pools, five dual allocations, Worker execution, compact
  screening archives, and indicator-only saved-record replacement passed all
  149 TypeScript tests, strict TypeScript, the production build, both
  rendered/source tests, repository-wide ESLint, `git diff --check`, and local
  D1 migration `0005_wonderful_silver_surfer.sql` on 2026-07-27.
- Recent-adaptive period/range/rolling selection, current-window balanced score
  without trade count, single custom-range controls, equal rolling-window rank
  aggregation, continuous pre-window indicator/position state, and updated
  rendered copy passed 146 TypeScript tests, strict TypeScript, the production
  build, two rendered/source tests, and warning-free repository-wide ESLint on
  2026-07-27.
- Same-canonical shortcut series reuse, optional EODHD normalization/retry/token
  behavior, exhaustive 37,131-candidate coverage, EMA5-8 Top-30 family gating,
  unique-winner combination parameters, and 60/40 versus 40/60 allocation
  replay passed 146 TypeScript tests, strict TypeScript, the production build,
  two rendered/source tests, and repository-wide ESLint on 2026-07-27. No live
  production-token EODHD request or full 37,131-candidate browser run was
  performed; the committed demo fixture and deterministic domain/engine tests
  cover those contracts without exposing credentials.
- Bidirectional period/lab range synchronization and active-shortcut
  shared-range replay passed 139 TypeScript tests, strict TypeScript, the
  production build, two rendered/source tests, repository-wide ESLint, and
  `git diff --check` on 2026-07-27. The same run's sample/range/rolling
  shared-display replay contract was later superseded by D-028. A real local
  browser loaded adjusted N225
  history and confirmed that the default lab dates
  2026-01-16 through 2026-07-24 equal the 128-session period input and appear
  in the shortcut range header. A later browser reload was blocked by the
  browser URL policy, so date-edit interaction and range/rolling final replay
  are covered by deterministic helper, validation-parity, and source tests.
- The 120-set hard cap, fixed EMA(6-8)/zero-slope screening contexts, single
  128-session period sample, shared strategy-lab default range, and grouped
  screening panel passed 138 TypeScript tests, strict TypeScript, the
  production build, two rendered/source tests, repository-wide ESLint, and
  `git diff --check` on 2026-07-26. A real local browser loaded adjusted N225
  history, confirmed that 2026-01-16 through 2026-07-24 contains the latest 128
  trading sessions, and completed a filter-enabled one-set-per-strategy smoke
  screen with 34 standalone and 32 combination results. Applying an EMA(6)
  result restored EMA(6) and a zero slope to the strategy lab. The browser
  check also found and fixed a global `.fixed` class collision before handoff;
  the final page had no document overflow.
- Outside-candle trade markers and pointer-silent strategy overlays passed 137
  TypeScript tests, strict TypeScript, the production build, two
  rendered/source tests, repository-wide ESLint, and `git diff --check` on
  2026-07-26. A real local browser applied an SMA Cross plus EMA Trend Follow
  combination to 6,505 adjusted N225 bars, showed buys below candle lows and
  exits above candle highs, and dragged the combination timeline from the
  latest 120 bars to a window beginning in 2019 without runtime warnings,
  errors, or document overflow.
- Persistent last-run screening snapshots and full-lab-range multi-period
  display replay passed 135 TypeScript tests, strict TypeScript, the production
  build, two rendered/source tests, repository-wide ESLint, and
  `git diff --check` on 2026-07-26. A real local browser ran the one-set N225
  multi-period screen through 1,416 evaluations: Channel BreakOut showed
  +60.83% in the result table, +60.83% after application in the strategy lab,
  and +60.83% in a newly saved shortcut. Changing initial cash to 110,000 kept
  all 34 standalone results visible. The temporary shortcut was deleted,
  restoring the original four N225 records, and the 1,265-pixel document
  remained inside its 1,280-pixel viewport.
- Adjustable 64/128/256-session multi-period selection, normalized
  40%/35%/25% weighted percentile ranks, external shortlist ordering, range
  validation, and fixed-width rolling validation passed 135 TypeScript tests,
  strict TypeScript, the production build, and two rendered/source tests on
  2026-07-26. A real local browser verified all six labelled period/weight
  inputs, edited the recent period to 80/45, switched to Range and back without
  losing the draft, restored 64/40, and kept the 1,265-pixel document inside
  its 1,280-pixel viewport. Repository-wide ESLint and `git diff --check` also
  passed.
- The `159558.SZ` first-shortcut regression passed 126 TypeScript tests,
  strict TypeScript, the production build, and two rendered/source tests on
  2026-07-26. A real local browser reproduced the previous failure with
  KDJ Reversal plus Volty Expan Close at A=40%/B=60%, then created a fourth
  collapsed instrument group with one saved plan after the shared name-boundary
  fix and logged no runtime errors. The temporary verification row was deleted,
  restoring the original ten saved records.
- Hard-gated independent deputies, high-overlap alternative roles, explicit
  deputy-shortfall copy, and immediate shortcut insertion from the successful
  POST response passed 126 TypeScript tests, strict TypeScript, the production
  build, and two rendered/source tests on 2026-07-26. A real local browser
  added an N225 shortcut, changed its collapsed group count from four to five
  immediately, and logged no runtime errors. The temporary browser-test row was
  deleted and the original 4/3/3 shortcut counts were restored.
- Readiness-before-migration launcher ordering passed the six dedicated Windows
  launcher tests, the full 125-test/build/render suite, ESLint, and
  `git diff --check` on 2026-07-26. A real second launch against the active
  local server reported `QuantScope is already running` and exited with code 0
  without invoking Wrangler.
- Cache-reader hot-update compatibility and retained-state validation passed
  118 TypeScript tests, strict TypeScript, the production build, two
  rendered/source tests, and repository-wide ESLint on 2026-07-26. A real
  local browser loaded 6,505 N225 bars, switched to SOX and back through the
  cached shortcut path, retained the timestamped cache warning, and reported
  no `bars.at` exception, console warning/error, or horizontal overflow.
- Non-expiring 32-series history caching, preserved cache-write timestamps, and
  full-history retry while a cached preview remains active passed 118
  TypeScript tests, strict TypeScript, the production build, two
  rendered/source tests, repository-wide ESLint, and `git diff --check` on
  2026-07-26. A real local browser switched from SOX back to N225, immediately
  rendered the cached chart with `2026/07/26 09:23`, then replaced the
  provisional warning after the background history refresh; the page had no
  horizontal overflow or console warnings/errors.
- Market isolation, Yahoo adjustment consistency, daily close completion,
  applied-plan separation, persistent/fallback shortcut caching, provider-key
  aliases, complete screening results, three-stage progress, retained results,
  selected-range executed-order initialization, grouped scrolling shortcuts,
  persistent group/record ordering, and conservative combination-order replay
  passed 125 TypeScript tests, strict TypeScript, the production build, two
  rendered/source tests, repository-wide ESLint, and `git diff --check` on
  2026-07-26. A real local Edge browser verified three collapsed canonical
  instrument labels for ten shortcuts, expansion into saved strategy/indicator
  rows, a 618-pixel scroll viewport over 735 pixels of expanded content, and
  group plus within-group drag order retained after reload.
- A real local-browser workflow on 2026-07-26 loaded 6,505 adjusted N225 bars
  and 6,679 adjusted SOX bars. The first SOX shortcut history load took about
  eight seconds; a provider-alias cache hit reopened it in about 0.3 seconds,
  and the cached N225 return displayed history without an empty chart frame.
  The browser's storage policy disabled IndexedDB, confirming the bounded
  in-memory fallback path.
- The same browser run verified that lab edits do not affect the trend chart
  until Apply, result rows apply directly, all 34 standalone and 32
  combination results remain rendered, and editing the next parameter cap
  leaves those results intact. A one-set screen completed 559 pair/allocation
  candidates with monotonic progress through all three stages. The
  1,265-pixel viewport had no document-level horizontal overflow and the
  console reported no warnings or errors.
- Screening progress paint scheduling passed 109 TypeScript tests, the
  production build, two rendered/source tests, and a real local-browser
  workflow on 2026-07-25. With 25 parameter sets per strategy, the action
  returned control in 313 milliseconds, exposed the Stop action, visibly
  reached intermediate allocation-stage progress at 3,480 / 5,303, then
  completed at 5,303 / 5,303 with no runtime errors.
- The compact screening layout passed 109 TypeScript tests, the production
  build, two rendered/source worker tests, scoped ESLint, and a real browser
  workflow on 2026-07-25. The objective, parameter-cap, and action labels and
  32-pixel controls aligned exactly. At a 2,185-pixel viewport, the 1,783-pixel
  screening panel rendered two equal 891-pixel result columns, separate
  160-pixel Strategy A/B columns, a centered allocation column, equal 46-pixel
  rows, and zero table overflow. At a 1,265-pixel viewport, the results stacked
  into full-width 861-pixel tables with the same row height and no overflow.
  Direct combination-row application succeeded with no console errors or
  warnings.
- Saved-shortcut application now preserves the latest one-click screening
  results. The regression passed 109 TypeScript tests, the production build,
  two rendered/source worker tests, and a real browser workflow on 2026-07-25;
  opening a shortcut retained all eight visible standalone rows and all eight
  visible combination rows, activated the shortcut, and produced no console
  errors or warnings.
- Indicator visibility, device-local parameter persistence, and saved-shortcut
  indicator snapshots passed 109 TypeScript tests, the production build, two
  rendered/source worker tests, scoped ESLint, and a real browser workflow on
  2026-07-25. The browser run confirmed all indicators were initially hidden,
  toggled SMA off and on, restored SMA 5/20 after reload, saved and restored
  SMA plus RSI through the backtest shortcut, removed the temporary test row,
  and reported no console errors or warnings.
- Selected-range state initialization, conservative same-bar entry/exit,
  Greedy pending-next-open guidance, equivalent-pair exclusion, and
  save-without-screen-reset passed all 107 TypeScript tests, the production
  build, two rendered/source tests, scoped ESLint, and `git diff --check` on
  2026-07-25. A real local browser completed the 1,152-evaluation minimum-grid
  screen, retained 16 visible Apply actions and the completed status after
  saving, and returned to the original four shortcuts after the temporary test
  record was deleted.
- Greedy mixed open/close timing, projected Parabolic SAR stops, separate
  Donchian Intrabar and Supertrend Stop variants, 34-strategy registry
  coverage, causal prefix invariance, order-derived chart lines, current
  condition prices, and screening/application consistency passed 104
  TypeScript tests, the production build, two rendered/source tests, scoped
  ESLint, and `git diff --check` on 2026-07-25. Repository-wide ESLint still
  enters pre-existing `.worktrees/**/dist` bundles and fails on generated
  minified code; no files in those worktrees were changed.
- Full-history target construction, bounded finalist target caching, hybrid
  touched-price execution, combination order-state replay, current entry/exit
  condition prices, and screening-card/application identity passed 99
  TypeScript tests, the production build, two rendered/source tests, scoped
  ESLint, and `git diff --check` on 2026-07-25. On 6,505 adjusted N225 bars,
  Channel BreakOut length 4/tick 0.1 moved the February entry to 2026-02-19
  and the March exit to 2026-03-03 under the hybrid contract; the former
  all-next-open policy produced 2026-02-20 and 2026-03-04. A real local browser
  showed A today's entry and exit condition prices with the same-bar
  touched-order disclosure and logged no runtime errors.
- Single-strategy full-allocation normalization, dual-only 60/40 controls,
  exact shortcut matching, and multiple snapshots per instrument passed 98
  TypeScript tests, the production build, two rendered/source tests, scoped
  ESLint, and `git diff --check` on 2026-07-25. Local migration
  `0002_flawless_korvac.sql` applied without changing saved rows. Two API saves
  for one temporary instrument returned different IDs and remained listed
  together at normalized 100% allocation; both test rows were then deleted.
  Real-browser checks confirmed A-only and B-only plans expose only a disabled
  100% allocation, dual plans expose 40%/60%, returning to one strategy
  restores 100%, and the obsolete parenthetical open-marker text is absent.
- Arbitrary distinct-strategy pairing, selected-range relative-role
  classification, Strategy B as the gate, same-catalog-horizon combinations,
  60/40 allocation replay, legacy long/short JSON conversion, generic A/B
  manual selectors, and role badges passed 97 TypeScript tests, the production
  build, two rendered/source tests, scoped ESLint, and `git diff --check` on
  2026-07-25. A real local browser exposed all 32 strategies in both selectors,
  disabled duplicate selections, switched SMA/EMA to B as relative long and
  SMA/BarUpDn to A as relative long, kept two parameter panels, completed
  10,797 default evaluations with 32 standalone and 32 unique arbitrary-pair
  results, applied the first 60/40 combination back to the lab and trend chart,
  showed relative-role badges, had no 760-pixel horizontal overflow, and logged
  no runtime errors.
- Screening-score transparency, the three-target objective menu, the 250-set
  responsive default, removed-objective assertions, shared eight-evaluation
  yields, and observe-only linkage passed 95 TypeScript tests, the production
  build, two rendered/source tests, scoped ESLint, and `git diff --check` on
  2026-07-25. In a real local browser,
  maximum-return screening completed all 10,909 default three-stage evaluations
  in about nine seconds after warm-up and exposed the localized formula, limit,
  and status-rule copy.
- Unified one-click screening, standalone-strategy uniqueness, long/short-pair
  uniqueness, shared controls, and two-column layout passed 95 TypeScript tests,
  the production build, two rendered/source tests, and scoped ESLint on
  2026-07-25. A real local browser at 1,265 pixels exposed one screening button,
  one objective control, no legacy duplicate controls, and two equal result
  columns without document-level horizontal overflow. With one parameter set
  per strategy, it completed 1,052 evaluations, reported 32 unique standalone
  strategies and 32 unique long/short strategy pairs, and rendered eight
  distinct visible rows in each column.
- Event-driven two-layer entries/exits, four holding-state candidates,
  unchanged-state no-trade behavior, four-action chart markers, discrete lab
  controls, and selector-owned parameter sections passed 94 TypeScript tests,
  the production build, two rendered/source tests, and scoped `app/lib/tests`
  ESLint on 2026-07-25. A real local browser loaded 6,505 adjusted N225 bars,
  confirmed two strategy cards each owned its parameter block, exposed dual A
  options 0/40/60 and B options 40/60, automatically changed 40/40 to 60/40,
  completed the 1,052-evaluation combination screen with eight visible results,
  applied an A=40%/B=60% plan, showed sparse open/short-buy/short-sell/close
  markers instead of daily drift trades, had no document-level horizontal
  overflow, and logged no runtime errors.
- Extended daily history passed 86 TypeScript tests, the production build, two
  rendered/source tests, ESLint, and `git diff --check` on 2026-07-25. A real
  local N225 page loaded 6,505 valid adjusted Yahoo bars, displayed the
  6,505-bar chart metadata, and exposed 2000-01-04 through 2026-07-24 as the
  available date bounds with no console errors.
- Strategy-lab Apply/save separation passed the full 82-test TypeScript suite,
  production build, two rendered/source tests, ESLint, and
  `git diff --check` on 2026-07-25. A real local browser click moved the view
  from the lab to the trend chart while the shortcut count remained zero; the
  Apply and Save actions resolved to the strategy and shortcut panels
  respectively. The 375-pixel layout had no document-level horizontal
  overflow and the console had no errors.
- Two-layer position sizing and common following-open historical execution
  passed 82 TypeScript tests, the production build, two rendered/source worker
  tests, ESLint, and `git diff --check` on 2026-07-25.
- A real local browser run loaded 1,000 N225 bars, completed 2,582 standalone,
  pair, and A/B allocation evaluations with one parameter set per strategy,
  retained 32 combinations, and displayed eight ranked results with Apply
  actions. Applying the first result restored both strategy configurations
  plus A 20% and B 80%; saving it created a shortcut with the same complete
  plan, and deleting it restored the clean local test state. The 760-pixel
  layout had no document-level horizontal overflow and the console had no
  errors.
- A clean local D1 migration and a create/list/delete strategy-plan round trip
  passed on 2026-07-25. A live Yahoo `SI=F` request returned 20 adjusted daily
  commodity bars.
- Hierarchical horizon/combination coverage passed 75 TypeScript tests, the
  production build, two rendered/source worker tests, ESLint, and
  `git diff --check` on 2026-07-25.
- A real local browser run on N225 used one parameter set per strategy,
  completed 287 standalone-and-pair evaluations, retained 32 combinations,
  rendered eight ranked long/short rows and one equity/drawdown preview, and
  reported no console errors on 2026-07-25. The 1,265-pixel desktop and
  760-pixel responsive layouts had no document-level horizontal overflow.
- Task 8 final-review coverage passed 67 TypeScript tests, the production
  build, two rendered/source worker tests, and ESLint on 2026-07-24.
- Full 57-test TypeScript suite, production build, and one rendered-worker
  test: passed after daily-workflow documentation verification on 2026-07-24.
- Indicator registry and custom-period chart tests, the full 38-test TypeScript
  suite, production build, rendered-worker test, and ESLint: passed on
  2026-07-24.
- A real Edge workflow configured SMA 5/20, changed the strategy to MACD,
  confirmed the SMA selection and parameters remained intact, switched
  indicators and back, restored SMA 10/30 defaults, and visually confirmed
  simultaneous SMA lines plus strategy buy/sell markers at desktop and
  760-pixel widths on 2026-07-24.
- Local launcher contract tests and PowerShell parser validation: passed on
  2026-07-24.
- PowerShell behavior tests for missing, damaged, and ready dependencies plus
  ready and early-exit server states: passed on 2026-07-24.
- Clean temporary D1 migration, local HTTP readiness, launcher reuse, and a
  create/list/delete saved-backtest round trip without authentication: passed
  on 2026-07-24.
- Full 34-test TypeScript suite, production build, rendered-worker test, and
  ESLint: passed after the local launcher reliability review on 2026-07-24.
- Dedicated blue/orange trade-marker palette test, full test/build suite,
  ESLint, and dark-chart browser inspection: passed on 2026-07-24.
- Live filtered searches for `N225`, `SOX`, and `SPY`: passed on 2026-07-24.
- Live daily series for N225, SOX, and SPY passed on 2026-07-24; the broader
  daily/5-minute N225, SOX, SPY, and 510300 matrix last passed on 2026-07-23.
- Analysis, adapter, screening-objective, and chart-configuration unit tests:
  23 passed on 2026-07-24.
- Built-worker rendering test: 1 passed on 2026-07-24.
- Production build: passed on 2026-07-24.
- ESLint: passed on 2026-07-24.
- Browser workflow for Channel BreakOut, 74/74 screening, Apply, and visible
  buy/sell markers on N225: passed on 2026-07-24.
- Parameter-grid coverage, cap, uniqueness, best-per-strategy ordering,
  progress, and cancellation tests: passed on 2026-07-24.
- Saved-backtest payload validation, migration generation, and production
  build: passed on 2026-07-24.
- Long-only catalog, execution, and marker rules: passed on 2026-07-24.
- Chart zoom configuration tests and a real Edge
  drag-screen-apply-drag interaction: passed on 2026-07-24.
- A real Edge run selected the return/drawdown target, completed 32 parameter
  evaluations, applied the first-ranked result, retained the zoom window, and
  remained draggable on 2026-07-24.
- A 1,920-pixel Edge viewport reported matching 1,920-pixel document, body, and
  workspace widths on 2026-07-24.
- Synthetic intrabar-stop, gap-fill, range-boundary, no-future-data, and
  five-strategy order-plan tests passed on 2026-07-24.
- Live-guidance transition, price-order guidance, and range-end marker tests
  passed on 2026-07-24.
- Completed-history/recent-bar merge coverage increased the local suite to 27
  passing tests on 2026-07-24; the production build, rendered worker test, and
  ESLint also passed.
  rendered/source tests, ESLint, and `git diff --check` on 2026-07-25. A real
  local N225 page loaded 6,505 valid adjusted Yahoo bars, displayed the
  6,505-bar chart metadata, and exposed 2000-01-04 through 2026-07-24 as the
  available date bounds with no console errors.
- Strategy-lab Apply/save separation passed the full 82-test TypeScript suite,
  production build, two rendered/source tests, ESLint, and
  `git diff --check` on 2026-07-25. A real local browser click moved the view
  from the lab to the trend chart while the shortcut count remained zero; the
  Apply and Save actions resolved to the strategy and shortcut panels
  respectively. The 375-pixel layout had no document-level horizontal
  overflow and the console had no errors.
- Two-layer position sizing and common following-open historical execution
  passed 82 TypeScript tests, the production build, two rendered/source worker
  tests, ESLint, and `git diff --check` on 2026-07-25.
- A real local browser run loaded 1,000 N225 bars, completed 2,582 standalone,
  pair, and A/B allocation evaluations with one parameter set per strategy,
  retained 32 combinations, and displayed eight ranked results with Apply
  actions. Applying the first result restored both strategy configurations
  plus A 20% and B 80%; saving it created a shortcut with the same complete
  plan, and deleting it restored the clean local test state. The 760-pixel
  layout had no document-level horizontal overflow and the console had no
  errors.
- A clean local D1 migration and a create/list/delete strategy-plan round trip
  passed on 2026-07-25. A live Yahoo `SI=F` request returned 20 adjusted daily
  commodity bars.
- Hierarchical horizon/combination coverage passed 75 TypeScript tests, the
  production build, two rendered/source worker tests, ESLint, and
  `git diff --check` on 2026-07-25.
- A real local browser run on N225 used one parameter set per strategy,
  completed 287 standalone-and-pair evaluations, retained 32 combinations,
  rendered eight ranked long/short rows and one equity/drawdown preview, and
  reported no console errors on 2026-07-25. The 1,265-pixel desktop and
  760-pixel responsive layouts had no document-level horizontal overflow.
- Task 8 final-review coverage passed 67 TypeScript tests, the production
  build, two rendered/source worker tests, and ESLint on 2026-07-24.
- Full 57-test TypeScript suite, production build, and one rendered-worker
  test: passed after daily-workflow documentation verification on 2026-07-24.
- Indicator registry and custom-period chart tests, the full 38-test TypeScript
  suite, production build, rendered-worker test, and ESLint: passed on
  2026-07-24.
- A real Edge workflow configured SMA 5/20, changed the strategy to MACD,
  confirmed the SMA selection and parameters remained intact, switched
  indicators and back, restored SMA 10/30 defaults, and visually confirmed
  simultaneous SMA lines plus strategy buy/sell markers at desktop and
  760-pixel widths on 2026-07-24.
- Local launcher contract tests and PowerShell parser validation: passed on
  2026-07-24.
- PowerShell behavior tests for missing, damaged, and ready dependencies plus
  ready and early-exit server states: passed on 2026-07-24.
- Clean temporary D1 migration, local HTTP readiness, launcher reuse, and a
  create/list/delete saved-backtest round trip without authentication: passed
  on 2026-07-24.
- Full 34-test TypeScript suite, production build, rendered-worker test, and
  ESLint: passed after the local launcher reliability review on 2026-07-24.
- Dedicated blue/orange trade-marker palette test, full test/build suite,
  ESLint, and dark-chart browser inspection: passed on 2026-07-24.
- Live filtered searches for `N225`, `SOX`, and `SPY`: passed on 2026-07-24.
- Live daily series for N225, SOX, and SPY passed on 2026-07-24; the broader
  daily/5-minute N225, SOX, SPY, and 510300 matrix last passed on 2026-07-23.
- Analysis, adapter, screening-objective, and chart-configuration unit tests:
  23 passed on 2026-07-24.
- Built-worker rendering test: 1 passed on 2026-07-24.
- Production build: passed on 2026-07-24.
- ESLint: passed on 2026-07-24.
- Browser workflow for Channel BreakOut, 74/74 screening, Apply, and visible
  buy/sell markers on N225: passed on 2026-07-24.
- Parameter-grid coverage, cap, uniqueness, best-per-strategy ordering,
  progress, and cancellation tests: passed on 2026-07-24.
- Saved-backtest payload validation, migration generation, and production
  build: passed on 2026-07-24.
- Long-only catalog, execution, and marker rules: passed on 2026-07-24.
- Chart zoom configuration tests and a real Edge
  drag-screen-apply-drag interaction: passed on 2026-07-24.
- A real Edge run selected the return/drawdown target, completed 32 parameter
  evaluations, applied the first-ranked result, retained the zoom window, and
  remained draggable on 2026-07-24.
- A 1,920-pixel Edge viewport reported matching 1,920-pixel document, body, and
  workspace widths on 2026-07-24.
- Synthetic intrabar-stop, gap-fill, range-boundary, no-future-data, and
  five-strategy order-plan tests passed on 2026-07-24.
- Live-guidance transition, price-order guidance, and range-end marker tests
  passed on 2026-07-24.
- Completed-history/recent-bar merge coverage increased the local suite to 27
  passing tests on 2026-07-24; the production build, rendered worker test, and
  ESLint also passed.
- Live N225 browser verification on 2026-07-24 returned 1,000 cacheable history
  bars and a separate five-bar `no-store` update, advanced the displayed update
  time after manual refresh, recalculated the latest strategy guidance, kept
  the green-up/red-down legend visible, and preserved a dragged timeline window
  across refresh.
- A live N225 Channel BreakOut comparison for 2025-07-24 through 2026-07-24,
  length 4 and tick 0.1, produced 45.01% return, -9.63% maximum drawdown, and
  16 trades; its first entry and exit matched the reference dates.
- A real Edge run displayed the new tick parameter, completed a 64/64
  two-candidate-per-strategy screen, applied the Channel BreakOut result,
  preserved the prior zoom window, and successfully dragged it again on
  2026-07-24.
- Fixed K-line display timeliness after data source updates: updated
  `mergeCanonicalMarketSeries` to allow same-provider latest bar updates even if
  previously marked complete; set `/api/market` Cache-Control headers to
  `no-cache, must-revalidate`; updated `fetchMarket` client cache options;
  allowed window-focus/visibility refreshes when latest bar status is not
  complete; updated ECharts dataZoom percentage clamping so newly appended
  bars at the right edge remain visible; and updated backup source recovery in
  `MarketWorkspace.tsx` and `shortcut-refresh.ts` to collect candidates and
  prioritize backups with newer intraday bar dates (e.g. Eastmoney live bars over
  Nikkei EOD CSV) on 2026-07-30.

## Next priorities

1. Replace public website endpoints with a licensed global market-data feed.
2. Add venue-specific trading constraints and adjustment-mode controls.
3. Consider a durable server queue only if screens must survive page closure or
   run concurrently across devices; normal browser screening now uses a Web
   Worker.
4. Add pyramiding, multi-order brackets, limit orders, and optional lower-
   timeframe Bar Magnifier data for templates that require those features.
5. Add a licensed ingestion/archive pipeline and an explicit runtime cache
   retention/cleanup implementation if QuantScope moves beyond browser-driven
   public-endpoint refreshes.
# 2026-08-22 - Bounded high-order screening heap within stages

- Removed the per-bar allocation of core-satellite timeline state objects in
  summary screening by alternating two reusable state records.
- Added exact intra-stage optimizer checkpoints and configured the screening
  Worker to restart every 4,096 evaluations, including during stages 15-18.
- Candidate order, finalist limits, scoring, and ranking precision are
  unchanged; a resumed partial-stage run is regression-tested against an
  uninterrupted run.
- Maximum-return screening exposed a second allocation-stage hotspot: frequent
  best-result replacements repeatedly copied and sorted the whole display
  result pool. Retention now uses a keyed, sorted, bounded in-place index, so
  objective-dependent replacement frequency no longer multiplies heap usage.
- Final three-through-nine-strategy categories now show at most three results
  per Strategy A primary while retaining the same 30-result category limit.
  The chart includes a compact group/result navigator below its subchart.
- Entry-filter raw targets/orders are released before pair discovery, and
  checkpoints after pair allocation strip per-finalist order-fill maps. These
  objects are not consumed by three-through-nine-strategy summary screening;
  final detailed replays rebuild them from retained parameters, preserving
  exact results while reducing live and serialized state.
