# QuantScope

QuantScope is a daily workspace for researching one global index, ETF, or
commodity futures quote proxy at a time. It
combines filtered asset search,
dividend/split-adjusted price charts when the selected source supports them,
technical indicators, strategy backtests, parameter sensitivity diagnostics,
and staged exhaustive parameter screening in one responsive page. It does not place
trades or run unattended jobs.

Nikkei date-gap recovery keeps Yahoo as the primary and only inserts missing,
completed dates from the existing official Nikkei adapter after matching OHLC
overlap. Existing prices are locked, per-bar OHLC provenance is retained, and
the chart identifies the official supplement. This also covers successful but
date-lagged responses, shared by active charts, shortcut refresh and cycle input.

Strategy-cycle validation is now Nikkei 225 only. It screens completed daily
bars, examines the last two completed bars of the selected plan, and simulates
the allowed rebalance at that decision day's Nikkei close, including fees and
slippage. This is a proxy for China-market operations after Japan's 14:30 and
before China's 15:00 close (UTC+8), not an executable domestic-product quote.
Reduce-then-increase holds; increase-then-reduce only reduces; same-direction
signals use the final target. See `research/nikkei-cycle-conflicts/README.md`
for the reproducible old/new conflict study and its limitations. On opposing
new/previous signals, the execution policy follows the incoming winner's
current-date signals. Main returns and chart fills use that policy; the old
policy is retained internally for research without a UI comparison. Delayed three-bar confirmation is not
enabled.

## Included

- Search global indexes, exchange-traded funds, and commodity futures quote
  proxies; individual equities are excluded from results. A deterministic
  catalog includes gold (`GC=F`), silver (`SI=F`), crude oil (`CL=F`), and
  copper (`HG=F`).
- One daily research workspace. Intraday intervals are not exposed by the UI
  or market API, and no synthetic resampling is performed. Legacy non-daily
  saved records remain readable provenance and reopen against daily bars.
- A separate strategy-cycle validation page selects Nikkei 225 from the
  saved-backtest shortcut bar. An inclusive trailing-window range with an
  integer step (default 128 to 128) defines screening periods evaluated
  independently over the chosen evaluation
  history. The evaluation-history input
  loads the selected instrument's daily series and uses its complete K-line
  count as the dynamic upper bound instead of a fixed 512-session ceiling. The
  first winner is selected at the first evaluation close using the complete
  trailing window; the final evaluation close may also trigger and execute.
  Later exhaustive selections occur only when a normalized two-session moving
  average is neutral, the latest candle opposes a trend of at least 30 degrees,
  or the candle is a doji; same-direction strong-trend candles keep the current
  plan. Each selected plan inherits the continuous account's allocation and may
  change it only from its last two bars: increase-only and reduce-only sequences
  use their final target, reduce-then-increase does nothing, and
  increase-then-reduce may only reduce. The page shows this cost-adjusted
  every-update return, an old-on-conflict alternative, the opposite-intent
  count, and the same-period close-entry buy-and-hold benchmark. Its
  full-evaluation candlestick chart plots only actual executed rebalances and
  switches among the completed screening-period results. The maximum
  combination size is configurable from two through six strategies.
  Each cycle job persists only its selected winner. One compact batch request pre-submits
  every bounded optimization unit to the loopback coordinator, which continues
  a CPU- and memory-bounded durable parallel queue after the tab disconnects.
  Refreshing, navigating away, or a browser tab discard does not cancel work;
  reopening the page automatically reattaches result collection. Only explicit
  Pause, reset, or replacement by a different task cancels unfinished units.
  One immutable columnar bar file is shared by the queued units; each child
  materializes only its causal prefix,
  and windows at the same decision share range-independent entry-filter
  derivations. Unit mappings and completed selections remain in device-local
  IndexedDB for report recovery. The browser, coordinator, launcher, and local
  maintenance tools read one shared protocol-version configuration. If a stale
  relay is already running, result collection stops with a restart instruction
  instead of indefinitely showing an active validation with no compute child.
- Daily history requests start at 2000-01-01 with a 10,000-bar safety cap.
  Instruments launched later begin at their first provider-available bar.
- Candlestick and line chart modes with volume and synchronized zoom.
- One preferred primary per instrument, cacheable history, and an
  uncached latest-primary overlay on open and on a session-aware visible-page
  schedule. Known regular venues refresh every five minutes from the open
  through 30 minutes after the close, then stop. COMEX/NYMEX commodity proxies
  use the same cadence during their Sunday-Friday Globex session, including
  the close grace period but excluding the daily maintenance break and weekend
  closure. Unknown venues use a conservative 15-minute cadence.
  Focus/visibility refreshes share the same minimum interval. A primary
  failure immediately tries ordered backups; only a
  complete chain failure starts 15-, 30-, then 60-minute backoff. Completed
  OHLC bars are locked; a same-source refresh may fill a cached zero volume for
  the same date without changing its prices. Chinese index/ETF recovery uses
  no-key Tencent raw daily history when a canonical base is unavailable and
  its current quote for latest-only refreshes. The 50-call/day Juhe product is
  reserved for the final quote-only attempt.
  Initial history, latest refreshes, fallbacks, and temporary quotes are
  deduplicated and ordered by canonical trading date rather than provider
  timestamp, preventing adjacent daily bars from swapping across sources.
- A device-local canonical IndexedDB fast path stores canonical series,
  provider-specific snapshots, reference snapshots, fingerprints, and source
  health. Health retains bounded request samples and reports rolling 7-day and
  30-day availability. Three consecutive failures or a sub-80% 7-day rate can
  demote the configured primary; a backup must meet 95%/90% rolling thresholds
  and the existing price-quality gate before it becomes the effective source.
  The configured primary receives hourly recovery probes and must remain
  healthy for seven days before automatic restoration. A hit renders
  immediately while refresh continues.
- Explicit price-adjustment metadata from the selected `MarketSeries`.
  Eastmoney, EODHD, Marketstack, and valid Yahoo daily series are marked
  `corporate-action-adjusted` when their payload supports it. Other adapters
  declare their actual raw or adjusted scale.
- Explicit green-up/red-down chart legend. A selected-range boundary inherits
  an already-open position without a synthetic fill or cost and marks the
  ending position to the last close without forcing a sale.
- Thirty-five independently configurable indicators, including moving-average
  variants, Bollinger Bands, Ichimoku, Supertrend, momentum, volatility, and
  volume studies. Six category menus replace the flat indicator list, while a
  separate star-managed shortcut strip keeps favorites immediately available.
  The independent, non-backpainting confirmed support/resistance-break overlay
  is the initial favorite. It matches the supplied TradingView rule with
  15/15 confirmed pivots, EMA(5)/EMA(10) volume-oscillator filtering, and both
  close-break and wick markers while keeping levels invisible until their
  confirmation bar. One indicator is focused for editing while an
  ordered collection can remain visible. Indicators are hidden by default,
  each favorite/menu button toggles its own visibility, and parameter changes
  are saved as a device-local preference for later sessions. KDJ exposes its period plus the
  independent K and D smoothing inputs (default `9 / 3 / 3`); older saved
  settings that contain only the period inherit the new smoothing defaults.
- Overlay indicators share the price axis; each lower-pane indicator receives
  its own pane. Price, volume, and all indicator panes share the same zoom.
  Series names show their actual parameters in a scrolling legend. The visible
  price-axis range is derived from candle highs and lows only, so switching
  strategies on the same instrument and zoom window does not rescale the K-line
  chart because of a strategy reference overlay.
- Indicator visibility is fully user-controlled. Applying a strategy,
  screening result, or saved shortcut does not add, remove, or reconfigure
  lower-pane studies. The strategy contributes actual buy/sell fills and,
  where the rule has
  continuous price references, solid strategy lines that match their legend
  samples on the main price axis. Empty reference series are omitted. Long
  entry/exit and short entry/exit actions use the four localized action labels
  rather than abstract reference-event names.
  Technical Ratings shows the same EMA-20 and SMA-50 references used by its
  price votes.
- Thirty-four non-built-in strategy families plus independent equivalents of all 20
  templates in TradingView's official built-in-strategy directory. The added
  TradingView community ports are causal and long-only: bearish or short
  signals clear an existing long position instead of opening a short.
- Descriptive long-horizon and short-horizon catalog metadata for every
  strategy. Standalone results can expose that intended style, but it no
  longer restricts which two strategies can be combined.
- Date-range backtests with initial cash, commission, and slippage settings.
- Numeric fields select their current text on focus, allow temporary blank
  editing, and validate/clamp only on blur or Enter, so replacing `3` with
  `128` does not first produce `3128`.
- Long-only manual-history execution. Close-confirmed target changes trade at
  the following daily open; causal stop levels calculated from completed bars
  can fill inside the active bar and use its open after a gap.
- An optional moving-average-slope entry-filter subsystem used by the strategy
  lab, one-click screening, applied guidance, and saved shortcuts. Strategy A
  and Strategy B keep independent filter settings. It supports SMA,
  EMA, or WMA with a period of at least two sessions and compares the
  normalized one-session slope in percent. The control is off by default with
  an EMA(7), 0%/session preset; it delays only new buys and never forces an
  exit. One-click screening first evaluates every unfiltered parameter set.
  It then compares EMA(5), EMA(6), EMA(7), and EMA(8), at a fixed 0%
  threshold, only for the top 60 unfiltered parameter sets in the explicit
  trend, breakout, and momentum family. Other families remain unfiltered.
  Each result stores its winning filter state; the strategy lab remains
  editable for manual replay. If a causal entry price is touched while the
  filter rejects the buy, latest guidance keeps the price visible and
  explicitly reports the filter block.
- Chart-level fill markers derived from the active backtest and limited to four
  strategy actions: open (long buy), short buy, short sell, and close.
- Per-user saved backtests with a right-side shortcut bar that restores the
  instrument, complete optional Strategy A–I plan, parameters, allocations,
  and cost settings without changing the current manual indicator collection.
  Stored indicator snapshots remain compatibility/provenance data only. The saved date range remains creation-time
  provenance and does not replace the workspace range when opened.
  The shortcut bar contains the Save current strategy action. A save replaces
  the existing record when instrument, plan, range, cash, and costs are
  identical; a materially different
  setup creates a new snapshot. Each saved row keeps the strategy name, current
  rolling return, muted advice labels, red/green current allocation, and
  separate A-long/B-short entry and exit prices visible; added time and
  secondary parameter/allocation metadata are omitted. The separate header
  advice card is removed. The
  scrollable list shows one collapsed row per instrument; expanding it reveals
  the saved strategy/indicator snapshots. Instrument groups and snapshots can
  be reordered by drag and drop or keyboard arrows, and that order persists;
  nested strategy rows no longer intercept instrument-group drops.
  Owner-scoped, renameable folders organize instrument groups at the first
  level and strategy snapshots inside each instrument. Moving a row uses a
  folder selector; deleting a folder only returns its contents to the unfiled
  section.
  Each first-level instrument group also has an owner-scoped delete action that
  removes all of its saved strategy rows in one request.
  The workspace interval remains daily. Legacy non-daily records keep their
  stored interval label and disclose that opening them recalculates on daily
  bars. Opening a shortcut for the same canonical instrument preserves the
  already loaded successful price series and restores only the plan,
  parameters, and trade markers. A genuinely different canonical
  instrument triggers a market reload. The header refresh action updates the
  active chart and then refreshes every other unique shortcut instrument
  sequentially in the background. Whenever an active or background shortcut
  series changes, all daily saved plans for that canonical instrument are
  replayed over its latest 128 trading sessions and their rolling returns are
  persisted. Each shortcut now shows a recent-effectiveness prompt calculated
  from its latest available market series instead of a screening-rank history.
  The refreshed canonical series is ready
  when that shortcut is opened. The all-shortcut pass runs after both the
  header refresh and each scheduled active-market refresh cycle, reports
  progress and updated/retained counts, and retains the 60-second cooldown.
  Screening-run archives remain durable for reproducibility, but the
  redundant screening-history/weekly-comparison panel is not rendered.
- A nearby-parameter stability diagnostic that changes one parameter at a time
  to the immediately lower or higher configured value, reruns valid variants,
  and reports return-sign agreement, return/drawdown/trade-count ranges, and
  performance in up, sideways, and down market regimes. It validates the exact
  parameter shape and requires 120 in-range daily observations, two completed
  base trades, and a nearby variant before showing stable/sensitive. It never
  selects or applies a replacement parameter.
- One-click exhaustive strategy screening across all 55 strategies. It
  traverses all 45,196 finite registered parameter combinations; there is no
  per-strategy sampling control or hidden cap. One shared objective drives the
  complete single-and-combination workflow. After every standalone family is
  ranked, the all completed family winners (55 of the current 55) enter
  pair and higher-order combination discovery. This evidence-bounded gate is
  shared by every screening mode; standalone and EMA refinement remain
  exhaustive.
  A second period-derived action (128 days by default) processes every saved
  shortcut instrument sequentially, including indexes, ETFs, funds, and
  commodity proxies. It writes a batch-resume checkpoint only after an
  instrument failure; a later click continues after the successfully saved
  instruments, while an explicit Stop clears that checkpoint so the next click
  starts the batch from zero with a new underlying screening-run identity. The
  action files the current-objective winner into an instrument strategy folder
  named for that period, such as `128日`.
- Three focused screening targets: balanced score, maximum return, and maximum
  Sharpe. Balanced score is `0.45 * current-window total return +
  8 * clamp(current-window Sharpe, -5, 5) + 0.35 * current-window maximum
  drawdown`; trade count is displayed and still controls the candidate versus
  recent-effectiveness prompt, but does not affect optimization order.
- Four recent-adaptive screening modes inside the same one-click workflow.
  `Period` is the default and selects parameters, EMA refinement, combinations,
  and allocations only from one adjustable trailing window. The default is 128
  trading sessions and is bidirectionally synchronized with the strategy lab
  range. `Range` performs the same complete selection over one custom start/end
  interval without separate training or test intervals. `Multi-period screening`
  accepts
  two to eight explicit, non-overlapping start/end date intervals, evaluates
  retained candidates independently in every interval, and ranks them by the
  equal-weight average of each interval's normalized objective rank. Its mode
  and date intervals persist in device-local storage. `Rolling` first forms
  the retained candidate pool over one custom total interval, then advances a
  fixed-width calendar window by one year and equally averages each window's
  tied 0-to-100 objective rank. None of these modes is presented as independent
  out-of-sample proof. Bars before an active scoring boundary remain available
  only for causal indicator and position-state continuity; their transactions
  and performance never enter the active-window objective.
- Monotonic segmented twelve-stage progress, cancellation, and unexpected-run
  recovery. The first result column keeps
  only the best parameter set for each standalone strategy. Screening
  builds every candidate signal over the complete loaded history and limits
  only performance measurement to the selected range. This preserves sticky
  position state across long quiet periods. If that state is already long
  before the selected start, the simulation inherits the position at the
  first selected open without a trade or cost. The EMA stage
  keeps only compact metrics for each eligible strategy's top 60 unfiltered
  parameter sets. The top six final parameter sets per strategy keep their
  complete execution state for `6 x 6` pair replay.
- Four-through-six-strategy screening reuses full-history causal strategy
  targets but executes each repeated combination only across the selected
  scoring window plus one preceding bar. Its streaming core-satellite state and
  causal volatility cap advance from complete history, preserving inherited
  exposure without building an equity curve for every candidate.
- Screening runs in stage-isolated module Web Workers. Each completed stage
  writes a compact continuation checkpoint and the next stage starts in a fresh
  Worker heap. Binary targets and sparse order events remain internal; ranked
  result messages omit chart/trade detail and applying a row regenerates it.
  Completed results are not reused as a calculation cache. The latest completed
  compact result is kept in a
  single device-local IndexedDB record so the matching instrument and interval
  can restore its tables after refresh; the next run replaces that record.
- Every completed run writes a compact audit archive containing source,
  optional temporary-quote provider/time provenance, adjustment mode, last
  bar, data fingerprint, screening configuration, retained candidates, and
  validation summary. Each user and canonical instrument retains only its
  newest six archives; older rows are permanently removed.
  The UI compares the newest run with the prior run for the same canonical
  instrument; archives never feed the next optimization.
- A two-selector strategy lab where Strategy A and Strategy B can each be any
  different registered strategy and either selector can be omitted. For a dual
  plan, the selected-range target with the longer average active run becomes
  the relative long-cycle gate; an exact duration tie prefers fewer target
  transitions and then Strategy A. A fresh relative-long entry establishes
  its allocation without inheriting an already-active relative-short signal.
  The base-then-add mode uses a later relative-short entry to add the other
  allocation and its paired exit to remove that layer. The full-then-reduce
  mode opens at A+B, uses a relative-short exit to reduce to the base sleeve,
  and uses the next entry to replenish full exposure. A relative-long exit
  clears both layers in either mode, and allocation never becomes negative.
  The derived
  roles are shown in the lab and recalculate when dates or parameters change.
  Each selector exposes its own parameter settings directly below it.
  Selecting only one strategy always backtests and saves it at 100% allocation;
  dual plans compare 50/50, 60/40, 40/60, 70/30, and 30/70 under both tactical
  modes.
  Its Apply action clones the current draft plan to the trend chart and moves
  the view to that chart; selector/parameter edits do not change chart lines,
  markers, or live guidance before Apply. Durable saving remains a separate
  shortcut-bar action.
- The same one-click run retains the top six parameter finalists for every
  strategy, ranks each strategy family's best final standalone result, and
  evaluates all `6 x 6` parameter pairings among the all eligible families at
  the reference 60%/40% allocation, without a
  separate combination checkbox. Each strategy-ID pair keeps its best
  parameter pairing before allocation replay.
  MACD and Supertrend each expose one common built-in entry. Their retired
  duplicate IDs remain readable in historical plans but are not screened again.
  Equivalent historical entries cannot be combined with themselves. It keeps up to
  4,096 pair finalists before replaying all allocation/mode alternatives. The
  current 55-strategy catalog contributes 55 families and at most 1,485
  unordered pairs before declared equivalence exclusions, so no eligible pair
  is discarded by the safety bound. Both columns render every retained best
  row. The second result column keeps only the best
  parameter/allocation result for each unique strategy-ID pair.
  Each result shows which member was classified as relative long or short.
  Dual targets remain limited to 0%, 40%, 60%, or 100%, and every ranked
  result can be applied directly to the lab and trend chart. Result tables do
  not display ordinal ranks or objective scores; they show whether the strategy
  remains favorable, has conflicting short/mid-term evidence, needs review, or
  lacks enough recent executions. Exact and same-type shortcut matches are
  labelled with parameter/allocation/filter differences.
- Pair winners seed bounded forward expansion through three-to-six-strategy
  core-satellite candidates. Every strategy-count category retains at most 30, and
  three-to-six-strategy categories retain at most three results with the same
  Strategy A primary. Staged search is deliberately wider: every primary keeps
  its top 16 intermediate candidates at each three-to-six-strategy level for
  the next expansion. The three-result cap is applied only to final display, so
  a strong parent is not removed merely because three same-primary variants
  already rank above it.
  Three-to-six-strategy result rows use the concise
  `Strategy A name · N-strategy layered` label, keep the remaining strategy
  names in a compact two-line summary, and omit per-leg parameters; full names
  remain available through accessible labels and hover text.
- A compact result navigator below the chart selects the single- through
  six-strategy result group and moves through adjacent ranked results without
  duplicating the full result tables.
- A post-screening primary/deputy shortlist combines the standalone and
  combination result pools. The highest eligible candidate under the selected
  objective becomes the primary strategy. Up to two deputies must share no
  strategy component with the recommendations already selected and must keep
  daily equity-return correlation below 0.75. High-overlap candidates may
  appear only as same-family alternatives; the UI reports when screening did
  not find enough independent deputies instead of filling the row with
  duplicates. Each card applies directly to the chart. A separate recent-effectiveness
  review compares the last 30 sessions with same-period buy-and-hold and uses a
  63-session excess-return confirmation. It is a monitoring prompt, does not
  change optimization order, and is not represented as out-of-sample proof.

## Run locally

Requirements: Windows and Node.js 22.13 or newer.

For one-click local use, double-click `open-quantscope.bat`. The launcher:

- starts the loopback screening coordinator with the existing market relay;
  heavy screening runs in restartable child processes with exact disk
  checkpoints, while the browser Worker remains available if that local engine
  cannot be reached before a job starts. Independent queued jobs use an
  automatically detected multi-CPU process pool that reserves one logical CPU,
  25% of physical memory (at least 2 GiB), budgets 4 GiB per child, and never
  exceeds eight children;
- transfers screening bars as lossless Float64 columns, reuses layered
  checkpoints and derived filter state, and fetches the compact result only
  after status reports completion;
- runs QuantScope only at `http://127.0.0.1:3000`, with strict-port startup so
  the development server cannot silently move to 3002 or another origin;
- manages the application on port 3000 and the market relay on port 3001
  through one runtime-port registry;
- initializes the project-local saved-backtest database and safely recovers
  when Wrangler reports that no migrations are pending but fails to exit;
- opens a new maximized Edge window as soon as port 3000 begins listening when
  Edge is available; and
- never requires a ChatGPT or other account.

Keep the `QuantScope Local Server` window open while using the application.
Closing that window stops the local server. Saved backtests remain under
`.wrangler/state` after the server stops.

The Windows launcher reconciles every persistent runtime listener on each
start: the application on `127.0.0.1:3000` and the loopback-only,
source-allowlisted relay on `127.0.0.1:3001`. A healthy QuantScope listener is
reused. An unhealthy listener is stopped only when its Node command, fixed
arguments, and absolute project path identify this exact checkout. An active
unrelated listener is left untouched and reported with its PID. The same exact
identity check also removes an older current-checkout server that Vite had
previously moved to a fallback port. Readiness uses the small
`/api/health` contract instead of rendering the complete workspace. A failed
startup stops its launched process tree and checks for verified leftovers. When
`HTTP_PROXY` or `HTTPS_PROXY` is configured, only the relay process receives
those values; proxy addresses never enter application bindings or logs.
Development mode also defaults to the fixed loopback relay URL so an ordinary
local dev command does not silently omit this route.

For manual development:

```bash
npm install
npm run local:db:migrate
npm run local:dev
```

Open `http://127.0.0.1:3000`.

## Test and build

```bash
npm test
npm run build
```

## Data and limitations

QuantScope assigns one deterministic canonical source definition to every
instrument. Yahoo is primary for N225, SOX, the built-in gold, silver,
crude-oil, and copper continuous proxies, Yahoo-discovered instruments, and
indexes or ETFs with a verified Yahoo symbol mapping. An instrument without a
verified Yahoo mapping keeps its selected provider. Eastmoney, Nasdaq, the
official Nikkei CSV, and optional credentialed EODHD, Twelve Data, Financial
Modeling Prep, Alpha Vantage, Marketstack, and Zhitu definitions are ordered
backups where supported. Tencent supplies no-key Chinese index/ETF raw daily
history, bounded at 2,000 requested rows, plus a session quote. History can
recover an empty chart under verified exchange identity; latest-only refreshes
still treat the one-bar quote as an in-memory overlay. FRED is a close-only
N225 reference. Secrets stay in
`.env.local` or a hosted secret store. Public website endpoints have no
published stability or commercial-use SLA.

The browser stores canonical series, provider-isolated source snapshots,
close-only references, SHA-256 fingerprints, lifetime counters, rolling
7/30-day source-health samples, and demotion state in a separate IndexedDB
database. A completed canonical bar is immutable. A
preferred-primary refresh may update only the unconfirmed final bar or append a
new date. When it fails, a declared backup may append missing dates or replace
only an unconfirmed final bar after identity verification or bounded overlap
validation; it never rewrites a confirmed date. The active fallback is labeled
in the UI. History requests are cacheable, whereas latest-bar and manual
refresh requests remain uncached. A configured-primary change may reuse the
existing same-instrument canonical record as its locked history seed. If a
validated in-memory temporary quote is followed by a transient all-source
failure, the newest still-valid quote remains visible until a newer quote or a
completed canonical bar supersedes it.

Eastmoney requests forward-adjusted data with `fqt=1`. EODHD daily bars scale
OHLC by the accepted `adjusted_close / close` factor only when every row is
coherent. Yahoo daily bars scale
all accepted open, high, low, and close rows only when every row has a finite
positive `adjclose / raw close`; one missing or invalid factor keeps every row
raw and marks the whole returned series as raw. Yahoo intraday support remains raw
inside the provider layer, and Nasdaq is always a raw daily fallback. Provider
volume is never rescaled. `MarketSeries.priceAdjustment` is the authoritative
adjustment label displayed by the UI. Yahoo also scales an adjusted series'
provider previous close and, after limiting output, uses the immediately
preceding normalized bar as `previousClose`.

The chart, indicators, strategy reference lines, current-bar guidance,
stability analysis, and backtests all consume the same normalized
`MarketBar[]`. For ETFs, adjusted prices reduce mechanical distribution/split
gaps. For indexes, the provider symbol and methodology determine whether the
source represents a price index or a total-return index; QuantScope does not
convert one methodology into the other or add constituent-company events and
fundamentals. This is not separate cash-distribution accounting, reinvestment,
cash yield, or a synthetic total-return ledger.

The newest daily bar is classified as complete, in-progress, or unknown from
provider session metadata or documented exchange closes. Close-derived live
signals ignore an incomplete/unknown newest bar; resting stop orders derived
from the prior completed bar remain active.

Commodity search uses deterministic Eastmoney continuous-contract page
identifiers, while the fixed canonical histories use the Yahoo aliases
`GC=F`, `SI=F`, `CL=F`, and `HG=F`. Eastmoney remains an independently stored
backup definition. Gold additionally uses FMP `GCUSD` and AllTick `GOLD`
credentialed backups. All commodity backups require retained-history overlap
and bounded price error because spot/CFD and continuous-contract methodologies
are not assumed identical. QuantScope does not model a contract chain, roll
method, multiplier, margin, expiry, delivery, or futures-account leverage.

Run `npm run verify:market` while the local server is running to perform the
live coverage matrix. It checks 16 global indexes, 11 ETFs, and four commodity
proxies for source identity, exchange identity, minimum history, dates, and
valid OHLC geometry. The live matrix is intentionally separate from
`npm test`, because public-source reachability is network-dependent.
Use `MARKET_VERIFY_GROUP=index|etf|commodity` to run one rate-limited group.
For an independent ETF or commodity audit, set
`MARKET_VERIFY_PROVIDER=nasdaq` or `MARKET_VERIFY_PROVIDER=yahoo` where that
provider supports the asset type.

Backtests are research simulations. They do not model every venue rule,
tracking error, tax, suspension, lot constraint, corporate action, or real
order-book liquidity. Close-confirmed signals execute at the following open.
Price orders calculated entirely from completed-bar data execute on the active
bar when its OHLC range touches the stop; a gap beyond the stop fills at the
active bar open. An open-only gap condition executes at that open. Daily OHLC
cannot prove the exact intraday path when both entry and exit stops of one flat
strategy are touched, so the backtest uses the conservative entry-then-exit
round trip. When two strategies produce different same-bar stop prices, the
combination engine uses one deterministic conservative ordering: entries from
lower to higher price, exits from higher to lower price, and the relatively
longer-horizon layer first at equal prices. This makes results reproducible but
does not reconstruct the real intraday tick path.
Index backtests are price proxies and do not represent a directly tradable
instrument. Volume-based studies are unavailable or uninformative when an
index source does not publish volume.

The current strategy guidance intentionally evaluates the newest provider
daily bar, which may still be unfinished. Close-confirmed signals can therefore
change again before the bar closes and remain next-open instructions. A
price-order strategy instead shows the current bar's entry and exit condition
prices calculated from prior completed data; an untouched condition is not a
fill. Greedy also shows a completed-candle instruction that is pending for the
next open; a qualifying opposite gap at that open can replace that direction.

Editing strategy-lab plans, dates, cash, or cost settings and saving a backtest
do not clear the current page's completed one-click screening results. They
remain visible until another screening starts or the instrument changes, but
changing the visible instrument or opening another saved strategy does not
cancel the original screening job. Its result remains owned by the original
instrument and is never rendered against the newly viewed series. Completed
results are not loaded from the compact D1 archive after refresh. Compact D1 run archives
exist only for provenance and week-to-week comparison. Local D1 state writes
are excluded from the development file watcher.

The optional moving-average-slope entry filter uses
`(MA[t] / MA[t-1] - 1) * 100`, rather than a raw price-unit difference, so one
threshold has comparable meaning across differently priced instruments.
Close-confirmed strategies evaluate the completed signal bar and still trade
at the following open. Intrabar and open-trigger strategies use the preceding
completed bar because the active bar's final moving average is not yet known.
If a blocked strategy remains long in its own target state, entry is delayed
until the filter becomes eligible; a later negative slope does not liquidate
an existing position.

The stability label is descriptive, not predictive. Invalid parameters do not
run a stability backtest. Evidence requires at least 120 daily observations
inside the selected range, two completed base trades, and one valid nearby
variant. Insufficient evidence is displayed with explicit reasons rather than
stable/sensitive. With sufficient evidence, stability additionally requires at
least 75% return-sign agreement, a return range no wider than 15 percentage
points, and no more than 10 percentage points of drawdown deterioration.
Regimes use the current close versus a 60-day SMA and the SMA's 20-bar slope,
retaining earlier bars for causal warm-up. The one-click period, range, and
rolling modes are recent-adaptive in-sample selectors rather than independent
out-of-sample tests. Re-running them weekly or every few weeks deliberately
allows selected parameters and relative roles to adapt to a recent configured
interval. A relative-long buy
establishes its allocation, a relative-short buy adds the other allocation, a
relative-short sell removes that layer, and a relative-long sell clears every
active layer. Rebalance records preserve relative long/short entry and exit
attribution; when the gate closes while the short layer is active, the final
strategy sell contains both exit events but renders as one close. A short
signal already active before the gate opens is observed, not inherited. The
allocation engine trades only when planned state changes and does not recenter
a constant target after ordinary price drift. Every finalist holding choice is
replayed through the allocation backtest, so exposure, costs, return,
drawdown, and Sharpe affect its rank. The staged four-phase search is exhaustive
across the full registered 45,196-parameter Cartesian product. EMA5-8 is a
  second-stage comparison over only the top 60 unfiltered candidates for each
  eligible family. Combination screening ranks family winners, retains the top
  100% of eligible families, then uses each retained family's top six final parameter
  sets. It evaluates all 36 parameter crossings for every eligible unordered
  non-equivalent strategy pair, keeps the best crossing per pair,
  and compares 50/50, 60/40, 40/60, 70/30, and 30/70 assignments.
This reduces combination work without eliminating overfitting.
Close-confirmed changes execute at the following daily open, while
causal predefined price orders may execute on the touched bar under the same
hybrid contract used by screening and the applied chart.

TradingView is a product reference only. This project does not redistribute the
TradingView Advanced Charts library or copy protected Pine scripts. The
built-in strategy implementations are transparent, independently written
long-only equivalents. Negative or short signals from an original template
close an existing long position instead of opening a short position. Internal
price-order references drive same-bar touched-order execution when their level
is known before the active bar; open-only gap rules execute at the observed
open. Strategies whose originals depend on
pyramiding, multi-order brackets, Bar Magnifier data, or TradingView's private
Technical Ratings engine are not claimed to be execution-identical.
