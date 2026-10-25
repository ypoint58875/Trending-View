# Nikkei 225 adjacent-interval relative threshold study

## SOX comparison using the same 200-session definition

Open `output/sox-200-session-report.zh-CN.html`. Run
`node research/nikkei-daily-move-outlook/analyze-sox-blocks.mjs` to acquire/reuse
the fixed SOX snapshot, `--offline` for local-only replay, or `--refresh` for an
explicit incremental overlap check. The independent `sox-config.json` fixes
the same calendar endpoints as Nikkei: 2000-01-04 through 2026-10-13.
Own-market US sessions form 33 full 200-session blocks plus a 134-session tail:
6,734 days, 3,529 up, 3,202 down, three flat. US/Japan block date boundaries
differ; block numbers are not synchronized calendar periods.

Yahoo Finance `^SOX` unadjusted index daily bars supply prices; official Nasdaq
defines the instrument. No ETF or total-return substitute is used. Raw JSON,
normalized CSV, timestamp/URL/request parameters, source registry and sync state
are preserved separately. This extends the independent folder only; existing
Nikkei source snapshots and reports remain unchanged.

## Fixed 200-session directional counts

`node research/nikkei-daily-move-outlook/analyze-daily-blocks.mjs` creates
`output/daily-200-session-report.zh-CN.html`, matching CSV/JSON and a hash
manifest. From 2000-01-04 through 2026-10-13, 6,557 trading sessions form 32
complete non-overlapping 200-session blocks and one 157-session tail. Every
day, including block starts, compares with the previous trading close. Flat
days stay in denominators. All blocks reconcile to 3,409 up/3,147 down/one flat.
The snapshot is unchanged; this is a frequency table, not a return forecast.

## Latest: daily-run durations, amplitude terciles and MA context

Open **`output/singleton-report.zh-CN.html`** for the 2026-10-20 request.
The term singleton means a completed one-session close-return run, not a
candlestick body: down/up/down or up/down/up, confirmed by the final reversal.
The same report includes exactly-two-session and at-least-three-session runs.
All buckets are disjoint. Each direction/duration also has three descriptive
full-snapshot amplitude groups; these are not prediction thresholds.

```powershell
node research/nikkei-daily-move-outlook/analyze-singletons.mjs
node --test research/nikkei-daily-move-outlook/tests/*.test.mjs
```

Completed up runs: 802 one-session, 433 two-session, 440 longer (1,675 total).
Completed down runs: 883 one-session, 428 two-session, 363 longer (1,674 total).
The user's quoted singleton numerators/mean returns match; the quoted total
denominators were reversed relative to this exact accepted source and original
completed-run CSV. The report shows the recomputed denominators and proportions.

SMA context uses the direction at the close before each run. A countertrend
run is internal when that MA direction stays unchanged through its confirming
reversal day; any opposite MA sign within that window is turn-associated.
Turns reversing back by confirmation are counted explicitly. Same-trend and
neutral contexts remain separate; four countertrend classes do not exhaust
all singleton dates. Three-date MA sequences expose the boundary details.
The preceding MA interval ID joins existing interval research; relative ratios
use only trend movement already observed before the run starts. Future outcomes
start at the confirmation close, after the reversal that defines a singleton.
This is descriptive research, not a new trading backtest or lasting-regime label.

The source snapshot remains 2000-01-04 through 2026-10-13, with earlier MA
warm-up data. No current-market refresh or parent app edits. Outputs and atomic
completion use the `singleton-*` prefix. All earlier reports remain unchanged.

## Current: distribution-led groups and buy-and-hold comparison

Open **`output/adaptive-report.zh-CN.html`**. The user's 5%-10% example is not
a fixed partition. Separate preceding-up/down groups for each SMA are learned
from 2000-2009, with minimum 30 references per group and maximum four groups.
This yields four groups per direction for MA7 and three for MA20. Training peak
ratios generate candidates; 2010-2015 net portfolio CAGR selects group-specific
ranks using a bounded joint-seed/coordinate search. Later results are exploratory
frozen-policy evaluations: these dates have already been inspected previously.

```powershell
node research/nikkei-daily-move-outlook/analyze-adaptive-thresholds.mjs
node --test research/nikkei-daily-move-outlook/tests/*.test.mjs
```

Zero/one/two smallest training groups are compared as exclusions, each separately
optimized. Excluded references generate neither relative buy nor relative sell:
cash or an existing position continues until a valid signal. The explicit
invalid-positive-denominator MA exit remains. Exclusion does not erase/merge
intervals. A separate accuracy-first schedule tests whether stronger continuation
frequency improves trading returns. Candidates, selection attempts, first
crossings, fills, equity, annual and cost comparisons use `output/adaptive-*`.

At 5 bps per side, 2016-01-04 through 2026-10-13, main MA7/MA20 CAGR is
3.5074%/6.1805%, against holding 12.6249%. Excluding one smallest group gives
7.0900%/6.2514%. Full-reference accuracy-first rules give 2.9081%/7.9235%.
No tested variant establishes reliable excess return. Rare triggers and tiny
denominator sensitivity are explicit. Current theoretical trigger prices do
not establish an actionable strategy. Index prices exclude dividends and are
not a tradable instrument; both accounts use the same price-index basis.
Source data, older reports and the parent application remain unchanged.

## Earlier fixed-group prototype (superseded)

Open **`output/relative-report.zh-CN.html`** for the earlier research prototype:
current rebound/retracement as a fraction of the previous interval, conditioned
on prior amplitude groups including 5%-10%, and threshold-confirmed long/flat
operations. The report includes a price calculator and separates candidate
parameters from verified evidence. All older reports remain supplementary.

```powershell
node research/nikkei-daily-move-outlook/analyze-relative-exits.mjs
node --test research/nikkei-daily-move-outlook/tests/*.test.mjs
```

The new script reads only the accepted local snapshot and does not refresh data.
Candidate ratios use 2000-2009 pair distributions, rank selection uses 2010-2015,
and the schedule is frozen for 2016 onward. MA periods remain 7/20. Prior move
groups are [0,1), [1,3), [3,5), [5,10), [10,20), [20,+inf). Fewer than ten
positive training peaks in a group explicitly fall back to pooled estimates.

For the 5%-10% group, validation-selected research candidates are:

| MA | Rebound entry / preceding loss | Retracement exit / preceding gain | Early positive samples, entry / exit |
| --- | ---: | ---: | ---: |
| 7 | 41.7116% | 84.0625% | 19 / 25 |
| 20 | 15.8124% | 64.8958% | 12 / 12 |

These are not established optimal real-trade levels. The MA(7) complete
bucket-conditioned policy has later CAGR 5.7919% with close drawdown -31.1090%,
versus MA-only 0.6060% / -26.8516%. It improves return but deepens drawdown.
MA(20) gives 4.5035% / -36.4490% versus 11.2442% / -17.7125%. Neither passes
the declared complete comparison screen. Those are whole-policy results across
groups, not a claim that the small 5%-10% cohort alone earned those returns.
Conditional cohort trade results are in `relative-operation-cohorts.csv`.

An entry threshold now drives entry; MA-up confirmation alone does not buy.
After an exit threshold crosses, the next actual open fills the exit. The same
sell line is a profit-protection or loss-realization line depending on cost.
There is no additional fixed stop or hard profit target. When the previous MA-up
interval actually lost price and has no valid positive denominator, the model
uses an explicitly recorded next-open MA-turn fallback. All historical fills,
costs, holding periods, active positions, eligibility and selection are auditable.

Percentage-return ratios and point retracements differ: 100 -> 105 -> 102.9 is
40% by return ratio, 42% by point retracement. The calculator displays both.

## Earlier interval and daily research

Open **`output/ma-interval-report.zh-CN.html`** for the revised Chinese report.
It first defines SMA(7)/SMA(20) direction intervals without a price-magnitude
threshold, then summarizes interval price moves, then derives and evaluates
return-amplitude thresholds. The controls compare MA period, historical
subperiod and 1/5/10/20/60-session future horizon.

The previous **`output/report.zh-CN.html`** remains supplementary daily context.
It is a self-contained local file; no application server or internet connection
is required to read it. CSV details and standalone SVG charts accompany it.

## Isolation

All new source, data, tests, outputs, and documentation live in this directory.
No QuantScope source, configuration, package manifest, root documentation,
database, browser storage, launcher, or screening process is modified. The only
outside inputs are the previous study's normalized CSV and acquisition manifest,
read once without modification. The study uses only Node built-in modules.
Copy the **whole directory including local ignored data** to preserve offline
reproduction independently of the previous study.

## Questions answered

- Do prices actually rise in MA-up intervals and fall in MA-down intervals?
  Report count/time shares, agreement, conditional magnitudes and durations.
- What thresholds follow from those interval amplitude distributions? Derive
  them from completed, direction-aligned intervals confirmed by 2015 year-end;
  freeze their values when examining 2016 onward.
- After the first cumulative drop/rise of X% within an MA-defined interval,
  how often is the terminal move opposite 1/5/10/20/60 sessions later, how large
  is that opposite move when it occurs, and what is continued-move risk?
- How do unconditional benchmarks, disjoint event windows, different MA periods
  and earlier/later samples change the interpretation?

The following original analyses are retained as supplementary context:

- Positive and negative daily return magnitudes, frequencies, quantiles, and
  stability across decades and the latest 1,260 observations.
- Fixed daily-return bins and subsequent 1-, 5-, 10-, and 20-session returns.
- Trend-conditioned terminal outcomes and intervening high/low excursions.
- Completed same-direction runs and 3%/5%/10% close-based directional-change
  waves, including confirmation delays and unfinished current waves.
- Rolling chronological probability, direction, mean-return, and outcome-range
  evaluation against simple benchmarks.

## Run from the repository root

Requires Node 22.13 or later. Do not install anything into the application.

```powershell
node research/nikkei-daily-move-outlook/analyze-intervals.mjs
node research/nikkei-daily-move-outlook/analyze.mjs
node research/nikkei-daily-move-outlook/analyze.mjs --offline
node research/nikkei-daily-move-outlook/analyze.mjs --refresh
node --test research/nikkei-daily-move-outlook/tests/*.test.mjs
```

`analyze-intervals.mjs` reads only the accepted local price snapshot, verifies
its hash against the original source manifest, and writes its own independent
`ma-interval-*` artifacts. It does not refresh data or alter the previous results.
Run it after refreshing the original price snapshot if a new as-of date is needed.

The normal run reuses a source snapshot younger than 24 hours. `--refresh`
requests only a trailing overlap and new dates. `--offline` rebuilds outputs
from the committed local state without network calls. Run analysis before the
artifact tests. No scheduled job or monitoring automation is installed.

## Initial results, as of 2026-10-13

Revised MA-interval results for the full sample:

| SMA | MA-up intervals | Up-direction agreement | MA-down intervals | Down-direction agreement |
| --- | ---: | ---: | ---: | ---: |
| 7 | 540 | 84.44% | 540 | 82.96% |
| 20 | 335 | 81.19% | 336 | 78.87% |

SMA(7) mean price changes across all MA-up/MA-down completed intervals are
+2.4356% / -2.0267%; SMA(20) gives +2.6841% / -2.0304%. These are descriptive
interval returns measured from the close preceding the first labeled session,
not returns obtainable by entering before that session's MA direction is known.

For example, the pre-2016 SMA(7) aligned-interval medians produce thresholds
of 1.7991% down and 1.9525% up. In the later sample, 20-session terminal
upward frequency after the down threshold is 61.90% (105 mature events), with
mean +4.5174% among upward outcomes. Terminal downward frequency after the up
threshold is 46.22% (119 events), with mean 3.2643% downside magnitude among
downward outcomes. Their unconditional baselines are 60.45% and 39.55%.
Non-overlapping sensitivity changes those frequencies to 56.72% (67 events)
and 42.67% (75 events). Strong-looking tail frequencies often have fewer than
30 observations, and the relation is not monotonic. No optimal threshold or
statistically established reversal edge is claimed.

Original daily-context results retained below:

The main sample has 6,557 observations from 2000-01-04. Up days average +1.0334%,
down days -1.0562%, and the positive-day share is 51.9902%. The 5% reversal
definition produces completed up-wave median +10.6680% and down-wave median
-8.8969%; these wave endpoints require later reversal confirmation.

The latest accepted Yahoo close is 67,777.5234, daily return -1.8157%, with an
upward moving-average alignment. Its daily-return-and-trend cell has fewer than
80 mature historical events, so the actual current forecasts use trend only.
The 20-session positive-return share is 58.8595% versus 61.5354% unconditional;
mean return is +1.1563%, and the central 80% empirical terminal range is
-5.5386% to +7.9883%. This is a historical reference, not a calibrated forecast.

Yahoo's 2026-10-14 OHLC row contains missing values. The publisher has data
through 2026-10-14; no official prices are spliced into the Yahoo series. The
922-date close overlap passes with maximum absolute error 0.000005684%.

Chronological evaluation from 2016 finds Brier errors worse than the
unconditional baseline for 1/5/10 sessions and slightly better for 20 sessions
(0.24224 versus 0.24764; 131 non-overlapping observations). Direction accuracy
does not beat always-up at any tested horizon. No statistically established or
cost-adjusted trading edge is claimed. Historical outcome ranges remain useful
as descriptive risk references.

## Files

- `interval-config.json`, `interval-copy.zh-CN.json`: revised interval study
  settings and isolated Chinese presentation copy.
- `analyze-intervals.mjs`, `lib/intervals.mjs`, `lib/interval-report.mjs`:
  threshold-free MA intervals, derived thresholds, reversal analysis and report.
- `output/ma-interval-*`: full interval census, data-derived thresholds, first
  crossings, every mature event outcome, all period/horizon summaries and hashes.

- `config.json`: fixed bins, dates, horizons, lookback and resource limits.
- `analyze.mjs`, `lib/`: independent data ingestion, calculations and report.
- `report-copy.zh-CN.json`: isolated user-facing Chinese text.
- `data/raw/`: local seed copy, original acquisition provenance, Yahoo responses.
- `data/processed/`: accepted OHLC and daily derived features.
- `data/state/`: atomic sync and completed-output checkpoint.
- `data/source_registry.jsonl`: request/copy provenance without credentials.
- `output/`: Chinese report, SVGs, detailed CSVs and hashed run manifest.
- `tests/`: causal mathematics and generated-artifact verification.
- `docs/`: methods, sources, pipeline, retention and project memory.

Raw data and runtime state are locally retained and Git-ignored. Do not publish
or commit retained raw source data without reviewing provider permissions.
