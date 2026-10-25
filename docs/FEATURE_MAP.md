# Feature Map

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

Current shared overlay controls now select explicit `ema7-sma11-wma14-v1`:
EMA7 positive-turn supplement, SMA11 >0.125% pending-reduction protection,
WMA14 negative-slope flat-entry gate. Link `sma-position-overlay.ts`, shared
controls, both page memo dependencies, locale, saved-plan parser, existing
backtest/cycle/native/live consumers, `mixed-position-overlay.test.ts` and
rendered tests. Preference v3 migrates old booleans; old unversioned plans
retain original formulas. Frozen 91.4477%/45-fill ledger ties out via
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
Zero-to-many inclusive ranges persist as a separate local preference and update
the selected completed cycle report without rescreening. Coverage is the share
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
| Bollinger and SMA chart readability | `app/components/PriceChart.tsx`, `tests/chart-config.test.ts` | Visible enabled price-indicator lines expand the candle axis to avoid clipping; strategy lines and lower panes do not. TradingView Pine blue Bollinger boundaries and orange basis stay solid; aqua/yellow SMA becomes dashed only while Bollinger is enabled. Wider legend samples show stroke styles. | Finite visible overlay range, offscreen/null exclusion, full Bollinger extent, coexistence and standalone SMA including equal periods, existing pan/zoom and price precision regressions | `CODEX_STATE.md`, `ARCHITECTURE.md`, `FUNCTIONS.md`, `MODULE_PATTERNS.md` |
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
