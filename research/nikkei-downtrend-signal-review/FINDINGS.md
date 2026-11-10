# Verified interpretation

## 2026-11-10 explicitly confirmed holding-bearish rerun

The user explicitly selected checking the currently carried strategy, not
exhaustively selecting a new winner on extra dates. The requested mask is:
original screening dates OR (actual pre-decision holding AND close below open).
Other dates retain existing behavior; all v11 risk/entry/exit guards and two-bar
signal rules remain. Verify actual holdings on the modified path, not the old
path. A fresh rerun equals the holding-downtrend row below exactly.

All 2,000 daily masks match that explicit requirement. Net return is
350.5911425933033%, maximum drawdown 12.617443423061559%, 141 rebalances,
149 added checks, and final equity 450,591.1425933033 from 100,000 initial cash.
The baseline remains 463.0922799282711%, drawdown 10.875316695865923%,128 fills.
There are 56 added signal-check dates (38 reduce,17 increase,one sequence hold).
Same-state probes attribute eight immediate reductions,including two clears,
to added requests. More timely exits do not imply higher overall return.

Fresh verification: 25 focused tests, typecheck, research ESLint, production
baseline parity, 12 serialized resumes and 12 causal prefixes pass. Independent
Python verifies all 8,000 daily scalar ledgers and masks. No production changes
or new screening jobs. Existing source/model identity remains unchanged; raw
signals were reused, while every replay was recomputed. Current source still
ends 2026-10-26; no claim about the browser account's later dates is made.

Scope: existing full-screen 10-session winners, maximum six strategies,
2,000 evaluation sessions from 2018-08-09 to 2026-10-26. Replay uses current
v11, 3bps commission and 2bps slippage. This is a frozen study, not a complete
export of the browser's current validation account. No rule has been adopted.

## Existing signals and skipped dates

- Original screening dates: 1,293. Dates containing a last-two-bar signal
  sequence: 641; dates resolving to a reduction direction: 384.
- Actual executed rebalances: 128, including 57 entries from an empty account.
- Skipped dates: 707. Strong-downtrend bearish continuation dates: 322.
- On the baseline's actual invested path, 144 of those 322 dates have exposure.
  54 have a signal sequence: 38 reduction, 15 increase, one reduce-then-increase
  hold. These are check-day counts; yesterday's signal can appear again.
- Across all 322 skipped-down dates, 94 follow a bullish candle, including 41
  invested dates. The production MA2 trigger is not a daily candle-sign-flip
  trigger. Do not silently assume it implements the user's recollection.

## Scope-dependent impact

| Research scope | Extra check dates on its own path | Net return % | Max drawdown % | Rebalances |
|---|---:|---:|---:|---:|
| Current rules | 0 | 463.0923 | 10.8753 | 128 |
| Any holding on skipped strong-downtrend bearish days | 149 | 350.5911 | 12.6174 | 141 |
| Close-down entry followed only by declining closes | 4 | 462.9048 | 10.8753 | 130 |
| Bearish-body entry followed only by bearish bodies | 2 | 463.0923 | 10.8753 | 128 |

The broad variant changes its own subsequent holding path, so its 149 checked
dates differ from the baseline's 144 eligible dates. Same-state no-request
probes attribute eight immediate reductions, including two full clears, to
extra requests. Eleven extra requests change the same-day target in either
direction; buy priority and suppression of supplemental rules also matter.
Do not attribute all 47 reductions/39 clears occurring on checked dates to
new sell signals: many would have occurred through native risk/pending rules.

The broad variant loses 112.5011 percentage points of full-period compounded
return. It also lowers final-500 return from 99.8490% to 81.5804%. This sample
does not support treating more checks as an automatic improvement.

## Exact down-entry continuation examples

Two definitions are separate because a gap can produce a rising close with
a bearish body, or a falling close with a bullish body.

| Entry | Extra check | Current-winner signal | Narrow close-down replay |
|---|---|---|---|
| 2019-12-03 | 2019-12-04 | Full clear, target 0 | Guarded; pending clear retained, no same-day sale |
| 2022-06-29 | 2022-06-30 | Increase, target 1 | Already full; no new trade |
| 2022-06-29 | 2022-07-01 | Increase, target 1 | Already full; no new trade |
| 2022-10-07 | 2022-10-11 | Reduce, target 0.6 | Sell 40%; regular screening restores full exposure next session |

The close-down variant changes one daily target and two economic fill dates:
partial sale on 2022-10-11 and restoration on 2022-10-12. It adds two rebalances
and lowers full return by 0.1874 percentage points. No extra immediate full
clear occurs. The 2019 pending request does not change the eventual fill path.

Under the code's bearish-body interpretation, only the two 2022-06-29 episode
dates qualify; neither has a sell signal. Results are exactly unchanged. Thus
these saved winners provide no evidence that the specific uninterrupted
bearish-entry case missed an available base-strategy exit. A new exhaustive
screen could select a different winner, but that is a different experiment.

## Verification and recovery

25 focused tests pass (four research, 21 existing cycle tests), as do project
typecheck and research ESLint. Production baseline net return and every economic
rebalance match. Twelve serialized resumes and twelve causal replay prefixes
match direct replay. A real extraction stopped after 16 of 322 dates and resumed
the remaining 306. Independent Python accounting verifies all 8,000 daily
cash/unit/equity observations, fills, MA2 masks, episode definitions and checks.
Extraction peak RSS: 251.6MiB; per-day replay RSS guard remains 1.5GiB.

Full npm test was not rerun: no production feature code changed. Run commands
and atomic checkpoint/recovery rules are in README.md. Identity:
1601f4b0768a9c27cdfbad3cd527a56a4f98ca444a116c3dc6aedd9b59255467.

App/lib/browser state, screening jobs, sources and credentials are unchanged.
Existing dirty-worktree changes are preserved. No out-of-plan edits occurred.
