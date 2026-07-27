# Codex State

## Current status

The daily manual-swing index, ETF, and commodity-proxy QuantScope version is
implemented and buildable.

Implemented:

- Index/ETF/commodity-proxy search with individual-equity filtering. Yahoo
  `FUTURE` results and deterministic gold, silver, crude-oil, and copper
  catalog entries normalize to `commodity`.
- Eastmoney, optional licensed EODHD, Yahoo Finance, and Nasdaq market adapters
  with ordered fallback. EODHD is enabled only by server-side
  `EODHD_API_TOKEN`, accepts daily indexes/ETFs, retries one transient failure,
  and never handles commodity proxies.
  A successful fallback adopts the winning provider's real symbol so later
  five-bar refreshes do not send an Eastmoney `secid` to Yahoo. Legacy saved or
  cached Yahoo rows that still contain an Eastmoney-shaped `secid` are
  translated before the request. Yahoo also continues to its query2 backup
  host after primary-host network exceptions, not only non-success statuses.
- A daily-only, one-instrument user interface. Provider adapters, API
  validation, and saved-record types retain interval support internally.
- Authoritative adjustment metadata on every `MarketSeries`: Eastmoney
  `fqt=1` is adjusted, valid EODHD daily OHLC is scaled by
  `adjusted_close / close`, valid Yahoo daily OHLC is scaled by
  `adjclose / raw close`, Yahoo intraday is raw internally, and Nasdaq is a raw
  daily fallback. Volume is never rescaled. ETF adjustment covers
  distribution/split price gaps; index price-versus-total-return methodology
  remains provider-defined. Yahoo normalizes provider `previousClose` to the
  returned scale and resets it to the preceding normalized bar after slicing.
- Candlestick/line switching, provider volume, shared zoom, and an ordered
  visible collection drawn from 20 indicators.
- Metadata-driven settings for every parameterized indicator, including SMA,
  with a separate focused indicator, device-local per-indicator parameter
  memory, independent toggleable visibility, all-hidden defaults, and
  one-click default restoration.
- Overlay indicators on the price axis and one lower pane per visible pane
  indicator, with price, volume, and all panes sharing zoom. Every configured
  series name reports its actual parameters in a scrolling legend.
- Independent indicator and strategy state so strategy changes preserve the
  visible studies while actual strategy buy/sell fills remain overlaid.
- Buy markers anchor below the matching candle low, while strategy and
  range-exit markers anchor above the matching candle high; all receive
  outward pixel clearance and never cover the candle body or wick. Marker and
  strategy-reference overlays are pointer-silent, and explicit inside-zoom
  drag settings keep single- and dual-strategy price charts equally pannable.
- Pure, bar-aligned strategy price references for 21 price-based strategies.
  Price-order references reuse their exact order plans; all returned references
  render dashed on the main price axis, and strategies without a continuous
  price reference return no lines. Technical Ratings exposes the EMA-20 and
  SMA-50 references used by its price votes.
- Cached full history plus uncached five-bar overlays on page open, manual
  refresh, 60-second visible-page refresh, and page focus/visibility. Only
  identical source, interval, and price-adjustment modes merge; otherwise the
  complete existing history remains active.
- A bounded IndexedDB cache of normalized daily histories for fast shortcut
  opens. It displays a provider/symbol/interval hit immediately, refreshes the
  full history in the background, retains at most 32 series without an age
  expiry, displays the last successful cache-write time, and never substitutes
  one instrument's stale series while another instrument is selected. A
  bounded in-memory fallback covers embedded browsers and storage policies
  that disable IndexedDB for the current application session.
  Requested/resolved provider-key aliases keep legacy shortcut identities
  cacheable after fallback. Cached-first display is visibly marked provisional
  until a compatible network refresh succeeds.
- Shared daily history beginning at 2000-01-01 with a 10,000-bar safety cap.
  Eastmoney, EODHD, Yahoo, and Nasdaq translate the boundary to provider-specific
  date parameters; later-listed instruments begin at their first available
  bar. Internal intraday requests retain their smaller caps.
- A current-bar long-only strategy guidance card that reports the target
  allocation plus increase, reduce, hold, or remain-flat state from the newest
  available provider bar.
- An explicit green-up/red-down legend and a neutral range-end valuation marker
  that is separate from genuine strategy exits.
- Dedicated sky-blue buy and orange sell markers with light borders and dark
  label backgrounds, visually separated from green-up/red-down candles.
- A directly draggable 22-pixel chart timeline selection with visible resize
  handles; parent rerenders and applied screening results preserve the active
  zoom window for the current instrument and interval. Periodic market option
  updates replace only variable axes, grids, zoom, and series components, so
  an active crosshair price tooltip is preserved across a refresh.
- Fourteen extended strategies plus independent equivalents of all 20 official
  TradingView built-in strategy templates.
- Explicit horizon metadata for all 34 strategies: 17 long-horizon trend,
  breakout, channel, and persistent-momentum rules plus 17 short-horizon
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
  exposure at the first selected open. If a flat strategy's entry and exit
  stops are both touched on one daily bar, the engine records the conservative
  entry-then-exit sequence. Selected-range initialization for price-order
  strategies is derived from the full executed order timeline rather than a
  separate close-target approximation.
- Long-only positions, costs, metrics, equity, drawdown, and chart-level
  buy/sell markers derived from actual fills.
- An optional cross-strategy SMA/EMA/WMA slope entry filter shared by the
  strategy lab, stability diagnostics, one-click standalone/combination
  screening, applied metrics, live guidance, and saved shortcuts. It is off by
  default with an EMA(7), 0%/session preset, uses normalized causal slopes,
  delays only new buys, and never forces a sell. Lab and screening drafts are
  independent; each completed screening result freezes and reapplies its
  filter. One-click screening first ranks the complete unfiltered grid. It then
  compares EMA(5), EMA(6), EMA(7), and EMA(8), at a 0% slope, only for each
  explicit trend/breakout/momentum strategy family's top 30 unfiltered
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
- Exhaustive parameter-grid optimization across all 34 strategies, with all
  37,131 valid finite strategy-parameter combinations, no sampling control,
  cancellation, and best-per-strategy result retention. The UI
  yields before entering the optimizer; the optimizer then yields before its
  first evaluation, at each stage transition, and every eight evaluations.
  Each browser cooperative yield is followed by a timer-task boundary so React
  progress commits receive a real paint opportunity instead of chaining
  prioritized continuations until completion. Screening
  builds targets from complete loaded history and restricts only performance
  metrics to the selected range. The EMA phase retains compact Top-30 metrics;
  only each strategy's unique final winner keeps complete execution state for
  pair replay.
- Three deterministic screening objectives: balanced score, maximum return,
  and maximum Sharpe. Return/drawdown and minimum-drawdown targets are not
  exposed. Balanced score is `0.45 * current-window return +
  8 * clamp(current-window Sharpe, -5, 5) + 0.35 * current-window drawdown`.
  Trade count is excluded from rank and remains only a displayed metric and
  candidate/observe-only condition.
- A unified strategy plan with optional Strategy A and Strategy B selections,
  independent parameters and allocations, and the complete registry available
  in both selectors. Either selection can be empty, and duplicate or declared
  equivalent pairs are rejected. Each parameter section is nested directly
  below its own selector.
  For a dual plan, selected-range average active-run length determines the
  relative long-cycle gate; duration ties prefer fewer target transitions and
  then Strategy A. The relative-long entry establishes its allocation, a later
  fresh relative-short entry adds the other allocation, its exit removes that
  layer, and the relative-long exit clears both.
- One unified one-click strategy screen with one objective, one progress
  stream, and one stop action. Its left result
  column returns exactly one best parameter set per standalone strategy. The
  same four-stage run retains one unique final winner per strategy and
  automatically ranks every unordered pair of non-equivalent winners at A=60%
  and B=40%, keeps up to 4,096 pair finalists, then evaluates the alternate
  A=40%/B=60% assignment. Holdings remain 0%, 40%, 60%, or 100%. The current
  maximum is 559 winner pairs, so every retained pair reaches the
  allocation stage. Its right result column keeps one best result per unique
  unordered strategy-ID pair, ranks up to 32 pairs, displays A/B plus the
  derived relative roles, and applies a complete result to the lab and chart.
- Three one-click recent-adaptive modes: default period screening runs the
  complete parameter/EMA/combination/allocation workflow only on one adjustable
  trailing window; the default 128 sessions share one constant with the lab.
  Range screening uses one custom start/end interval. Rolling screening forms
  its retained pool over one custom total interval and equally averages tied
  percentile ranks from fixed-width calendar windows that advance one year.
  Complete earlier history remains available for indicator and opening-state
  continuity, but only active-window performance enters any objective. The
  modes have no training/test stage and make no out-of-sample claim. Completed
  results remain a last-run snapshot across lab plan, date, cash, and cost
  edits.
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
  remain active.
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
  Each new snapshot also stores the ordered indicators visible at save time and
  their exact parameters; legacy rows restore an empty indicator collection.
  The shortcut bar has no separate saved-count row or pagination. It reads a
  bounded 200-row collection into a scroll region, canonicalizes provider
  aliases into one collapsed disclosure per instrument, and reveals concrete
  strategy/indicator snapshots on expansion. Group and within-group drag or
  keyboard ordering is persisted in the owner-scoped `display_order` column.
  Opening a shortcut preserves the shared date range. When its canonical
  instrument matches the successful non-empty active series, the workspace
  also preserves that exact price series across provider aliases and restores
  only plan-derived state; only a different instrument or unusable active
  series reloads market data. Active-instrument shortcut returns are
  recalculated from each saved plan and cost assumptions
  over that range; inactive instruments show no stale numeric return until
  their history becomes active. Creation-time dates and metrics remain durable
  record provenance but are not a second live display interval.
- A lower research area that places the strategy lab and automated screening
  together. The lab edits a draft plan and its backtest; the trend chart,
  markers, and latest guidance retain a separate applied plan until the user
  presses Apply. Screening-result and saved-shortcut row actions update both
  states. Durable saving remains only in the shortcut panel. Screening controls span a
  horizontal bar above equal-width standalone and combination result columns;
  every retained compact, keyboard-focusable result row applies directly,
  tables do not
  use horizontal scrollbars, built-in strategy names omit a redundant prefix,
  combination Strategy A/B use separate compact columns with inline
  name/horizon labels, and combination results do not repeat the equity preview
  already available under the strategy lab.
- Chinese responsive UI with centralized locale copy.
- A one-click Windows local launcher that applies project-local D1 migrations,
  binds vinext to `127.0.0.1:3000`, requires no account, reuses an
  already-running QuantScope server before attempting D1 migration, and opens
  a new maximized Edge window when Edge is available. This ordering prevents a
  second launch from waiting on the live `.wrangler/state`.

## Verification status

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

## Next priorities

1. Replace public website endpoints with a licensed global market-data feed.
2. Add venue-specific trading constraints and adjustment-mode controls.
3. Move large screening jobs to a Web Worker or durable queue when browser
   execution time becomes unacceptable.
4. Add pyramiding, multi-order brackets, limit orders, and optional lower-
   timeframe Bar Magnifier data for templates that require those features.
5. Add a licensed ingestion/archive pipeline and an explicit runtime cache
   retention/cleanup implementation if QuantScope moves beyond browser-driven
   public-endpoint refreshes.
