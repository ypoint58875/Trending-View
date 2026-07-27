# Function Map

## Market data

- `searchEastmoney(query)`: searches and retains only index/ETF results.
- `searchYahoo(query)`: extends global index/ETF discovery and maps Yahoo
  `FUTURE` results to commodity quote proxies.
- `searchEodhd(query)`: when `EODHD_API_TOKEN` is configured server-side,
  searches licensed EODHD metadata and retains only index/ETF results.
- `searchCommodityCatalog(query)`: searches deterministic Yahoo-backed gold,
  silver, crude-oil, and copper entries without waiting for remote discovery.
- `searchMarketAssets(query)`: merges the commodity catalog and provider
  results, then de-duplicates normalized instruments.
- `clampMarketSeriesLimit(requestedLimit, interval)`: applies the shared
  10,000-bar daily cap while retaining the smaller internal intraday cap.
- `requestsExtendedDailyHistory(interval, requestedLimit)`: identifies daily
  requests that must use the shared 2000-01-01 provider boundary.
- `fetchEastmoneySeries(instrument, interval, limit)`: fetches and normalizes
  OHLCV bars with `fqt=1`, adds `beg=20000101` for extended daily history, and
  marks the result corporate-action adjusted.
- `fetchYahooSeries(instrument, interval, limit)`: fetches global chart history.
  Extended daily requests use explicit `period1`/`period2` dates beginning at
  2000-01-01. Daily bars scale all accepted OHLC rows only when every row has a
  finite positive `adjclose / raw close`; one invalid or missing factor keeps
  the entire series on the raw scale. An all-adjusted series scales provider
  previous close by its first accepted factor; slicing sets previous close to
  the immediately preceding normalized bar. Intraday output is raw.
- `fetchNasdaqDailySeries(instrument, limit)`: fetches supported daily index/ETF
  history from the shared start date when extended history is requested and
  marks it raw.
- `fetchEodhdDailySeries(instrument, interval, limit)`: resolves and fetches
  licensed EODHD daily index/ETF bars, retries transient failures, and applies
  one all-or-nothing `adjusted_close / close` OHLC scale. It is disabled when
  the server token is absent and never handles commodity proxies.
- `fetchMarketSeries(...)`: applies the ordered provider fallback and keeps the
  longer valid daily result when extended coverage is needed. Optional EODHD
  precedes the public Yahoo/Nasdaq fallback for daily indexes and ETFs.
- `/api/market?mode=history`: returns cacheable normalized daily history from
  2000-01-01, capped at 10,000 bars.
- `/api/market?mode=latest`: returns an uncached window of up to ten recent
  bars for current-bar replacement. The current UI requests five.
- `mergeLatestMarketSeries(...)`: idempotently retains history and replaces
  overlapping bars by `time`, then sorts and limits the result. It accepts only
  identical interval, source, and `priceAdjustment`; the workspace retains the
  complete existing/history series on any mismatch.
- `resolveLatestDailyBarStatus(...)`: classifies the newest daily bar as
  complete, in-progress, or unknown from provider session-end metadata or the
  documented exchange close.
- `marketSeriesCacheKey(...)`, `readCachedMarketSeriesEntry(...)`,
  `readCachedMarketSeries(...)`, and `writeCachedMarketSeries(...)`: isolate
  normalized IndexedDB histories by provider/symbol/interval, retain at most 32
  without an age expiry, preserve the last successful write timestamp, and
  provide a non-authoritative fast path before background refresh.
  `readCachedMarketSeries(...)` retains the original direct-`MarketSeries`
  contract for hot-reload and older-consumer compatibility; the entry variant
  additionally returns `cachedAt`. A bounded in-memory copy provides the same
  current-session fast path when browser storage is unavailable. Explicit
  requested-instrument aliases keep older shortcuts cacheable after a provider
  fallback changes the resolved provider symbol.
- `parseKlineRow(row)`: parses daily or intraday Eastmoney CSV rows.
- `parseYahooChart(...)`, `parseEodhdDailyRows(...)`, and
  `parseNasdaqRows(...)`: normalize provider payloads into `MarketBar[]`.
  Provider volume passes through without price-adjustment scaling.

## Indicators

- `sma`, `ema`, `wma`, `dema`, `bollingerBands`, `vwap`, `supertrend`,
  `ichimoku`, `rsi`, `macd`, `kdj`, `stochasticRsi`, `cci`, `williamsR`,
  `adx`, `roc`, `mfi`, `cmf`, `atr`, and `obv` return deterministic arrays
  aligned with source bars.
- `stochasticSlow`, `parabolicSar`, and `parabolicSarState` support the
  corresponding built-in strategy equivalents. `parabolicSarState` also
  exposes each bar's causal projected trigger and pre-trigger direction.
- `getIndicator(id)`: resolves display placement and parameter metadata from
  the shared indicator registry.
- `getDefaultIndicatorParameters(id)`: returns a fresh default parameter
  object for one indicator.
- `createDefaultIndicatorSettings()`: creates independent session settings for
  every registered indicator.
- `createDefaultIndicatorWorkspacePreferences()`: creates the all-hidden
  default workspace with SMA focused only for editing.
- `parseIndicatorWorkspacePreferences(...)`: validates device-local focused,
  visible, and per-indicator parameter state before restoration.
- `createIndicatorConfigurations(...)` and
  `parseIndicatorConfigurations(...)`: create and validate the ordered visible
  indicator snapshot shared by the chart and saved-backtest boundary.
- `indicatorConfigurationsEqual(...)`: compares ordered visible IDs and exact
  parameters for shortcut active-state matching.
- `MarketWorkspace` keeps one `focusedIndicator` for settings and an ordered
  `visibleIndicatorIds` collection for chart output. The toolbar click focuses
  and toggles that indicator, while hiding never discards its settings.

## Chart configuration

- `buildIndicatorSeries(bars, indicator, parameters, labels, xAxis, yAxis)`:
  calculates one configured indicator and returns its ECharts series without
  consulting strategy state. Every parameterized series name includes the
  actual calculation parameters; VWAP and OBV remain parameter-free.
- `buildPriceChartLegend()`: returns a non-interactive scrolling legend above
  the reserved main-price plot area.
- `buildPriceChartLayout(times, paneCount)`: keeps overlay indicators on the
  main price axes and allocates one lower grid for each visible pane indicator.
- `buildPriceDataZoom(barsLength, xAxisIndexes)`: links price, volume, and all
  indicator axes to one inside zoom and one directly draggable timeline slider,
  showing the latest 120 bars initially.
- `applyDataZoomWindow(option, window)`: reapplies the user's current zoom
  start/end percentages when chart series or indicators update.
- `buildStrategyLineSeries(lines, labels)`: renders strategy price references
  as semantic dashed lines on the main price axes.

## Strategies

- `getStrategy(id)`: resolves a registry entry.
- `getStrategiesByHorizon(horizon)`: returns the registry entries explicitly
  classified for long- or short-horizon use.
- `LONG_HORIZON_STRATEGY_IDS` and `SHORT_HORIZON_STRATEGY_IDS`: ordered,
  disjoint catalog contracts covering every registered strategy exactly once.
- `TRADINGVIEW_BUILT_IN_STRATEGY_IDS`: the ordered 20-entry completeness
  contract for the official built-in template directory.
- Every strategy provides `buildTarget(bars, parameters)`, producing a
  long-only `0/1` desired-position series without future data.
- Price-triggered strategies additionally provide
  `buildOrders(bars, parameters)`, producing bar-aligned long-entry and
  long-exit stop levels derived only from completed bars.
- `INTRABAR_PRICE_ORDER_STRATEGY_IDS`: the ordered contract covering Donchian
  Intrabar, Supertrend Stop, Channel BreakOut, Greedy, Momentum, Parabolic SAR,
  Pivot Reversal, Price Channel, and Volty Expan Close.
- `resolveStrategyOrderFill(...)` and `buildStrategyOrderTimeline(...)`: shared
  stateful execution primitives for open-only events, touched stops, gap
  prices, target state, and aligned fill prices.
- Combination replay orders different same-bar entry stops from lower to
  higher and exit stops from higher to lower. Identical prices process the
  relative-long layer first. Touched fills are not discarded merely because
  two strategies use different stop prices.
- `buildStrategyOrders(bars, strategyId, parameters)`: validates and returns the
  strategy's existing bar-aligned order plan, or `null` when the strategy has
  no price-order contract.
- `buildMovingAverageSlopeSeries(bars, filter)`: builds SMA, EMA, or WMA from
  closes and returns the aligned normalized one-session percentage slope.
- `buildMovingAverageEntryAllowedSeries(bars, filter)`: converts the slope
  series into an aligned entry-eligibility series using the configured minimum
  threshold.
- `applyMovingAverageSlopeEntryFilter(target, entryAllowed)`: delays only new
  long entries until eligibility becomes true, resets when the strategy target
  exits, and never creates a filter-driven sell.
- `parseMovingAverageSlopeFilter(...)`,
  `cloneMovingAverageSlopeFilter(...)`, and
  `movingAverageSlopeFiltersEqual(...)`: validate, persist, and compare the
  optional shared plan setting. The preset is EMA(7) at 0% per session, while
  omission means disabled.
- `buildScreeningMovingAverageSlopeFilters()`: returns the fixed one-click
  screening contexts EMA(5), EMA(6), EMA(7), and EMA(8), all with a 0% minimum
  slope.
- `supportsScreeningMovingAverageSlopeFilter(strategyId)`: checks the explicit
  trend/breakout/momentum screening family. The list includes Channel BreakOut
  and Price Channel and excludes reversal/candlestick families.
- `buildStrategyPriceLines(...)`: pure strategy visual contract. It reuses
  `buildStrategyOrders` directly for stop-price strategies and
  provides continuous references for `sma-cross`, `ema-cross`,
  `bollinger-reversion`, both Donchian variants, both extended Supertrend
  variants, and Greedy's prior-bar gap levels,
  `ichimoku-trend`, `vwap-reversion`, `tv-bollinger-bands`,
  `tv-bollinger-directed`, `tv-keltner-channels`, `tv-parabolic-sar`, and
  `tv-supertrend`. Technical Ratings exposes the exact EMA-20 and SMA-50 used
  by its price votes. Other strategies return an empty array rather than an
  invented line.

## Stability

- `isValidStrategyParameters(strategyId, parameters)`: requires exactly the
  registered parameter keys, finite values inside each domain's minimum and
  maximum, integer values for shared lookback/count/vote keys, and every
  cross-field constraint. Decimal price and oscillator-level parameters remain
  valid inside their registered ranges.
- `isIntegerStrategyParameterKey(key)`: identifies shared integer-only
  lookback/count/vote keys, including keys ending in `Period`.
- `normalizeStrategyParameterInput(key, value)`: rounds and clamps integer-only
  workspace inputs to at least one while preserving decimal parameter values.
- `buildNearbyParameterSets(strategyId, baseParameters)`: returns an empty list
  for an invalid base; otherwise it returns the base
  parameters followed by valid variants that move one parameter at a time to
  the immediately lower or higher value in its screening domain.
- `classifyMarketRegimes(bars)`: classifies each eligible daily bar as up when
  close is above the current 60-day SMA and that SMA is above its value 20 bars
  earlier, down for the inverse, and sideways otherwise. Warm-up bars are
  unclassified.
- `summarizeNearbyBacktests(base, variants)`: reports return, drawdown, and
  trade-count ranges plus nearby return-sign agreement. Stability requires at
  least one valid variant and all inclusive checks: at least 75% sign
  agreement, at most a 15-percentage-point return range, and at most 10
  percentage points of drawdown deterioration.
- `summarizeRegimeReturns(bars, equity)`: compounds consecutive current-rule
  equity growth by the regime of the current bar.
- `analyzeStrategyStability(...)`: reruns the existing backtest for the base
  and nearby sets and returns diagnostics only; invalid parameters do not run.
  Evidence reports actual/minimum observation and trade counts plus
  `invalid-parameters`, `insufficient-observations`, `insufficient-trades`, or
  `no-nearby-variants`. Stable/sensitive requires at least 120 in-range daily
  observations and two completed base trades; regimes may retain earlier bars
  for causal warm-up. The diagnostic never selects or applies a parameter.

## Simulation

- `buildLiveStrategyGuidance(...)`: evaluates the newest available bar through
  the shared strategy registry and returns buy, sell, hold, or wait guidance.
  An optional entry filter suppresses only a new buy; close-confirmed entries
  use the latest completed slope and active-bar price/open orders use the prior
  completed slope.
- `runBacktest(...)`: executes prior-bar targets at the next bar open or fills
  predefined stop orders when the active bar touches them. A stop crossed by a
  gap fills at the bar open. The function applies costs to long entries and
  exits and calculates equity, drawdown, return, Sharpe, win rate, profit
  factor, trade count, benchmark return, and a screening score. The workspace
  passes `executionPolicy: "hybrid"`.
- `runBacktestFromTarget(...)`: reuses a caller-built complete-history target
  while retaining the same price-order and performance engine. If the prior
  complete-history target is active, the selected-range simulation inherits
  units and cash at its first open without recording an entry or cost. An open
  ending position is marked to the final close without a forced exit.
  Screening uses it so a candidate target is not rebuilt before pair retention.
- `runAllocationBacktest(...)`: executes an aligned `[0, 1]` allocation target
  from the prior completed bar at the next open, with optional aligned causal
  intrabar execution sequences for same-bar price-order changes. Complete-
  history prior state initializes exposure at the first selected open without a
  rebalance or cost. It
  trades only when the planned state changes, so ordinary price drift does not
  create daily recentering fills. It applies costs and reports common
  performance plus rebalance records. Final equity marks open units to the last
  close without a forced rebalance. An optional aligned signal-event stream
  attributes fills to relative long/short entries and exits.
- `resolveStrategyOrderFills(...)`: resolves one bar's open and stop orders
  against the current long-only position. It returns an ordered fill list so a
  flat bar touching both entry and exit stops can record the conservative
  entry-then-exit round trip.
- `summarizeStrategySignalHorizon(target)`: reports average active-run length,
  active-run count, and target-transition count for one strategy target.
- `resolveRelativeLongStrategy(strategyATarget, strategyBTarget)`: selects the
  target with the longer average active run, then fewer transitions, then
  Strategy A as a deterministic exact-tie fallback.
- `buildStrategyCombinationTarget(...)`: accepts any two different registered
  strategies and builds their relative-horizon zero/base/full target.
- `buildStrategyPlanAllocationTarget(...)`: builds single- or dual-strategy
  targets from explicit Strategy A/B allocations, requiring each in `[0, 1]`
  and A+B no greater than one. A single selected strategy always produces a
  100% target; explicit layer allocations apply only to dual plans.
- `buildStrategyPlanTimeline(...)`: rejects duplicate or declared equivalent
  strategy IDs, derives relative roles from the selected range, and builds both
  the allocation target and aligned long-entry, long-exit, short-entry, and
  short-exit events plus causal intrabar execution sequences. A
  relative-long entry starts the base allocation without inheriting an
  already-active relative-short signal. Each later short entry must be followed
  by a short exit or the relative-long gate close.
- `buildStrategyPlanTarget(...)`: returns the target portion of the same
  timeline contract.
- `buildLiveAllocationGuidance(...)`: reports the newest previous/target
  allocation and increase, reduce, hold, or wait action.
- `MarketWorkspace.applyCurrentStrategyToChart()`: clones the current lab draft
  into the applied chart plan and moves the viewport to the trend chart.
  Draft selector/parameter edits do not alter chart lines, markers, or latest
  guidance until this boundary is invoked.
- `buildTradeMarkers(trades)`: maps every real long entry to an open marker and
  every real strategy exit to a close marker.
- `buildAllocationTradeMarkers(rebalances)`: maps allocation increases,
  and reductions to the same chart-marker contract.
  Strategy fills receive one semantic action: open, short buy, short sell, or
  close. A simultaneous long/short exit is one close marker while retaining
  both source events for audit.
- `buildScreeningCandidates(horizons)`: expands every valid finite parameter
  combination for the requested strategy horizons. With the complete registry
  it returns 37,131 unique strategy/parameter candidates and performs no
  per-strategy sampling.
- `screeningObjectiveValue(result, objective)`: maps a backtest to balanced,
  total-return, or Sharpe utility. The balanced score is
  `0.45 * currentWindowReturn + 8 * clamp(currentWindowSharpe, -5, 5) +
  0.35 * currentWindowMaxDrawdown`. Trade count does not enter this score.
- `compareScreeningResults(left, right, objective)`: orders candidates under
  the selected objective and deterministic metric tie-breakers.
- `areStrategiesEquivalent(...)`: reports identical IDs or registry entries
  declared as the same mathematical signal family, preventing meaningless
  self-combinations while keeping each standalone result available.
- `optimizeStrategies(...)`: runs candidates in interruptible chunks, reports
  progress, generates each signal target from complete loaded history, limits
  performance to the selected range, keeps only the best result for each
  strategy under the selected objective, and sorts those best results by the
  same objective. It remains the lower-level standalone-only optimizer; the
  workspace uses the unified combination optimizer below.
- `optimizeStrategyCombinations(...)`: evaluates every supplied standalone
  candidate unfiltered. For each eligible strategy it keeps compact metrics for
  the top 60 and evaluates those sets under EMA5-8. It normally keeps one
  unique final winner per strategy; rolling callers can request a Top-10
  per-strategy pool. It automatically ranks every unordered non-equivalent
  retained pair, retains up to 4,096 pairs, and compares 50/50, 60/40, 40/60,
  70/30, and 30/70. It reports strategy, entry-filter, pair, and allocation
  stages and retains up to 32 ranked combinations, with one best result per
  unordered strategy-ID pair. The current registry creates 559 winner pairs,
  so every pair reaches allocation comparison. Each pair stores and replays
  independent `strategyAEntryFilter` and `strategyBEntryFilter` values. Targets
  are built from complete loaded history and retained only for finalists. The default optimizers yield before
  their first evaluation, at every stage transition, and after every eight
  evaluations. Browser cooperative yields are followed by a timer-task
  boundary so progress state is committed and painted before work resumes.
- `runScreeningInWorker(...)`: creates a module Worker for one complete
  validation run, forwards typed optimization/validation progress, sends
  cancellation, and always terminates the worker. It falls back to the core
  function only when `Worker` is unavailable.
- `fingerprintMarketSeries(series)`: SHA-256 hashes interval, source,
  adjustment, and normalized OHLCV bars for screening provenance.
- `createSaveScreeningRunInput(...)`: converts a validation outcome into a
  compact ranked archive without equity, trade, rebalance, or ranking-replay
  arrays.
- `compareScreeningRuns(current, previous)`: reports winner change, Top-10
  overlap, cross-run ranks, and metric deltas for the same current winner.
- `runStrategyCombinationBacktest(...)`: replays one fixed combination over a
  requested performance window. Callers may freeze the previously selected
  relative-long slot so a later sample cannot redefine the plan.
- `buildSampleValidationWindows(bars, selectedRange, periods)`: validates one
  positive period definition and returns its trailing scoring window. The
  default period is 128 sessions and is also the strategy lab's initial range
  length. Earlier bars remain available only for continuous indicators and
  opening position state.
- `resolveTradingSessionRange(...)` and
  `resolveTrailingTradingSessionRange(...)`: normalize calendar inputs to
  loaded trading bars, count the inclusive sessions, or derive a trailing
  session range ending at a requested loaded date. The workspace uses these as
  the shared two-way boundary between the period input and lab dates.
- `buildRollingValidationFolds(bars, range, windowYears)`: advances one
  fixed-width calendar window by one year inside a configured total interval.
  Boundary windows are normalized to loaded sessions and labelled partial.
- `runScreeningWithValidation(...)`: period mode runs the complete optimizer
  only on the configured trailing window and converts retained objective order
  into a tied percentile rank. Range mode runs the complete optimizer only on
  one custom interval. Rolling mode forms the retained candidate pool on its
  configured total interval, replays that pool in each fixed-width window,
  converts every window to tied percentile ranks, and equally averages those
  ranks. Complete history remains available for causal indicators and opening
  state, but metrics before each active boundary never enter its score. No mode
  labels its configured windows as training, test, or out-of-sample.
- `equityReturnCorrelation(left, right)`: aligns daily equity returns by date
  and returns their Pearson correlation when at least three finite shared
  observations have non-zero variance.
- `evaluateRecentStrategyEffectiveness(result, bars)`: compares the latest 30
  aligned sessions of strategy equity and instrument closes, requires two
  recent strategy executions, and uses 63-session excess return to distinguish
  mixed evidence from a review-required result.
- `selectStrategyShortlist(singleResults, combinationResults, bars, options)`:
  merges eligible standalone and combination candidates, keeps the objective
  winner as primary, and selects up to two deputies. A deputy must share no
  strategy component with any selected recommendation, have a measurable
  maximum aligned daily equity-return correlation below 0.75, and is then
  ordered by the deterministic quality/diversity score. High-overlap
  candidates may occupy unfilled display slots only with the `alternative`
  role; they never count as deputies. Recent effectiveness is attached after
  selection and never changes rank.

Historical price bars, indicators, strategy lines, live guidance, stability,
and backtests all receive the same normalized `MarketBar[]` from the active
`MarketSeries`.

## Saved backtests

- `createSaveBacktestInput(...)`: creates a compact current-backtest snapshot
  with the complete strategy plan, ordered visible indicator configurations,
  and legacy primary strategy columns.
- `parseStrategyAllocationPlan(...)`: validates optional Strategy A/B
  selections, different IDs, exact parameters, explicit allocation bounds, and
  converts legacy long/short plus core/maximum JSON. It canonicalizes every
  single-strategy plan to full allocation.
- `strategyPlansEqual(...)`: compares strategy IDs, parameter values, and
  allocations so the shortcut bar highlights only the complete active plan.
  Date range is workspace state and is no longer part of shortcut identity.
- `buildLegacyStrategyPlan(...)`: derives a full-allocation Strategy A plan for
  rows saved before strategy-plan JSON existed.
- `parseSaveBacktestInput(...)`: validates index/ETF/commodity identity,
  strategy plan, visible indicator IDs/parameters, date range, costs, and
  metrics at the API boundary. Instrument names use the shared 256-character
  market boundary so provider-resolved Yahoo long names remain saveable.
  Missing legacy indicator state becomes empty.
- `savedBacktestInstrumentKey(...)` and `groupSavedBacktests(...)`: normalize
  provider-specific instrument aliases and create one ordered disclosure group
  per instrument.
- `canReuseSavedBacktestMarketSeries(...)`: returns true only when the saved
  instrument, active instrument, and non-empty successful active series share
  the same canonical key and interval. Shortcut open then preserves that series
  instead of switching providers or reloading the chart.
- `reorderSavedBacktestGroups(...)` and
  `reorderSavedBacktestsWithinGroup(...)`: move a complete instrument group or
  one snapshot inside its current group while preserving every other row.
- `parseSavedBacktestOrderInput(...)`: validates a unique, positive,
  owner-order ID list bounded to 200 rows.
- `GET /api/saved-backtests`: returns up to 200 current-user shortcuts ordered
  by persisted display order, with updated time and ID as deterministic
  fallback keys.
- `POST /api/saved-backtests`: inserts a new current-user strategy snapshot;
  repeated instruments are allowed and a new row begins at the top.
- `PATCH /api/saved-backtests`: verifies every submitted ID belongs to the
  current owner and persists the complete visible order in one update.
- `DELETE /api/saved-backtests?id=...`: removes only the current user's record.

The persistence shape retains an interval field for compatibility. New UI
saves use `1d`, and opening a shortcut does not change the daily-only workspace
interval. Legacy shortcuts display their stored interval and disclose that
opening recalculates the selected setup on daily bars. The active instrument's
visible shortcut returns are derived client-side from each saved plan and saved
cost assumptions over the current shared range; inactive instruments do not
show a stale numeric return.
