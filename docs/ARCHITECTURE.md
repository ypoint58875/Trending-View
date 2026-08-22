# Architecture

## Runtime

QuantScope is a vinext App Router application compiled to a Cloudflare
Worker-compatible bundle.

```text
Windows one-click local runtime
  -> open-quantscope.bat
  -> scripts/start-local.ps1
  -> runtime-port registry
     -> application at 127.0.0.1:3000
     -> market relay at 127.0.0.1:3001
  -> local D1 under .wrangler/state

Browser UI
  -> /api/search and /api/market
  -> canonical IndexedDB plus background primary/latest refresh and source audits
  -> index/ETF/commodity search filter plus deterministic commodity catalog
  -> canonical source profile per instrument
  -> Eastmoney, optional EODHD, Yahoo Finance, Nasdaq, and FRED reference adapters
  -> provider-isolated source snapshots and health measurements
  -> one locked canonical MarketSeries
  -> explicit daily or provider-native one-minute workspace interval
  -> interval-exact range, latest-bar, source-health, and cache boundaries
  -> indicator registry
  -> independent indicator selection and device-local parameter preferences
  -> strategy registry
  -> target-state or price-order strategy plan
  -> optional normalized moving-average-slope entry filter
  -> newest-bar live strategy guidance
  -> hybrid backtest execution engine
  -> exhaustive, chunked parameter-grid optimizer
  -> staged EMA5-8 family refinement
  -> unique-winner relative-horizon combination optimizer
  -> partial-allocation hybrid backtest
  -> ECharts canvas views
  -> /api/saved-backtests
  -> hosted email or fixed loopback owner key
  -> hosted or project-local D1 saved backtest snapshots
```

## Boundaries

- `app/`: routes, UI components, styles, and localized copy.
- `lib/market/`: provider adapters, parsers, and normalized market types.
- `lib/analysis/`: pure indicators, strategies, backtesting, and screening.
- `db/` and `drizzle/`: saved-backtest schema and forward migrations.
- `tests/`: deterministic analysis tests and built-worker rendering tests.
- `data/`: traceable source samples and source registry.
- `docs/`: durable project memory.

The API routes return normalized data and do not expose provider-specific row
formats to the browser.

Saved backtests use one owner key in every query. Hosted requests use the
authenticated ChatGPT email header. Requests to `localhost` or `127.0.0.1`
without that header use the fixed local owner `local@quantscope.invalid` and
the project-local D1 state under `.wrangler/state`. Saved rows are append-only
snapshots at creation time: the owner/provider/instrument columns are indexed
for listing, but they are not unique, so one instrument can retain multiple
strategy plans.
The upper workspace pairs the price chart with saved shortcuts. The lower
research grid pairs the strategy lab with automated parameter screening.
Saved-shortcut listing reads at most 200 owner-scoped rows into a bounded
scroll region. The UI canonicalizes provider-specific aliases into one
instrument group, renders each group as a disclosure, and mounts its saved
strategy/indicator rows only while expanded. Native drag-and-drop or keyboard
arrow moves update the ordered list optimistically and persist `display_order`
through the same owner-scoped API. A group-level delete resolves the canonical
instrument key on the server and removes every matching owner-scoped row.
Renameable `saved_backtest_folders` rows provide two fixed scopes: one root
scope for canonical instrument groups and one canonical-instrument context for
strategy rows. Saved rows keep nullable folder foreign keys. Assignment is
owner- and context-validated; deleting a folder sets those references to null
and never deletes saved backtests. Both folder scopes are collapsible, and
sibling drag or keyboard ordering is optimistically persisted through each
folder row's context-local `display_order`.

`MarketWorkspace` owns separate indicator, draft strategy-plan, and applied
strategy-plan state. Indicator controls read defaults, category, and validation
metadata from the indicator registry, start with every indicator hidden,
persist one parameter set and a favorites list in device-local storage, and
pass only the visible configurations to `PriceChart`. A controlled menu bar
replaces the previous flat toolbar, keeps at most one category open, and closes
on another category, an outside click, or Escape. Each categorized indicator
has an independent outline-star favorite action. The favorites strip occupies
its own row, remains directly clickable, and initially contains the confirmed
support/resistance-break pilot.
Each favorite or menu label both focuses and toggles its indicator, while the
adjacent category-menu star only changes favorite membership. Draft strategy
changes, Apply, screening rows, and saved shortcuts never change manual
indicator visibility or parameters.
Only Apply, a screening row, or a saved shortcut updates chart references,
live guidance, and trade markers. Save current strategy snapshots that applied
chart plan and its matching metrics rather than unapplied lab edits.
`PriceChart` renders the selected studies together with both selected
strategies' qualified reference lines and actual trade/allocation markers. It
derives an explicit visible price-axis range from OHLC highs and lows whenever
data zoom changes; strategy overlays cannot expand that range, so one
instrument and zoom window retain the same K-line scale across saved plans.
Useful references render as solid lines matching their legend symbols; empty
reference series are omitted. Price detail tooltips and crosshair labels share
a one-decimal formatter. Visible price-axis ticks remain integers when the
visible candle high exceeds 20 and use at most two decimals when it is 20 or
less; the same rule applies to daily and one-minute series.
Saved-backtest snapshots retain the ordered visible indicator configurations
in a nullable JSON column for backward-compatible provenance, but opening a
shortcut does not restore or alter indicator visibility or parameters. If the
shortcut and the successful active series resolve to the same canonical
instrument, the workspace preserves that exact series and restores only plan,
parameter, metric, and marker state. Only a different canonical instrument
triggers a market reload. For
every active or successfully background-refreshed instrument, daily shortcut
returns are derived from each saved plan and costs over the latest 128 trading
sessions. The rolling-update API persists returns without changing legacy rank
columns. Saved-plan ranks are no longer read, written, backfilled, or rendered.
Each shortcut instead presents a current 30-session review with a 63-session
confirmation; unavailable live calculations fall back to the last persisted
rolling return and then to the creation-time metric. Completed screening runs
remain a compact backend provenance archive and never mutate shortcuts.

One local strategy-screening action sends the complete market snapshot and
settings once to the loopback screening coordinator on port 3001. The
coordinator stores one deterministic job request and runs the shared screening
core in a disposable Node child process. Every exact checkpoint is serialized
atomically to `data/state/screening-engine`; the child then exits so its entire
heap is returned to the OS, and a fresh child resumes the same traversal.
Only one compute child runs at a time across browser tabs. If the local engine
is unavailable before a job starts, the existing dedicated module Web Worker
remains the compatibility fallback. Both paths generate all 45,196 finite
parameter combinations from the shared registry and apply one objective. For each
explicitly eligible trend, breakout, or momentum strategy, it retains compact
metrics and raw execution state for the top 60 unfiltered
parameter sets and compares EMA(5), EMA(6), EMA(7), and EMA(8) at a 0% slope.
Every strategy contributes its top three final parameter sets to normal pair
screening, which evaluates all nine crossings for each strategy-ID pair and
keeps the best crossing before allocation replay;
rolling screening retains the best ten candidates per strategy for window
aggregation before collapsing back to one displayed winner per strategy. The
optimizer ranks every unordered pair of non-equivalent retained single results
and compares 50/50, 60/40, 40/60, 70/30, and 30/70 allocations under both
base-then-add and full-then-reduce tactical modes. The current
catalog produces 1,594 non-equivalent strategy-ID pairs. Final
combination output keeps only the best parameter/allocation result for each
unique unordered strategy-ID set within each strategy-count category. Pair
winners seed bounded triple discovery, and each retained count seeds the next
count through nine strategies. This forward-expansion beam avoids exhaustive
tuple enumeration. The UI renders nine vertically stacked disclosures and
independently retains the top 30 rows per one-to-nine strategy category.
Stage-local counters drive one monotonic eighteen-segment bar.
Clicking or keyboard-activating a result row applies it directly; the strategy
A/B columns retain detailed parameters for pair results, while three-to-nine
strategy results use one compact Strategy-A-led layered-plan name, a two-line list
of the remaining names, and aggregate weights. The strategy lab remains the
sole equity-preview surface. Every target is generated from
the complete loaded history; only performance is restricted to the selected
date range. Market bars cross the UI boundary once per job as protocol-v3
binary metadata, times, and Float64 columns. The coordinator writes those
columns directly to `bars.bin` without creating a second JSON bar graph. Stage-local
indicator, target, order, and fill state stays inside the compute process and
checkpoint; rejected candidates, display equity, trades, and rebalances never
pass to the next discovery stage. Entry-filter completion drops raw target and
order state, pair completion drops per-leg fills, and higher stages retain only
parameters, compressed targets, scalar performance, finalist keys, and
traversal cursors. The engine returns compact ranked winners and validation
evidence; detailed chart curves and transaction records are replayed only when
a result is shown. Child progress is limited to four IPC updates per second and
includes throughput, stage ETA, resident memory, and restart count. A
coordinator watchdog replaces a child after 60 seconds without a heartbeat and
fails explicitly after three consecutive no-progress recoveries. Exact local
checkpoints use an adaptive 4,096/8,192/16,384 cadence and every stage boundary.
An atomic manifest references independent sections, so frozen earlier-stage
state is not repeatedly serialized. The completed compact outcome is fetched
from a separate result endpoint only after status reports completion.

`screening-validation.ts` wraps the same optimizer without duplicating its
candidate domain or objective rules. Period screening performs the complete
parameter, EMA Top-60, combination, and allocation workflow inside one
configured trailing window. The default is 128 sessions and is synchronized
bidirectionally with the strategy-lab range. Range screening performs the same
workflow over one custom start/end interval and has no separate training,
selection, or test stage. Rolling screening first forms the retained
standalone and combination pool over one custom total interval, then advances
a fixed-width calendar window by one year. Each window converts the active
objective order into a tied 0-to-100 percentile rank, and equal window weights
drive the final order.

All three modes build indicators, strategy targets, and opening position state
from complete loaded history so a scoring boundary does not reset a
continuously running strategy. If exposure already exists, the active range
inherits units and cash directly at its first open without recording a trade or
cost. At the end it marks remaining units to the last close without a forced
sale. Only real signal transactions and performance inside the active period,
custom range, or rolling window feed its return, Sharpe, drawdown, and
objective. The balanced objective is `0.45 * totalReturn +
8 * clamp(Sharpe, -5, 5) + 0.35 * maxDrawdown`; trade count remains report and
candidate-status evidence only. These modes are recent-adaptive in-sample
selectors and make no out-of-sample claim.

After all result groups complete, `strategy-shortlist.ts` forms one combined
eligible pool. The first candidate under the active screening objective is the
primary strategy. It recommends up to two deputies only when each candidate
shares no strategy component with the recommendations already selected and
its maximum aligned daily equity-return correlation to them is below 0.75.
Quality/diversity scoring orders only candidates that pass that hard
independence gate. High-overlap candidates can fill otherwise empty visual
slots only as same-family alternatives, never as deputies; the UI explicitly
reports a deputy shortfall. The shortlist occupies one fixed horizontal row
above both underlying result tables and does not alter them. A separate
30-session review compares strategy
equity with the active instrument and checks a 63-session excess-return
confirmation; this review is descriptive and never feeds back into selection
rank. Period and rolling modes expose their window-aggregate selection score
to the shortlist; range mode uses its custom-range objective. Diversity
measurement remains independent from objective ranking.

Every strategy registry entry retains descriptive `long` or `short` catalog
metadata, but plans and combinations do not use it as an eligibility rule.
Strategy A through optional Strategy E can each hold a different,
non-equivalent registry entry. A single strategy directly controls the target,
while dual plans retain the existing core-gate/tactical-sleeve state machine
and five allocation splits. Three-to-nine-leg plans select the longest active-run
strategy as a 60% core gate and normalize all remaining positive 10% weights as
one tactical-support score. Support and hysteresis choose 60%, 80%, or 100%,
while an inactive core selects 0%. A causal fast/slow true-range ratio can cap
exposure at 80%, 60%, or 0%; tightening is immediate and loosening requires two
completed bars. Close-confirmed allocation changes execute at the next open.
Individual price-order fills update their leg state but do not execute separate
portfolio sleeves in a three-to-nine-leg plan. Complete-history state initializes
any already-active position at the first selected open without a transaction or
cost. It does not
recenter an unchanged state after price drift and applies costs only to actual
in-range transitions. It marks the selected-range end to the last close
without liquidation. Rebalances carry
relative long/short entry/exit attribution, and a gate exit with an active
short layer renders as one close action.

The strategy registry supports two execution contracts. Target-state
strategies produce long/flat decisions after a completed bar and execute at the
next open. Price-order strategies produce stop levels using only completed-bar
data; an open-only rule may additionally react to the observed active open.
The backtest engine fills touched stops inside that bar, executes open-only
events at the open, uses the open for crossed gaps, and applies the same cost and trade-record
pipeline to both contracts. When both entry and exit stops of one flat strategy
are touched on the same daily bar, the resolver records a conservative
entry-then-exit sequence rather than choosing the profitable path.

The manual-history workspace, direct backtest, stability analysis, standalone
screening, combination screening, applied chart, and saved metrics all use the
same hybrid policy. Close-derived target changes fill at the following open.
Registry entries with causal price orders fill on the touched bar, including
open-price gap handling. Combination same-bar entry stops execute from lower to
higher and exit stops from higher to lower; the relative-long layer wins an
equal-price tie.

`entry-filter.ts` owns the optional moving-average-slope entry boundary for
SMA, EMA, and WMA. It calculates normalized one-session percentage slopes once
over the complete loaded history and exposes an aligned entry-eligibility
series. Target-state plans apply eligibility on the completed signal bar;
price/open-order plans apply the preceding completed bar's eligibility to the
active execution bar. The stateful filter delays only a flat-to-long
transition and never creates an exit. Strategy-lab drafts and one-click
screening drafts remain independent, while a screening result or saved
shortcut carries the exact filter into the applied plan, backtest, stability
diagnostic, chart, and live guidance. When the screening draft is enabled, the
optimizer creates separate EMA(5), EMA(6), EMA(7), and EMA(8) contexts at a
fixed 0% threshold only for the explicit trend/breakout/momentum family and
only after selecting each eligible strategy's top 60 unfiltered parameter
sets. Combination plans store `strategyAEntryFilter` and
`strategyBEntryFilter`; every leg is replayed with the exact filter state that
qualified its retained single result, including mixed filtered/unfiltered and
different-EMA pairs.

`screening-runs.ts` is the persistence boundary for audit archives. It builds a
stable candidate key, strips heavy equity/trade/rebalance arrays from the
validation report, and hashes the normalized market snapshot with SHA-256.
`/api/screening-runs` scopes every read and write by the shared owner resolver
and canonical instrument key. D1 stores source, adjustment, fetch time, last
bar, data fingerprint, retained compact ranking, settings, and validation
configuration. Read and write boundaries prune every owner's archive groups to
the newest six rows per canonical instrument. The UI compares the newest two
runs. This archive is provenance, not optimization input or a result cache.

Live guidance reuses the same strategy registry. Target-state strategies
compare the newest dynamic bar target with the preceding target. Price-order
strategies replay the same long-only touched-stop rules through the newest bar
and expose the current entry/exit condition prices. This produces buy, sell,
continue-holding, or remain-flat guidance under the same execution contract.
Greedy additionally exposes a completed-candle action pending for the next
open, with its documented opposite-gap override. The latest daily bar is
explicitly complete, in-progress, or unknown. Close-derived guidance freezes
at the preceding target until completion is known, while prior-completed-bar
stop orders remain eligible.
When a causal entry order is touched but the prior completed-bar entry filter
rejects it, guidance preserves the entry condition price and exposes an
`entryBlockedByFilter` state so the UI does not present an ordinary wait.

Full history can be HTTP-cached for one hour; a separate uncached request
retrieves up to five latest bars on open and every refresh. The browser
resolves a canonical source profile before loading data. A completed canonical
bar is locked; only an unconfirmed final bar may be replaced. Preferred-source
dates may be appended. A declared fallback may append missing dates after
identity or overlap validation, but provider changes never rewrite confirmed
canonical bars.

`lib/market/canonical-cache.ts` owns a separate
`quantscope-canonical-market` IndexedDB database. It stores canonical series,
provider-isolated history/latest snapshots, close-only reference snapshots,
SHA-256 fingerprints, and source-health records. Source health stores lifetime
counters, bounded 31-day attempts, rolling 7/30-day availability inputs,
persistent demotion, latency, latest date, date gaps, OHLC error against the
canonical series, adjustment agreement, network route, and methodology.
`lib/market/source-health.ts` applies minimum-sample quality gates, hourly
configured-primary probes, and seven-day restoration hysteresis. A
verified backup may extend canonical OHLC without rewriting confirmed dates.
Rejected candidates remain provider-isolated audit snapshots and may produce
only a price-gated temporary quote. A validated current-session quote may be
merged into the active in-memory series as an unconfirmed display bar, but the
locked historical series is retained separately and only that canonical base
is persisted. The legacy 32-series cache is
read only through a controlled same-instrument migration path. A prior
canonical-primary record may remain the locked seed after a deliberate source
policy change; the new primary can update only an unconfirmed final date and
append missing or newer dates.

The daily workspace asks for provider history from 2000-01-01 and retains at
most 10,000 normalized bars in page memory. `lib/market/history.ts` owns this
shared boundary and the separate retained intraday safety cap. Eastmoney,
Yahoo, and each active daily backup translate the boundary into
provider-specific date parameters or documented caps. A later-listed
instrument begins at its first available bar.

The live guidance presentation labels price orders as same-bar conditional
fills and close-confirmed signals as following-open instructions. It does not
use wall-clock time to change execution semantics.

Community analysis is isolated under `lib/analysis/community/`. The catalog
records provenance and compatibility; the community registry owns indicator
IDs/defaults; pure formula modules own aligned calculations; and the main
indicator/strategy registries import those collections. Pine source is never a
runtime dependency. The import contract requires confirmation-bar pivots,
input-prefix causality tests, explicit MTF limitations, and host-controlled
following-open execution for close-derived strategy targets. See
`docs/COMMUNITY_IMPORTS.md`.

Yahoo is preferred for N225, SOX, the deterministic continuous-futures aliases,
Yahoo-discovered instruments, and indexes or ETFs with a verified Yahoo symbol
mapping. The official Nikkei CSV, Eastmoney, Nasdaq, and optional EODHD,
Twelve Data, Financial Modeling Prep, AllTick, Alpha Vantage, Marketstack,
Zhitu, Tencent, and Juhe definitions are tried when supported. During Chinese
index/ETF outage
recovery, the no-key Tencent session quote is probed before quota-bearing
history services; Juhe is the last quote-only attempt and is skipped after a
valid Tencent quote. The first validated history source remains canonical,
while either accepted quote can update only the active current session.
Neither Tencent nor Juhe is a history or effective-primary source. Juhe is
protected by a 50-call Shanghai-day gate and excluded from routine audits.
Gold FMP `GCUSD`, AllTick `GOLD`, and Eastmoney `101.GC00Y`
backups are overlap-required and therefore cannot recover an empty chart or
rewrite confirmed Yahoo history. FRED is a close-only N225 reference and never
becomes OHLC.
Eastmoney HTTPS is preferred, with a same-host HTTP retry only when the public
site closes the TLS connection. Major global index codes are mapped to their
real exchange sessions instead of interpreting Eastmoney market `100` as JPX.
For local Windows use, `scripts/market-relay.mjs` is always ensured by the
launcher. Development defaults to its fixed `127.0.0.1:3001` route, it
restricts targets to reviewed provider endpoints, and it lets the local Worker
runtime reach proxy-preferred sources without receiving proxy addresses or
credentials. The launcher registers both persistent runtime listeners:
application port 3000 and relay port 3001. It probes each service, reuses a
healthy current instance, and removes an unhealthy listener only when the
owning Node command matches the exact current-checkout executable path and
role-specific arguments. A different checkout or unrelated listener is never
stopped automatically.
Provider-side latency, rate limits, regional blocks, and licensing constraints
remain possible.

The visible page schedules the active instrument by venue session: five
minutes for an open regular venue through 30 minutes after close,
Sunday-Friday Globex hours for COMEX/NYMEX proxies with their maintenance break,
and 15 minutes for an unknown venue. Focus and visibility cannot bypass the
minimum interval. Ordered backup
recovery begins immediately after a primary failure; 15/30/60-minute backoff
begins only after the full source chain fails. The complete shortcut collection
is refreshed after the manual header action and after each scheduled
active-instrument update. The inactive-instrument pass remains sequential,
de-duplicated, cooldown-protected, and does not switch the visible chart.
## Three-to-nine-strategy core-satellite positioning and comprehensive assessment

Pair screening is the bounded parent stage for triple discovery. The optimizer
takes the best 128 pair finalists, tries a non-equivalent third finalist at a
40/30/30 reference allocation, retains up to 256 unique unordered strategy-ID
triples, and replays all 36 positive tenth-based judgment-weight allocations.
Triple finalists seed bounded four-strategy reference tests,
and four-strategy finalists seed bounded five-strategy reference tests. Each
retained four/five set then replays every positive 10% allocation composition
once: 84 four-leg candidates and 126 five-leg candidates. Output is capped
independently at 30 for each strategy count. Progress has ten optimizer segments
through quintuple allocation.

Strategy A through optional Strategy I may each hold a different,
non-equivalent registry entry. Three-to-nine-leg allocations remain judgment
weights, not independently tradable sleeves. The longest-duration leg gates a
60% core position. Non-core support uses 30%/70% outer thresholds and 40%/60%
hold bands to select 60%, 80%, or 100%. Volatility stress may directly reduce
or clear that target, while delayed cap recovery and the no-trade bands suppress
churn. The longest-duration leg is therefore both the execution core and the
stable display/reference role.

`strategy-consensus.ts` is a post-screening reducer. The workspace takes up to
five diversified shortlist entries, derives each plan's previous and current
live target through the shared allocation state machine, and applies
deterministic rank weights. It rounds the aggregate target to a 10% position
and maps agreement plus directional pressure to
buy/add/hold/reduce/sell/wait. It cannot alter screening rank or result tables.
