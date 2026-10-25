# Conflict-only next-session confirmation

The requested three-bar confirmation improves on immediate incoming-winner
signals in part of the available sample, but does not add value over the
two-bar confirmation control and often trails immediate previous-winner
signals. The user chose to retain previous-winner signals in product execution.
This experiment is preserved for reproducibility and is not enabled in the UI.

## Exact rule

1. Evaluate incoming and preceding winners on the current decision date using
   their final two completed Nikkei bars and existing sequence constraints.
2. ONLY if their permitted directions oppose, keep the existing position at
   that day's close. Non-conflict decisions keep the ordinary two-bar rule.
3. At the next TRADING session's close, use the winner actually selected on
   that next date, and inspect its final three completed bars ending there.
   Do not reuse the conflict day's selected plan or a later available winner.
4. Apply permitted catch-up at that next close, including fees/slippage. No
   signal or future performance can retroactively change the conflict-day hold.
5. For the three-bar extension, preserve the existing conservative constraint:
   any reduction followed by a later increase holds. Otherwise use the final
   signal with inherited-allocation directional clamps. A quiet final day
   permits earlier signals within the specified lookback. A due confirmation
   takes precedence over starting another wait if that date also has a conflict.

These are fixed experimental assumptions. No three-bar rule is applied to a
normal, non-conflicting decision.

## Matched data and comparisons

The existing frozen OHLCV/strategy archive has 37 replacement conflicts. Only
27 conflicts on 14 dates have the exact next-session winner in the same
original batch/period/configuration cohort. The other ten are excluded; this
is a selected subset of the earlier study, so its results must not be compared
against the earlier 37-event averages. Next sessions refer to adjacent Nikkei
bars, including weekend and holiday gaps, not the next calendar day.

Four predetermined policies are compared on this matched subset:

- Incoming winner: apply the incoming plan's two-bar signals on the conflict day.
- Previous winner: apply the preceding plan's current two-bar signals that day.
- Delay two: hold on conflict, then apply the next winner's final two bars.
- Delay three: hold on conflict, then apply the next winner's final three bars.

Paired events branch from identical 50% inherited exposure at the conflict
close, then hold the resulting position to the same endpoint. The wait branch
holds actual units through the first day, including price-driven allocation
drift; it does not rebalance back to 50% for free. All fills run through the
shared allocation ledger. Both commission and slippage are 5 bps each on traded
exposure. There is no forced liquidation at the observation endpoint.
The horizon counts from the CONFLICT close, not the confirmation close.

## Event results

Differences below are delayed-three minus the named comparator in percentage
points. Each row uses the same 27 events. W/L/T means wins/losses/ties.

| Future sessions | Versus incoming: mean / W-L-T | Versus previous: mean / W-L-T | Versus delay-two: mean / W-L-T |
| --- | --- | --- | --- |
| 1 | +0.118 / 17-10-0 | -0.134 / 8-18-1 | -0.013 / 2-12-13 |
| 5 | +0.951 / 16-11-0 | -0.041 / 12-14-1 | -0.155 / 6-8-13 |
| 10 | +0.950 / 19-8-0 | -2.759 / 5-21-1 | -1.330 / 0-14-13 |
| 20 | +0.898 / 19-8-0 | -3.702 / 7-19-1 | -1.790 / 0-14-13 |

At ten sessions, weighting each of the 14 dates equally gives +0.556 points
versus incoming, -2.375 versus previous, and -1.051 versus delay-two. The
five-session comparison against previous changes sign across chronological
halves. Raw events overlap across windows and horizons; 27 is not a count of
independent market episodes. Cost and inherited-exposure sensitivities are
included in the machine-readable summary (0%, 50%, 100%; 0/5/10 bps each).

The third bar changes the 50%-account target in 14 of 27 events. Two mechanisms
are visible in the actual cases:

- On the 2026-04-02 conflict (22- and 24-session windows), confirmation is
  2026-04-03. The next winner has no two-bar change, while the three-bar window
  retrieves an older reduction to 30%. It reduces before a rebound. The
  ten-session paired return is 4.243%, versus 6.724% for delay-two.
- On 2026-03-26 (26-session window), the 2026-03-27 two-bar window permits an
  increase to 100%. Adding the third bar produces reduce-then-increase, so the
  preserved sequence rule holds the 50% account instead. Ten-session return is
  2.138%, versus 4.448% for delay-two.

These explain particular outcomes, not a general law that older signals fail.

## Continuous accounts

Of 83 otherwise complete cohort/period histories, eight lack a next-day winner
required by an actual wait and are excluded. The remaining 75 include 62 with
no conflicts and 13 with conflicts; the 62 no-conflict histories behave
identically across all four policies. Both wait policies use two bars on every
ordinary decision, enter confirmation only on conflict, and reconsider normal
screens after confirmation. No branch is chosen by its later return.

For the 13 histories with conflicts, delayed-three has:

| Comparator | Higher return | Lower return | Equal |
| --- | ---: | ---: | ---: |
| Incoming winner | 5 | 3 | 5 |
| Previous on conflict | 4 | 9 | 0 |
| Delay two | 1 | 6 | 6 |

These histories overlap. Their cumulative returns cannot be summed or treated
as 13 independent tests. No eligible history is waiting for confirmation at
its final endpoint. Every row and exclusion is retained in the summary.

## Reproduce and recover

Run `npx tsx research/nikkei-cycle-conflicts/delayed-confirmation.ts` and
`npx tsx --test research/nikkei-cycle-conflicts/*.test.ts`.

The script reads the existing immutable `data/input.json`, checks its bar hash,
and limits input to 32 MiB, 10,000 bars, and 4,096 snapshots. The separately
versioned `data/delayed-state.json` atomically checkpoints completed groups
after their outcomes are safe. Rerun the same command to resume. SIGINT finishes
the current bounded group and exits with a recovery message. Memory is bounded
to this fixed input and one group's causal timelines/actions at a time.

`output/delayed-events.json` keeps matched/excluded events and all outcomes.
`output/delayed-summary.json` keeps sensitivities and continuous account rows.
Generation uses no new market downloads and does not alter prior research or
raw source backups. Frozen inputs and source hashes do not expire; outputs are
replaceable. Original rankings still use archived hybrid execution, and the
Nikkei close is a proxy rather than a China-product executable quote.
