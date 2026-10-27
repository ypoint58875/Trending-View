# Feature Map

## All strategy-shortcut128-session focus

MarketWorkspace uses its existing saved-recent128-session range for chart focus
as well as replay, and advances savedChartOpenRevision on every ordinary shortcut
click. Dynamic validated shortcuts keep their matching128-session focus/reset.
PriceChart's generic default, clean instrument-group views, saved plans, history,
signals, costs and performance calculations remain unchanged. Tests link
chart-config.test.ts weekday-gap/short-history focus and rendered-html.test.mjs
saved-click reset/range wiring; docs CODEX_STATE, ARCHITECTURE and FUNCTIONS.

## Portfolio allocation marker semantics

lib/analysis/trade-markers.ts classifies allocation events from actual from/target
allocation, not component signal names. PriceChart's optional increasePosition/
reducePosition labels and workspace locale mapping display portfolio actions;
signals remain provenance. Existing cycle chart already uses actual allocation.
Tests: allocation-marker-actions.test.ts, analysis.test.ts and chart-config.test.ts.
No stored report, account upgrade, ranking, return or data-source change. Links:
CODEX_STATE, FUNCTIONS, DEBUGGING and MODULE_PATTERNS.

## Synchronized dynamic-account rules and128-session shortcuts

- Shared entry: useValidatedCycles in ValidatedCycleShortcuts.tsx hydrates and
  synchronizes from either workspace. Preview/client/worker compute current rules;
  promoteValidatedCycleProfile and store promoteValidatedCycleRules commit the
  complete account version/report with a single prior-rule backup and revision CAS.
- StrategyValidationWorkspace consumes the same stored report as MarketWorkspace
  shortcuts/markers. Pending data and future appends use synchronized settings;
  static saved strategies remain unchanged. UI copy identifies synchronization
  and failures, rather than presenting a v7 shortcut beside a v8-only report.
- MarketWorkspace removes the entire validated chart banner/exit action and uses
  a per-open chart revision to reset each shortcut click to validatedCycleFocusRange
  (latest128 sessions). History and all signals remain available by zoom/pan.
- Tests: preview promotion/immutability, atomic store failure/concurrent promotion,
  backup/idempotence/continuation, rendered source and browser two-page equality/
  banner absence/repeated128-bar reset. Linked docs: README, CODEX_STATE,
  ARCHITECTURE, FUNCTIONS, MODULE_PATTERNS, DEBUGGING, TECH_RESEARCH,
  DATA_PIPELINE and CACHE_POLICY. No protocol or market-source changes.

## Fast cycle hydration and current-rule execution preview

- StrategyValidationWorkspace restores local tasks independently of static API
  refresh and derives instruments from saved task/accounts. Shared useValidatedCycles
  readiness avoids duplicate replay. Form renders before background shortcut sync.
- validated-cycle-preview.ts holds pure current-overlay replay/cache identity;
  validated-cycle-preview-client.ts and .worker.ts keep replay off the UI thread.
  validated-cycle-strategy.ts optionally holds one derived preview; its store
  checks identity inside an atomic metadata write without changing account revision.
- Current-page stats/chart use the same preview; archived shortcuts/confirmed
  accounts remain unchanged and version-labelled. StrategyCycleRollingChart uses
  content-direction dragging; zh-CN distinguishes canvas dragging from slider.
- Tests: validated-cycle-preview, validated-cycle-strategy-store, chart-config,
  rendered-html and frozen rsi-shape-integration; isolated pending/503 browser smoke.
- Links: README, CODEX_STATE, ARCHITECTURE, FUNCTIONS, MODULE_PATTERNS,
  DEBUGGING, TECH_RESEARCH, DATA_PIPELINE and CACHE_POLICY. No protocol/source change.

## RSI10 first overbought pullback research

Research-only rsi-first-pullback.ts/test.ts and RSI_FIRST_PULLBACK_DESIGN/RESULTS
reuse current v8, shared RSI and existing cycle/ordinary replay. Explicit one-shot
arming, three triggers/priorities, thresholds65/70/75 and two scopes produce55
rows including baseline. Atomic hash-traced output includes next-open metrics,
events and omissions. No production rule/UI/registry/account/protocol change.
Links: CODEX_STATE, TECH_RESEARCH, DATA_PIPELINE, CACHE_POLICY and DATA_SOURCES.

## Adopted RSI shape overlay v8

- Core: sma-position-overlay.ts version registry, causal RSI7/10 feature cache,
  last fallback E, guarded pending reduction and native-buy veto. backtest.ts
  passes intrabar buy intent without weakening existing hard risk exits.
- UI: SmaPositionOverlayControls.tsx and app/i18n/zh-CN.ts distinguish entry,
  exit, priority and exact RSI/lookback definitions; ValidatedCycleShortcuts.tsx
  displays each retained account model version. New default calculations use v8;
  explicit saved plans and inherited validated accounts keep their model.
- Tests: rsi-shape-position-policy.test.ts covers gates, priority, recovery,
  boundaries and next-open causality. rsi-shape-integration.test.ts checks frozen
  research targets/returns and actual cycle report. ATR/research baselines pin v7.
- Links: README, CODEX_STATE, ARCHITECTURE, FUNCTIONS, MODULE_PATTERNS,
  TECH_RESEARCH, CACHE_POLICY and DATA_PIPELINE. No protocol or data source change.

## RSI period and threshold research

Research-only ShapeRsiSettings/ShapeContext cache in shape-priority.ts links to
rsi-parameter.ts/test, rsi-parameter-audit.ts and RSI_PARAMETER_DESIGN/RESULTS.
Independent entry/exit periods7..20, strength/extreme thresholds and historical
windows feed existing added shape rules without changing native signals.
28621 singles plus64 shortlisted combinations use bounded hash-checked chunks
and atomic manifests. Audit checks legacy parity, matched neighbors, omissions
and execution sensitivity. No production registry, UI, model, optimizer or live
validated-account change; apparent historical gains remain exploratory.

## Descending OHLC research extension

Research-only optional sequence policy in shape-priority.ts, shared strict
comparator, descending-sequence.ts/test and DESCENDING_SEQUENCE_DESIGN/RESULTS
cover3..6 observations of OHLC with3 priorities and4 RSI filters.193 policies,
legacy opens4/highs4 parity, causal close timing, event omission and next-open
sensitivity. Uses unchanged production dependencies and frozen input; no UI,
optimizer, protocol, registered strategy or validated-account update.

## Shape priority research boundary

research/nikkei-overlay-stability/SHAPE_PRIORITY_DESIGN.md, SHAPE_PRIORITY_RESULTS.md,
shape-priority.ts and shape-priority.test.ts define an isolated829-policy study.
Link production SmaPositionOverlay, shared RSI/WMA, cycle-close and ordinary
next-open replay only as unchanged dependencies. Checkpoints live in data/
shape-priority/<identity>/; results in output/shape-priority/. No production
strategy registration, UI rule, screening-limit or validated-profile update.

## Dynamic validated-cycle shortcuts and gap repair

- Core: lib/analysis/validated-cycle-strategy.ts retains one inherited account
  and uses strategy-cycle-validation.ts explicit decision-calendar replay.
- Persistence: validated-cycle-strategy-store.ts, separate revisioned IndexedDB
  registry, completed-task bootstrap, atomic retry and cross-page notifications.
- UI: app/components/ValidatedCycleShortcuts.tsx and MarketWorkspace.tsx show
  X-day validated strategies with full-history markers and current position;
  shortcuts sit under their matching instrument group and initial chart focus
  covers the latest128 sessions without trimming any stored history;
  ordinary and shortcut-batch screening append the same-window actual winner.
- StrategyValidationWorkspace.tsx publishes complete reports, restores registry
  updates, reuses frozen selections during repair and computes only missing
  decisions. Its queue ceiling applies to pending work rather than cached units.
- Text/style: app/i18n/zh-CN.ts validatedCycle and app/globals.css.
- Coverage: tests/validated-cycle-strategy.test.ts and
  tests/validated-cycle-strategy-store.test.ts cover inherited account parity,
  provisional replacement, close boundary, idempotence, gaps, repair, source
  correction rejection, explicit calendar, rendering, CAS retries, capacity,
  durable reload and failed-write recovery. Existing optimizer ranking, static
  shortcut server schema, engine protocol and ordinary execution are unchanged.

## Bounded cycle queue submission and completed-result reuse

Linked implementation: lib/analysis/screening-local-engine-client.ts,
scripts/screening-engine-coordinator.mjs, app/strategy-validation/
StrategyValidationWorkspace.tsx and app/i18n/zh-CN.ts. All uploads use64-unit
chunks with immediate durable acknowledgement mapping, detailed HTTP errors,
once-per-batch maintenance and completed-result reuse on explicit resubmission.
Shared config/screening-engine-protocol.json, protocol/bar transport, relay,
child, launcher and maintenance consumers were inspected; wire schema and
version are unchanged. Coverage: screening-local-engine-client and
screening-engine-coordinator tests plus existing child/launcher/rendered tests.
Live1294-job/21-chunk identity parity and both health contracts verified;
full424 unit/4 rendered tests plus latest targeted persistence tests pass.

## Six-leg versus five-leg local decision audit

`research/nikkei-overlay-stability/{SIX_VS_FIVE_DESIGN.md,six-vs-five.ts,six-vs-five.test.ts}`
links frozen six-leg dates, original request identities, max5/exactly5 winners,
ordered two-bar intents and same-baseline-state v7 targets. Shared production
screening/plan/signal/account APIs are reused without runtime edits. Seven
completed-job checkpoints live in data/six-vs-five/; derived results live in
output/six-vs-five/. This is not a complete max5 historical backtest.

## Selected combination-count audit

`research/nikkei-overlay-stability/output/COMBINATION_COUNTS.md` links frozen
full-screen-6-15 input/signals, source/bar hash checks, selected positive-leg
counts and duration-weighted full2000/final500/recent distributions. Distinguish
max-leg and family-finalist axes. Archived max3 coverage is incomplete and
ranking-model mismatched; no old3x3 performance gain is asserted. The proposed
matched2x2 search is not launched. No runtime feature or queue change.

## Adopted priorATR2 shock exit (v7)

User-authorized default: `lib/analysis/sma-position-overlay.ts` adds close<EMA7
and close-to-close decline>=2*previous WilderATR14 to v6, retaining archived
REBOUND_POSITION_OVERLAY_MODEL/OPTIONS. Shared ordinary/cycle/screening callers
and model-aware saved-plan parsing/checkpoint identities consume it unchanged.
`app/components/SmaPositionOverlayControls.tsx` and `app/i18n/zh-CN.ts` split
entry and exit explanations with risk-first priority, native4% simultaneous-
stop precedence and ATR timing. Coverage: tests/atr-position-policy.test.ts,
tests/rebound-position-policy.test.ts, tests/rendered-html.test.mjs and frozen
research/nikkei-overlay-stability/rebound-integration.test.ts. No RSI, entry
change, age10 stop extension, new ATR recovery or additional wait is adopted.
The historical contribution-study.ts v6 cases explicitly use archived v6
options. Verification: full npm test421 unit/4 rendered tests, typecheck/build,
and175 separate research tests pass.

## Earlier-risk exit robustness diagnostics

`research/nikkei-overlay-stability/{RISK_EXIT_VALIDATION_DESIGN.md,risk-exit-validation.ts,risk-exit-validation.test.ts}`
links the shared native ExitPriorityAccount/evidence, four frozen entry models,
292 loss-age/threshold/priorATR/wait/combination cases, exact prior-anchor parity,
episode suppression and common-state chronological deployment. Derived state:
`data/risk-exit-validation/grid.json`; outputs: `output/risk-exit-validation/`.
This research imports no new production behavior. Both-return improvement is
absent; the anchor gains concentrate in one December2022 episode. Regression
coverage checks ordered checkpoint compatibility, cleanup, causal prefixes,
deployment timing and evaluator-only suppression.

## Original-liquidation priority and earlier-risk exit comparison

`research/nikkei-overlay-stability/{EXIT_PRIORITY_DESIGN.md,exit-priority-study.ts,exit-priority-study.test.ts}`
links causal pending-zero origins, shared FilterAccount/native parity and212
frozen configurations to conditional priority and independent risk exits.
Preserve original-buy cancellation, partial-sell semantics, native stop
authority, cleanup and wait0/5. Atomic data/exit-priority progress and matching
outputs retain all scalar failures, selected blocked-day/event ledgers,
drawdown dates, development-only choices and cost/next-open sensitivities.
`exit-priority-audit.ts`/output/exit-priority-audit verify event concentration
and unchanged final500 targets. Age10 extension improves EMA3 full396.08%/
DD10.90% with unchanged final50098.14%, but only one extra2022-12-20 exit.
ATR2 gives393.14%/98.14%/DD10.88% with six correlated events. Ordinary sell
priority cases hurt full returns. Ten new tests cover guards, ATR/age bounds,
cleanup/waits, no same-bar entry exit, native authority and212 prefixes. No
production/model/default, data source, UI or protocol changes.

## Rolling5..20 peak-window extension

`research/nikkei-overlay-stability/{PEAK_WINDOW_DESIGN.md,peak-window-study.ts,peak-window-study.test.ts}`
links the unchanged PeakLiquidationAccount to644 cases across four previously
specified models, all integer5..20 windows, X2..6% and wait0/5. Shared policy
type widens to number only; original164 ordered menu/runtime behavior remain.
Separate data/peak-window progress and output/peak-window GRID/REPORT/COMPARISON
retain all cases, active-policy best-return/min-DD selections, first1500-only
selection and matched sensitivities.44 overlapping old target hashes reconcile.
Some shorter-window cases reduce close-proxy DD but none improve either return
metric; EMA3 N6/X6% yields354.77%/91.96%/DD10.90%, with DD advantage absent at
next-open. Four tests cover complete menu, window expiry,644 causal prefixes,
control parity and drift. No production/UI/default changes or new market data.

## Peak-liquidation comparison on four requested models

`research/nikkei-overlay-stability/{PEAK_LIQUIDATION_DESIGN.md,peak-liquidation-study.ts,peak-liquidation-study.test.ts}`
links frozen source/signals and existing FilterAccount to native v5/turn4/RSI/
daily4-ema3 additive peak exits,164 declared cases. Actual account resets,
native-entry reentry, wait0/5 and held episode/rolling20 peaks stay linked.
Atomic data/peak-liquidation/grid.json holds strict scalar progress; matching
outputs retain every failure, target paths, development-only selection and
selected close/next-open/double-cost ledgers. Supplementary
`peak-liquidation-audit.ts` and output/peak-liquidation-audit show actual4/6/8%
effects instead of only selecting the unchanged baseline. Seven tests cover
menu, native parity, prefix causality, cleanup/waits, pre-entry exclusion and
partial-add peak preservation. All112 affected cases lower total return;
none improves full drawdown. No production, UI, protocol or optimizer changes.

## Actual entry/liquidation source attribution

`research/nikkei-overlay-stability/{SIGNAL_SHARE_DESIGN.md,signal-share-study.ts,signal-share-study.test.ts}`
links frozen prices/signals, research DualAccount and exact production/contribution
target parity to actual entry/full-exit events. Causal pending-zero-request
tracking distinguishes immediate original exits, deferred original exits and
independent hard stops; original increases cancel pending origin, repeated zero
requests retain the first date. Partial changes and raw signal days use separate
denominators. Atomic output/signal-share summary/events/report retain full,
final500 and recent-window counts without resetting inherited state. Five tests
cover action classification, pending repetitions/cancellation, conflict holds,
stop precedence and window boundaries. Full entry source original20/rules37;
exit intention original56/stop1, with49 original exits delayed by rules. No
product changes, new fetches, optimizer changes or checkpoint migration.

## Screening versus overlay conditional contribution

`research/nikkei-overlay-stability/{CONTRIBUTION_DESIGN.md,contribution-study.ts,contribution-study.test.ts}`
links frozen full-screen prices/winners/signals and current production v6 to
nine raw/covered/fixed/overlay-only/buy-hold actual-account controls. First-known
winner and predetermined SMA10/30 retain the same decision calendar and two-bar
semantics. Source/code-identified signal prefixes persist separately under
data/contribution; output/contribution holds all ledgers, cost/next-open checks,
target parity, behavioral diagnostics and2x2 interaction/accounting results.
Full dynamic raw33.38% versus covered388.55%, fixed covered207.39..212.06%, and
overlay-only174.25% demonstrate strong interaction, not independent additive
alpha. Counts include recovery entries and sell-request deferral days. Five
new tests cover account sequence/prefix, arithmetic and progress drift. No
production rules, optimizer ranking, UI, sources or protocol changes.

## Adopted no-RSI dual-return candidate

User selected daily4-ema3-baseline, not the RSI-filtered438.34% candidate.
Shared `lib/analysis/sma-position-overlay.ts` exposes versioned v6 defaults with
an additional daily empty-account decline5%/rebound4% entry: preceding10 actual
flat closes, peak10 strictly before the latest equal low, EMA7 rising three
sessions, WMA7>=0 and close<=SMA20. Native original/turn/engulf/recovery priority,
pending reduction/cooldown vetoes, hold7 and exits remain unchanged. No RSI or
Bollinger conditions. `ENGULF_POSITION_OVERLAY_MODEL` and options archive v5;
saved parsing/model-aware identities already consume the shared model list.
Both page hooks use new defaults; old saved charts keep explicit versions.
Locale/shared controls now show nine rules and exact rebound details, covered
by rendered-route assertions and `tests/rebound-position-policy.test.ts`.
`research/nikkei-overlay-stability/rebound-integration.test.ts` validates source
identity and exact2000-target parity for archived v5 and selected v6, plus
close-proxy metrics388.5473%/final50098.1439%/DD12.0187% and next-open parity.
Earlier v5 research scripts/tests pin archived options; their existing hashed
checkpoints remain untouched and reject implementation drift on rerun.
This adoption supersedes earlier not-adopted/current-v5 status notes below,
not their frozen historical findings. Sparse-event and recent-period risks
remain; accepting this model does not imply independent validation.

## RSI/Bollinger empty-account alternatives and rebound filters

`research/nikkei-overlay-stability/{OSCILLATOR_ENTRY_DESIGN.md,oscillator-entry-study.ts,oscillator-entry-study.test.ts}`
links existing Wilder RSI14/Bollinger20/2 to61 causal flat-only recovery cases,
native priority/parity, strict full/final500 acceptance and separate atomic
data/oscillator-entry/grid.json progress/output/oscillator-entry ledgers.
`OSCILLATOR_FILTER_DESIGN.md` and `oscillator-filter-study.ts` add23 separately
declared filter/control cases through unchanged DualAccount rebound branches,
with independent data/oscillator-filter/grid.json and output/oscillator-filter.
`oscillator-filter-audit.ts` links selected target-hash parity, whole-account
episode omissions, one-date interventions, common-final500-state attribution
and dated drawdowns to output/oscillator-filter-audit. Tests cover17 oscillator
causality/priority/control/progress/omission cases; no live indicator/UI changes.
Independent oscillator entries fail the dual goal. RSI35-to40 rebound filtering
improves full438.3372%/final50099.8490% versus native382.6997%/95.5087% and
unfiltered435.7026%/86.1901%; Bollinger AND has identical targets. Five-event
concentration, July31 dependency, worse recentDD and failed chronological
selection remain mandatory limitations. Research candidate only, not adopted.

## Hard dual-return rebound continuation

`research/nikkei-overlay-stability/{DUAL_RETURN_DESIGN.md,dual-return-study.ts,dual-return-study.test.ts}`
links unchanged inherited fallback/native accounts to91 fixed entrance/exit
profiles, exact full/final500 acceptance, production/reference parity and
first1500-only selection. Scoped local exits have explicit tag transfer,
observed-close triggers, cooldown and no synthetic recovery; original entries
remain authoritative. `DUAL_RETURN_EXTENSION_DESIGN.md` and
`dual-return-extension.ts` add54 separately declared scope variants without
changing the first91 or their checkpoint. Preserve atomic91/55-row state under
data/dual-return and data/dual-return-extension, selected ledgers and combined
report under matching output paths, execution/cost/common-state diagnostics
and actual-account episode omissions. Combined145 cases yield16 goals but
only3 distinct paths; the simple EMA3 fallback improves both metrics with
unchanged DD but only3 additions/one final500 contributor and no postJuly21
improvement. This is research evidence, not an adopted model/default/UI change.

## SMA20 replacement and causal low-rebound research

`research/nikkei-overlay-stability/{SMA20_FALLBACK_DESIGN.md,sma20-fallback.ts,sma20-fallback.test.ts,sma20-fallback-audit.ts}`
links frozen full-screen prices/signals, isolated ResearchAccount feature
facades and2000-bar production parity. Twenty frozen policies compare faster
price gates, turn-only SMA20 OR rebound exceptions and independent empty-
account fallbacks. Causal flat lows/pre-low peaks, native-entry priority,
all-original-signal vetoes, existing holding/stops/recovery and zero-only
scope stay linked. Six separately labelled weaker-background audits and
single-event unlock/whole-account omission replays expose hindsight and
entry-versus-exit risks. Atomic outputs under output/sma20-fallback and
output/sma20-fallback-audit include all cases, ledgers, source/code identities,
flat intervals, blocked turns, MFE/MAE, cost/next-open/common-state results
and dated drawdowns. Hybrid-x4 improves full/recent return but worsens full/
recent DD and final500 return; not adopted. No live model, UI or default changes.

## Explicit-mode independent supplemental proposal

`research/nikkei-overlay-stability/{SUPPLEMENTAL_REPAIR_DESIGN.md,supplemental-repair.ts,supplemental-repair.test.ts,supplemental-repair-audit.ts}`
links frozen prices/signals, original v5 controller parity,577 declared policies
and one actual combined portfolio. Positive main targets remain exact. Explicit
range/wide-range confirmation, hysteresis, residence/shock exits and next-bar
eligibility gate only new sleeves; entry queues, cancellations, rearming,
main priority and sleeve exits have separate causal state. Persist20-case
scalar checkpoints under data/supplemental-repair and reject identity drift.
Output/supplemental-repair contains full comparisons, selected actual ledgers,
cost/next-open/common-state diagnostics, exact mode-intervals.csv, omission
attribution and RECOMMENDATION.md. Fifty-percent candidate improves full/recent
history but has only3 episodes and loses chronological selection; do not adopt.
No live indicator, strategy registry, chart UI, model or default is changed.

## MA/ATR segmentation and EMA20 derivative research

`research/nikkei-overlay-stability/{SEGMENTATION_DESIGN.md,ma-atr-segmentation.ts,ma-atr-segmentation.test.ts,ma-atr-segmentation-plot.py}`
links all6566 frozen bars to12 fixed MA/confirmation descriptions. Preserve
initial observed/confirmed/next-bar labels and separate shock events; initial
205-segment last2000 primary has turning-point lag, retained as a comparison.
`MA_DERIVATIVE_DESIGN.md`, `ma-derivative-study.ts`, its test and plotting script
add8 backward-only EMA20 slope/curvature/efficiency comparisons. Store broad
background and rapid sub-move segments separately, with observed-close versus
next-bar timing and censored forward evaluation restricted to warning diagnostics.
Atomic JSON/CSV/reports and all-history/last2000/recent PNGs live separately
under output/ma-atr-segmentation and output/ma-derivatives. No live indicators,
strategy registries, chart UI, saved models or trading defaults change.

## Supplemental episode sizing and attribution research

`research/nikkei-overlay-stability/{REGIME_SIZING_DESIGN.md,regime-sizing.ts,regime-sizing.test.ts}`
links current-v5 account behavior to321 predeclared actual partial-allocation
policies. Compare wide/weak-wide entry detection, EMA/all-supplement scope,
turn/pending3 entries, fixed/ATR budgets, optional confirmation restoration
and baseline/WMA/EMA/ATR-giveback exits. Preserve ordinary absolute targets,
entry ages, cooldown and actual stopped-allocation recovery. Atomic20-case
scalar progress lives in data/regime-sizing/grid.json; full grid, selected
ledgers and execution sensitivities live under output/regime-sizing.
`REGIME_SIZING_REVIEW_DESIGN.md`, `regime-sizing-review.ts` and its test add321
common-state forks to distinguish pre-cutoff path dependence from local rules.
Forks are retrospective diagnostics, never live date-based switches. Outputs
remain separate under output/regime-sizing-review. No default/model changes.

## Market-characteristic diagnosis and causal tuning

`research/nikkei-overlay-stability/{REGIME_TUNING_DESIGN.md,regime-tuning.ts,regime-tuning.test.ts}`
links frozen full-screen prices/signals, existing current-v5 ResearchAccount
and2000-target production parity. Describe the post-July21 interval and30
nonoverlapping historical64-session blocks; nearest-five analogues use only
market features. Runtime detection instead uses lagged ER20/Wilder14 ATR ranks,
two-day confirmation and hysteresis. Thirteen declared policies keep one account
and preserve pending reductions/entry/cooldown state across regime changes.
Atomic bounded ledgers/report/summary live under output/regime-tuning, with
first1500 selection,252-session comparisons and cost/next-open sensitivity.
No live indicator, provider, saved-plan, protocol or default-policy changes.

## SMA14..20 supplemental-entry diagnosis

`research/nikkei-overlay-stability/{SMA_ENTRY_DESIGN.md,sma-entry-study.ts,sma-entry-study.test.ts}`
links the immutable full-screen input/signals with existing Context/ResearchAccount
and current-v5 production parity. Compare28 SMA14..20/turn-window cases without
changing original entries, exits, reversals or live defaults. Atomic per-case
ledgers and summary/report live in output/sma-entry-14-20. Report inherited
post2026-07-21 returns, baseline holding, pre-cutoff choice, costs and next-open
sensitivity. Short bounded reruns regenerate derived artifacts; no new persistent
cache, scheduling or source fetch. Technical research and state record findings.

## Intentional price-chart zoom

`app/components/PriceChart.tsx` uses direct native inside wheel zoom without a
modifier key, per user preference. `MarketWorkspace.tsx`
uses localized chart-stage hover guidance; slider zoom is unchanged. Chart
configuration tests cover modifier-free wheel zoom and unchanged slider behavior.
The interaction is independent of market-refresh/session state; earlier browser
investigations remain historical context. No quote-data changes.

## Archived v5 hold7 and bullish reversal policy

Archived shared overlay v5 implements the user-selected hold7 plus >=5% decline /
bullish body engulfing variant. Daily cached reversal features connect
`lib/analysis/sma-position-overlay.ts`, saved version membership, both pages,
`app/components/SmaPositionOverlayControls.tsx`, locale and styles. Historical
v4 remains fixed hold5/no reversal; research comparisons and v4 tests explicitly
pin that version. Dedicated v5 tests verify gate exemption, signal/cooldown
priority, hold7 versus early5, emergency exits, next-open and prefix causality.
All2000 targets match the selected research ledger:382.6996508%/-12.0186696%.
Shared concise copy has eight rules, expandable exact reversal definition and
execution note. Cycle rules follow task actions; research settings use compact
optimization/validation row then full-width two-column rules, stacking on mobile.

## Missed V-bottom entry research

`research/nikkei-overlay-stability/{V_RECOVERY_DESIGN.md,v-recovery-study.ts,v-recovery-study.test.ts}`
links frozen full-screen source, shared Account/Features and exact current-v4
parity to386 confirmed entry/hold/exit/risk-recovery candidates. V signals
use only completed OHLC, chronological decline and flat/no-original-signal
entry; optional average exemptions apply only to additional V entries.
Atomic resumable scalar metrics live in data/v-recovery-confirmed/grid.json;
selected ledgers, diagnostics and REPORT.md live in output/v-recovery-confirmed.
Earlier exploratory directories remain intact. No live UI/model changes.

## Additive six-percent held-peak exit research

`research/nikkei-overlay-stability/{TRAILING_STOP_DESIGN.md,trailing-stop-six.ts,trailing-stop-six.test.ts}`
reuses frozen full-screen input/decisions, ExpandedAccount and current v4
production parity. Compare current rules, additional6% trailing close exit,
replacement-only6% and additive5/7% neighbors, all with wait5/recovery.
Per-case ledgers and summary are atomically stored under
`output/trailing-stop-six/`; no UI, saved model or production rule changes.
Small bounded five-case deterministic reruns need no additional checkpoint.

## Fixed default SMA20/WMA confirmation/early cumulative-stop policy

New research/cycle calculations use immutable v4 options from
`sma-position-overlay.ts`: SMA20-gated EMA7 supplement, WMA7 flat-entry/sell
confirmation, SMA11 protection, hold5, early cumulative4% stop, wait5 and
trend recovery. `SmaPositionOverlayControls.tsx` now renders a seven-item
localized list with no checkboxes or persistence; both workspace call sites
use it directly. Old preference reads/writes and setters are removed because
current policy is always enabled, while old stored preferences remain intact.
Saved-plan parser accepts all four models and preserves archived identities;
old hold5 tests/research are pinned to v3. Cached daily features and bounded
episode/cooldown state remain within the shared controller used by ordinary,
native-order and cycle ledgers. Dedicated policy tests and rendered contracts
cover order priority, gates, protection, early-stop scope, cooldown/recovery,
next-open timing, prefix causality and old-model compatibility. Production
2000-day targets reconcile with the328.0321%/-12.0187% research variant.

## Cumulative stop-loss threshold research

`research/nikkei-overlay-stability/{CUMULATIVE_STOP_DESIGN.md,cumulative-stop-study.ts,cumulative-stop-study.test.ts}`
links the immutable full-screen source and ExpandedAccount to1368 cumulative
entry/peak and daily-control stop rules. Preserve original sequencing and hold5
unless an explicit research stop fires; stops use observed closes, cooldown
blocks all buys, and recovery uses causal trends. Full grids, threshold-neighbor
rows, development/final500 comparisons, selected ledgers and execution/cost
sensitivity live under `output/cumulative-stops/`. Atomic50-row identity-checked
progress lives separately under `data/cumulative-stops/`. State, methodology,
pipeline and retention docs record limits and concentrated-event caveats.
Production continues with hold5 only.

## Expanded simultaneous return/drawdown research

`research/nikkei-overlay-stability/{DRAWDOWN_EXPANSION_DESIGN.md,drawdown-expansion.ts,drawdown-expansion.test.ts}`
links the frozen full-screen source to975 supplemental quality, pending-sell
confirmation and risk/recovery variants. Eligibility explicitly preserves
hold5 baseline return while lowering drawdown. Source/design-checked atomic
50-row metric checkpoints, full CSV, selected ledgers, cost/next-open replay,
development selection and final500 comparison stay linked under the isolated
data/output directories. Tests cover causal prefixes and risk-state transitions.
Methods, limitations, state and retention are documented; production enables
only the separately authorized hold5 rule.

## Supplemental five-bar protection and drawdown research

`sma-position-overlay.ts` adds v3 supplemental entry-age protection; page
preferences and localized checkbox copy use the current model. Saved-plan
parsing retains v1/v2/v3 identities; historical research scripts stay on v2.
Controller and rendered tests cover age, original entries, pending minima and
cancellation. Existing cycle winners/queues remain intact. Research files
`research/nikkei-overlay-stability/{DRAWDOWN_DESIGN.md,drawdown-study.ts,drawdown-study.test.ts}`
reuse frozen inputs for39 risk experiments, production hold5 parity,
first1500-only selection and final500 checks. Results are isolated under
`output/drawdown-hold5/`; experimental risk rules are not enabled in production.

## Bounded entry/exit condition research

`research/nikkei-overlay-stability/{RULE_VARIANTS_DESIGN.md,rule-variants.ts,rule-variants.test.ts}`
links the immutable full-screen input to 96 event/state entry, pending-sell
confirmation and supplemental holding-period variants. A feature-view adapter
reuses the shared account; pending minima, original priority and cancellation
remain unchanged. Production baseline parity, prefix causality and state tests
support fixed-grid, first1500 selection, subsequent500 and inherited expanding
deployment comparisons. Complete grid, selected ledgers, cost sensitivity and
source/code identities live in `output/rule-variants/`. Technical research and
project state record methodology, limitations and bounded resource assessment.
No production setting, source price, screening winner or queue changes.

## WMA7-turn and delayed-EMA entry research

`research/nikkei-overlay-stability/{WMA_TURN_DESIGN.md,wma-turn-study.ts,wma-turn-study.test.ts}`
links the existing immutable full-screen source to delayed blocked-EMA and
independent WMA7-turn entry variants. Both reuse the shared research account
and production close ledger, preserve pending sells and original-signal
priority, and compare full-period and four 500-session blocks with current
production baseline. Focused state/cancellation/crossing tests and baseline
production parity guard semantics. Outputs, August-2021 diagnostics and source
hashes are isolated under `output/wma-turn/`; project state records results
and the bounded short-run/no-new-checkpoint assessment. Production is unchanged.

## Research screening entry panel without EMA family refinement

`app/MarketWorkspace.tsx`, `app/globals.css`, `app/i18n/zh-CN.ts` and
`tests/rendered-html.test.mjs` link the new screening `Entry filter` fieldset
to the shared EMA7/SMA11/WMA7 controls. Remove the old screening slope-filter
UI, draft and interval snapshot field; ordinary and shortcut-batch requests
send a null base filter and omit optional EMA5..8 candidate filters. Preserve
checkbox preferences, account overlays, manual per-leg filters and historical
plan replay. Shortcut batch signatures use false for the obsolete filter
flag. Render/source checks cover grouping, removed controls and both request
paths. Architecture and project state describe the reduced computation scope.

## EMA7 turn or five-open rebound research

`research/nikkei-overlay-stability/{REBOUND_DESIGN.md,rebound-study.ts,rebound-study.test.ts}`
links the existing full-screen frozen input/signals with seven 2..5% rebound
thresholds, independent ledgers, trigger attribution and block returns under
`output/rebound-2-5/`. Rebound uses current close and the latest five opens,
including today. Shared `Account` retains original signal priority, flat-only
supplementation, WMA gate, SMA pending reductions and EMA positive-turn events.
Tests cover causal window expiry, inclusive thresholds, OR behavior, blocked
entries, inherited state and baseline parity. Project state documents the
bounded short-run/no-new-checkpoint assessment; no production feature changes.

## Completed full-screen overlay parameter comparison

`research/nikkei-overlay-stability/{full-screen-grid.ts,FULL_SCREEN_DESIGN.md}`
links batch-specific frozen full-screen input, causal signals, 8000 independent
6..15 period/0.025%..0.2% threshold combinations, ranked CSV, complete selected
ledgers and four continuous 500-session blocks. It reuses `Account`, `Features`
and atomic identity-checked research persistence, with production flag-path
parity and summary/full-history ledger checks. Data, sources, cache policy and
project state document this separate full-screen source; the previous quick
experiments remain unchanged. No product settings or controls change.

## Compact cycle validation settings

`StrategyValidationWorkspace.tsx` and its locale remove the monitoring-range
editor, long calculation hint and maximum-combination control. New cycle runs
always pass the fixed six-strategy ceiling through signatures, saved tasks,
batch jobs and Worker requests. Historical reports and stored monitoring
coverage remain readable. A running historical task with a different ceiling
is not automatically replaced; an explicit start follows the existing task-
signature replacement behavior. Rendered/source checks cover the removed
controls, fixed ceiling and preserved coverage/legacy guard.

## Exact screening performance

`lib/analysis/strategy-combinations.ts` links lazy proven-reset summary replay
and direct checkpoint stage/row seeking for every screening consumer. Keep
candidate grids, six finalists, all eligible families, deterministic ranking,
weight grids, entry filters and causal execution linked and unchanged.
`tests/screening-exact-performance.test.ts` and the frozen synthetic
`tests/fixtures/screening-exact-selection.json` compare complete pre-change
selection outputs and stage-interior/boundary recovery, ties, failed counts,
repeated interruption and all weight-grid cursor offsets. Existing validation,
local-engine and coordinator tests retain orchestration/disk recovery coverage.
`tests/rendered-html.test.mjs` checks the ordered subsequent-candidate slice
and row-seek structure rather than requiring the obsolete scalar loop syntax.
Architecture, functions, module patterns, data pipeline, technical research and
project state document the same behavior. No UI, wire/checkpoint schema,
search-result version, data source or cache identity change is involved.

## Canonical equivalent strategy catalog

`lib/analysis/strategies.ts` exposes 55 active strategies through `STRATEGIES`
and its horizon/interval selectors. `LEGACY_STRATEGY_ALIASES` retires
`macd-momentum` in favor of `tv-macd`, and `supertrend-trend` in favor of
`tv-supertrend`. Full-grid screening follows this same catalog; historical
lookup, locale names, parameter validation, charting and saved-plan parsing
retain both old IDs using `KNOWN_STRATEGY_IDS` in `saved-backtests.ts` and
`screening-runs.ts`. Result-model versioning invalidates old search/task/cache
identities without deleting archived plans. Linked tests cover signal equality,
active grid exclusion, retained canonical grids, legacy plans and catalog counts.

Current screening is full-only: six execution finalists per eligible family,
100% family participation and up to6 x6 pair crossings. Link both workspaces,
neutral shared overlay controls/CSS, locale, `strategy-combinations.ts`,
validation, Worker/local transports, child checkpoint metadata and cycle task
store. Result-model identity isolates old search/task/cache records. Reusable
parameter-library modules and quick expansion are removed; only explicit
legacy rejection remains. The preserved former library test file now checks
full-only policy, removal, actual pair coverage and restart compatibility.
Historical research below remains evidence about the previous implementation.

Expanded block calibration links `BLOCK_DESIGN.md`, `block-study.ts`,
`block-study.test.ts`, `block-report.ts`, `block-ui-text.ts`, `block-plot.py`
and `output/blocks-5-16/` under `research/nikkei-overlay-stability/`. Shared
production-parity-tested account and production local-slice ledgers execute
13824-configuration optimization across eleven equal train/deploy lengths.
Development-only segment-length choice, inherited live state, bounded atomic
window caches, tied optima, frozen-parameter lifetimes and complete subsequent
fold returns remain linked. No UI or production settings are changed. Reports
retain quick-screen-library limitations and separate full-sample winners from
forward deployment; research state, methods, pipeline and retention docs update
together.

2000-session overlay-stability research links
`research/nikkei-overlay-stability/{DESIGN.md,analyze.ts,analyze.test.ts,report.ts,ui-text.ts,plot.py,README.md}`
and its local frozen data, exact source registry, grid checkpoints, reports,
charts and CSVs. It reuses actual quick-screen winners, production causal
two-bar signals, shared average features and close/next-open ledgers. All8
current flag combinations reconcile against `SmaPositionOverlay`. Four500-day
blocks,5839 fixed configurations,70 chronological update policies and frozen
parameter-age cohorts address parameter robustness without changing product
controls or task identity. Post-hoc EMA8-only diagnostics are explicitly
separate from the primary declared menu's policy selection. Documentation
links `TECH_RESEARCH.md`, `CODEX_STATE.md`, `MODULE_PATTERNS.md`,
`DATA_SOURCES.md`, `DATA_PIPELINE.md` and `CACHE_POLICY.md`.

EMA8..14 fallback research links `ema-fallback-entry.ts`,
`ema-fallback-entry.test.ts` and `EMA_FALLBACK_ENTRY_DESIGN.md` in the rally
study. A research adapter queues only rejected EMA7 turns, compares explicit
backup timing/invalidation policies and delegates pending sells to the shared
production controller. Full control fills reconcile; current UI/rules stay intact.

Deferred EMA7 entry research links `deferred-ema-entry.ts`,
`deferred-ema-entry.test.ts` and `DEFERRED_EMA_ENTRY_DESIGN.md` in the rally
study. The production mixed controller handles all original intents and exits;
a research adapter remembers vetoed supplemental turns with explicit persistence
or cancellation policy. Full control fills reconcile; production settings and
active screening tasks stay unchanged.

WMA3 exit assistance links `wma-exit-assist.ts`, `wma-exit-assist.test.ts` and
`WMA_EXIT_ASSIST_DESIGN.md` in the rally study. Shared causal indicators compare
release of pending original sells with independent crossing clears, retaining
current entry semantics. Primary and prior EMA-priority control ledgers reconcile;
production controls, preferences and queues remain unchanged.

EMA7 priority research links `ema-entry-priority.ts`,
`ema-entry-priority.test.ts` and `EMA_ENTRY_PRIORITY_DESIGN.md` in the rally
study. The production mixed controller selectively bypasses the WMA gate for
supplements while a research adapter retains it for original buys. Source,
metrics and complete baseline fills reconcile; production defaults stay intact.

Downturn diagnostics link `downturn-signals.ts`, `downturn-signals.test.ts`
and `DOWNTURN_SIGNALS_DESIGN.md` in the rally study. Existing causal average
features produce confirmation/weakening signals; separate future-only peak
labels evaluate delay, coverage and subsequent returns. Current production
exit protection and entry gate remain unchanged.
The final user-directed menu is3..12 periods across all three average types;
the final summary path includes `downturn-signals-3-12` to retain the earlier
7..15 output separately.

Mixed-overlay timing review links `timing-review.ts`, `timing-review.test.ts`
and `TIMING_REVIEW_DESIGN.md` in the rally study. Shared research features
compare matched shorter gates/guards and higher thresholds; the production
controller tests a positive-EMA / recovering-WMA supplemental entry. Frozen
control fills reconcile; production UI/defaults and queues are unchanged.

WMA14 all-increase scope research links `wma-add-gate.ts`,
`wma-add-gate.test.ts` and `WMA_ADD_GATE_DESIGN.md` in the rally study. It uses
the production mixed-model controller and frozen cycle10 replay to test blocking
existing-position adds while retaining pending-sell semantics. Outputs and
controls reconcile independently; production controls and queues remain unchanged.

Current page rules use explicit `ema7-sma11-wma7-sma20-hold5-stop4-v4` as
described above, with immutable defaults and a shared rule list. Historical
v1/v2/v3 and unversioned plans retain their original formulas; saved parsing
and checkpoint identities distinguish all four explicit versions. Link the
shared controller, both page memo dependencies, locale, saved-plan parser,
backtest/cycle/native/live consumers, fixed-policy/historical overlay tests
and rendered contracts. `HOLD5_POSITION_OVERLAY_MODEL` retains v3;
`PREVIOUS_POSITION_OVERLAY_MODEL` retains v2 without the lock.
Frozen historical 91.4477%/45-fill ledger ties out via
`research/nikkei-cycle-rallies/verify-mixed-overlay.ts`.

Positive accelerating SMA12 entry research links `accelerating-entry.ts`,
`accelerating-entry.test.ts` and `ACCELERATING_ENTRY_DESIGN.md` in the rally
study. It reuses the production overlay controller and shared study inputs,
metrics and atomic outputs, testing the user-proposed additional flat-entry
condition without changing production controls or screening selections.

Overlay average-type research links `ma-type.ts`, `ma-type.test.ts`,
`ma-threshold-grid.ts`, `ma-threshold-grid.test.ts`, `MA_TYPE_DESIGN.md` and
`MA_THRESHOLD_GRID_DESIGN.md` in `research/nikkei-cycle-rallies/`. It reuses
the indicator implementations, frozen source/signal cache, close replay and
monitoring coverage helpers. All three periods 7..15, three average types
and eight exit thresholds yield 157464 historical configurations. Compact
chunk/threshold summaries and selected full ledgers are separate from raw
inputs. Production SMA controls, optimizer identity and live queues are unchanged.

The legacy unversioned SMA controls introduced `entrySlopeGate` (SMA11
slope <0 blocks flat entries) alongside the two existing options. Core state,
ordinary/native execution, cycle replay, saved-plan validation, settings keys,
page memo dependencies and persisted preferences use the same flag. The user-
requested explanation paragraph and research parameter-traversal display are
removed. Focused tests cover zero slope, original/supplemental/native orders,
existing-position adds, persistence, library isolation and rendered defaults.

Negative-slope flat-entry research links `entry-slope-gate.ts`, its tests and
`ENTRY_SLOPE_GATE_DESIGN.md` under `research/nikkei-cycle-rallies/`. It uses
the production account controller, frozen signal cache, shared close ledger and
monitoring coverage helper, comparing X=3..12 on original and combined cycle10
accounts. Outputs include all variants and rejected attempts. No production
checkbox, ranking, task identity or queue behavior changes.

Trade legend proportions link `PriceChart.tsx`'s series-aware legend builder
and `tests/chart-config.test.ts`: square up/down triangle and diamond paths
preserve aspect independently of the wider indicator legend line samples.

Production SMA12 overlays link `lib/analysis/sma-position-overlay.ts`,
`backtest.ts`, `strategy-cycle-validation.ts`, `strategy-combinations.ts`,
`screening-plan.ts`, `strategy-shortlist.ts`, `saved-backtests.ts`,
`screening-runs.ts`, `screening-worker-client.ts`, shared
`app/components/SmaPositionOverlayControls.tsx`, both workspace pages,
`app/i18n/zh-CN.ts` and shared CSS. Independent, default-checked controls
participate in ordinary research ranking/application/saving; cycle controls
replay existing selections only. Their page preferences, saved configuration,
cache identity, actual fills and guidance remain linked. Validation covers
independent flags, causal native fills, pending next-open versus cycle-close
execution, no-signal entry, saved-plan roundtrip, library isolation, rendered
defaults, frozen 74.6273% reconciliation and full `npm test`.

The SMA12 deferred-exit experiment is research-only: `exit-guard.ts`,
`exit-guard.test.ts` and `EXIT_GUARD_DESIGN.md` in
`research/nikkei-cycle-rallies/` share the frozen signal cache, original cycle
resolver, close ledger and production coverage helper. Current guards use
SMA7..12 only; retain deferred sell targets until protection fails or a new
original increase cancels them. Output summary/CSV link full-period risk,
four range diagnostics, subperiods and next-open sensitivity. No production
configuration, strategy behavior, live queue or UI is changed.

The user-requested SMA7..12 supplemental-entry comparison is research-only:
`research/nikkei-cycle-rallies/sma-flat-entry.ts`, its tests and design record
reuse the original causal selected plans, cycle signal resolver, close ledger,
and production monitoring coverage function. Empty/no-signal positive slope
turns enter once; original later signals manage the same holding. The source-
verified comparison includes baseline, holding and prior 40/80 prototype.
No UI, queue, screening identity or production strategy changes are made.

Cycle monitoring ranges link `lib/analysis/strategy-cycle-monitoring.ts`,
`app/strategy-validation/StrategyValidationWorkspace.tsx`, `app/globals.css`,
`app/i18n/zh-CN.ts`, and `tests/strategy-cycle-monitoring.test.ts`.
Previously saved zero-to-many inclusive ranges remain a separate local
preference, read without rewriting by the now read-only coverage display.
The settings editor is removed. Coverage is the share
of available evaluation trading dates with an executed positive holding after
the close; counts and actual intersecting dates expose partial data coverage.
The four requested 2025/2026 ranges are initial defaults. No-data, invalid input,
overlaps, partial holdings, inherited positions and actual close fills are tested.
See `CODEX_STATE.md` for persistence and resource scope.

The missed-rally research in `research/nikkei-cycle-rallies/` links frozen
cycle winners, shared ranking/execution ledgers, bounded causal longer-window
selection, joint strategy/indicator evidence, all-variant comparisons, and a
504-row single-account decision CSV. Earlier capital blends/fixed switches are
retained research only, superseded by the user's joint-judgment objective.
It changes no product feature. See its README and CODEX_STATE.

Cycle validation now uses completed Nikkei-only daily inputs and same-day close
proxy fills. `tests/strategy-cycle-validation.test.ts` covers completion gates,
current-close timing, final-day execution, no retroactive returns, yesterday's
signal catch-up, sequence exceptions, deduplication, and fixed conflict policies.
The page retains full-period charts. The selected execution account follows
the incoming winner's current signals on conflict, and its return and arrows
remain linked; previous-winner returns are internal research only. Delay/three-bar
confirmation is research-only. Task identity includes the conflict-policy key;
same-model previous-policy tasks migrate without screening again. Cycle chart
canvas and slider drags both move the date window in the drag direction.
The linked
research, frozen inputs, event outcomes, and continuous comparisons live under
`research/nikkei-cycle-conflicts/`; see its README and `CODEX_STATE.md`.

| Feature | Implementation | UI | Tests | Documentation |
| --- | --- | --- | --- | --- |
| Full-only six-finalist screening | `strategy-combinations.ts`, validation, worker/local clients, child checkpoint metadata, cycle task store and both pages | Complete grid, six execution candidates per family,100% eligible families; removed quick UI/library/expansion; model-versioned checkpoints and task compatibility | Repurposed parameter-library tests cover removal,6 x6 crossing, all-family selection, exact resume and stale-model rejection; local-engine and rendered tests | `ARCHITECTURE.md`, `FUNCTIONS.md`, `MODULE_PATTERNS.md`, `TECH_RESEARCH.md`, `DATA_PIPELINE.md`, `CACHE_POLICY.md`, `CODEX_STATE.md` |
| Nikkei fixed-primary missing-date repair | `lib/market/nikkei-freshness.ts`, `types.ts`, `index.ts`, `shortcut-refresh.ts`, `app/MarketWorkspace.tsx`, official Nikkei adapter, canonical cache/merge modules | A stale successful Yahoo result triggers a verified official tail supplement. Primary stays Yahoo; only missing complete dates are added, existing bars remain locked, and the chart labels official supplements | `tests/nikkei-freshness.test.ts`: identity/overlap gates, tail/internal gaps, holidays, incomplete bars, idempotence, source preservation, primary catch-up volume and cancellation; full `npm test`; live API/UI date and source checks | `ARCHITECTURE.md`, `FUNCTIONS.md`, `MODULE_PATTERNS.md`, `TECH_RESEARCH.md`, `DATA_SOURCES.md`, `DATA_PIPELINE.md`, `CACHE_POLICY.md`, `CODEX_STATE.md` |
| Executed shortcut position and venue-local daily completion | `lib/analysis/backtest.ts`, `lib/market/session.ts`, `app/MarketWorkspace.tsx`, `app/i18n/zh-CN.ts` | Original shortcut layout retained; current position uses executed allocation, while existing multi-leg action text distinguishes pending changes. Daily completion follows the venue-local trading date and close, including US sessions crossing Shanghai midnight | `tests/execution-state.test.ts`, rendered current-position and restored-layout assertions, full `npm test` | `CODEX_STATE.md`, `FUNCTIONS.md`, `MODULE_PATTERNS.md` |
| Index/ETF/commodity search | `lib/market/index-catalog.ts`, `lib/market/fund-catalog.ts`, `eastmoney.ts`, `eodhd.ts`, `twelve-data.ts`, `fmp.ts`, `yahoo.ts`, `commodities.ts`, `exchanges.ts`, `index.ts`, `app/api/search/route.ts` | Immediate deterministic major-index, verified-fund, and commodity catalog matches; `164824` resolves to the fixed Shenzhen/Tencent raw identity even from legacy `SHE`/`OTHER`, with Eastmoney retained as backup; `TOPIX`/Chinese alias resolves to the explicitly disclosed, loadable `1306.T` ETF proxy rather than unavailable Yahoo `^TOPX`; time-bounded public discovery before optional credentialed providers; normalized asset and exchange labels | Local `164824` fixed-primary identity and legacy raw replacement, local index catalog including both TOPIX aliases and proxy identity, provider filtering, Yahoo mapping boundaries, global code/venue mapping, credential/no-credential behavior, deterministic commodity catalog, live coverage script | `DATA_SOURCES.md`, `DEBUGGING.md`, `TECH_RESEARCH.md` |
| Daily research workspace | Daily-only state and range inputs in `app/MarketWorkspace.tsx`; daily chart presentation in `app/components/PriceChart.tsx`; daily-only `/api/market` interval validation; interval-aware persisted-record compatibility | One instrument at a time on daily bars; no intraday interval selector or market API access; no synthetic resampling; legacy non-daily saved records retain their stored provenance label but reopen and recalculate on daily bars | Server-rendered daily-only/no-minute control assertion, unsupported market-interval route validation, typecheck, complete tests, and build | `README.md`, `CODEX_STATE.md`, `ARCHITECTURE.md`, `MODULE_PATTERNS.md` |
| Readable responsive controls | `app/globals.css`, shared `app/components/CommittedNumberInput.tsx`, `app/MarketWorkspace.tsx`, `app/strategy-validation/StrategyValidationWorkspace.tsx`, `app/i18n/zh-CN.ts` | Functional microcopy remains readable in shortcuts, chart controls, strategy lab, screening, cycle validation, and status areas; number fields keep an editable draft, select-all on focus, permit temporary blank text, and validate/clamp only on blur or Enter; anchored VWAP uses a native date-time control; the current/all-shortcut refresh button remains visible beside the instrument header below 900 pixels | Rendered CSS/source assertions, shared numeric draft/commit source behavior, refresh interaction, and console-log inspection | `README.md`, `CODEX_STATE.md`, `DEBUGGING.md` |
| Canonical OHLCV, source isolation, adjustment, freshness, volume eligibility, and source status | `lib/market/canonical.ts`, `canonical-cache.ts`, `source-health.ts`, `fingerprint.ts`, `quality.ts`, `provider-errors.ts`, `fred.ts`, `fmp.ts`, `alltick.ts`, `tencent.ts`, `juhe.ts`, `history.ts`, `types.ts`, `exchanges.ts`, `fund-catalog.ts`, `session.ts`, `local-relay.ts`, `shortcut-refresh.ts`, provider adapters, `series.ts`, `/api/market`, `/api/market/reference`, `app/MarketWorkspace.tsx`, `scripts/market-relay.mjs` | Yahoo-first configured profiles except verified Eastmoney LOFs; legacy `SHE`/`OTHER` fund identities are repaired before source selection; incompatible short adjusted LOF caches trigger full raw-history recovery and atomic replacement; Eastmoney dual-history-host attempts and independent Tencent raw daily recovery for SSE/SZSE indexes and ETFs; explicit `Asia/Shanghai` daily identity and UI timestamps; shared aliases; rolling health and backup gates; locked completed OHLC; provider-isolated snapshots; all-shortcut refresh; safe source status | Asia-Shanghai cross-zone current-bar metadata, deterministic and legacy LOF identity, full-history cross-scale Tencent replacement, Eastmoney alternate host, Tencent raw history parsing/request bounds, trading-date order, canonical alias/profile/merge acceptance, volume repair/coverage, rolling thresholds, immutable completed OHLC, session boundaries, failure backoff, shortcut refresh, relay/route tests, and live coverage | `DATA_SOURCES.md`, `DATA_PIPELINE.md`, `CACHE_POLICY.md`, `DECISIONS.md`, `DEBUGGING.md`, `TECH_RESEARCH.md`, `MODULE_PATTERNS.md`, `SECRETS.md` |
| Chart modes, categorized indicator collection, favorites, user-controlled panes, zoom, direct pan, and trade markers | `lib/analysis/indicators.ts`, `indicator-registry.ts`, `lib/analysis/community/{registry,indicators,catalog}.ts`, `backtest.ts`, `trade-markers.ts`, `screening-chart.ts`, interval-aware presentation, visible-OHLC/indicator axis range, and synchronized focus/zoom in `app/components/PriceChart.tsx`, controlled horizontal pan and modular ECharts registration in `app/components/EChart.tsx`, device-local indicator preferences, stable empty-trade input, and empty-query startup guard in `MarketWorkspace.tsx` | Forty indicators including nineteen imported community formulas; all-hidden manual defaults; daily charts initially show the latest 60 trading sessions, including after a saved shortcut is opened, while shortcut strategy metrics and markers still use the latest 128 sessions; applying strategies/results/shortcuts never changes indicator panes; screening progress cannot rebuild an unchanged price chart through a fresh empty-trade reference; left-button drag follows the mouse in proportion to the current visible span, pans linked price, volume, and indicator windows without changing that span, keeps the slider synchronized, and continuously recalculates the y-axis from visible OHLC and enabled price-indicator lines; screening results replay markers only inside their exact selected window or independent multi-period windows and focus their envelope; inherited selected-range exposure is labelled `Opening position` at the first open without creating a transaction | Registry/catalog coverage, stable empty-trade source contract, default 60-session versus shortcut 128-session separation, screening-window proportional-speed/clamping/span and focused x/y zoom tests, visible-range axis tests, interactive controller preservation, aligned/finiteness/prefix-causality tests, pane/zoom/legend geometry, bounded resize and interaction-preserving updates, modular ECharts assertions, live N225 pan verification, and closed/open/inherited marker mapping with unchanged trade count | `FUNCTIONS.md`, `MODULE_PATTERNS.md`, `COMMUNITY_IMPORTS.md`, `TECH_RESEARCH.md`, `CODEX_STATE.md` |
| Minute data delay disclosure | `estimateIntradayDataDelayMinutes` in `lib/market/session.ts`; active-series rendering in `app/MarketWorkspace.tsx`; localized warning in `app/i18n/zh-CN.ts` and `app/globals.css` | While the venue refresh policy is enabled, a newest-bar lag of at least three minutes is shown prominently as an estimate; normal one- or two-minute bar latency is not flagged | Delay threshold unit test, rendered source/style assertions, and live N225 15-minute-lag browser check | `CODEX_STATE.md`, `FUNCTIONS.md`, `DEBUGGING.md` |
| Bollinger and moving-average chart readability | `app/components/PriceChart.tsx`, `tests/chart-config.test.ts` | Visible enabled price-indicator lines expand the candle axis to avoid clipping; strategy lines and lower panes do not. TradingView Pine blue Bollinger boundaries and orange basis stay solid; SMA/EMA/WMA become dashed only while Bollinger is enabled, retaining their colors and calculated data. Wider legend samples show stroke styles. | Finite visible overlay range, offscreen/null exclusion, full Bollinger extent, coexistence and standalone SMA/EMA/WMA including equal periods, unchanged DEMA, existing pan/zoom and price precision regressions | `CODEX_STATE.md`, `ARCHITECTURE.md`, `FUNCTIONS.md`, `MODULE_PATTERNS.md` |
| Strategy price visuals | `lib/analysis/strategy-visuals.ts`, `app/components/PriceChart.tsx`, existing indicator and price-order helpers | Useful semantic thin 1.5-pixel dashed lines match their legend samples; all-null lines are omitted; long/short entry and exit references use four localized action labels; buy markers sit below candle lows and sell/range-exit markers above candle highs; K-line tooltips/crosshair use one decimal while shared price ticks stay integer | All-strategy declared-line coverage, exact Technical Ratings vote-line coverage, direct order-plan reuse, null-line removal, action labels, one-decimal tooltip/crosshair, integer axis, marker placement, pointer silence, zoom, and exact thin dashed chart-style tests | `FUNCTIONS.md`, `MODULE_PATTERNS.md`, `DECISIONS.md` |
| Strategy backtest and latest guidance | `strategies.ts`, `built-in-strategies.ts`, `community/strategies.ts`, `strategy-orders.ts`, `strategy-execution.ts`, `entry-filter.ts`, `live-guidance.ts`, `backtest.ts` | Generic Strategy A/B/C panel with all 55 strategies, including twenty-three long-only community ports; saved commission preservation; optional per-leg entry filters; hybrid execution disclosure | Registry/catalog coverage, long-only targets, prefix causality, volume exclusion, final-close mark-to-market, next-open timing, price-order execution, allocation, and cost tests | `COMMUNITY_IMPORTS.md`, `DECISIONS.md`, `FUNCTIONS.md`, `MODULE_PATTERNS.md`, `TECH_RESEARCH.md` |
| Latest strategy guidance | `strategies.ts`, `built-in-strategies.ts`, `strategy-orders.ts`, `strategy-execution.ts`, `entry-filter.ts`, `live-guidance.ts`, `strategy-combinations.ts`, `market/session.ts` | Single/dual saved shortcuts retain allocation and per-slot entry/exit guidance; three-through-nine-leg shortcuts show the current 0%/60%/80%/100% core-satellite target, non-core support, long-cycle core state, current action, and volatility risk cap | Buy/hold/sell/wait transitions, filtered new-buy suppression with sells preserved, incomplete/unknown close-signal freeze with active stop-order fills, core/tactical live-support fields, volatility-cap causality, and rendered shortcut placement | `ARCHITECTURE.md`, `FUNCTIONS.md`, `DECISIONS.md`, `MODULE_PATTERNS.md`, `TECH_RESEARCH.md` |
| Strategy stability diagnostics | `lib/analysis/stability.ts`, shared parameter validator/input semantics and `buildNearbyParameterSets` in `screening.ts`, existing `runBacktest` | Evidence-insufficient reasons or stable/sensitive; factual nearby ranges and up/sideways/down summaries remain diagnostic-only | Exact-key/range/finite/integer/cross-field validation, integer UI normalization with decimal-level preservation, invalid no-run, 120-observation/two-trade evidence, zero/one/sufficient trades, prefix-safe regimes, inclusive thresholds | `README.md`, `FUNCTIONS.md`, `MODULE_PATTERNS.md`, `TECH_RESEARCH.md`, `DECISIONS.md` |
| Strategy-cycle validation | `app/strategy-validation/StrategyValidationWorkspace.tsx`, `app/components/StrategyCycleRollingChart.tsx`, `lib/analysis/strategy-cycle-validation.ts`, `strategy-cycle-validation-store.ts`, canonical market profile/cache/merge modules, shared screening engine/plan modules, allocation backtester, `app/i18n/zh-CN.ts`, `research/nikkei-cycle-conflicts/` | Nikkei 225 complete daily bars only. Inclusive 5-to-491-session periods (default 128), integer step, two-to-six strategy ceiling, shared causal trend dates, and 2048-unit bound remain. Explicit start refreshes five latest bars over cached full history; restore reuses cache. Decisions, including the final evaluation day, simulate fills at that day's Nikkei close. Plans inherit allocation and preserve all two-bar sequence exceptions. The full-period chart and four-action main-account markers switch among completed periods. The report shows conflict count and incoming-winner execution return without an old-policy comparison. Canvas and slider right drags navigate later dates; saved same-model policy signatures migrate without rescreening. Durable queue, pause/reset, and reattachment remain; task identity includes the new Nikkei close model. Ordinary ranking stays on its historical convention. | Completion/identity gates, latest-bar refresh source contract, close-price fills and costs, no retroactive return, final-day execution, causal prefixes, all six signal sequences and clamps, fixed conflict policies, complete-period chart markers, queue recovery, route SSR, typecheck, full tests/build; research ledger equivalence and identical resumed summary | `README.md`, `CODEX_STATE.md`, `ARCHITECTURE.md`, `FUNCTIONS.md`, `MODULE_PATTERNS.md`, `TECH_RESEARCH.md`, `DATA_SOURCES.md`, `DATA_PIPELINE.md`, `CACHE_POLICY.md`, research README |
| Unified recent-adaptive screening and validation shortlist | `screening.ts`, `strategy-combinations.ts`, `screening-validation.ts`, `screening-chart.ts`, `screening-memory-policy.ts`, Worker modules, `screening-result-cache.ts`, `strategy-shortlist.ts`, orchestration and instrument ownership in `MarketWorkspace.tsx`, shortcut matching in `saved-backtests.ts`, and `scripts/analyze-screening-rank-pruning.mjs` | Fresh research intervals default to maximum total return while balanced score and Sharpe remain selectable and restored snapshots retain their prior objective. Standalone and EMA stages remain exhaustive; after family winners are ranked, the shared all-eligible-family policy lets all55 eligible families enter combinations. Combination screening crosses each eligible strategy's top six parameter finalists `6 x 6` per strategy-ID pair, then uses bounded forward expansion through six legs; every three-to-six-leg level retains up to 16 intermediate candidates per Strategy A primary for continued expansion and receives complete allocation replay, while final display independently keeps at most 30 total and three per primary; viewing another instrument or saved strategy does not cancel the original run or misapply its result; long histories and low-memory hosts use tighter exact checkpoint cadence; a compact navigator below the chart switches result groups and adjacent ranked results; multi-period screening replays candidates in persisted non-overlapping intervals and averages interval ranks equally; the latest completed full result is restored from one device-local IndexedDB record after refresh and replaced by the next run | Maximum-return default, exact standalone grid, evidence-backed percentile selection, eligible-pair crossing coverage, per-primary 16-candidate search constants, complete retained-candidate allocation replay, independent top-30 two-through-six retention, per-primary three-result display cap, chart result navigation, twelve-stage progress, multi-range aggregation/chart mapping, non-interrupting navigation source contract, shared long-history memory policy, Worker cancellation, local latest-result persistence source assertions, and responsive controls | `README.md`, `FUNCTIONS.md`, `MODULE_PATTERNS.md`, `TECH_RESEARCH.md`, `CACHE_POLICY.md` |
| Strategy plans, hierarchical pair screening, and core-satellite multi-strategy positioning | `strategy-combinations.ts`, `strategy-consensus.ts`, `saved-backtests.ts`, `screening-runs.ts`, `strategy-shortlist.ts`, shared order replay, and `MarketWorkspace.tsx` | Optional A–I plan slots remain readable for legacy compatibility; new screening stops at A–F. One leg is direct, two legs retain core/tactical hierarchy, and three-to-six screened legs use the longest-duration strategy as a 60% core while positive 10% non-core weights manage one tactical sleeve; hysteresis and causal volatility caps produce 0%/60%/80%/100% | Pair state-machine regressions; 36/84/126/126 judgment-weight candidates for three through six legs; core-satellite/no-trade/volatility-cap regressions; staged discovery and per-category top-30 retention; archive/save parsing; progress and cancellation | `README.md`, `ARCHITECTURE.md`, `FUNCTIONS.md`, `MODULE_PATTERNS.md`, `TECH_RESEARCH.md`, `DECISIONS.md` |
| Strategy research layout | `MarketWorkspace.tsx`, `globals.css`, localized result headings and naming template in `app/i18n/zh-CN.ts` | Screening results render as six full-width standalone through six-strategy disclosure groups stacked vertically; each group collapses independently and numbers its own engine-ordered rows from one; single/dual rows retain detailed cells, while three-to-six rows use one Strategy-A-led layered-plan name, a two-line remaining-name summary, aggregate weights, and no per-leg parameter columns or horizontal expansion | Rendered order/copy/accessibility assertions, per-category top-30 tests, and disclosure/layout checks | `ARCHITECTURE.md`, `README.md`, `CODEX_STATE.md` |
| Saved backtest shortcuts and folders | `saved-backtests.ts`, `entry-filter.ts`, `strategy-combinations.ts`, market/cache modules, legacy-compatible `db/schema.ts`, `/api/saved-backtests`, `/api/saved-backtest-folders` | Grouped shortcuts retain A–I plans and use one resolved latest-128-session range for rolling returns, current guidance, core/tactical role classification, and chart marker replay. Clicking an instrument-level group opens that instrument as a clean strategy-free chart while preserving manually selected indicators; child rows continue to restore saved strategies. Strategy rows display their current one-based folder position with high-contrast numbers; each one-click screening save is persisted at the top of its matching session folder. The button label, screening length, and folder name all follow the first sample period's trading-session input, with 128 as its default. Single/dual rows keep per-slot prices; three-through-nine rows show current dynamic position, tactical support, action, core state, and volatility cap with no per-leg price rows; old A/B and A/B/C JSON remains valid | Folder/order/delete, exact replacement, folder-top promotion, rolling-range consistency regression, clean instrument-level opening, canonical reuse, legacy and A–I parsing, multi-leg core-satellite rendering, and live shortcut/applied-position agreement | `ARCHITECTURE.md`, `FUNCTIONS.md`, `CACHE_POLICY.md`, `MODULE_PATTERNS.md` |
| Shortcut batch period screening | `lib/analysis/shortcut-batch-screening.ts`, `lib/market/shortcut-refresh.ts`, orchestration in `app/MarketWorkspace.tsx`, `/api/saved-backtests`, `/api/saved-backtest-folders` | The left period button serially screens every shortcut instrument, including indexes, ETFs, funds, and commodity proxies, using the configured session count and optimization objective, saves the global best single/combination result, and assigns it to the instrument's matching `N日` folder. Each successful save appears immediately without changing the manually arranged first-level instrument order. A failure-marked checkpoint retains the run identity and successfully saved instruments for the next click; explicit Stop clears it and makes the next batch start at zero under a new underlying screening-run identity. Nested strategy rows and folders do not swallow instrument-group drops. | Best-result comparison, versioned failure-only checkpoint parsing/resume, fresh-versus-resumed run identity, explicit-stop checkpoint clearing, nested-drop guards, stable group-order source assertions, typecheck, complete tests, build, and rendered control contract | `CODEX_STATE.md`, `MODULE_PATTERNS.md`, `DEBUGGING.md`, `TECH_RESEARCH.md` |
| All-shortcut market refresh | `lib/market/shortcut-refresh.ts`, shared provider registry in `lib/market/types.ts`, canonical/cache/quality/series modules, orchestration and rolling recalculation in `app/MarketWorkspace.tsx` | The header action and each scheduled active refresh cycle de-duplicate and serially refresh every inactive shortcut instrument without changing the visible chart; pending automatic requests survive busy/cooldown state; refreshed records use a fixed latest-128-session comparison window; returns update without adding rank events | Primary history/latest background refresh, canonical identity, pending-request consumption, rolling-return source assertions, and live grouped refresh completion | `README.md`, `FUNCTIONS.md`, `DATA_PIPELINE.md`, `CACHE_POLICY.md`, `MODULE_PATTERNS.md` |
| Screening run archive | `lib/analysis/screening-runs.ts`, `app/api/screening-runs/route.ts`, shared owner resolver, `db/schema.ts` | Backend-only reproducibility archive; completed runs insert compact candidates/configuration/report data and never update shortcut ranking; newest six rows retained | Six-run owner/instrument pruning, fingerprint determinism, parser round trip, no saved-rank side effects, and frontend-history-panel absence | `ARCHITECTURE.md`, `FUNCTIONS.md`, `CACHE_POLICY.md`, `TECH_RESEARCH.md` |
| Same-canonical shortcut market reuse | `canReuseSavedBacktestMarketSeries` in `saved-backtests.ts`; restore boundary in `MarketWorkspace.tsx` | Opening an N225 shortcut while a successful N225 series is active preserves that exact chart series across provider aliases and restores only strategy, parameters, indicators, metrics, and markers; only a different canonical instrument reloads market data | Cross-provider N225 reuse, different-instrument reload, empty-series reload, and rendered restore-source assertions | `ARCHITECTURE.md`, `FUNCTIONS.md`, `DECISIONS.md`, `DEBUGGING.md` |
| Product copy and risk disclosure | `app/i18n/zh-CN.ts` | Workspace and footer | Rendered HTML test | `README.md` |
| Windows local no-login launcher | `open-quantscope.bat`, runtime-port registry, exact-command process sweep, guarded migration and failed-start cleanup in `scripts/start-local.ps1`, `vite.config.ts`, `/api/health`, bounded request boundary in `scripts/market-relay.mjs`, `lib/market/local-relay.ts`, `wrangler.local.jsonc`, local package scripts, existing localhost owner fallback in `/api/saved-backtests` | New maximized Edge window with default-browser fallback at `127.0.0.1:3000`; strict-port Vinext startup cannot drift to another origin; the browser opens once registered port 3000 listens; a small versioned health route replaces full-workspace SSR readiness; an already-ready server is reused before D1 migration; the registry covers the application on 3000 and allowlisted loopback relay on 3001; bounded native Node health probes bypass external-request proxies; a live server that has begun listening receives one bounded 120-second cold-compile grace period after the initial 60-second readiness window; relay health includes the screening-engine protocol version so an exact-checkout legacy relay is safely replaced; every startup path probes health, releases only unhealthy or stray exact-current-checkout owners, reuses healthy services, and reports unrelated owner PIDs without stopping them; failed startup stops its launched tree and rechecks verified leftovers; a Wrangler no-pending-migrations terminal message receives a two-second exit grace period before its exact migration tree is recovered; a child-exit `taskkill` race is accepted only after the verified root has stopped; other timeouts and still-live roots fail startup; relay handler failures are contained per request and connection lifetimes are bounded; development defaults to the fixed relay URL; runtime screening state is excluded from Vite file watching so large cycle queues do not consume development-server watcher handles; proxy values never enter Worker bindings or logs | Versioned application-health response, strict-port source contract, runtime-state watcher exclusion, proxy-bypassing health probe, one-shot listening callback, bounded cold-compile grace, runtime-port inventory, application/relay identity, fallback-port stray cleanup, failed-start cleanup linkage, unrelated-listener preservation, normal migration success/failure exit codes, completed-no-op hang and child-exit-race recovery, generated-command/default-relay validation, relay allowlist/bounds/failure-containment contract, live restart, readiness-before-migration ordering, HTTP readiness, saved-record round trip | `README.md`, `ARCHITECTURE.md`, `FUNCTIONS.md`, `MODULE_PATTERNS.md`, `TECH_RESEARCH.md`, `DECISIONS.md`, `DEBUGGING.md` |
# OOM-safe one-click screening and continuation

- Execution metrics and range/session reuse: `lib/analysis/backtest.ts`.
- Candidate/finalist ranking and stage checkpoints:
  `lib/analysis/strategy-combinations.ts`.
- Fold compaction and displayed-result materialization:
  `lib/analysis/screening-validation.ts`.
- Worker persistence and request identity:
  `lib/analysis/screening-checkpoint-store.ts`,
  `lib/analysis/screening.worker.ts`, `lib/analysis/screening-worker-client.ts`,
  and `lib/analysis/screening-worker-protocol.ts`.
- Workspace namespace linkage: `app/MarketWorkspace.tsx`.
- Regression coverage: `tests/analysis.test.ts` and
  `tests/screening-validation.test.ts`.
- Streaming allocation and compact finalist state:
  `lib/analysis/strategy-combinations.ts` and `lib/analysis/backtest.ts`.
- Transferable market-bar transport:
  `lib/analysis/screening-worker-bars.ts` and the Worker protocol/client.
- Automatic stage heap isolation: `lib/analysis/screening.worker.ts` and
  `lib/analysis/screening-worker-client.ts`.
- Default loopback process isolation, adaptive multi-CPU job concurrency, and disk continuation:
  `lib/analysis/screening-local-engine-{protocol,client}.ts`,
  `scripts/screening-engine-{coordinator.mjs,child.ts}`, and
  `scripts/market-relay.mjs`. Each job remains single-child, while independent
  queued jobs fill an automatically sized process pool; the browser Worker is
  retained only as a pre-start fallback. Exact core/process equivalence and
  disk-checkpoint restart are covered by `tests/screening-local-engine.test.ts`.
- Engine liveness and bounded transport: protocol version 2 stores typed
  columnar bars once, rate-limits progress IPC, exposes throughput/ETA/memory
  telemetry, checks 60-second heartbeats, and resumes an unresponsive child at
  most three consecutive times before reporting an explicit error. Exact
  traversal and shared-core equality remain covered by the same process test.
- Protocol version 3 completes browser binary upload, layered atomic
  checkpoints, persisted filter derivations, lazy result fetch, adaptive
  checkpoint/yield cadence, lazy chart chunks, and stalled-child fault
  injection in `tests/screening-engine-coordinator.test.ts`.
- Protocol version 6 retains the atomic batch queue manifest and durable
  explicit-cancellation markers, invalidates older completed jobs that may
  contain seven- or eight-strategy winners, and resumes only compatible unfinished cycle
  jobs after a loopback coordinator restart.
- Protocol version 7 aligns batch submission, status, cancellation, and lease
  endpoints with the 2048-unit strategy-cycle ceiling. The launcher replaces a
  stale v6 relay before the expanded queue is submitted.
- Protocol version 8 makes lease disconnection non-destructive. The bounded
  durable queue continues until completion or explicit cancellation, and a
  restored running browser task automatically reattaches result collection.
- Local screening protocol compatibility is one linked change unit. The single
  version source is `config/screening-engine-protocol.json`; consumers are
  `lib/analysis/screening-local-engine-protocol.ts`,
  `scripts/screening-engine-coordinator.mjs`, `scripts/start-local.ps1`, and
  protocol-aware maintenance scripts. Request/status behavior also links
  `lib/analysis/screening-local-engine-client.ts`, `scripts/market-relay.mjs`,
  `app/strategy-validation/StrategyValidationWorkspace.tsx`, and
  `app/i18n/zh-CN.ts`. Regression coverage belongs in
  `tests/screening-local-engine-client.test.ts`,
  `tests/screening-engine-coordinator.test.ts`,
  `tests/screening-local-engine.test.ts`, and `tests/local-launcher.test.ts`.
  Any protocol or endpoint edit must review this whole set. An incompatible
  status request must leave the running state with a localized restart message;
  it must not enter an unbounded polling loop.
