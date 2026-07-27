# Changelog

## 2026-07-27

- Replaced pre-window and train/selection/test screening with three
  recent-adaptive modes: one synchronized N-session period, one custom range,
  and equal-rank fixed-width rolling windows over one custom total interval.
  Earlier bars remain available for continuous indicator and opening-position
  state, but only active-window metrics enter selection. The UI no longer
  describes these modes as out-of-sample validation.
- Removed trade count from balanced score. It is now
  `0.45 * current-window return + 8 * clamp(current-window Sharpe, -5, 5) +
  0.35 * current-window drawdown`; trade count remains visible and continues
  to control candidate/observe-only status.
- Removed one-click parameter sampling and now traverses all 37,131 registered
  combinations. Eligible trend/breakout/momentum strategies refine only their
  top 30 unfiltered parameter sets under EMA5-8; each strategy contributes one
  final winner to automatically enabled pair screening, which compares 60/40
  and 40/60 allocations.
- Preserved the current successful price series when a saved shortcut resolves
  to the same canonical instrument, even across provider aliases. Only a
  different instrument or missing series triggers a market reload.
- Added an optional server-token EODHD daily index/ETF adapter with transient
  retry, all-or-nothing adjusted OHLC, provider fallback integration,
  traceable sample data, and safe configuration documentation.
- Unified the period-sample session input, strategy-lab start/end dates, and
  shortcut return interval. Session and date edits now synchronize in both
  directions over loaded trading bars, newly loaded instruments preserve the
  session count, and active-instrument shortcut returns are recalculated from
  each saved plan and costs without overwriting durable snapshots.
- Superseded the earlier same-day shared-range replay contract for range and
  rolling output with the configured-window metric contract above.

## 2026-07-26

- Replaced weighted 64/128/256-session selection with one adjustable period
  sample that defaults to 128 sessions and shares that constant with the
  strategy lab's initial date range. Reduced the strategy-parameter default
  and hard cap to 120, grouped the screening panel by responsibility, and made
  enabled right-side screening compare only EMA(6-8) at a fixed 0% slope
  without pairing finalists from different filter periods.
- Moved every buy marker below its candle low and every strategy/range exit
  above its candle high with additional pixel clearance. Trade-marker and
  strategy-reference overlays are now pointer-silent, and inside zoom declares
  drag behavior explicitly so dense combination overlays cannot block chart
  panning.
- Added an optional shared SMA/EMA/WMA slope entry filter to the strategy lab
  and one-click screening. It defaults off with an EMA(7), 0%/session preset,
  uses causal normalized slopes, blocks only new buys, persists in saved
  strategy plans, and is replayed consistently by screening, stability,
  applied-chart metrics, and live guidance.
- Made the Windows launcher reuse an already-running QuantScope server before
  invoking local D1 migration, preventing Wrangler from waiting on the live
  `.wrangler/state` after reporting that no migrations are pending.
- Fixed repeated N225 latest-refresh failures after long-history fallback:
  Yahoo results now store the resolved Yahoo symbol, legacy
  Eastmoney-shaped Yahoo identifiers are translated, and a primary-host
  network exception continues to the query2 backup host.
- Preserved an active chart crosshair price tooltip across periodic market
  updates by replacing only variable chart components instead of recreating
  all ECharts interaction state.
- Removed the redundant native "Open saved backtest" hover title from shortcut
  cards while retaining an accessible button label and the existing open
  action.
- Replaced saved-shortcut pagination and the redundant saved-count row with a
  bounded scroll region. The bar now shows one collapsible row per canonical
  instrument, reveals its saved strategy/indicator snapshots on demand, and
  persists group or within-group drag/keyboard ordering in D1.
- Added a post-screening three-card primary/deputy shortlist across standalone
  and combination results. The primary follows the selected objective; deputy
  selection balances objective rank with equity-return correlation and shared
  strategy components. Each card includes a separate 30-session recent review
  with 63-session confirmation and applies directly to the chart.
- Added a bounded IndexedDB cache for normalized daily histories. Saved
  shortcuts can display cached provider/symbol/interval history immediately,
  then complete the normal full-history and latest-bar refresh in the
  background. Retention is limited to 32 series with no age expiry, and the UI
  discloses the last successful cache-write time. A bounded in-memory fallback
  covers storage-disabled embedded browsers, and requested/resolved provider
  aliases preserve hits for legacy shortcuts after market-source fallback.
- Cleared page-memory market state before instrument changes and added visible
  warnings when a latest request fails or changes source/adjustment mode,
  preventing an old chart from being labeled as the newly selected instrument.
- Added complete/in-progress/unknown latest-daily-bar metadata using provider
  session end or documented exchange closes. Incomplete close-confirmed live
  signals are frozen at the prior state; causal resting stops remain active.
- Made Yahoo daily adjustment all-or-nothing across accepted bars so one
  missing adjusted close cannot create a mixed adjusted/raw price series.
- Separated strategy-lab draft state from the applied trend-chart plan.
  Selector and parameter edits now require Apply; screening rows and saved
  shortcuts still apply directly.
- Made three-stage screening progress monotonic with stage-local counters,
  rendered every retained standalone/combination result, and guaranteed an
  unexpected optimizer failure exits the running state. Completed results now
  remain visible while the next objective or parameter cap is edited and clear
  only when a new run actually starts.
- Preserved different-price same-bar combination stop fills with a deterministic
  conservative ordering: entry prices lower-to-higher, then exit prices
  higher-to-lower, with the relative-long layer first at equal prices.
- Made Save current strategy persist the chart's applied plan and applied
  metrics rather than unapplied strategy-lab draft edits.
- Initialized selected-range price-order backtests and screening candidates
  from their full-history executed order state, matching application results at
  the range boundary.
- Marked device-cache-first histories as provisional until a compatible network
  refresh completes, and retained requested provider aliases when opening older
  shortcuts after source fallback.
- Preserved the original direct-series cache-reader API while adding a separate
  timestamped entry reader, and guarded workspace state/ref values against
  stale hot-module shapes. This prevents a development hot update from placing
  `{ series, cachedAt }` into state expected to contain `MarketSeries`.
- Added strict TypeScript checking to `npm test`, including local Cloudflare
  ambient declarations.
- Excluded generated distribution files and archived worktree builds from
  ESLint so source linting is no longer polluted by compiled bundles.

## 2026-07-25

- Fixed one-click screening progress that could appear frozen until
  completion. The workspace now yields before starting the optimizer, and each
  initial, stage-transition, and eight-evaluation optimizer yield crosses a
  timer-task boundary so React and the browser can paint intermediate progress.
- Reworked automated screening into a full-width horizontal control bar above
  two equal result columns. Result rows now apply directly by click, Enter, or
  Space; the separate Apply buttons, built-in strategy-name prefix, horizontal
  table scrollbars, and duplicate first-combination equity preview were
  removed. Combination Strategy A/B use separate compact columns with inline
  name/horizon labels, while the two-layer allocation column is narrower and
  centered.
- Kept the latest one-click screening results visible when a saved backtest
  shortcut is opened. They now remain until a new screening run or an explicit
  instrument search starts; editing the next run's objective or parameter cap
  also leaves completed results intact.
- Changed the indicator toolbar to true visibility toggles and made every
  indicator hidden by default. Focused-but-hidden controls now use a neutral
  style instead of looking active.
- Added validated device-local indicator preferences so parameter edits,
  focus, visibility, and display order survive a page restart.
- Added migration `0003_heavy_nemesis.sql` and saved the ordered visible
  indicators plus exact parameters with each backtest shortcut. Opening a
  shortcut restores that indicator snapshot; legacy rows restore none.
- Initialized selected-range exposure at the first selected open when the
  complete-history target was already active, without importing pre-range P&L.
- Changed the shared order resolver to return ordered fill sequences. A flat
  strategy whose entry and exit stops are both touched on one daily bar now
  records a conservative entry-then-exit round trip.
- Added Greedy pending-next-open guidance for completed-candle direction,
  including the active-open opposite-gap override disclosure.
- Declared mathematically equivalent MACD-cross and Supertrend-close strategy
  IDs, rejected those meaningless dual plans, and reduced the complete current
  retained-pair count from 2,244 to 2,236.
- Excluded project-local `.wrangler` state writes from the Vite file watcher so
  saving a shortcut does not reload the page or clear completed one-click
  screening results.
- Split Greedy execution by information time: active-open gaps now execute at
  that open, completed candle direction executes at the following open, and
  the minimum-body filter no longer blocks gap events.
- Changed Parabolic SAR from an extra close-confirmation delay to causal
  projected-SAR stop execution on the touched bar.
- Preserved Donchian and Supertrend close-confirmed strategies and added
  separate Donchian Intrabar and Supertrend Stop variants. The registry now
  contains 34 strategies, with 7,329 quick-grid and 32,518 full-grid
  candidates.
- Added one shared open/stop order resolver for direct backtests, combination
  replay, and live guidance; raised the retained pair bound to 4,096 for all
  current two-finalist parameter pairs.
- Built every screening target from complete loaded history while restricting
  only trades/equity/metrics to the selected dates. Added a bounded complete
  target cache for the two retained finalists per strategy.
- Added standalone and combination regressions requiring screening cards to
  match the same strategy after Apply, including identical allocation
  rebalances and relative-role windows.
- Enabled the shared hybrid execution contract throughout the workspace:
  close-confirmed signals fill at the following open, while causal predefined
  price orders fill on the touched bar and use the open for gaps.
- Added today's entry and exit condition prices plus execution-mode disclosure
  to latest guidance, and removed the obsolete 15:00 clock-based mode switch.
- Made every single-strategy lab plan use and persist 100% allocation; 60/40
  controls now apply only when both Strategy A and Strategy B are selected.
- Changed Save current strategy from an instrument-keyed upsert to an inserted
  snapshot, allowing multiple strategies for the same instrument. Migration
  `0002_flawless_korvac.sql` replaces the unique instrument index with a
  non-unique lookup index, and shortcut highlighting now matches the complete
  active setup.
- Shortened the chart's relative-long entry label to `Open`.
- Replaced fixed long-by-short combination eligibility with every unordered
  pair of different strategies while leaving standalone screening unchanged.
- Made both manual Strategy A/B selectors use the complete registry and derive
  relative long/short roles from selected-range average active-run length,
  with transition-count and Strategy A tie-breaks.
- Preserved hierarchical base/add/reduce/clear execution under the derived
  roles, added same-catalog-horizon coverage and visible role badges, raised
  the retained-pair bound to 2,048 for all 1,984 current parameter pairs, and
  limited dual allocation assignments to 60/40 and 40/60.
- Changed saved plan JSON to generic Strategy A/B fields and added read-time
  conversion for existing long/short and core/maximum records without a
  database migration.
- Made one-click screening responsive by separating the 250-combination quick
  default from the existing 2,500 hard cap and yielding to the browser every
  eight evaluations through its cooperative scheduler followed by a
  timer-task paint boundary.
- Exposed the exact balanced-score formula and documented that
  candidate/observe-only status does not affect ranking. Each observe-only
  badge reports its failed return, Sharpe, or minimum-trade conditions.
- Removed return/drawdown and minimum-drawdown from one-click screening after
  product review. The target menu now contains only balanced score, maximum
  return, and maximum Sharpe.
- Moved each strategy's parameter controls directly below its long/short
  selector and replaced free-form allocation inputs with discrete plan choices.
- Made dual plans event-driven: long entry starts only A, an already-active
  short signal is not inherited, later short entries and exits are paired, and
  a long exit clears both layers.
- Stopped unchanged allocation states from generating daily drift-recentering
  trades and reduced chart labels to open (long buy), short buy, short sell,
  and close; simultaneous long/short exits render as one close.
- Expanded daily chart acquisition to 2000-01-01 with a shared 10,000-bar cap,
  provider-specific Eastmoney/Yahoo/Nasdaq date parameters, longer-series
  fallback selection, and unchanged five-bar latest refreshes.
- Replaced the strategy-lab persistence affordance with an explicit Apply
  action that moves the current plan to the trend-chart view; durable saving
  remains a separate shortcut-bar action.
- Moved Save current strategy into the shortcut panel and removed the
  duplicate lower-lab action.
- Merged standalone and combination screening into one “one-click strategy
  screening” action with one objective, one parameter cap, one progress stream,
  and side-by-side result columns. Standalone rows are unique by strategy ID;
  combination rows are unique by long/short strategy ID pair and keep the best
  parameters and A/B allocation for that pair.
- Replaced core/maximum/tactical holding terminology with explicit long layer
  A and short layer B. A long buy establishes A, a short buy adds B, a short
  sell removes B, and a long sell clears the position.
- Changed combination screening to parameter, pair, and allocation stages,
  with two finalists per strategy, a 1,024-pair bound that covers all 1,020
  current retained pairs, and four A/B choices
  that produce only 0%, 40%, 60%, or 100% holdings.
- Initially limited screening to a 500-bar causal prefix; the complete-history
  state fix above supersedes that boundary.
- Added long/short entry and exit attribution to allocation rebalances and
  chart markers; a long-gate clear records a simultaneous short exit when that
  layer is active.
- Added backward-compatible conversion from saved core/maximum JSON to A/B.
- Added optional long- and short-horizon strategy selectors with independent
  parameters plus core and maximum allocation inputs. Long-only, short-only,
  and hierarchical dual plans share one validated allocation model.
- Optimized combination holding across a fixed six-value core-allocation
  ladder, labeled who controls holding, and added Apply actions that restore
  the complete plan, scroll to the main chart, and render both strategy
  references plus allocation increase/reduction markers.
- Persisted complete strategy plans in nullable-compatible D1 JSON while
  deriving full-allocation single plans for legacy rows.
- Added commodity futures quote-proxy discovery for gold, silver, crude oil,
  and copper, Yahoo `FUTURE` support, Chinese aliases, and explicit futures
  modeling limitations.
- Classified all 32 strategies into explicit, disjoint long- and short-horizon
  groups and exposed those groups in the strategy selector and screening
  results.
- Added hierarchical targets where the long rule gates exposure and the short
  rule switches between a configurable core allocation and full planned
  allocation inside the long uptrend.
- Added a partial-allocation next-open backtest with per-rebalance commission,
  slippage, range-end liquidation, and shared screening metrics.
- Added the initial bounded combination-screening foundation: standalone
  finalists, retained long/short pairing, shared objectives, progress,
  cancellation, ranked results, and an equity/drawdown preview.
- Added coverage for horizon completeness, hierarchy truth tables, prefix
  invariance, allocation execution and costs, bounded role-safe optimization,
  progress, cancellation, and rendered UI order.

## 2026-07-24

- Prevented all adjusted/raw latest-history merges and retained the complete
  compatible series across source or adjustment-mode mismatches.
- Added exact strategy-parameter validation and explicit stability evidence:
  120 in-range daily observations, two completed base trades, and a nearby
  variant are required before stable/sensitive can appear.
- Made all configurable indicator legend names reflect actual parameters,
  changed the legend to a scrolling layout with reserved plot clearance, and
  added exact Technical Ratings EMA-20/SMA-50 price references.
- Preserved legacy shortcut interval provenance while keeping all reopened
  setups daily, normalized Yahoo previous-close scale/slice behavior, and
  re-exported `MarketPriceAdjustment` from the market barrel.
- Made the interactive workspace daily-only for one index or ETF at a time
  while retaining interval support inside provider/API types.
- Added authoritative `MarketSeries.priceAdjustment` metadata: Eastmoney
  `fqt=1` is adjusted, Yahoo daily OHLC uses a validated per-bar
  `adjclose / raw close` factor with whole-series raw fallback metadata, Yahoo
  intraday remains raw internally, and Nasdaq is a raw daily fallback.
- Kept provider volume unscaled and routed the same normalized `MarketBar[]`
  through charts, indicators, strategy visuals, guidance, stability, and
  backtests.
- Added focused versus ordered-visible indicator state, independent settings,
  overlay versus one-pane-per-indicator layout, and shared zoom across price,
  volume, and all indicator panes.
- Added a pure strategy price-visual contract for 17 price-based strategies,
  including direct reuse of the five price-order plans, dashed main-axis
  rendering, and empty output for strategies without continuous references.
- Added nearby-parameter stability diagnostics using adjacent valid screening
  values, inclusive 75%/15-point/10-point thresholds, and prefix-safe 60-day
  SMA/20-bar-slope market regimes. The diagnostic never selects parameters.
- Added `DATA_PIPELINE.md` and `CACHE_POLICY.md` to distinguish current HTTP
  caching and in-memory latest-bar merge behavior from future ingestion,
  archival, retention, and cleanup recommendations.
- Added cached full history plus uncached recent-bar overlays on open, focus,
  visibility, and 60-second visible-page intervals.
- Added current dynamic-bar buy, sell, continue-holding, and remain-flat
  strategy guidance without changing historical backtest execution.
- Added explicit green-up/red-down chart copy and separated neutral range-end
  valuation closes from genuine strategy sell markers.
- Added a shared price-order strategy contract and hybrid backtest execution:
  close targets still fill at the next open, while predefined stops can fill
  inside the following bar with gap-aware prices.
- Migrated Channel BreakOut, Momentum, Pivot Reversal, Price Channel, and Volty
  Expan Close to the shared stop-order model without enabling short positions.
- Added configurable and optimizable tick values to Channel BreakOut, Momentum,
  and Pivot Reversal, increasing the default grid to 31,172 combinations.
- Added stop-touch, gap-fill, selected-range first-bar, prefix-invariance, and
  price-order registry coverage tests.
- Matched the N225 Channel BreakOut length-4/tick-0.1 reference trade dates and
  restored the same-period result from 31.52% to 45.01%.
- Preserved the active main-chart zoom window when an optimized strategy is
  applied by updating the existing ECharts instance instead of recreating it.
- Added selectable balanced, return/drawdown, maximum-return,
  minimum-drawdown, and maximum-Sharpe screening targets with deterministic
  tie-breaking and target-value display.
- Made the selected chart timeline range directly draggable, enlarged its
  interaction area and resize handles, and stabilized chart label props so
  parent rerenders do not reconstruct the chart.
- Updated the Windows launcher to open a new maximized Edge window, preventing
  an existing browser split pane from appearing as unused application width.
- Added slider configuration tests and real-browser drag/full-width checks.
- Replaced the fixed three-presets-per-strategy screen with constrained
  parameter grids, a configurable 2,500-combination per-strategy hard cap, and
  27,584 valid default candidates.
- Added chunked screening progress, cancellation, deterministic over-cap
  sampling, and best-per-strategy result retention.
- Moved the strategy lab and automated screening into one lower research area;
  the upper-right sidebar now contains only saved backtest shortcuts.
- Added automated coverage for grid uniqueness and caps, optimizer progress,
  cancellation, best-result sorting, and rendered layout order.
- Added per-user D1 persistence for saved index/ETF backtests.
- Added a right-side save action and shortcut bar that restores the complete
  saved backtest setup and displays its saved return.
- Added an ownership-scoped upsert/list/delete API, schema migration, payload
  validation, and rendered UI coverage.
- Added a root-level Windows launcher for the deployed application.
- Expanded screening to 96 candidates so every strategy is tested with three
  distinct parameter sets, with automated coverage and distinctness checks.
- Added a minimum candle-body filter to parameterize the four previously
  parameterless candle-pattern strategies.
- Restricted every strategy and backtest to long-only execution: buy opens a
  long position and sell closes it; negative reference signals now remain flat.
- Removed short-direction parameters, short trade accounting, and short marker
  mapping while preserving all 32 strategies and 74 screening candidates.
- Added buy and sell annotations to the main chart for the active backtest,
  including immediately applied screening results.
- Upgraded the backtest engine from long-only targets to next-open long, flat,
  short, and reversal execution with direction-aware costs.
- Added independent equivalents of all 20 official TradingView built-in
  strategy templates, including Channel BreakOut.
- Expanded automated screening from 36 to 74 parameter candidates.
- Added catalog completeness, Channel BreakOut, short execution, and trade
  marker mapping tests.

## 2026-07-23

- Created the QuantScope market strategy workspace.
- Added Eastmoney search and OHLCV routes.
- Added chart switching, volume, eight indicators, six strategy families,
  configurable backtesting, and 18-candidate screening.
- Added responsive Chinese UI, tests, documentation, and source traceability.
- Restricted search and examples to global indexes and ETFs; removed the
  individual-equity sample.
- Added Yahoo Finance discovery/history and Nasdaq daily-history fallback.
- Expanded the chart catalog from 8 to 20 indicators, the strategy registry
  from 6 to 12 families, and automated screening from 18 to 36 candidates.
- Added provider filtering, parser, full-catalog alignment, full-strategy
  signal, and live multi-symbol integration coverage.
