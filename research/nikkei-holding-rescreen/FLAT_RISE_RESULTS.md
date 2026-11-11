# Flat-account rising-candle screening

Compare the production v12 calendar with a calendar that restores full
screening on normally skipped sessions if the previous close had zero
actual units, both today and yesterday close above their own opens, and
today closes strictly above yesterday. Use completed bars and the
alternative account's own holding path. Both calendars retain the existing
holding-dependent bearish screening, overlay, close execution proxy,
3 bps commission and 2 bps slippage.

The frozen sample has 2,000 evaluation sessions from 2018-08-09 to
2026-10-26, with the full ten-session optimizer and at most six component
strategies. There are 260 candle candidates before the flat check, including
78 on the baseline account's flat path. The alternative's eligible dates
can differ once a restored screen changes its account.

## Completed comparison

| Metric | v12 skip | Restore screening |
| --- | ---: | ---: |
| Full sample net return | 434.03% | 345.17% |
| Final 500 sessions net return | 108.20% | 96.83% |
| Final 250 sessions net return | 56.52% | 51.94% |
| Maximum drawdown | 8.95% | 9.82% |
| Rebalance fills | 135 | 131 |
| Flat-to-invested entries | 61 | 59 |

The alternative restored 85 screens. The two accounts had different
targets on 74 dates. With the alternative's same starting state and only
that day's screen toggled, restored screening enabled two entries and
blocked four supplemental entries. These local comparisons do not measure
the downstream effects of different holdings or winning strategies. The
result applies to the frozen v12 sample.

## Two-session rebound coverage

For comparison with the earlier entry study, use the latest lowest open in
the trailing five sessions, a decline of at least 5% from the maximum close
in the ten sessions preceding the low, and a close strictly more than 4%
above the low one or two sessions later.

Five such sessions qualify for restored screening on the baseline path.
Two already enter through existing rules. Three stay flat.

| Date | Sessions after low | Prior decline | Rebound | Baseline close |
| --- | ---: | ---: | ---: | --- |
| 2018-12-27 | 1 | 11.52% | 4.02% | Flat |
| 2020-03-24 | 1 | 20.14% | 9.18% | Invested |
| 2022-10-04 | 1 | 7.52% | 4.71% | Flat |
| 2024-08-07 | 1 | 18.99% | 9.39% | Flat |
| 2026-07-31 | 1 | 10.90% | 5.07% | Invested |

Three qualifying rebound sessions occurred exactly two sessions after the
low while the baseline was flat. One was skipped and entered under the
existing overlay. None met the consecutive bullish and higher-close filter.

The completed earlier study explicitly adds a supplemental entry for this
rebound pattern. It returned 432.11% net with 9.64% maximum drawdown,
compared with 434.03% and 8.95% for v12. Both trailing windows were unchanged.
That study tests a direct entry condition. Restored screening lets the
optimizer's selected strategy and the existing overlay determine entry.

The restored 2018-12-27 screen found no strategy signal in the two-bar
window, so that rebound still stayed flat. On 2019-03-12, the restored
screen produced a reduction signal. In the same account state with that
screen omitted, the overlay would have entered. The completed comparison
is recorded in the generated summary.

## Replay and status

Run one instance of `node --import tsx research/nikkei-holding-rescreen/flat-rise.ts`.
The completed holding study's `output/latest.json` locates the frozen input
and the `flat-rise` output directory. The runner writes the reproduced baseline,
the comparable daily prefix in `progress.json`, and the final comparison in
`summary.json` after both accounts match the production report's final
account, overlay and economic fills.

The study stores new request-matched winners and optimizer checkpoints in
`data/<identity>/flat-rise-jobs`. It cheaply replays from the beginning on
restart and reuses exact completed jobs and child checkpoints. It uses a
single chronological account with up to six speculative children. Baseline
eligibility can prioritize optimizer work, while the alternative's own
previous-close units determine acceptance. Input and output are bounded to
the fixed sample. Existing retention applies to the frozen data and job
artifacts. The runner makes no provider requests.
