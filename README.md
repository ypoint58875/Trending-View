# QuantScope

QuantScope is a daily-only workspace for researching one global index, ETF, or
commodity futures quote proxy at a time and making manual swing decisions. It
combines filtered asset search,
dividend/split-adjusted price charts when the selected source supports them,
technical indicators, strategy backtests, parameter sensitivity diagnostics,
and staged exhaustive parameter screening in one responsive page. It does not place
trades or run unattended jobs.

## Included

- Search global indexes, exchange-traded funds, and commodity futures quote
  proxies; individual equities are excluded from results. A deterministic
  catalog includes gold (`GC=F`), silver (`SI=F`), crude oil (`CL=F`), and
  copper (`HG=F`).
- One fixed daily interval in the user interface. Provider adapters and API
  types retain interval support for internal compatibility.
- Daily history requests start at 2000-01-01 with a 10,000-bar safety cap.
  Instruments launched later begin at their first provider-available bar.
- Candlestick and line chart modes with volume and synchronized zoom.
- Cached history plus an uncached latest-bar overlay on open, every
  60 seconds while visible, and on focus/visibility, with current-bar strategy
  guidance recalculated after each compatible overlay. Source or
  price-adjustment mismatches retain the complete existing history.
- Saved-shortcut histories also use a bounded device-local IndexedDB fast path:
  a hit renders immediately with its cache timestamp, while the complete
  network history refresh continues in the background. Cached histories do
  not expire by age; the oldest entry is evicted only when the 32-series
  capacity is exceeded.
- Explicit price-adjustment metadata from the selected `MarketSeries`.
  Eastmoney, EODHD, and valid Yahoo daily series are marked
  `corporate-action-adjusted`; Nasdaq is a raw daily fallback.
- Explicit green-up/red-down chart legend. A selected-range boundary inherits
  an already-open position without a synthetic fill or cost and marks the
  ending position to the last close without forcing a sale.
- Twenty independently configurable indicators, including moving-average
  variants, Bollinger Bands, Ichimoku, Supertrend, momentum, volatility, and
  volume studies. One indicator is focused for editing while an ordered
  collection can remain visible. Indicators are hidden by default, each toolbar
  button toggles its own visibility, and parameter changes are saved as a
  device-local preference for later sessions.
- Overlay indicators share the price axis; each lower-pane indicator receives
  its own pane. Price, volume, and all indicator panes share the same zoom.
  Series names show their actual parameters in a scrolling legend.
- Indicator visibility is independent from strategy selection. The active
  strategy contributes actual buy/sell fills and, where the rule has
  continuous price references, dashed strategy lines on the main price axis.
  Technical Ratings shows the same EMA-20 and SMA-50 references used by its
  price votes.
- Fourteen extended strategy families plus independent equivalents of all 20
  templates in TradingView's official built-in-strategy directory.
- Descriptive long-horizon and short-horizon catalog metadata for every
  strategy. Standalone results can expose that intended style, but it no
  longer restricts which two strategies can be combined.
- Date-range backtests with initial cash, commission, and slippage settings.
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
  editable for manual replay.
- Chart-level fill markers derived from the active backtest and limited to four
  strategy actions: open (long buy), short buy, short sell, and close.
- Per-user saved backtests with a right-side shortcut bar that restores the
  instrument, complete optional Strategy A/B plan, both parameter sets,
  allocations, date range, cost settings, and the indicators that were visible
  at save time with their exact parameters.
  The shortcut bar contains the Save current strategy action. A save replaces
  the existing record when instrument, plan, range, cash, and costs are
  identical—even when only visible indicators changed; a materially different
  setup creates a new snapshot. The
  scrollable list shows one collapsed row per instrument; expanding it reveals
  the saved strategy/indicator snapshots. Instrument groups and snapshots can
  be reordered by drag and drop or keyboard arrows, and that order persists.
  The workspace interval remains daily. Legacy non-daily records keep their
  stored interval label and disclose that opening them recalculates on daily
  bars. Opening a shortcut for the same canonical instrument preserves the
  already loaded successful price series and restores only the plan,
  parameters, indicators, and trade markers. A genuinely different canonical
  instrument triggers a market reload.
- A nearby-parameter stability diagnostic that changes one parameter at a time
  to the immediately lower or higher configured value, reruns valid variants,
  and reports return-sign agreement, return/drawdown/trade-count ranges, and
  performance in up, sideways, and down market regimes. It validates the exact
  parameter shape and requires 120 in-range daily observations, two completed
  base trades, and a nearby variant before showing stable/sensitive. It never
  selects or applies a replacement parameter.
- One-click exhaustive strategy screening across all 34 strategies. It
  traverses all 37,131 finite registered parameter combinations; there is no
  per-strategy sampling control or hidden cap. One shared objective drives the
  complete single-and-combination workflow.
- Three focused screening targets: balanced score, maximum return, and maximum
  Sharpe. Balanced score is `0.45 * current-window total return +
  8 * clamp(current-window Sharpe, -5, 5) + 0.35 * current-window maximum
  drawdown`; trade count is displayed and still controls the candidate versus
  observe-only badge, but does not affect rank.
- Three recent-adaptive screening modes inside the same one-click workflow.
  `Period` is the default and selects parameters, EMA refinement, combinations,
  and allocations only from one adjustable trailing window. The default is 128
  trading sessions and is bidirectionally synchronized with the strategy lab
  range. `Range` performs the same complete selection over one custom start/end
  interval without separate training or test intervals. `Rolling` first forms
  the retained candidate pool over one custom total interval, then advances a
  fixed-width calendar window by one year and equally averages each window's
  tied 0-to-100 objective rank. None of these modes is presented as independent
  out-of-sample proof. Bars before an active scoring boundary remain available
  only for causal indicator and position-state continuity; their transactions
  and performance never enter the active-window objective.
- Monotonic segmented four-stage progress, cancellation, and unexpected-run
  recovery. The first result column keeps
  only the best parameter set for each standalone strategy. Screening
  builds every candidate signal over the complete loaded history and limits
  only performance measurement to the selected range. This preserves sticky
  position state across long quiet periods. If that state is already long
  before the selected start, the simulation inherits the position at the
  first selected open without a trade or cost. The EMA stage
  keeps only compact metrics for each eligible strategy's top 60 unfiltered
  parameter sets. Only the final unique winner per strategy keeps its complete
  execution state for pair replay.
- Screening runs in a dedicated module Web Worker. Indicator, target, and
  execution arrays are reused only inside that run; completed results are not
  restored as a calculation cache after refresh.
- Every completed run writes a compact audit archive containing source,
  adjustment mode, last bar, data fingerprint, screening configuration,
  retained ranking, and validation summary. The UI compares the newest run
  with the prior run for the same canonical instrument; archives never feed
  the next optimization.
- A two-selector strategy lab where Strategy A and Strategy B can each be any
  different registered strategy and either selector can be omitted. For a dual
  plan, the selected-range target with the longer average active run becomes
  the relative long-cycle gate; an exact duration tie prefers fewer target
  transitions and then Strategy A. A fresh relative-long entry establishes
  its allocation without inheriting an already-active relative-short signal.
  A later relative-short entry adds the other allocation, its paired exit
  removes that layer, and a relative-long exit clears both layers. The derived
  roles are shown in the lab and recalculate when dates or parameters change.
  Each selector exposes its own parameter settings directly below it.
  Selecting only one strategy always backtests and saves it at 100% allocation;
  dual plans compare 50/50, 60/40, 40/60, 70/30, and 30/70.
  Its Apply action clones the current draft plan to the trend chart and moves
  the view to that chart; selector/parameter edits do not change chart lines,
  markers, or live guidance before Apply. Durable saving remains a separate
  shortcut-bar action.
- The same one-click run automatically pairs the unique final winner of every
  strategy with every non-equivalent strategy winner at the reference
  60%/40% allocation, without a separate combination checkbox.
  Equivalent implementations such as the paired MACD-cross and Supertrend
  close-confirmation entries are not combined with themselves. It keeps up to
  4,096 pair finalists before replaying the alternate 40%/60% assignment. The
  current 34-strategy catalog produces 559 unique non-equivalent winner pairs,
  so no pair is discarded. Both columns render every retained best row. The
  second result column keeps only the best
  parameter/allocation result for each unique strategy-ID pair.
  Each result shows which member was classified as relative long or short.
  Dual targets remain limited to 0%, 40%, 60%, or 100%, and every ranked
  result can be applied directly to the lab and trend chart.
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
  change the historical ranking, and is not represented as out-of-sample proof.

## Run locally

Requirements: Windows and Node.js 22.13 or newer.

For one-click local use, double-click `open-quantscope.bat`. The launcher:

- runs QuantScope only at `http://127.0.0.1:3000`;
- initializes the project-local saved-backtest database;
- opens a new maximized Edge window when Edge is available; and
- never requires a ChatGPT or other account.

Keep the `QuantScope Local Server` window open while using the application.
Closing that window stops the local server. Saved backtests remain under
`.wrangler/state` after the server stops.

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

The provider chain reads Eastmoney, Yahoo Finance, and Nasdaq website endpoints
and can additionally use the licensed EODHD daily API for indexes and ETFs.
Set the server-only `EODHD_API_TOKEN` environment variable to enable that
fallback; leave it empty to retain the credential-free chain. The public
website endpoints are convenient for a prototype but have no published
stability or commercial-use SLA.

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

Commodity symbols use Yahoo continuous futures quote pages as research proxies.
QuantScope does not model a contract chain, roll method, multiplier, margin,
expiry, delivery, or futures-account leverage. Nasdaq fallback is intentionally
disabled for commodity instruments.

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
are not loaded from a calculation cache after refresh. Compact D1 run archives
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
across the full registered 37,131-parameter Cartesian product. EMA5-8 is a
second-stage comparison over only the top 60 unfiltered candidates for each
eligible family, after which combination screening uses retained single
results across all unordered non-equivalent pairs and compares 50/50, 60/40,
40/60, 70/30, and 30/70 assignments.
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
