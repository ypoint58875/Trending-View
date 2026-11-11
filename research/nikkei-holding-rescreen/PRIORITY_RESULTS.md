# v12 entry and exit priority

## Sample and comparisons

The sample is 2,000 completed Nikkei sessions from 2018-08-09 to
2026-10-26. Each variant replays the original ten-session winners, up to
six components, and accepts extra bearish screens according to its own
actual prior-close holdings. All requested winners were available from
matching caches. The replay uses the completed-close proxy, 3 bps
commission, and 2 bps slippage.

The main matrix crosses four wait policies, four flat-entry policies, three
ordinary-clear policies, and two risk attribution policies. Five fixed wait
lengths and two narrow clear variants add seven controls. All 103 cases
complete with both fixed and holding-dependent calendars. The dynamic
replays have seven distinct equity/target paths. The control matches the
existing production-backed v12 trace on all 2,000 daily targets and equity
values.

## One change at a time

| Change from v12 | Net return | Last 500 | Last 250 | Max drawdown | Fills |
| --- | ---: | ---: | ---: | ---: | ---: |
| Current v12 | 434.03% | 108.20% | 56.52% | 8.95% | 135 |
| Fixed wait of 0, 1, or 2 sessions | 401.23% | 108.20% | 56.52% | 12.51% | 137 |
| Fixed wait of 3 or 4 sessions | 434.03% | 108.20% | 56.52% | 8.95% | 135 |
| Allow qualified E in the final two wait days or any wait day | 434.03% | 108.20% | 56.52% | 8.95% | 135 |
| Allow qualified recovery in the final two wait days | 434.03% | 108.20% | 56.52% | 8.95% | 135 |
| Engulfing before a resolved sell on a flat account | 460.39% | 108.20% | 56.52% | 8.95% | 135 |
| E before a resolved sell on a flat account | 434.03% | 108.20% | 56.52% | 8.95% | 135 |
| Guard-qualified ordinary clear before a buy | 432.44% | 104.40% | 54.94% | 8.84% | 140 |
| Keep pending clear on every buy that does not add exposure | 344.40% | 81.23% | 49.40% | 9.39% | 146 |
| Keep pending clear only when a larger target is vetoed | 434.03% | 108.20% | 56.52% | 8.95% | 135 |
| Record the risk reason before ordinary clear classification | 434.03% | 108.20% | 56.52% | 8.95% | 135 |

There is one actual early 4% stop in the frozen v12 path and five ensuing
wait days. None has an eligible E exception. One has native recovery evidence
before the final two days. A zero-to-two-day fixed wait allows an early entry
on 2022-03-01 and the changed exposure lasts four sessions. These observations
give the narrower E exception no historical outcome sample.

The actual saved account through 2026-11-11 has an additional later case.
It stopped on 2026-11-05 at a 4.4974% decline from its entry signal close.
November 11 was wait day four. Its E and recovery conditions were true,
with no pending reduction. A same-checkpoint probe returned a 0% target with
the recorded wait, 100% with the wait lifted, and 100% with the wait lifted
and recovery disabled. On the normal native order, recovery wins before E
when both are available. The recent case has no forward return in this study.

Promoting engulfing improves historical return through the single
2022-02-04 conflict covered in ENGULFING_PRIORITY_RESULTS.md. E promotion
adds no changes to that path. The first-1,500-session winner also prefers
guard-qualified ordinary clear ahead of a buy. It gains 173.35% in the
first 1,500 sessions versus 156.50% for v12, then returns 104.40% in the
final 500 versus 108.20% for v12. The last 500 have been used in earlier
research and serve as a chronological check.

The ready-clear alternative also gives the same results if limited to an
already-pending full clear. Restricting pending-clear preservation to a
genuinely larger but vetoed target changes the request state once
(2019-02-01), with identical daily positions and equity. The broad variant
also retains clears when an original buy reaffirms the current allocation,
and has a materially worse path.

## Recommended ordering for review

1. Evaluate hard risk from the actual held position and record its reason
   and state before ordinary decisions can mask it. When both risks
   qualify, the early 4% stop owns the recovery and five-session wait.
   ATR alone retains its native timing. The baseline has six ATR events
   masked by ordinary liquidation, with the same close fills. Risk-first
   attribution raises the recorded risk count from five to eleven and
   leaves all 48 matched economic paths identical.
2. Apply cooldown as an explicit eligibility gate. Preserve the current
   five-session setting. Record qualified E during the wait as an
   observation, then evaluate current conditions anew on an eligible day.
   A selective day-four/day-five exception needs additional independent
   observations before adoption.
3. Once flat and eligible, retain the current strategy-buy priority and
   native supplemental ordering. The narrow reversal candidate gives
   bullish engulfing precedence over a reduction when flat and otherwise
   eligible. Its observed benefit is concentrated in one conflict.
4. For holdings, keep ordinary full clears subject to the existing
   minimum hold, range, and slope guards. Preserve current buy
   cancellation behavior. The isolated actual-target-veto alternative
   remains a candidate for collecting more cases.

## Reproduce

Run `node --import tsx research/nikkei-holding-rescreen/priority-study.ts`
after the frozen v12 flat-rise baseline exists. The holding study's
`output/latest.json` locates the parent output directory. The runner writes
`priority-study/summary.json` with all results and dated events and
`priority-study/traces.json` with one-factor daily paths. Both writes are
atomic. The read-only replay has a fixed 2,000-session window, 10,000-bar
input limit, and 16 MiB per input file. A restart recomputes the small
matrix from cached winners. No data refresh, optimizer job, or production
policy change was required.

An independent accounting pass checked daily equity, drawdown and trailing
returns for 17 one-factor traces, all 103 compounded window breakdowns, and
all 48 matched risk-attribution paths. Typecheck and scoped ESLint passed.
