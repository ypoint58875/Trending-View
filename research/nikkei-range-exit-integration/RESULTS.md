# Range3/range10 integration rerun

2018-08-09..2026-10-26;2000 sessions;1293 frozen decisions;current v9 cycle lag1;3bps commission+2bps slippage per side.
Identity:e79c17a309a5b389dbdc0c9415c593e7c919507f2cdebe5459eedd4f7101bf36. Source:b543028a5db9860a9ac262d8bf65cf6df06f8d625afba728d875ce0d0274873e.

| Policy | Full net | MaxDD | Fills | Train net | Validation net | Final500 | Blocked attempts/spells | Base clears/pending vetoed | Undone/preserved partials |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 445.34% | -10.88% | 133 | 85.79% | 46.87% | 99.85% | 0/0 | 0/0 | 0/0 |
| range3-all | 458.46% | -10.88% | 129 | 90.10% | 47.00% | 99.85% | 4/4 | 3/1 | 0/0 |
| range10-all | 482.44% | -11.87% | 89 | 80.20% | 60.25% | 101.70% | 128/43 | 21/95 | 0/0 |
| range3-base-priority | 445.34% | -10.88% | 133 | 85.79% | 46.87% | 99.85% | 0/0 | 0/0 | 0/0 |
| range10-base-priority | 431.94% | -10.88% | 133 | 85.79% | 43.26% | 99.85% | 1/1 | 0/0 | 0/0 |

All-ordinary variants reproduce the previous study's full targets/state/fills. Base-priority controls preserve explicit original full clears, necessary original pending clears, and already accepted original partial reductions; only extra controller ordinary full exits are protected. Native holding/MA guards, early4%/ATR, cooldown and incoming-winner rules remain active. No parameter adoption.

| Policy | Gross | Actual net | Stress20bps | Next-open net | Next-open maxDD | Next-open final500 | Risk exits inside band | Deferred spells losing>=4% after age5 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 480.52% | 445.34% | 352.10% | 478.39% | -9.28% | 106.91% | 0 | 0 |
| range3-all | 493.12% | 458.46% | 366.18% | 496.58% | -9.28% | 106.91% | 0 | 0 |
| range10-all | 506.15% | 482.44% | 416.72% | 524.18% | -12.77% | 112.68% | 14 | 5 |
| range3-base-priority | 480.52% | 445.34% | 352.10% | 478.39% | -9.28% | 106.91% | 0 | 0 |
| range10-base-priority | 466.25% | 431.94% | 340.98% | 463.32% | -9.28% | 106.91% | 12 | 1 |

## Deferred spells: range3-all

Native source totals:{"base-clear":{"nativeFullExits":10,"blockedAttempts":3,"executedFullExits":7},"base-pending":{"nativeFullExits":39,"blockedAttempts":1,"executedFullExits":38},"controller":{"nativeFullExits":1,"blockedAttempts":0,"executedFullExits":1},"risk":{"nativeFullExits":11,"blockedAttempts":0,"executedFullExits":11}}

| First veto | Resolved/end | Sessions | Attempts | Source | Outcome | First age | Price change | MAE | Worst entry loss | Post-age5 loss days |
| --- | --- | ---: | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: |
| 2020-07-10 | 2020-07-13 | 1 | 1 | base-clear | cancelled-by-increase | 5 | 2.22% | 0.00% | -0.12% | 0 |
| 2024-02-07 | 2024-02-29 | 14 | 1 | base-pending | cancelled-by-increase | 5 | 8.43% | 0.00% | -0.51% | 0 |
| 2024-05-08 | 2024-05-15 | 5 | 1 | base-clear | cancelled-by-increase | 3 | 0.48% | -0.34% | -0.57% | 0 |
| 2024-06-13 | 2024-06-17 | 2 | 1 | base-clear | full-exit | 8 | -1.60% | -1.60% | -2.16% | 0 |

## Deferred spells: range10-all

Native source totals:{"base-clear":{"nativeFullExits":25,"blockedAttempts":21,"executedFullExits":4},"base-pending":{"nativeFullExits":108,"blockedAttempts":95,"executedFullExits":13},"controller":{"nativeFullExits":13,"blockedAttempts":12,"executedFullExits":1},"risk":{"nativeFullExits":18,"blockedAttempts":0,"executedFullExits":18}}

| First veto | Resolved/end | Sessions | Attempts | Source | Outcome | First age | Price change | MAE | Worst entry loss | Post-age5 loss days |
| --- | --- | ---: | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: |
| 2018-12-05 | 2018-12-07 | 2 | 2 | base-pending | cancelled-by-increase | 25 | -1.10% | -1.91% | 0.00% | 0 |
| 2018-12-10 | 2018-12-20 | 8 | 6 | controller | full-exit | 28 | -3.90% | -3.90% | -5.01% | 1 |
| 2019-02-07 | 2019-02-12 | 2 | 2 | base-pending | cancelled-by-increase | 22 | 0.54% | -2.01% | 0.00% | 0 |
| 2019-03-07 | 2019-03-11 | 2 | 2 | base-pending | cancelled-by-increase | 41 | -1.54% | -2.01% | 0.00% | 0 |
| 2019-03-13 | 2019-03-25 | 7 | 2 | base-clear | risk-exit | 45 | -1.47% | -1.47% | 0.00% | 0 |
| 2019-05-07 | 2019-05-14 | 5 | 5 | base-pending | cancelled-by-increase | 20 | -3.91% | -3.91% | -2.10% | 0 |
| 2019-05-16 | 2019-05-30 | 10 | 6 | base-clear | cancelled-by-increase | 27 | -0.57% | -0.57% | -2.68% | 0 |
| 2019-05-31 | 2019-06-03 | 1 | 1 | controller | cancelled-by-increase | 38 | -0.92% | -0.92% | -5.15% | 2 |
| 2019-06-25 | 2019-07-05 | 8 | 2 | base-pending | cancelled-by-increase | 55 | 2.61% | -0.51% | -2.01% | 0 |
| 2019-11-14 | 2019-11-19 | 3 | 1 | base-pending | cancelled-by-increase | 21 | 0.65% | 0.00% | 0.00% | 0 |
| 2020-07-10 | 2020-07-13 | 1 | 1 | base-clear | cancelled-by-increase | 5 | 2.22% | 0.00% | -0.12% | 0 |
| 2020-07-22 | 2020-07-27 | 1 | 1 | base-pending | cancelled-by-increase | 13 | -0.16% | -0.16% | 0.00% | 0 |
| 2020-07-28 | 2020-07-31 | 3 | 3 | base-clear | risk-exit | 15 | -4.18% | -4.18% | -2.72% | 0 |
| 2020-08-28 | 2020-08-31 | 1 | 1 | base-pending | cancelled-by-increase | 17 | 1.12% | 0.00% | 0.00% | 0 |
| 2020-10-15 | 2020-10-28 | 9 | 5 | base-pending | cancelled-by-increase | 48 | -0.38% | -0.41% | 0.00% | 0 |
| 2020-10-30 | 2020-11-02 | 1 | 1 | controller | cancelled-by-increase | 59 | 1.39% | 0.00% | 0.00% | 0 |
| 2021-01-28 | 2021-02-26 | 19 | 4 | base-pending | risk-exit | 14 | 2.73% | -1.89% | 0.00% | 0 |
| 2021-04-20 | 2021-04-30 | 7 | 7 | base-pending | cancelled-by-increase | 28 | -0.99% | -2.03% | -2.46% | 0 |
| 2021-06-17 | 2021-06-21 | 2 | 2 | base-pending | risk-exit | 18 | -3.47% | -3.47% | -1.30% | 0 |
| 2021-08-16 | 2021-08-18 | 2 | 2 | base-pending | cancelled-by-increase | 6 | 0.23% | -0.36% | -1.14% | 0 |
| 2021-08-20 | 2021-08-23 | 1 | 1 | controller | cancelled-by-increase | 10 | 1.78% | 0.00% | -2.63% | 0 |
| 2021-11-24 | 2021-11-26 | 2 | 2 | base-pending | risk-exit | 19 | -1.88% | -1.88% | -1.27% | 0 |
| 2022-07-12 | 2022-07-27 | 10 | 1 | base-pending | cancelled-by-increase | 9 | 5.24% | 0.00% | -1.79% | 0 |
| 2022-08-10 | 2022-08-24 | 9 | 1 | base-pending | full-exit | 29 | 1.78% | 0.00% | 0.00% | 0 |
| 2022-10-13 | 2022-11-30 | 32 | 4 | base-clear | cancelled-by-increase | 3 | 6.60% | 0.00% | -3.29% | 0 |
| 2022-12-02 | 2022-12-09 | 5 | 5 | base-pending | cancelled-by-increase | 37 | 0.44% | -0.73% | 0.00% | 0 |
| 2022-12-19 | 2022-12-20 | 1 | 1 | controller | risk-exit | 48 | -2.46% | -2.46% | -2.07% | 0 |
| 2023-02-13 | 2023-02-24 | 8 | 6 | base-pending | cancelled-by-increase | 19 | 0.10% | -1.18% | 0.00% | 0 |
| 2023-07-21 | 2023-07-24 | 1 | 1 | base-pending | cancelled-by-increase | 16 | 1.23% | 0.00% | -2.73% | 0 |
| 2023-08-14 | 2023-08-17 | 3 | 3 | base-clear | cancelled-by-increase | 31 | -1.35% | -1.35% | -4.77% | 2 |
| 2023-08-18 | 2023-08-29 | 7 | 4 | controller | cancelled-by-increase | 35 | 2.47% | 0.00% | -5.30% | 4 |
| 2024-02-07 | 2024-02-29 | 14 | 1 | base-pending | cancelled-by-increase | 5 | 8.43% | 0.00% | -0.51% | 0 |
| 2024-05-08 | 2024-05-15 | 5 | 1 | base-clear | cancelled-by-increase | 3 | 0.48% | -0.34% | -0.57% | 0 |
| 2024-05-29 | 2024-05-31 | 2 | 2 | base-pending | cancelled-by-increase | 18 | -0.18% | -1.30% | -0.62% | 0 |
| 2024-06-05 | 2024-06-24 | 13 | 7 | base-clear | cancelled-by-increase | 23 | 0.82% | -1.01% | -0.50% | 0 |
| 2024-10-17 | 2024-10-24 | 5 | 3 | base-pending | cancelled-by-increase | 11 | -1.97% | -2.07% | -1.46% | 0 |
| 2024-11-01 | 2024-11-05 | 1 | 1 | base-pending | cancelled-by-increase | 22 | 1.11% | 0.00% | -1.60% | 0 |
| 2024-11-13 | 2024-11-22 | 7 | 6 | base-pending | cancelled-by-increase | 29 | -1.13% | -1.80% | -1.67% | 0 |
| 2024-11-27 | 2024-12-19 | 16 | 3 | base-pending | cancelled-by-increase | 39 | 1.78% | 0.00% | -1.39% | 0 |
| 2024-12-20 | 2025-02-03 | 26 | 10 | base-clear | risk-exit | 56 | -0.47% | -0.66% | -0.59% | 0 |
| 2025-06-04 | 2025-06-16 | 8 | 3 | base-pending | cancelled-by-increase | 7 | 1.49% | -0.51% | 0.00% | 0 |
| 2025-07-11 | 2025-08-01 | 14 | 2 | base-pending | cancelled-by-increase | 34 | 3.11% | -0.28% | 0.00% | 0 |
| 2026-09-08 | 2026-09-15 | 5 | 4 | base-clear | cancelled-by-increase | 7 | -2.74% | -2.74% | -4.45% | 2 |

## Deferred spells: range3-base-priority

Native source totals:{"base-clear":{"nativeFullExits":10,"blockedAttempts":0,"executedFullExits":10},"base-pending":{"nativeFullExits":38,"blockedAttempts":0,"executedFullExits":38},"controller":{"nativeFullExits":1,"blockedAttempts":0,"executedFullExits":1},"risk":{"nativeFullExits":11,"blockedAttempts":0,"executedFullExits":11}}

| First veto | Resolved/end | Sessions | Attempts | Source | Outcome | First age | Price change | MAE | Worst entry loss | Post-age5 loss days |
| --- | --- | ---: | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: |


## Deferred spells: range10-base-priority

Native source totals:{"base-clear":{"nativeFullExits":10,"blockedAttempts":0,"executedFullExits":10},"base-pending":{"nativeFullExits":38,"blockedAttempts":0,"executedFullExits":38},"controller":{"nativeFullExits":1,"blockedAttempts":1,"executedFullExits":0},"risk":{"nativeFullExits":12,"blockedAttempts":0,"executedFullExits":12}}

| First veto | Resolved/end | Sessions | Attempts | Source | Outcome | First age | Price change | MAE | Worst entry loss | Post-age5 loss days |
| --- | --- | ---: | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: |
| 2022-12-19 | 2022-12-20 | 1 | 1 | controller | risk-exit | 6 | -2.46% | -2.46% | -4.83% | 1 |

## Verification and interpretation

Real production cycle report exactly matches baseline445.34209325762885% and all economic fills. Five fresh metric audits,10 causal prefixes and10 serialized controller/episode/lineage/cash resumes pass. Same-state probes never replace the accepted account. Deferred spell price changes/MAE are descriptive, can overlap and are not summed portfolio impacts. Stop4% retains its original first5-session age coverage. Gross/net includes compounding. Next-open reuses the SAME cycle-lag1 controller/episode path at different fill prices, not an execution-specific redesigned policy.

Frozen data ends2026-10-26 and is not the newer browser account ending2026-11-05. Winners/overlay/sample have been repeatedly studied; final500 is conditional historical audit, not untouched holdout. Main Nikkei close is a proxy, real China-product execution untested. Peak observed RSS:399.4MiB below1536MiB. Raw/derived/checkpoint files stay separate and ignored. Production/account/archive files unchanged.
