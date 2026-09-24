# Debugging

## Strategy-cycle validation does not resume or exceeds its limit

The page stores one versioned task in the
`quantscope-strategy-cycle-validation` IndexedDB database after each complete
decision/window optimization. Resume requires the same canonical instrument,
latest market bar and bar count, screening windows, update intervals,
evaluation length, objective, and cost settings. A changed signature starts a
new task deliberately. Task version 2 also stores every deterministic local
job ID. All incomplete units are submitted before result collection, so the
loopback coordinator continues them without browser polling. Reopen the page
and press Continue to collect completed results and rebuild the report.

If progress stops overnight, check `http://127.0.0.1:3001/health` and the
matching directories under `data/state/screening-engine/`. A queued or running
job with changing checkpoint timestamps means computation is continuing even
if the page is temporarily busy. Explicit Pause and closing or leaving the page
cancel all submitted unfinished jobs. The primary close signal is a streaming
browser lease: when its connection disappears, the coordinator writes durable
cancellation markers and kills the children. The unload batch request is only a
redundant fast path.
Screening-engine protocol version 4 persists a batch
queue manifest and explicit-cancellation markers, so restarting the local relay
automatically resumes unfinished, non-paused jobs. Reopen the page and press
Continue only to reattach report collection immediately; it is not required to
keep the computation queue advancing.

If the page reports too many units, reduce the evaluation length, remove a
screening window, or increase update intervals. It rejects schedules above 512
units before screening and keeps no unbounded queue. Clearing the task cancels
its submitted jobs and removes the device-local validation record. If a task cannot be read, inspect
whether browser site-data policy disabled or cleared IndexedDB; saved backtest
shortcuts and market sources use separate persistence boundaries.

## Browser memory grows during an otherwise bounded screening run

First compare the local-engine memory shown in the screening status with the
Edge renderer working set. If the child remains bounded but the renderer grows,
instrument the price canvas while progress advances. Screening progress must
not call `ECharts.setOption` unless chart inputs changed. In particular, never
pass a new empty array or object literal into a memoized chart dependency on
each `MarketWorkspace` render. The no-applied-backtest path uses
`EMPTY_PRICE_CHART_TRADES`; replacing it with `[]` causes every 200 ms progress
update to rebuild the complete chart option. In the 6,544-bar N225 reproduction
that defect caused 131 canvas clears in 20 seconds and linear renderer growth.

## Viewing another instrument cancels or misplaces a screening result

Instrument navigation must call
`clearScreeningPresentationForInstrumentChange()` and must not abort
`screeningAbortRef`. The active job owns an immutable `runSeries` and
`runInstrumentKey`; completion may update the visible result tables only when
`visibleInstrumentKeyRef` still matches that key. The device-local result is
also written with the run key, so returning to the original instrument can
restore it. Only the explicit stop action or page teardown may abort the job.

## KRX KS11 screening exhausts memory

Confirm the loaded series length and local engine telemetry. Yahoo `^KS11`
returned 6,680 daily rows in the 2026-09-21 read-only probe, crossing the shared
long-history boundary. Both the browser Worker and local child must use
`screeningCheckpointInterval(...)`; at least 6,000 bars or at most 9 GiB
physical memory checkpoints every 2,048 evaluations. The atomic checkpoint
resumes the exact traversal in a fresh heap. Do not shorten history, reduce
finalist limits, or change strategy domains. If memory still grows, retain the
job directory and record stage, bar count, RSS, checkpoint bytes, and restart
count.

## 164824 changes source or price while Shenzhen is closed

The verified profile must resolve legacy `164824.SHE`/`OTHER` and Eastmoney
aliases to Tencent `sz164824` as the fixed raw canonical primary. Eastmoney
`0.164824` remains a raw verified backup only. If the source label differs,
inspect canonical-cache primary metadata and allow the primary-change migration
to replace an old adjusted or Eastmoney cache as one unit; never merge price
adjustment modes. The 2026-09-21 probe observed Eastmoney `rc=102` and a valid
Tencent response, so adding more Eastmoney off-hours retries is not the
recovery path.

## One-click screening appears stuck

Check the engine telemetry below the progress bar first. A changing candidate
count, non-zero evaluations/second, or updating memory value means the current
high-order stage is active even when its percentage moves slowly. The local
coordinator restarts a child automatically after 60 seconds without any
heartbeat and resumes `data/state/screening-engine/<job-id>/checkpoint.bin`.
After three consecutive no-progress restarts it reports an error instead of
spinning indefinitely. Normal 8,192-evaluation and stage checkpoints can also
increase the restart count; they never change or skip candidates.
Protocol-v3 status responses remain small; the completed result is read once
from `/screening/jobs/<job-id>/result`. `bars.bin`, `derived.bin`, and the
checkpoint manifest can be inspected independently when diagnosing disk cost.
On Windows, an `EPERM` rename error for `checkpoint/manifest.json` indicates a
transient file lock during replacement. The writer retains the last committed
manifest, retries the rename, and falls back to a recoverable backup swap; press
Continue once to restart a job that exhausted its retries before this fix.

## Shortcut batch period screening stops or resumes

1. The left screening button uses the first configured period-window session
   count and processes only shortcut instruments whose asset type is `index`.
2. Progress is committed after the strategy record is saved and assigned to
   its `N日` folder. Pressing Stop leaves the last complete checkpoint intact.
3. Reopen the page and press the same button with unchanged period, objective,
   costs, and entry-filter mode to resume. A changed configuration starts a
   fresh pass.
4. Failed instruments remain pending and are retried. The bounded checkpoint
   stores only keys, status, timestamps, and a safe last error—not market data.
5. If an index group cannot be dragged, confirm nested record/folder drop
   handlers return without stopping propagation for a group drag.

## Local launcher does not open QuantScope

1. Confirm `node --version` reports 22.13.0 or newer and `npm --version`
   succeeds.
2. Read any reported port-owner PID. The launcher manages its own unhealthy
   listeners on ports 3000 and 3001, but refuses to stop an unrelated owner.
   It also removes an exact-current-checkout Vinext process left on a historical
   fallback port. Vite now uses strict-port mode, so new launches fail instead
   of silently moving from 3000 to 3002.
   Loopback health probes bypass configured HTTP/HTTPS proxies; those proxy
   values remain enabled only for Node's external market requests.
3. Read the visible `QuantScope Local Server` window for vinext errors.
   The browser should open once port 3000 listens. Application readiness is a
   lightweight `/api/health` request and no longer waits for full workspace SSR.
   A cold vinext compile may exceed the initial 60-second startup window. If
   port 3000 is already listening and the server process is still alive, the
   launcher reports that compilation is continuing and grants one bounded
   120-second grace period. It still fails after that period rather than
   waiting indefinitely, then stops the failed launch tree and checks for exact
   current-checkout leftovers.
4. If a previous launcher is already serving QuantScope, launch again: the
   readiness check now reuses that server before touching the D1 migration
   state.
5. Run `npm run local:db:migrate` if the saved-backtest API reports
   `PERSISTENCE_UNAVAILABLE`.
6. Keep `.wrangler/state` to retain local saved backtests. Removing that
   directory resets local persistence.
7. Run `npm ci` if `node_modules` is missing or dependencies are damaged.

If the console previously stopped after `No migrations to apply!`, Wrangler had
completed the no-op migration but left its Windows process tree alive. The
launcher now relays migration output and allows a two-second exit grace period
after that exact terminal message. It then closes only the migration process
tree and continues startup. Windows may report that one child exited during
that cleanup; the launcher now verifies the exact root process and continues
when it has already stopped. A root process that remains alive, or a migration
that times out without the success message, remains a hard failure and is never
skipped.

The launcher never falls back to the hosted site. The local UI and saved
records do not require login, but live market-data providers still require
internet access.

## Port 3000 or 3001 is already used

The runtime-port registry contains every persistent local listener:

- port 3000: the vinext QuantScope application;
- port 3001: the loopback market relay.

On startup, the launcher reuses a healthy service. If a service is unhealthy,
it resolves the listener PID and stops it only when the `node.exe` command line
matches this checkout and the expected application or relay command. Another
project checkout, a wrong role or port, and an unrelated listener are never
stopped automatically. The conflict message includes the remaining owner PID
so it can be inspected explicitly.

Port 3002 is not a valid QuantScope application port. If an older development
server is found there, rerun the launcher: it will stop that process only when
the executable path and fixed Vinext arguments identify this exact checkout.

## Market route returns `UPSTREAM_UNAVAILABLE`

If `164824` appears as exchange `OTHER` or only has a short adjusted history,
the record came from the legacy EODHD `164824.SHE` discovery path. Reload the
instrument normally: canonical resolution now repairs it to `SZSE`/`0.164824`
and requests full raw history. No saved-record or browser-database deletion is
required. If Eastmoney is unavailable, Tencent supplies the replacement raw
history; when both public endpoints fail, the existing cache is retained and
the normal retry backoff applies.

1. Read the chart's source label and call the preferred provider with
   `strictProvider=1`; then call each configured backup strictly in profile
   order. A promoted backup should display `VERIFIED_BACKUP_ACTIVE`.
2. For a Yahoo primary, check the always-on loopback relay first, then query1,
   query2, and direct routing. Yahoo may
   return regional 403/429 responses even when another route succeeds.
   Eastmoney may close a Node TLS socket during burst traffic; confirm the
   same-host HTTP retry and avoid repeatedly bypassing history cache.
   The relay returns `RELAY_REQUEST_FAILED` with HTTP 502 when an allowlisted
   request or screening handler throws before sending a response. This is a
   contained request failure; confirm `/health` still reports `ready: true`
   before restarting the relay.
3. Check whether Eastmoney changed `QuotationCodeTable.Data` or `data.klines`.
4. Confirm daily rows use `YYYY-MM-DD` and minute rows use
   `YYYY-MM-DD HH:mm`.
5. For global daily history, check Yahoo query1/query2, the official Nikkei CSV
   for N225, then configured EODHD, Twelve Data, Financial Modeling Prep,
   Alpha Vantage, Marketstack, Zhitu, and Nasdaq status in profile order.
6. Check source-health attempts, availability, latency, last error, latest
   date, and quality before increasing timeouts.
7. If history succeeds through Yahoo but every latest refresh fails, inspect
   `series.instrument.secid`: a resolved Yahoo series should carry a Yahoo
   symbol such as `^N225`, not an Eastmoney identifier such as `100.N225`.
   Legacy saved values are translated at request time; a fresh history response
   should normalize the stored identity.
8. For gold, check strict providers in canonical order: Yahoo `GC=F`, FMP
   `GCUSD`, AllTick `GOLD`, then Eastmoney `101.GC00Y`. FMP/AllTick/Eastmoney
   are overlap-required and cannot recover an empty chart. An AllTick 401 is a
   credential problem, not a price-quality failure.
9. In the source-health tooltip, compare the independent 7-day and 30-day
   rates. A temporary demotion is expected after three consecutive failures;
   the configured primary is probed hourly and does not restore until the
   seven-day hysteresis gate passes.

## Search returns an individual equity

Inspect the source classification fields and update the adapter-level asset
filter. Do not add UI-only filtering: unsupported asset types must never cross
the API boundary.

## Empty chart

1. Inspect `/api/market` and confirm `bars` is non-empty.
2. Confirm every bar has finite OHLC values and a valid timestamp.
3. Resolve the canonical profile. N225 must request Yahoo `^N225`, SOX must
   request Yahoo `^SOX`, and gold must request Yahoo `GC=F`. FMP `GCUSD`,
   AllTick `GOLD`, and Eastmoney/Nasdaq
   identifiers are backup definitions and must not be mistaken for a successful
   Yahoo primary response.
4. If the preferred source is down, inspect
   `quantscope-canonical-market`. A cached canonical series should remain
   visible. A promoted backup may append missing dates but must not change any
   confirmed cached OHLC date.
5. For a Chinese index, verify Zhitu is ordered before broad credentialed
   providers. For ETF `513310`, verify EODHD resolves the SSE listing; Twelve
   Data, Alpha Vantage, Marketstack, and Zhitu are not accepted substitutes
   unless their strict response and mapping pass the profile policy. For the
   current-session overlay, verify Tencent is tried first and Juhe last. A
   Tencent history response can recover an empty chart; Juhe should be skipped
   after a valid Tencent result and can never become the effective primary.
6. Check the browser console for ECharts initialization errors.
7. If the chart disappeared only after opening a saved strategy for the same
   index, inspect `canReuseSavedBacktestMarketSeries(...)`. The saved, active,
   and active-series canonical keys should match (for example, Eastmoney
   `100.N225` and Yahoo `^N225`) and the successful non-empty series should be
   preserved. Provider alias differences alone must not clear market state.

If Juhe returns a quota warning, inspect only the safe error code and the local
`JUHE_API_USAGE_DATE`/`JUHE_API_USAGE_OFFSET` metadata; never log the key or
upstream body. The in-process counter resets on server restart, while the
provider's 50-call account bucket does not, so the configured same-day offset
must include any external or prior-process calls that need local accounting.

## Global index uses the wrong close time

1. Inspect `lib/market/exchanges.ts`.
2. Eastmoney market `100` is only an overseas bucket; never map the whole
   bucket to JPX.
3. Add a known code mapping only when the index venue is verified. Unknown
   symbols must remain `OTHER`.
4. Update `MarketExchange`, session-close metadata, API validation, and saved
   record validators together.

## Live coverage regression

Start the local server, then run:

```bash
npm run verify:market
```

The Windows launcher always ensures a loopback-only, source-allowlisted market
relay. The relay lets proxy-preferred providers such as Yahoo use a configured
route without exposing the proxy address or credential to the application
runtime or logs. Development uses the fixed loopback URL even without a proxy.
Port 3001 must be free or owned by a healthy QuantScope relay.

The script checks 16 indexes, 11 ETFs, and four commodity proxies. A failure
reports the source, exchange, bar count, and upstream error. It is intentionally
outside `npm test` because public endpoint reachability and regional blocks are
not deterministic.

## Indicator visibility or parameters do not restore

1. A fresh browser profile intentionally starts with every indicator hidden.
2. Click an indicator once to show it and again to hide it; a focused hidden
   button uses a neutral style and is not active on the chart.
3. Device-local parameter memory uses
   `quantscope.indicator-preferences.v1`. Invalid stored values are discarded
   and safe registry defaults are used.
4. A saved shortcut restores only the indicators visible when it was saved,
   with their saved parameters. Rows created before migration
   `0003_heavy_nemesis.sql` intentionally restore no indicators.
5. If new saves return `PERSISTENCE_UNAVAILABLE`, run
   `npm run local:db:migrate` and retry.

## Daily chart does not reach 2000

1. Confirm the instrument existed in 2000; later-listed ETFs begin at their
   first provider-available bar.
2. Confirm the history request uses `limit=10000` and `mode=history`.
3. Check the provider URL for Eastmoney `beg=20000101`, EODHD
   `from=2000-01-01`, Yahoo `period1=946684800`, or Nasdaq
   `fromdate=2000-01-01`.
4. If Eastmoney starts later, confirm the longer-history EODHD/Yahoo attempts
   run and that the longer valid series wins without merging providers.
5. Do not treat the five-bar `mode=latest` overlay as the history response.

For an Eastmoney LOF such as `164824`, confirm the canonical primary remains
the original Eastmoney `secid`, the request uses `fqt=0`, and the returned
adjustment label is `raw`. A guessed Yahoo `.SZ`/`.SS` history can return only
one or a few recent rows and must not become the LOF primary.

If both Eastmoney history hosts fail, request Tencent with the same exchange-
local symbol and `mode=history`. A valid `164824` backup is raw, starts at
2018-08-01, and is capped at 2,000 requested rows. Do not merge it with an
adjusted cache unless the existing overlap/scale gate accepts the replacement.

## Today's daily bar is missing in Asia/Shanghai

1. Confirm the displayed and cached update timestamps use `Asia/Shanghai`.
2. Inspect Yahoo `regularMarketTime`, price, open, day high, and day low. A
   valid snapshot with an Asia-Shanghai date at least as new as the daily array
   should append or replace only the unconfirmed last bar.
3. Keep exchange-local time only for refresh windows and close timing; do not
   derive display dates from the browser or server default zone.
4. For SSE/SZSE indexes and ETFs, confirm the concurrent Tencent quote remains
   available when Yahoo metadata is absent. Commodity proxies use Yahoo's
   validated current-session metadata.
5. Never fabricate a completed close. Invalid or incomplete metadata is
   ignored and the latest status remains conservative.

## Latest strategy guidance does not update

1. Confirm the page is visible; background tabs intentionally do not poll.
2. Check the displayed update time and use the refresh button once.
3. Confirm `/api/market?mode=latest` returns `Cache-Control: no-store` and a
   newer `fetchedAt` value. History mode should remain cacheable.
4. Remember that the guidance uses the provider's newest bar. A web endpoint
   may still be delayed even when the application does not cache it.
5. Confirm an end-of-range diamond is labeled as a valuation close, not a
   strategy sell.
6. If the bar touched a displayed entry price but no buy appears, inspect the
   strategy's entry-filter summary. The guidance card should report that the
   entry condition was touched but the moving-average slope filter failed.
   This is a blocked hypothetical entry, not a missing executed fill.

## A closed daily chart keeps changing after refresh

1. Confirm the newest canonical bar reports `latestBarStatus: "complete"`.
2. A same-provider refresh must not rewrite that bar's OHLC. It may only
   backfill missing published volume on completed dates.
3. For verified LOFs such as `164824`, confirm the canonical Eastmoney series
   remains raw and that a Tencent temporary quote is rejected when the same
   completed trading date already exists.
4. If an older cache still oscillates, reload once so the locked canonical
   series replaces the displayed in-progress copy.

## Chart timeline cannot be dragged

1. Confirm the slider data zoom has `brushSelect: false`; ECharts otherwise
   reserves the selected fill for brush selection instead of moving the window.
2. Drag the green selected range to move it, or drag either bright handle to
   resize it.
3. Confirm `EChart` is initialized only once and reapplies the captured zoom
   window when trade markers or indicators update.
4. Confirm the reset key changes only when the instrument or interval changes.
5. Run the chart configuration test, apply a screening result, and repeat the
   drag in a real browser.
6. If a visible price tooltip disappears during a scheduled refresh, confirm
   chart updates use component `replaceMerge` and do not recreate tooltip or
   axis-pointer state with `notMerge: true`.

## Browser shows an empty pane to the right

The workspace already uses the full webpage viewport. A gray vertical divider
with a second empty region is a browser split pane, not unused page width.
Close the split pane or launch the site through `open-quantscope.bat`, which
opens a new maximized Edge window when Edge is installed.

## Backtest has no trades

The selected parameters may produce no entry signal in the chosen date range.
Expand the range or change the strategy. Do not weaken assertions or inject a
trade only to make a test pass.

## A breakout trade appears one bar late

1. Confirm the strategy is registered with `buildOrders`, not only
   `buildTarget`.
2. Confirm each order at bar N uses data ending at bar N-1.
3. For a long stop, require `high >= stop` and fill at `max(open, stop)`.
4. For a long exit stop, require `low <= stop` and fill at
   `min(open, stop)`.
5. Confirm the configured tick is present after loading an older saved
   backtest; defaults are merged into saved parameter snapshots.
6. Run the synthetic stop, gap, and prefix-invariance tests before comparing
   live provider data.

## Parameter screening is slow

1. Signal targets intentionally scan complete loaded history so persistent
   strategy state is not reset at an arbitrary warm-up boundary. The selected
   range limits performance measurement, not signal construction.
2. The first stage intentionally evaluates all 45,196 registered parameter
   combinations. There is no production cap or sampling control.
3. Confirm only compact metrics and reusable execution state for each eligible
   strategy's top 60 unfiltered
   candidates survive into the EMA stage. The top three final parameter sets
   per strategy should retain complete execution state for pair replay.
4. Confirm the unified run advances through parameter, entry-filter, pair, and allocation
   stages. The single-strategy column is produced by the parameter stage; the
   combination column is available after allocation replay.
5. Confirm EMA(5-8) runs only for the explicit trend/breakout/momentum family.
   Channel BreakOut and Price Channel must participate; reversal and
   candlestick families must remain unfiltered.
6. Confirm each strategy pair crosses its top three retained parameter sets,
   uses the exact independent A/B entry filters, and retains the best of all
   nine crossings before allocation replay. With 57 strategies and two
   equivalent ID pairs excluded, the current maximum is 1,594 strategy-ID
   pairs under the 4,096 safety bound. Compare 50/50, 60/40, 40/60, 70/30,
   and 30/70.
7. Use the stop action when a run is no longer useful.
8. Confirm `screening.worker.ts` was emitted by the production build and that
   progress messages continue while the main page remains interactive. The
   stop action should send cancellation and terminate the Worker promptly.
9. For rolling mode, confirm the selection pool retains up to ten candidates
   per strategy for every window and collapses to one displayed winner only
   after equal-window ranking.
10. If screens must survive page closure or run concurrently across devices,
   move the same protocol to a durable server queue without changing the
   registered candidate domain.

## Screening card changes after Apply

1. Confirm both screening and the active workspace use the complete market
   history to build the target and the same selected dates only for metrics.
2. Confirm both paths pass the same `hybrid` execution policy, commission,
   slippage, parameters, and allocations.
3. For a combination, confirm both paths derive relative roles over the same
   optional date window and pass the same intrabar fill-price timeline.
4. Run the regression that deep-compares each standalone card with
   `runBacktest(...)` and compares combination metrics/rebalances with a rebuilt
   applied timeline.

## Screening rank does not match the expected metric

1. Check the selected optimization target before starting the run.
2. Changing the target clears prior results; rerun screening to compare
   parameters under the new target.
3. Confirm the target is balanced score, maximum return, or maximum Sharpe.
   Return/drawdown and minimum drawdown are intentionally unavailable.
   Balanced score must equal `0.45 * current-window return +
   8 * clamp(current-window Sharpe, -5, 5) +
   0.35 * current-window max drawdown`; trade count must not change it.
4. The candidate/observe-only badge does not affect sorting. Candidate requires
   positive total return, positive Sharpe, and at least two trades; hover the
   badge to see every failed condition.
5. When target values tie, total return, drawdown, Sharpe, and balanced score
   are applied as deterministic tie-breakers in that order.

## Applied strategy is not visible on the chart

1. A fresh daily or one-minute workspace intentionally starts with Strategy A
   and Strategy B empty and no strategy applied to the chart. Selecting
   "Do not use" in both slots and pressing Apply intentionally clears every
   strategy-linked pane, reference, marker, and latest-guidance calculation.
2. For a strategy configured directly in the lab, use the lab's Apply button
   and confirm the page scrolls to the main chart. This action must not create
   a saved shortcut.
3. For a screening result, click the result row and confirm it restored the
   selectors and scrolled to the main chart. Enter and Space should provide
   the same keyboard action while the row is focused.
4. Confirm the result's A and B values match the two strategy-lab allocation
   selectors. Dual plans must be 50/50, 60/40, 40/60, 70/30, or 30/70; the two strategy parameter
   sections should sit directly below their own selectors.
5. Reference lines exist only for strategies with a continuous price
   reference; a candle/oscillator rule may legitimately add no line.
6. Confirm both selectors contain the complete strategy registry, duplicate
   IDs are unavailable, and the lab shows A/B as relative long or short based
   on the selected range's average active-run length. Changing dates or
   parameters must recalculate those roles.
7. Confirm the chart legend prefixes follow the derived relative roles, not
   the strategy catalog's fixed horizon metadata.
8. For a partial/combined plan, inspect allocation transition markers rather
   than expecting generic round-trip trade markers. The only strategy labels
   are open (relative-long buy), short buy, short sell, and close. A gated final
   clear is one close marker even though its rebalance record retains both exit
   events.
9. Confirm the selected date range has at least one allocation change.
10. If markers appear on nearly every bar while the target state is unchanged,
   inspect `plannedAllocation`; ordinary price drift must not trigger a
   maintenance rebalance.

## Live execution label or condition price looks wrong

1. Confirm the strategy exposes `buildOrders` before expecting today's entry
   or exit condition price.
2. Confirm today's order uses only data through the prior completed bar.
3. A touched stop is a same-bar fill; an untouched displayed condition remains
   pending. A gap beyond the stop uses the bar open.
4. Close-confirmed strategies never show a known next-open price and retain the
   following-open label.
5. Inspect `MarketSeries.latestBarStatus`. In-progress or unknown daily bars
   intentionally freeze close-confirmed live targets at the preceding state;
   causal resting stops still use the active high/low.

## Saved shortcut history is slow or shows the wrong instrument

1. Confirm IndexedDB contains `quantscope-market-cache` for the current
   `127.0.0.1:3000` origin. Browser storage is isolated by origin.
2. Confirm the key matches provider, `secid`, and `1d`; fallback providers use
   their normalized provider identity.
3. A first open without a cache entry still performs the normal complete
   history request. Subsequent opens can render the saved series first.
   Cache age does not suppress this preview; use the displayed cache time to
   judge how old it is.
4. The full history request always continues after a hit. A source or
   adjustment mismatch triggers one `strictProvider=1` full-history request
   for the latest successful source. The warning remains only if this recovery
   fails; inspect that request before clearing cache.
5. If IndexedDB is blocked or cleared, the application intentionally falls
   back to a bounded in-memory session cache and the network without changing
   backtest meaning.
6. A cached-first chart intentionally shows a provisional warning until a
   compatible network history refresh completes.

If a development hot update reports `Cannot read properties of undefined
(reading 'at')`, confirm the workspace uses `readCachedMarketSeriesEntry(...)`
for timestamped reads and retains `readCachedMarketSeries(...)` as the
direct-series compatibility API. Current code also validates retained React
state and refs before reading `bars`.

## Nasdaq 100 is empty or shows stale volume

1. Inspect the selected search result and the canonical profile. Eastmoney may
   return code `NDX100`, while Yahoo and Nasdaq use `NDX`; all must resolve to
   canonical key `index:NDX`.
2. Confirm the primary Yahoo request uses `^NDX` and the Nasdaq backup uses
   provider `secid` `NDX`, not the selected alias `NDX100`.
3. Do not reject a parsed Yahoo series merely because its returned code is
   `NDX`. Canonical profile validation must compare the shared alias key.
4. Yahoo currently publishes nonzero NDX daily volume; Nasdaq's index-history
   response may publish zero. Never synthesize volume or copy it across dates.
   Same-session merge may retain an already accepted positive value. A full
   same-source refresh may also repair an older cached zero for the same date
   without changing OHLC. A recent isolated gap automatically requests that
   history once before browser site data would need clearing.

## Commodity search or history is empty

1. Search the exact Yahoo symbol (`GC=F`, `SI=F`, `CL=F`, or `HG=F`) to use the
   deterministic catalog.
2. Confirm `/api/search` returns `assetType: commodity` and `provider: yahoo`.
3. Confirm `/api/market` accepts `commodity` and Yahoo is reachable.
4. Do not route commodity symbols to Nasdaq; there is intentionally no fallback.
5. Remember that these are futures quote proxies, not spot or contract-chain
   records.

## Saved shortcut bar cannot load

1. For local use, confirm `.wrangler/state` exists and run
   `npm run local:db:migrate`.
2. For hosted use, confirm `.openai/hosting.json` declares the `DB` D1 binding.
3. Confirm `drizzle/` contains the `saved_backtests` migration.
4. For hosted use, confirm the request includes the injected user identity
   headers.
5. Inspect `/api/saved-backtests` for `AUTH_REQUIRED`,
   `INVALID_PAYLOAD`, or `PERSISTENCE_UNAVAILABLE`.
6. If drag ordering reverts, inspect the `PATCH /api/saved-backtests` response
   and confirm migration `0004_real_ulik.sql` added `display_order`. The route
   must update the complete order in bounded 25-record chunks; one large
   conditional statement can exceed D1's bind-parameter limit near 200 rows.
7. Do not fall back to browser storage for failed durable writes.
8. Existing core/maximum plan JSON should be converted to A/B when read; a
   failure here indicates invalid stored JSON rather than a missing migration.
9. If a second strategy saved for the same instrument replaces the first,
   apply migration `0002_flawless_korvac.sql`; it removes the old unique
   instrument index and creates the non-unique lookup index.
10. If a newly searched ETF loads through Yahoo but Save returns
   `INVALID_PAYLOAD`, inspect the provider-resolved instrument name. Market and
    saved-record validation must both use
    `MAX_MARKET_INSTRUMENT_NAME_LENGTH`; `159558.SZ` currently resolves to an
    82-character English name.
11. If rolling returns are missing, apply `0007_bright_jackpot.sql` and inspect
    `PUT /api/saved-backtests` for a complete set of current rolling evaluations.
    The legacy rank columns from that migration are intentionally inert: current
    screening archives never read, backfill, or append shortcut ranks.
12. If only some shortcuts receive a rolling-return update, verify the update
    includes every saved ID in the canonical instrument group. Validation prompts
    are computed from the latest available 30-session and 63-session evidence and
    do not depend on a screening archive write.
13. If first-level group deletion fails, inspect
    `DELETE /api/saved-backtests?instrumentKey=...`; the server resolves stored
    provider aliases to the canonical key before deleting owner-scoped rows.
14. If shortcut folders fail to load or rename, apply
    `0008_sour_rage.sql`, then inspect `/api/saved-backtest-folders`. Folder
    deletion should unfile records; it must not delete saved backtests.

## Adjacent daily K-lines appear out of order

1. Inspect `bar.time` and `bar.timestamp` separately. Daily ordering must use
   the canonical `YYYY-MM-DD` trading key; timestamps are provider metadata and
   may use different epochs or timezones.
2. Confirm all initial/latest/fallback/temporary-quote paths call
   `normalizeMarketBars(...)` after merging.
3. Confirm duplicate trading dates retain one validated bar and that the last
   item is selected only from the normalized array.
4. Run the conflicting-provider-timestamp regression in `analysis.test.ts`.

## Numeric input is hard to replace

1. Confirm the field uses `CommittedNumberInput`, not an eager
   `value={number}` plus `onChange={Number(...)}` binding.
2. Focus should select the full current value. Empty draft text is valid until
   blur or Enter; Escape restores the committed value.
3. Validation, integer rounding, and min/max clamping belong in the commit
   boundary, not each keystroke.

## Screening, lab, and shortcut ranges disagree

1. Confirm the period input calls `updateSharedRangeFromSessions(...)` and both
   lab date inputs call `updateSharedRangeFromDates(...)`.
2. Confirm `resolveTradingSessionRange(...)` snaps calendar inputs to actual
   loaded bars and `resolveTrailingTradingSessionRange(...)` derives the
   requested count from the current end date.
3. On a newly loaded instrument, confirm `sharedRangeSessionsRef` is retained
   while the calendar dates are rebuilt from that instrument's bars.
4. Confirm opening a saved shortcut does not restore `saved.startDate` or
   `saved.endDate`; creation-time dates remain persistence provenance only.
5. Shortcut comparison is intentionally separate from the lab/screening range.
   Inspect `savedBacktestRollingGroups` and verify every daily saved plan uses
   `SAVED_BACKTEST_ROLLING_SESSIONS` plus its saved cost assumptions. An inactive
   instrument should show its last persisted rolling return, then its
   creation-time fallback, until usable history is loaded again.
6. Period result rows must use the synchronized N-session range. Range rows
   must use the custom interval. Rolling rows use the configured total interval
   while their selection score equals the arithmetic mean of all window rank
   scores. Earlier bars may affect indicators and opening state but never the
   reported performance boundary.

## Commands

```bash
npm test
npm run typecheck
npm run build
```

`npm test` includes strict TypeScript checking, analysis/unit tests, a
production build, and rendered/source tests. Minimal local Cloudflare ambient
types live under `types/` so `npm run typecheck` covers `db/` and `worker/`
without depending on the deployment build.
# One-click screening out-of-memory recovery

- Discovery backtests should have empty `equity`, `trades`, and `rebalances`
  arrays while retaining finite ranking metrics. Displayed finalists should be
  detailed after materialization.
- A stopped, crashed, or OOM-terminated Worker leaves its most recently
  committed checkpoint in `quantscope-screening-checkpoint`. Starting the same
  instrument/configuration resumes it; any bar, cost, range, mode, objective,
  filter, or exclusion change invalidates that snapshot.
- Successful completion deletes the checkpoint. Browser site-data controls can
  also remove it; the fallback is a clean full run.
- The Worker process is expected to change after each completed optimization
  stage. This is deliberate heap isolation, not a crash. Progress must continue
  at the next stage without replaying completed candidate calculations.
- If a higher-order discovery stage stops with a multi-gigabyte Edge renderer
  and no CPU progress, verify that finalist retention uses keyed binary
  insertion. Reintroducing full-pool sorting per candidate causes extreme
  temporary allocation without changing the intended top-16-per-primary rule.
- Screening table results intentionally contain empty detail arrays. Apply the
  row to regenerate its detailed equity and transaction data.
# Intra-stage screening OOM

If a long high-order discovery stage advances for a while and then the renderer
shows `Out of Memory`, check whether the Worker is running a whole stage without
an intra-stage restart. High-order summary evaluation must use the alternating
streaming timeline states and persist an exact checkpoint every 4,096 candidate
evaluations. The Worker then restarts and resumes after the saved ordinal. This
bounds transient heap pressure without pruning candidates or changing ranking.
The same retention and restart path is shared by balanced, total-return, and
Sharpe objectives and by sample, range, multi-range, and rolling validation.
Objective and validation configuration remain part of the checkpoint signature,
so state from one scoring method or period cannot be resumed by another.
Entry-filter discovery data (`rawTarget` and `rawOrders`) must be cleared as
soon as that stage ends. Per-finalist order-fill maps are required through pair
allocation replay only; checkpoints at later stages strip them because
three-through-nine-strategy summary evaluation uses close targets, while final
detailed results rebuild execution from the retained parameters.
