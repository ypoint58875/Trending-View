# Codex State

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
  same run retains the top three final parameter sets per strategy,
  automatically ranks all nine crossings for every unordered pair of
  non-equivalent strategy IDs, keeps the best crossing per pair and up to 4,096
  pair finalists, then compares 50/50, 60/40, 40/60, 70/30, and
  30/70 under both tactical modes. Holdings remain 0%, 30%, 40%, 50%, 60%,
  70%, or 100% for pairs. The best 128 pair parents then generate bounded
  triples, then bounded forward expansion adds four- and five-strategy sets;
  retained three-to-five-leg sets replay every positive 10% judgment-weight
  composition once (36/84/126 candidates). The current
  maximum is 1,594 strategy-ID pairs, so every retained pair reaches the
  allocation stage. Its right result column keeps one best result per complete
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
