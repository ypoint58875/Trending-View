# Function Map

## Canonical strategy catalog

- `LEGACY_STRATEGY_ALIASES`: retired MACD and Supertrend IDs and active equivalents.
- `STRATEGIES`: 55 active strategy definitions used for menus and full grids.
- `KNOWN_STRATEGY_IDS`: active and archived IDs accepted by saved-plan and
  screening-history validation.
- `getStrategy`: resolves active and historical definitions for unchanged replay.

## Position overlays

- `MIXED_POSITION_OVERLAY_MODEL`: current explicit EMA7/SMA11/WMA14 rule set.
  The existing shared controller selects model-specific cached features; its
  inherited-account, pending-sell and execution-timing responsibilities persist.
- Page preferences force the current model and migrate existing three choices.
  Saved-plan parsing accepts the explicit model and rejects unknown versions;
  absent model retains legacy behavior for historical/library data.

- `normalizeSmaPositionOverlay`: omits disabled settings for legacy identity.
- `SmaPositionOverlay.request` / `close`: one inherited account, original signal
  priority, optional positive-turn entry, deferred reductions, daily release
  and fresh-buy cancellation. Optional SMA11 negative-slope gate blocks flat
  entries, including supplements/native orders; adds/exits stay independent.
  No clock or future-bar access.
- `useSmaPositionOverlayPreferences` / `SmaPositionOverlayControls`: independent
  default-checked controls with per-page versioned storage and visible failures.
- Ordinary ledgers expose `latestTargetAllocation` separately from actual
  executed allocation. Cycle replay applies the controller before close fills;
  its chart, returns and monitoring use those actual rebalances.

## Full-only search compatibility

- `COMBINATION_FINALISTS_PER_STRATEGY`: six final execution candidates.
- `COMBINATION_STRATEGY_PERCENTILE`:100, preserving every eligible family.
- `SCREENING_RESULT_MODEL_VERSION`: shared search identity; obsolete optimizer
  checkpoints and latest-result snapshots cannot resume under the new policy.
- `isCurrentCycleScreeningSignature`: prevents restoring old search winners
  and queues, including legacy quick tasks. Stored files remain untouched.
- Removed reusable parameter-library modules, metadata capture, controls and
  quick-stage expansion. Legacy requests are explicitly rejected.


## Nikkei missing-date repair

- `nikkeiNeedsMissingBarProbe`: checks a completed Tokyo weekday and bounded
  recent weekday gaps only as official-probe hints, not a holiday calendar.
- `mergeNikkeiMissingBars`: requires canonical identity, complete official
  sessions and two matching OHLC overlaps, inserts only absent dates, and keeps
  the original primary metadata and immutable bars. Added bars retain OHLC
  provider/access-time provenance; no volume is invented.
- `supplementNikkeiMissingBars`: lazily calls the existing official adapter only
  when probing is necessary, retains primary data on classified source failure,
  and propagates cancellation. Active chart, shortcut and non-strict API flows
  share it; no source-selection oscillation is introduced by date-gap repair.

## 2026-10-24 Nikkei cycle close replay

- `isNikkeiCycleInstrument`: restricts the cycle page to canonical `index:N225`.
- `completedNikkeiCycleSeries`: accepts daily Nikkei series, excludes incomplete
  and future bars, and requires today's provider-complete status after the JPX
  close. It never changes the shared canonical source data.
- `buildStrategyCycleRollingSchedule`: now starts at the first evaluation close
  and allows a final-day trigger; at least three evaluation bars are required.
- `strategyCycleRecentSignals`: builds only a causal prefix and returns the
  final two completed bar-to-bar allocation changes of one selected plan.
- `strategyCycleSignalDirection` / `strategyCycleSignalsOppose`: apply the
  existing reduce-then-increase hold exception before comparing signal intent.
- `runStrategyCycleCloseBacktest`: uses explicit close-price executions through
  the shared allocation ledger without modifying ordinary backtest timing.
- `buildStrategyCycleRollingReport`: `updateReturn` and `rebalances` now follow
  the user-selected incoming-winner execution policy. `newOnConflictReturn`
  aliases the executed total; `oldOnConflictReturn` holds an internal research
  comparison using preceding-winner signals only on conflict dates. No old
  return comparison is shown in the UI. Benchmark entry remains at the
  first evaluation close; the full chart plots the executed account fills.
- `NIKKEI_CYCLE_CONFLICT_POLICY`: versions this user choice separately from
  close-execution timing and engine protocol in task persistence/restoration.
- `migrateCycleConflictPolicySignature`: upgrades only the previous conflict
  policy under the same close model, preserving saved winners and job mappings.

These definitions supersede earlier next-open rolling-cycle descriptions below.

`BacktestPerformance.executedAllocation` reports the last executed normalized
allocation from single-strategy and allocation backtests, including inherited
opening exposure. Shortcut current-position labels consume this field instead
of the latest desired close target. The original shortcut layout is unchanged.
`resolveLatestDailyBarStatus(...)` compares trading dates in the known venue's
timezone before checking its close, preventing Shanghai midnight from completing
a still-active US trading session. Unknown venues retain the existing fallback.

## 2026-09-26 trend-triggered cycle validation

- `buildCycleScreeningWindows(...)`: expands an inclusive integer screening
  range by its configured step, rejecting reversed or out-of-bound inputs.
- `strategyCycleTrendAngle(...)`: converts the normalized one-bar slope of
  MA(2) into a fixed angle where one slope unit is one percent per bar. The
  result is independent of chart scale.
- `shouldScreenStrategyCycleAtIndex(...)`: triggers an exhaustive screen for a
  neutral MA(2), doji, or candle opposing a trend of at least 30 degrees. A
  same-direction candle in a strong trend retains the current plan.
- `buildStrategyCycleRollingSchedule(...)`: requires the configured trailing
  screening window before evaluation, always screens once immediately before
  evaluation, and then includes only causal trigger dates that can affect a
  later evaluation session. Every included unit still screens the complete
  configured trailing window. The separate 2048-unit bound remains enforced.
- `resolveStrategyCycleRecentSignals(...)`: applies only the final two bars of
  one newly selected plan to an inherited allocation. Increase-only or
  reduce-only sequences use the final same-direction target,
  reduce-then-increase holds, and increase-then-reduce may only reduce.
- `buildStrategyCycleRollingReport(...)`: stitches the selected plans into one
  continuous inherited-allocation account, changes allocation only on trigger
  decisions with an allowed two-bar sequence, and returns only its total return,
  actual rebalances, and the same-period buy-and-hold benchmark.
- `optimizeStrategyCombinations(...)`: honors `maxCombinationStrategies` by
  stopping staged expansion after the configured two-through-six leg count;
  the option is included in browser/local-worker request identity.
- `buildStrategyCycleRollingChartOption(...)`: plots every evaluation bar and
  the every-update account's actual buy/sell rebalances without creating a
  marker for a plan-only change.

## 2026-09-25 current cycle result maintenance

- `scripts/compact-current-cycle-results.ts`: preflights the exact current
  356-result batch, rewrites each full result to its unchanged selected winner
  via atomic replacement, cancels unfinished jobs outside that batch, and
  removes unrelated screening-engine state directories. The command is
  read-only without `--apply`; `--one-result` supports a bounded resume check.

## 2026-09-22 strategy-cycle validation

- `barsAvailableAtCycleDecision(bars, decisionIndex)`: returns the inclusive
  historical prefix and rejects an invalid decision index, preventing future
  bars from reaching the optimizer.
- `normalizeCycleValues(...)`: de-duplicates, sorts, bounds, and caps user
  screening-window or update-interval values.
- `buildStrategyCycleSchedule(...)`: forms the union of required historical
  decision dates plus the five-session reference grid so compatible update
  intervals share optimization work without fixing the screening-window size.
- `buildStrategyCycleDailySchedule(...)`: creates the daily product grid with
  `evaluation sessions - screening window - 20` units. The window defaults
  to 128 sessions and the daily decision frequency remains fixed.
- `strategyCyclePlanKey(...)`: creates an order-stable exact identity over a
  selected plan and its fixed relative-long role.
- `buildStrategyCycleDailyValidationReport(...)`: consumes daily winners for
  the selected screening window, compares each frozen old/new transition over 5/10/15/20
  future sessions with configured costs, aggregates explicit return-difference
  distributions, splits them by old/new screening-window return ordering, and
  supplies pair-chart dates and pre-change rebalance markers.
  Display aggregates exclude strict-zero returns or strict-zero differences so
  inactive/equal-position events do not dilute medians, means, or counts.
- `runStrategyCycleConfiguration(...)`: replays selected plans through one
  continuous allocation account with next-bar execution and no synthetic
  update-boundary reset.
- `buildStrategyCycleMatrix(...)`: evaluates every normalized window/interval
  pair from persisted selection snapshots.
- `runStrategyCycleNextVintageReference(...)`: shifts every next same-window
  five-session vintage onto the preceding segment to create an explicitly
  retrospective rebalance-event reference timeline.
- `compareStrategyCycleRebalanceEvents(...)`: chronologically matches strategy
  rebalances one-to-one, classifies opposite-direction actions as severe errors,
  and reports correct-direction hits, missed/extra events, late rate, lead/lag,
  allocation error, and paired basis-point impact. Each paired return starts at
  the prior reference rebalance and ends at the later compared adjustment with
  shared start/target allocations and a shared end price. Wrong-direction
  actions never count toward timing or return metrics.
- `buildStrategyCycleEventValidation(...)`: compares every configured
  screening-window/update-interval cell against its common next-vintage event
  reference without selecting a winner.
- `evaluateStrategyCycleEffectiveness(...)`: summarizes median return,
  positive rate, and median benchmark excess at fixed forward horizons.
- `readLatestStrategyCycleValidationTask(...)`,
  `writeStrategyCycleValidationTask(...)`, and
  `clearStrategyCycleValidationTask(...)`: manage the single versioned,
  transactional IndexedDB task record, including version-2 queued local job
  mappings and version-1 migration.
- `enqueueScreeningBatchInLocalEngine(...)`, `enqueueScreeningInLocalEngine(...)`, and
  `waitForScreeningInLocalEngine(...)`: separate durable local job submission
  from browser result polling so a bounded cycle queue can run without tying up
  the React render loop. `cancelScreeningInLocalEngine(...)` sends one keepalive
  batch request for explicit Pause, reset, and task replacement across all
  submitted units, with per-job DELETE fallback for older coordinators.
- `holdScreeningBatchLeaseInLocalEngine(...)`: consumes a streaming coordinator
  response for the lifetime of the page task. Under protocol v8 this stream is
  advisory: connection loss does not alter durable queue state.
- `waitForScreeningBatchInLocalEngine(...)`: reads the pending job set in one
  bounded status request and imports completed outcomes regardless of queue
  order; it falls back to chunked individual reads for an already-running older
  version-4 relay.
- `hashMarketBars(...)`: computes one deterministic prefix hash that every
  screening window at the same historical decision reuses.
- `unpackMarketBars(packed, requestedCount)`: materializes only the validated
  causal prefix from a shared columnar batch file, bounding per-child object
  allocation without copying a file per unit.
- `createScreeningEngineCoordinator(...)`: persists batch membership in an
  atomic queue manifest, restores unfinished non-cancelled units at startup,
  and atomically records single-job or bounded batch cancellation before
  stopping children. Its job-lease endpoint streams heartbeats without treating
  response closure as user cancellation.
- `screeningResultPlan(...)`: converts single or combination screening winners
  to the shared allocation-plan representation for both workspaces.

## 2026-08-20 additions

- `supportResistanceBreaks(...)`: confirmation-bar levels, EMA(5)/EMA(10) volume-oscillator filtering, close crossovers, and both wick conditions without backpainting.
- `validateMultiRangeWindows(...)`: normalizes at least two explicit intervals and rejects invalid, undersized, or overlapping periods.
- `runMultiRangeValidation(...)`: independently replays retained candidates in every selected interval and orders them by equal-weight average normalized rank.
- Community strategy builders: seventeen causal long-only formula ports; every bearish source state clears rather than shorts.
- `keltnerChannels`, `donchianChannels`, `choppinessIndex`, `aroon`, and `trix`: aligned series consumed through the shared indicator registry and chart renderer.

## Market data

- `searchEastmoney(query)`: searches and retains only index/ETF results.
- `searchYahoo(query)`: extends global index/ETF discovery and maps Yahoo
  `FUTURE` results to commodity quote proxies.
- `searchEodhd(query)`: when `EODHD_API_TOKEN` is configured server-side,
  searches licensed EODHD metadata and retains only index/ETF results.
- `searchCommodityCatalog(query)`: searches deterministic Eastmoney-backed
  gold, silver, crude-oil, and copper continuous proxies without waiting for
  remote discovery.
- `searchIndexCatalog(query)`: resolves a deterministic local catalog of major
  global and mainland index symbols without a provider request. TOPIX aliases
  resolve to the explicitly labelled, loadable `1306.T` ETF proxy.
- `searchMarketAssets(query)`: merges the commodity catalog and provider
  results with Yahoo exact-symbol results first, then de-duplicates normalized
  instruments. Local catalog hits return immediately. Otherwise public
  provider discovery runs before optional credentialed providers and is
  bounded by a four-second deadline.
- `clampMarketSeriesLimit(requestedLimit, interval)`: applies the shared
  10,000-bar daily cap, a 2,500-bar native one-minute cap that can retain a
  complete five-session provider window, and the smaller 1,500-bar cap for
  other intraday intervals.
- `requestsExtendedDailyHistory(interval, requestedLimit)`: identifies daily
  requests that must use the shared 2000-01-01 provider boundary.
- `fetchEastmoneySeries(instrument, interval, limit)`: fetches and normalizes
  OHLCV bars with `fqt=1`, adds `beg=20000101` for extended daily history, and
  marks the result corporate-action adjusted. It tries the primary and
  alternate Eastmoney history hosts plus the local relay within one bounded
  request deadline. A
  verified Eastmoney LOF instead uses raw `fqt=0` history and reports `raw`.
- `fetchYahooSeries(instrument, interval, limit)`: fetches global chart history.
  Extended daily requests use explicit `period1`/`period2` dates beginning at
  2000-01-01. Daily bars scale all accepted OHLC rows only when every row has a
  finite positive `adjclose / raw close`; one invalid or missing factor keeps
  the entire series on the raw scale. An all-adjusted series scales provider
  previous close by its latest accepted factor; slicing sets previous close to
  the immediately preceding normalized bar. A validated current-session
  metadata snapshot may append or replace the unconfirmed `Asia/Shanghai`
  current daily bar before Yahoo's daily array catches up. Intraday output is
  raw.
- `fetchNasdaqDailySeries(instrument, limit)`: fetches supported daily index/ETF
  history from the shared start date when extended history is requested and
  marks it raw. Provider-specific definitions use `secid`, so a selected alias
  such as `NDX100` correctly requests Nasdaq symbol `NDX`.
- `fetchEodhdDailySeries(instrument, interval, limit)`: resolves and fetches
  licensed EODHD daily index/ETF bars, retries transient failures, and applies
  one all-or-nothing `adjusted_close / close` OHLC scale. It is disabled when
  the server token is absent and never handles commodity proxies.
- `fetchNikkei225DailySeries(...)`: parses the official Nikkei Indexes CSV into
  no-key N225 daily OHLC.
- `fetchTwelveDataDailySeries(...)`, `fetchFmpDailySeries(...)`, and
  `fetchAlphaVantageDailySeries(...)`: resolve provider symbols and normalize
  credentialed global daily candidates. FMP maps canonical gold `GC=F` to
  `GCUSD` while preserving the canonical code.
- `fetchAllTickDailySeries(...)`: requests daily type `8` K-lines for AllTick
  commodity code `GOLD`, caps one request at 500 bars, and preserves canonical
  gold identity. Runtime HTTP 401 is classified as an invalid credential.
- `fetchMarketstackDailySeries(...)`: fetches adjusted EOD rows only for ETFs.
- `fetchZhituDailyIndexSeries(...)`: fetches SSE/SZSE index-only daily bars,
  using an exchange-local symbol and a bounded 1,500-bar request.
- `fetchTencentDailySeries(...)`: fetches up to 2,000 no-key raw daily bars for
  an SSE/SZSE index or ETF and normalizes them to `MarketSeries`.
- `fetchTencentQuoteSeries(...)`: fetches one no-key SSE/SZSE index or ETF
  session snapshot for a latest-only temporary overlay.
- `parseJuheQuote(...)`: validates the stock-product response, normalizes both
  special index and `gid` payload shapes, preserves the requested canonical
  code, and returns one raw current quote bar.
- `fetchJuheQuoteSeries(...)`: requests one SSE/SZSE index or ETF quote behind
  the server-only key and a 50-call Shanghai-day gate. It is a final quote-only
  fallback, not history.
- `orderMarketRecoveryDefinitions(...)`: keeps no-key Tencent first, quota-
  bearing Juhe last, and removes Juhe after an already accepted temporary quote.
- `temporaryQuoteFromMarketSeries(...)`: validates backup quote identity, date,
  OHLC shape, and relative price against the retained canonical series.
- `mergeTemporaryQuoteIntoMarketSeries(...)`: appends a newer session or
  replaces only an unconfirmed same-day bar in the active in-memory view. It
  leaves the separately retained canonical base untouched for persistence.
- `mergePreferredTemporaryQuote(...)`: de-duplicates new and retained quote
  candidates, prefers the newest date/fetch time, and returns both the merged
  view and the exact accepted quote. A completed canonical bar invalidates a
  same-day temporary quote.
- `refreshShortcutMarketInstrument(...)`: refreshes one inactive shortcut
  instrument against its canonical profile without changing the visible
  instrument. It uses the canonical cache, strict primary request, ordered
  fallback recovery, temporary-quote retention, source snapshots, and health
  records, and returns separate canonical/display series.
- `fetchMarketSeriesStrict(...)`: fetches exactly the provider selected by a
  canonical source definition. Recovery order belongs to the workspace profile,
  not to an adapter.
- `/api/market?mode=history`: returns cacheable normalized daily history from
  2000-01-01, capped at 10,000 bars.
- `/api/market?mode=latest`: returns an uncached window of up to ten recent
  bars for current-bar replacement. The current UI requests five.
- `resolveMarketAutoRefreshPolicy(instrument, currentTime)`: returns the
  venue-local open/post-close/closed/continuous/unknown phase, enablement, and
  minimum visible-page refresh interval.
- `marketRefreshFailureBackoffMs(failures)`: clamps complete-chain retry
  backoff to 15, 30, then 60 minutes.
- `classifyMarketProviderError(error)`: converts provider failures to safe
  credential-invalid, access-denied, quota-limited, not-configured, or generic
  upstream codes without exposing credentials or response bodies.
- `/api/market/reference`: returns the close-only FRED N225 reference without
  manufacturing open, high, or low values.
- `mergeLatestMarketSeries(...)`: idempotently retains history and replaces
  overlapping bars by `time`, then sorts and limits the result. It accepts only
  identical interval, source, and `priceAdjustment`.
- `canonicalMarketInstrumentKey(...)` and
  `resolveCanonicalMarketProfile(...)`: normalize provider aliases and select
  one deterministic primary, independent backups, reference definitions,
  network routes, and methodology. Verified Yahoo symbols become primary;
  verified `164824` instead stays on fixed Tencent raw history with Eastmoney
  raw history as backup; unsupported mappings retain the selected provider.
- `yahooPrimarySymbolForInstrument(...)`: returns a Yahoo symbol only for an
  exact Yahoo-discovered instrument or a deterministic supported index/ETF
  mapping; it returns `null` instead of guessing unsupported exchange suffixes.
- `mergeCanonicalMarketSeries(...)`: locks completed canonical OHLC, permits
  same-primary replacement only for the unconfirmed final bar, appends later
  primary dates, and fills a same-source cached zero volume for the same date
  without changing locked OHLC. A successful primary with a different
  `priceAdjustment` replaces the old series instead of mixing price scales.
- `missingPublishedVolumeRepairKey(...)`: identifies recent isolated completed-
  bar volume gaps only when the surrounding source coverage remains reliable,
  allowing one full-history self-repair attempt without polling permanently
  volume-less instruments.
- `selectCanonicalFallbackSeries(...)`: walks fetched backup candidates in
  profile order, accepts deterministic identity mappings directly, applies
  overlap/error thresholds to uncertain mappings, and returns the first
  promotable series without rewriting confirmed dates.
- `assessMarketVolumeCoverage(...)`: reports positive-volume coverage and marks
  it reliable only for at least 20 bars with at least 90% positive volume.
- `temporaryQuoteFromMarketSeries(...)`: admits only a same-instrument,
  non-stale, plausible backup price for temporary display; it never returns
  chart OHLC.
- `fingerprintMarketSeries(...)` and
  `fingerprintMarketReferenceSeries(...)`: SHA-256 hash the normalized source
  identity and observations.
- `measureMarketSeriesQuality(...)` and
  `measureMarketReferenceQuality(...)`: compute latency, date coverage, OHLC
  or close errors, adjustment agreement, network route, and methodology.
- `readCanonicalMarketSeriesEntry(...)`,
  `writeCanonicalMarketSeries(...)`, `writeMarketSourceSnapshot(...)`,
  `writeMarketReferenceSnapshot(...)`, `recordMarketSourceAttempt(...)`, and
  `readMarketSourceHealth(...)`: persist canonical, provider-isolated,
  fingerprinted browser data, lifetime counters, recent attempt samples, and
  demotion state without cross-source
  overwrite. Canonical reads remain keyed by instrument/interval across an
  explicit configured-primary change, while writes still require the current
  primary.
- `summarizeMarketSourceHealth(...)` and
  `selectMarketSourceByRollingHealth(...)`: calculate independent 7/30-day
  windows, apply minimum-sample and quality gates, order recovery sources, and
  enforce configured-primary demotion/probe/restoration hysteresis.
- `knownIndexExchange(...)` and `exchangeFromProviderLabels(...)`: normalize
  major global index and provider venue labels to documented market sessions.
- `resolveLatestDailyBarStatus(...)`: classifies the newest daily bar as
  complete, in-progress, or unknown from provider session-end metadata or the
  documented exchange close. Date identity is compared in `Asia/Shanghai`;
  exchange-local clock time still decides a known venue close.
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
- `parseYahooChart(...)`, `parseEodhdDailyRows(...)`,
  `parseNikkei225DailyCsv(...)`, `parseTwelveDataValues(...)`,
  `parseAlphaVantageDailyCsv(...)`, `parseFmpDailyRows(...)`,
  `parseAllTickKlineRows(...)`,
  `parseMarketstackEodRows(...)`, `parseZhituDailyRows(...)`,
  `parseTencentDailySeries(...)`, `parseTencentQuote(...)`, and
  `parseNasdaqRows(...)`: normalize provider
  payloads into `MarketBar[]`.
  Provider volume passes through without price-adjustment scaling.

## Indicators

- `rollingHighLow(bars, period)`: calculates aligned rolling highs and lows
  with monotonic index queues in linear time, preserving `null` warm-up values
  for indicators and channel strategies that previously rescanned each window.
- `sma`, `ema`, `wma`, `dema`, `bollingerBands`, `vwap`, `supertrend`,
  `ichimoku`, `rsi`, `macd`, `kdj`, `stochasticRsi`, `cci`, `williamsR`,
  `adx`, `roc`, `mfi`, `cmf`, `atr`, and `obv` return deterministic arrays
  aligned with source bars.
- `kdj(bars, period, smoothK, smoothD)`: applies independent recursive K and D
  smoothing. Registry defaults are `9 / 3 / 3`, and missing legacy smoothing
  keys are filled from current defaults at the validation boundary.
- `stochasticSlow`, `parabolicSar`, and `parabolicSarState` support the
  corresponding built-in strategy equivalents. `parabolicSarState` also
  exposes each bar's causal projected trigger and pre-trigger direction.
- `getIndicator(id)`: resolves display placement, category, and parameter metadata from
  the shared indicator registry.
- `getIndicatorsByCategory(category)`: returns the stable menu contents for one
  indicator family.
- `getDefaultIndicatorParameters(id)`: returns a fresh default parameter
  object for one indicator.
- `createDefaultIndicatorSettings()`: creates independent session settings for
  every registered indicator.
- `createDefaultIndicatorWorkspacePreferences()`: creates the all-hidden
  default workspace with SMA focused for editing and the independent confirmed
  support/resistance-break study in the favorites strip.
- `parseIndicatorWorkspacePreferences(...)`: validates device-local focused,
  visible, favorite, and per-indicator parameter state before restoration;
  legacy preferences inherit the default favorite.
- `createIndicatorConfigurations(...)` and
  `parseIndicatorConfigurations(...)`: create and validate the ordered visible
  indicator snapshot shared by the chart and saved-backtest boundary.
- `indicatorConfigurationsEqual(...)`: compares ordered visible IDs and exact
  parameters for persistence and compatibility checks; shortcut activation no
  longer depends on or restores saved indicator snapshots.
- `supportResistanceBreaks(...)`: creates carried support/resistance levels
  only after both left and right pivot windows are known, then emits later
  close-through break markers without backpainting.
- `MarketWorkspace` keeps one `focusedIndicator` for settings plus ordered
  `visibleIndicatorIds` and `favoriteIndicatorIds` collections. A controlled
  category state keeps one menu open at a time. Favorite-strip and categorized
  label buttons focus and toggle indicators; adjacent category stars only add
  or remove favorites, and hiding never discards settings.

## Chart configuration

- `buildIndicatorSeries(bars, indicator, parameters, labels, xAxis, yAxis)`:
  calculates one configured indicator and returns its ECharts series without
  consulting strategy state. Every parameterized series name includes the
  actual calculation parameters; VWAP and OBV remain parameter-free. Confirmed
  support/resistance renders two carried price lines plus bullish/bearish break
  markers.
- `buildPriceChartLegend()`: returns a non-interactive scrolling legend above
  the reserved main-price plot area.
- `buildPriceChartLayout(times, paneCount)`: keeps overlay indicators on the
  main price axes and allocates one lower grid for each visible pane indicator.
  Main-axis ticks are integers and its crosshair label uses one decimal.
- `formatPriceChartTime(bar, interval)`: formats one-minute chart categories
  from the provider epoch in `Asia/Shanghai` while leaving daily and canonical
  exchange-local market keys unchanged.
- `buildPriceDataZoom(barsLength, xAxisIndexes, interval, initialWindow)`: links
  price, volume, and all indicator axes to one inside zoom and one directly
  draggable timeline slider, initializing the real x-axis window from the same
  focus window used to derive the visible price-axis range,
  showing the latest 120 bars initially and preventing one-minute views from
  shrinking below 120 visible bars when enough history exists.
- `estimateIntradayDataDelayMinutes(barTimestamp, fetchedAt)`: returns a
  rounded lag only when the newest minute bar is at least three minutes behind
  the fetch time; the workspace displays it while the venue refresh policy is
  enabled.
- `buildVisiblePriceAxisRange(bars, window, overlayValues)`: derives padded
  minimum and maximum values from visible candle lows/highs and finite enabled
  price-indicator line values. Strategy references, pane values, offscreen
  values, warm-up nulls, and trade markers do not determine the range.
  `buildIndicatorSeries` accepts the current Bollinger visibility to make SMA
  dashed during coexistence; Bollinger blue boundaries and orange basis remain
  solid, while SMA uses aqua/yellow from the TradingView palette. Legend samples
  are widened to make dashed strokes readable.
- `applyDataZoomWindow(option, window)`: reapplies the user's current zoom
  start/end percentages when chart series or indicators update.
- `panDataZoomWindow(window, dragPixels, chartWidth)`: translates a direct
  horizontal drag in proportion to the current visible window, preserving its
  span and clamping it to the available history.
- `buildStrategyLineSeries(lines, labels)`: renders strategy price references
  as semantic solid lines matching the legend on the main price axes, removes
  all-null lines, and maps long/short entry/exit references to action labels.
- `formatPriceChartTooltipValue(value)`: formats K-line and price-reference
  tooltip values with exactly one decimal place.

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

- `resolveScreeningResultChartWindows(result, report)`: maps period, range,
  rolling, and multi-period screening results back to the exact independent
  date windows used for ranking. The workspace reruns the applied plan in each
  window and merges its trade/rebalance markers. Saved shortcuts bypass these
  windows and use the latest 128 trading sessions.
- `priceDataZoomWindowForTimeRange(bars, startTime, endTime)`: converts the
  applied marker envelope into an initial ECharts zoom window so older
  screening periods are visible immediately.
- `buildLiveStrategyGuidance(...)`: evaluates the newest available bar through
  the shared strategy registry and returns buy, sell, hold, or wait guidance.
  An optional entry filter suppresses only a new buy; close-confirmed entries
  use the latest completed slope and active-bar price/open orders use the prior
  completed slope. A touched causal entry that is rejected by the filter keeps
  its condition price and sets `entryBlockedByFilter`.
- `runBacktest(...)`: executes prior-bar targets at the next bar open or fills
  predefined stop orders when the active bar touches them. A stop crossed by a
  gap fills at the bar open. The function applies costs to long entries and
  exits and calculates equity, drawdown, return, Sharpe, win rate, profit
  factor, trade count, benchmark return, and a screening score. It also returns
  the entry time and fill price of an in-range position that remains open, so
  chart markers do not depend on a later exit. Inherited opening exposure does
  not create this record. The workspace passes `executionPolicy: "hybrid"`.
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
  strategy IDs and builds an aligned allocation timeline. One leg is direct;
  two legs retain the relative core/tactical state machine and causal intrabar
  executions. Three-to-nine legs select the longest-duration target as a 60%
  core gate and normalize all remaining allocation values as tactical judgment
  weights. Tactical support and hysteresis select 60%, 80%, or 100%; an inactive
  core selects 0%. A causal fast/slow true-range ratio caps exposure at 80%, 60%,
  or 0% during volatility stress, with immediate tightening and two-bar recovery.
  Individual intrabar leg fills do not become separate portfolio executions.
- `buildStrategyPlanTarget(...)`: returns the target portion of the same
  timeline contract.
- `buildLiveAllocationGuidance(...)`: reports the newest previous/target
  allocation and increase, reduce, hold, or wait action, plus core state,
  tactical support, and the current volatility risk cap.
- `buildMultiStrategyVolatilityRiskCaps(...)`: builds causal per-bar exposure
  caps from 5-versus-20-bar EWMA true-range pressure. It uses no future bars.
- `MarketWorkspace.applyCurrentStrategyToChart()`: clones the current lab draft
  into the applied chart plan and moves the viewport to the trend chart.
  Draft selector/parameter edits do not alter chart lines, markers, or latest
  guidance until this boundary is invoked. A null draft is valid and clears
  strategy-linked chart panes, references, markers, and guidance. Both the
  daily and one-minute workspace snapshots initialize with null draft/applied
  strategy state.
- `buildTradeMarkers(trades)`: maps every real long entry to an open marker and
  every real strategy exit to a close marker.
- `buildAllocationTradeMarkers(rebalances)`: maps allocation increases,
  and reductions to the same chart-marker contract.
  Strategy fills receive one semantic action: open, short buy, short sell, or
  close. A simultaneous long/short exit is one close marker while retaining
  both source events for audit.
- `buildScreeningCandidates(horizons)`: expands every valid finite parameter
  combination for the requested strategy horizons. With the complete registry
  it returns 45,196 unique strategy/parameter candidates and performs no
  per-strategy sampling.
- `screeningObjectiveValue(result, objective)`: maps a backtest to balanced,
  total-return, or Sharpe utility. The balanced score is
  `0.45 * currentWindowReturn + 8 * clamp(currentWindowSharpe, -5, 5) +
  0.35 * currentWindowMaxDrawdown`. Trade count does not enter this score.
- `compareScreeningResults(left, right, objective)`: orders candidates under
  the selected objective and deterministic metric tie-breakers.
- `selectCombinationStrategyIds(singleResults, objective)`: applies the shared
  complete eligible-family selection after complete standalone and EMA evaluation.
  It keeps 100% of completed eligible strategy families
  for every pair and higher-order screening path.
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
  the top 60 and evaluates those sets under EMA5-8. It normally keeps the top
  six final parameter sets per strategy; rolling callers can request a
  Top-10 per-strategy pool. It ranks the completed family winners and allows
  all eligible families into combinations. It evaluates all 36 parameter
  crossings for every eligible unordered non-equivalent strategy pair, keeps
  the best crossing for each pair, retains up to 4,096 pairs, and compares
  50/50, 60/40, 40/60,
  70/30, and 30/70 under both tactical modes. It reports strategy,
  entry-filter, pair, and allocation
  stages, then expands retained pair winners through bounded triple, quadruple,
  and quintuple beams. Three-, four-, and five-leg allocation replay covers all
  positive 10% judgment-weight compositions once. It retains at most 30
  results independently for each strategy count, with one best result per
  unordered strategy-ID set. Three-through-six-leg search retains the top 16
  intermediate parent/finalist candidates for each Strategy A primary at every
  level, while final result categories separately retain at most three rows per
  primary and 30 total. Intermediate pools use cached unordered-set keys and
  stable binary insertion; this is result-equivalent to sorting the complete
  pool after every candidate but avoids that repeated allocation. The current
  registry contributes 55 families and at most 1,485 unordered pairs before
  declared-equivalence exclusions, so every eligible pair reaches allocation
  comparison. Each pair stores and replays
  independent `strategyAEntryFilter` and `strategyBEntryFilter` values. Targets
  are built once from complete loaded history and retained only for finalists.
  Three-through-six-leg summary execution starts at the first requested state
  after finding an earlier guaranteed zero caused by the inactive core or a
  zero volatility cap. It retains a later transition to preserve signal events
  and inherited holdings, with full-history fallback when no reset exists.
  All causal targets, role selection and volatility warm-up remain complete.
  Checkpoint recovery restores cumulative progress/failures and skips completed
  stages using their saved pools. Ordered row offsets seek within discovery;
  division/remainder seek within allocation grids without replaying earlier
  candidates. Existing checkpoint and search-model identities remain valid.
  Price-order candidates build their order plan once and derive their target
  from that plan instead of also constructing an unused close target. The
  default optimizers yield before their first evaluation, at every stage
  transition, and after every 128 evaluations. Browser cooperative yields are followed by a timer-task
  boundary so progress state is committed and painted before work resumes.
- `MAX_MULTI_STRATEGY_RESULTS_PER_PRIMARY`: hard-caps one Strategy A primary
  at three rows in each final three-through-six-strategy result category.
- `MAX_MULTI_STRATEGY_FINALISTS_PER_PRIMARY`: retains the top 16 intermediate
  candidates for each Strategy A primary at every three-through-six search
  level before expanding the next strategy count.
- `MAX_MULTI_STRATEGY_FINALISTS_PER_LEVEL`: bounds one intermediate level at
  the registered strategy count multiplied by the per-primary 16-candidate
  allowance.
- `runScreeningInWorker(...)`: creates a module Worker for one complete
  validation run, forwards typed optimization/validation progress, sends
  cancellation, and always terminates the worker. It falls back to the core
  function only when `Worker` is unavailable.
- `screeningCheckpointInterval(barsLength, physicalMemoryBytes?)`: returns the
  shared exact-checkpoint cadence used by both the browser Worker and local
  child. Histories with at least 6,000 bars and hosts with at most 9 GiB use a
  2,048-evaluation boundary so a fresh process or Worker releases stage heap
  more frequently without truncating input or changing candidate order.
- `fingerprintMarketSeries(series)`: SHA-256 hashes interval, source,
  adjustment, and normalized OHLCV bars for screening provenance.
- `createSaveScreeningRunInput(...)`: converts a validation outcome into a
  compact ranked archive without equity, trade, rebalance, or ranking-replay
  arrays. When the scored display includes a temporary quote, the archive also
  records its provider, quote date, and fetched time separately from the
  canonical series source.
- `compareScreeningRuns(current, previous)`: reports winner change, Top-10
  overlap, cross-run ranks, and metric deltas for the same current winner.
- `pruneScreeningRunHistory(db, ownerEmail)`: permanently deletes screening
  archive rows ranked after the newest six inside each canonical-instrument
  group for one resolved owner. Both archive reads and successful writes invoke
  this boundary.
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
- `resolveScreeningProgressBarState(...)`: maps the six shared optimizer
  stages and each rolling selection window onto one bounded progress scale.
  Period and range runs end at six of six segments; rolling runs end at
  `6 + foldCount` of the same maximum.
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
- `buildThreeStrategyPlanTimelineFromTargets(...)`: combines three aligned leg
  targets into one weighted-consensus decision with 60% entry, 40% exit, and
  strategy-count confirmation. It returns a binary target and emits portfolio
  events only when that consensus changes.
- `optimizeStrategyCombinations(...)` triple stages: after normal pair replay,
  the default run uses up to 128 pair parents, tests non-equivalent third-leg
  finalists, retains up to 256 unique triples at 40/30/30, and replays all 36
  tenth-based judgment-weight candidates. `includeTriples: false` remains a
  test/diagnostic compatibility switch; production defaults to enabled.
- `buildStrategyConsensusAdvice(evidence)`: de-duplicates live plan evidence,
  applies deterministic rank weights, rounds the aggregate target to 10%, and
  returns action, confidence, agreement, directional pressure, and evidence
  counts without feeding the result back into optimization.

Historical price bars, indicators, strategy lines, live guidance, stability,
and backtests all receive the same normalized `MarketBar[]` from the active
`MarketSeries`.

## Windows local runtime

- `GET /api/health`: returns the small versioned application-readiness contract
  without rendering the workspace.
- `Test-QuantScopeReady()`: accepts port 3000 only when `/api/health` returns the
  exact application role, readiness flag, and contract version within two
  seconds.
- `Test-QuantScopeMarketRelayReady()`: accepts port 3001 only when its health
  endpoint returns `ready: true`.
- `Test-QuantScopeApplicationProcess(process, root, port)`: verifies that a
  listener is the current checkout's Node/vinext development command with the
  registered host and application port.
- `Test-QuantScopeMarketRelayProcess(process, root, requireOrphan)`: verifies
  the exact absolute `scripts/market-relay.mjs` command and optionally requires
  its parent to be absent.
- `Test-QuantScopeRuntimeProcess(process, runtime, root)`: dispatches
  role-specific ownership checks for every registered runtime port.
- `Remove-UnhealthyQuantScopeRuntimeListener(runtime, root)`: resolves
  listener PIDs and stops only unhealthy owners that pass the exact
  current-checkout role check.
- `Remove-StrayQuantScopeApplicationProcesses(root)`: enumerates Node processes
  before launch and stops only exact current-checkout Vinext development
  commands, including legacy instances that had moved to a fallback port.
- `Confirm-QuantScopeRuntimePortAvailable(runtime, root)`: applies verified
  cleanup and waits for the registered port to be released.
- `Get-LocalPortOwnerDescription(runtime)`: returns the unresolved listener PID
  for an actionable conflict without exposing command-line or secret values.
- `Invoke-QuantScopeLocalMigrations(root, npmCommand, timeout, grace)`: relays
  Wrangler output and preserves its normal exit code. Only the exact
  no-pending-migrations terminal message enables a short grace period followed
  by migration-process-tree recovery; an unverified timeout remains a failure.
- `Stop-QuantScopeProcessTree(process)`: terminates only the process tree rooted
  at an explicitly verified or launched process.
- `Wait-QuantScopeStartup(serverProcess, onListening, ...)`: opens the browser
  through a one-shot callback when port 3000 first listens, then enforces the
  independent readiness deadline and bounded cold-compile grace.
- `Remove-FailedQuantScopeStartup(serverProcess, root)`: stops the launched
  tree, sweeps only exact current-checkout leftovers, and verifies port release.
- `New-QuantScopeServerCommand(root, useMarketRelay, startMarketRelay)`:
  generates the visible server command, reusing a healthy relay or owning and
  cleaning up a newly started relay as appropriate.

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
  per instrument, including its nullable instrument-folder affiliation.
- `parseCreateSavedBacktestFolderInput(...)`,
  `parseRenameSavedBacktestFolderInput(...)`, and
  `parseAssignSavedBacktestFolderInput(...)`: validate the fixed instrument and
  strategy folder scopes, bounded names, canonical contexts, and nullable
  assignments.
- `parseSavedBacktestFolderOrderInput(...)` and
  `reorderSavedBacktestFolders(...)`: validate complete, unique sibling orders
  and reorder only folders that share an exact scope and context.
- `canReuseSavedBacktestMarketSeries(...)`: returns true only when the saved
  instrument, active instrument, and non-empty successful active series share
  the same canonical key and interval. Shortcut open then preserves that series
  instead of switching providers or reloading the chart.
- `reorderSavedBacktestGroups(...)` and
  `reorderSavedBacktestsWithinGroup(...)`: move a complete instrument group or
  one snapshot inside its current group while preserving every other row.
- `parseSavedBacktestOrderInput(...)`: validates a unique, positive,
  owner-order ID list bounded to 200 rows.
- `parseSavedBacktestRollingUpdateInput(...)`: validates one canonical
  instrument fingerprint and a unique bounded collection of 128-session return
  evaluations.
- `GET /api/saved-backtests`: returns up to 200 current-user shortcuts ordered
  by persisted display order, with updated time and ID as deterministic
  fallback keys. Legacy rank columns are not read into the API record.
- `POST /api/saved-backtests`: inserts a new current-user strategy snapshot and
  clears inert legacy rank fields. An exact
  instrument/plan/filter/allocation/cost setup replaces its existing row even
  when the rolling date range changed, preventing duplicate shortcuts. A new
  strategy for an existing instrument inherits that instrument group's stored
  display order so automated saves never move the first-level shortcut group.
- `PATCH /api/saved-backtests`: verifies every submitted ID belongs to the
  current owner and persists the complete visible order in bounded 25-record
  updates so D1 bind-parameter limits are not exceeded. Repeating the same
  complete order is deterministic and repairs an interrupted partial write.
- `PUT /api/saved-backtests`: verifies that every evaluated row belongs to the
  current owner and canonical instrument and stores its latest 128-session
  rolling return. Every row is updated in one conditional SQL statement.
- `DELETE /api/saved-backtests?id=...`: removes only the current user's record.
- `DELETE /api/saved-backtests?instrumentKey=...`: canonicalizes the owner's
  stored aliases and removes every row in that first-level instrument group in
  one atomic D1 batch.
- `POST`, `PATCH`, `PUT`, and `DELETE /api/saved-backtest-folders`: create,
  rename/reorder, assign/unassign, and safely delete owner-scoped shortcut
  folders. Strategy folders are restricted to one canonical instrument
  context; reorder updates only a complete sibling set, and deletion clears
  affiliations before removing the folder.

`POST /api/screening-runs` stores the compact screening audit only. It does not
read or update saved shortcuts, rank histories, or rolling returns.

The persistence shape retains an interval field. New UI saves use the active
`1d` or `1m` interval. Opening a supported shortcut selects that interval;
unsupported legacy minute intervals remain labelled and fall back to daily.
Active and successfully
refreshed instruments replay every shortcut over their latest 128 trading
sessions. The resulting return is durable, so an inactive instrument can show
its last rolling return; a row without a rolling update falls back to its
creation-time return. The same refreshed series feeds per-shortcut allocation
guidance and A-long/B-short condition prices; the header does not render a
separate guidance card.

- `findStrategyShortcutMatch(...)`: compares a screening candidate plan only
  with shortcuts from the supplied canonical instrument and interval scope. It
  returns an exact match or the closest complete strategy-type match, including
  parameter, allocation, entry-filter, and tactical mode differences. A dual
  candidate matches only when both strategy IDs occur in the same saved plan;
  one shared component is insufficient.
- `evaluateRecentStrategyEffectiveness(...)`: applies the 30-session return,
  buy-and-hold excess, drawdown, two-execution, and optional 63-session
  confirmation gates. `mixed` means the recent excess-return, relative-drawdown,
  and medium-window confirmation evidence does not point in one direction.
- Community formulas and registration functions are documented in
  `COMMUNITY_IMPORTS.md` and implemented under `lib/analysis/community/`.
  `halfTrend`, `qqeMod`, and `schaffTrendCycle` expose aligned recursive state;
  `sessionVolumeProfile` returns aligned POC/VAH/VAL plus latest-session bins;
  `anchoredVwap` begins HLC3-volume accumulation at an absolute timestamp.
- `createBacktestExecutionContext(...)`: selects one immutable scoring window
  and precomputes its intraday session metadata for reuse across candidate
  backtests.
- `readScreeningCheckpoint(...)`, `writeScreeningCheckpoint(...)`, and
  `clearScreeningCheckpoint(...)`: maintain the single device-local,
  request-fingerprinted optimizer continuation record.
- `packMarketBars(...)` / `unpackMarketBars(...)`: losslessly convert browser
  market-bar objects to and from the transferable screening Worker buffer.
- `runScreeningInLocalEngine(...)`: submits one compact loopback job, streams
  scalar progress, reconnects through a relay restart, and returns `null` only
  when the engine is unavailable before job creation so the Worker can safely
  take over.
- `encodeLocalScreeningJobRequest(...)`: writes protocol-v3 metadata and times
  ahead of the lossless Float64 market columns, avoiding browser-side bar JSON.
- `recommendedScreeningConcurrency(...)`: derives a conservative process-pool
  size from available logical CPU capacity and physical memory while retaining
  desktop headroom.
- `createScreeningEngineCoordinator(...)`: queues local jobs, fills the bounded
  disposable-child pool, restores deterministic jobs from disk, and exposes
  loopback-only create/status/cancel endpoints plus detected concurrency in
  relay health.
- `scripts/screening-engine-child.ts`: runs the unchanged shared validation
  core, atomically persists exact optimizer checkpoints, exits after each
  checkpoint, and writes only the compact completed outcome.
  Its checkpoint store atomically commits independently mutable sections and
  reuses request-fingerprinted derived entry-filter eligibility.
- `replaceFileAtomically(...)`: retries transient Windows rename locks, then
  publishes through a recoverable target-to-backup swap and restores the prior
  target when the replacement cannot be committed.
- `createStreamingCombinationTimeline(...)`: produces monotonic allocation,
  signal, and intrabar states without materializing per-candidate timeline
  arrays.
- `selectBestShortcutScreeningResult(...)`: compares retained single and
  combination results with the shared objective comparator and returns the
  overall winner for automated shortcut saving.
- `parseShortcutBatchCheckpoint(...)` and
  `pendingShortcutBatchInstrumentKeys(...)`: validate the bounded durable batch
  checkpoint and return only incomplete canonical shortcut instruments when
  the full screening configuration signature still matches.
