# Nikkei cycle conflict study

Product decision on 2026-10-24 (superseding the earlier choice): use incoming-winner current-date signals
when new and previous signals oppose. The main product return and chart now
follow this account; previous-winner returns remain internal research only. The
[conflict-only delayed confirmation study](DELAYED_CONFIRMATION.md) did not
justify enabling the requested three-bar variant. It remains research-only.

The verified local sample favors the previous strategy on conflicting
replacement signals more often than the incoming winner. This is exploratory
evidence, not a universal switching rule: only 19 unique replacement-conflict
dates are available, periods overlap, and rankings were archived using the
ordinary hybrid execution model rather than reoptimized at the close.

## Execution contract

The product cycle page is Nikkei 225 only. Japan currently closes at 15:30 JST
(14:30 UTC+8), leaving a window before China's 15:00 close. JPX extended the
close from 15:00 JST on 2024-11-05. Only completed daily bars are available to a
screening decision. Nikkei close is the requested same-day execution proxy;
actual China-listed products can differ because of exchange rates, premiums,
holiday calendars, quote delays, and time needed to complete screening.

For the selected plan, inspect the final two completed bars ending on the
decision date. A quiet final bar permits the preceding day's signal. Two
same-direction signals use their final target. Reduce-then-increase does
nothing; increase-then-reduce only reduces. Increases cannot reduce inherited
exposure; reductions cannot increase it. No repeated trade occurs when the
target is already satisfied. Rebalance markers use the decision day's close
with configured commission and slippage. Newly acquired exposure earns only
subsequent returns. The final evaluation day may have a fill.

## Inputs and reproducibility

- Command: `npx tsx research/nikkei-cycle-conflicts/analyze.ts`.
- Ledger check: `npx tsx --test research/nikkei-cycle-conflicts/analyze.test.ts`.
- Inputs: 6,560 Nikkei daily OHLCV bars, 2000-01-04 through 2026-10-16;
  1,573 completed cycle winners dated 2025-09-04 through 2026-09-28.
- Periods: 10, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, and 40 sessions.
  These are the available archives, not a selected subset ranked by subsequent
  performance. No 128-session archive was available for this study.
- Each request's bar count, decision date, and OHLCV prefix fingerprint matches
  the frozen history exactly. Source request/result SHA-256 hashes are saved.
  Cohorts retain original batch, optimizer model, options, and cost identity.
  Forty-eight non-cycle records and one unfinished record were excluded.
- `data/input.json` is the frozen source backup. `data/source_registry.jsonl`
  records source access. `data/state.json` atomically checkpoints complete
  period/cohort groups and checks the frozen input hash and cycle model.
- `output/events.json` contains every conflict and paired outcome;
  `output/summary.json` contains comparisons, continuous accounts, and cost,
  starting-allocation, date-weighting, and chronological-half sensitivity.
- Rerun the same command after interruption. Completed groups are skipped;
  derived summaries are deterministically rebuilt. The study is sequential,
  bounded to 4,096 archive jobs, 10,000 bars and 32 MiB of frozen input, and
  holds one causal timeline at a time. No external API, schedule, full-grid
  rescreening, or raw-source cleanup is involved. Frozen inputs do not expire.

## What a conflict means

For a replacement, evaluate both the incoming and preceding selected plans
on the SAME decision day's final two bars. Do not compare the previous
strategy's outdated recommendation from its original selection day. Preserve
the two-bar sequence exceptions first, then compare the permitted directions.
An increase against a reduction is a conflict. An empty/full account may turn
one side into a hold; intent and executed trades are distinct.

Different trailing periods can also disagree on the same date because they
select different strategy families, parameters, allocations, and filters.
For example, on 2025-12-26 the 22-session winner increased its target to 100%,
while the 26-session winner reduced to 0%. The shorter-period plan combined
directed Bollinger and pivot extension; the longer-period plan combined MFI
reversal and pivot extension. Neither period automatically supersedes the other.

For a temporal example on 2026-04-02, the 22-session preceding winner's
volume-weighted MACD signaled an increase to 100%; the incoming
Bollinger-reversion/TMA plan signaled a reduction to 30%.

## Paired event results

There were 37 conflicts among 1,474 consecutive replacement comparisons
(2.51%), spread over 19 dates. Cross-period comparisons found 73 opposing
pairs among 5,647 same-cohort/date pairs (1.29%), spread over 11 dates.
These are conditional rates among archived comparisons, not rates for every
trading day or independent trials.

Each event branches from the same 50% invested account at the conflict close,
executes the selected target delta, then holds until the future close. Costs
are 5 bps commission plus 5 bps slippage on traded exposure in either branch;
there is no forced exit. This isolates the choice at the conflict. It is NOT
a replay of all subsequent strategy signals and overlapping horizons are not
independent trades. All direction rules and branches are fixed before reading
future prices.

| Future sessions | New wins / 37 | Old wins / 37 | Mean new minus old, percentage points | Median difference |
| --- | ---: | ---: | ---: | ---: |
| 1 | 12 | 25 | -0.640 | -0.138 |
| 5 | 15 | 22 | -1.103 | -2.120 |
| 10 | 8 | 29 | -3.349 | -2.961 |
| 20 | 15 | 22 | -2.774 | -1.367 |

Weighting each conflict DATE equally reduces the mean differences to -0.269,
-0.151, -2.325, and -1.962 points respectively. The five-session result changes
sign between earlier and later dates (-1.678 versus +1.223 points). Therefore
an unconditional claim that the old strategy always wins would be unsupported.
The JSON contains 36 sensitivities across 0%, 50%, and 100% inherited exposure,
0/5/10 bps each of commission and slippage, and all four horizons.

For cross-period pairs, `old` means the shorter window and `new` the longer
window only for column consistency. It does NOT mean a later selection. Longer
windows won 38/73, 21/73, 29/73, and 47/73 comparisons at 1/5/10/20 sessions;
there is no consistent longer-versus-shorter preference.

## Continuous account policy check

Eighty-three cohort/period histories have complete trigger coverage and at
least three evaluation bars. Both policies start in cash. The main policy
always uses the incoming winner. The comparison uses the preceding winner's
CURRENT signals only on a conflict date, then reconsiders at the next screen.
Each policy retains its own resulting allocation and pays its own traded
costs. This is not a policy that keeps an old plan indefinitely.

Twenty-one histories contained conflicts: old-on-conflict had the higher
continuous return in 15, incoming-winner in six. The other 62 histories had
no conflicts and equal results. Histories overlap and cannot be summed or
treated as 21 independent samples. One 40-session history (2025-09-04 through
2026-06-11, two conflicts) returned 12.758% for incoming winners and 18.371%
for old-on-conflict. This is an illustration, not the best window selected
for deployment. All 83 rows are included in the summary JSON.

## Interpretation

The available evidence supports displaying and continuing to test the
old-on-conflict alternative. It does not establish a reliable universal rule
or justify choosing a policy/window after observing each future result.
The product main chart now shows actual fills of the user-selected incoming
account, with no previous-policy return card. The experiment's incoming
and previous baseline columns remain unchanged. A broader untouched period and
China-product price data are needed to assess actual execution performance.

Session references checked on 2026-10-24:
[JPX trading hours](https://www.jpx.co.jp/english/equities/trading/domestic/01.html),
[JPX 2024 extension](https://www.jpx.co.jp/english/corporate/news/news-releases/1030/20241103-01.html),
[SSE trading schedule](https://english.sse.com.cn/start/trading/schedule/).
