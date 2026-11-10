# Post-reduction increase cooldown results

2018-08-09..2026-10-26;2000 sessions;current v8;1293 frozen screening decisions.
Source:b543028a5db9860a9ac262d8bf65cf6df06f8d625afba728d875ce0d0274873e. Identity:c75518b2e7b7375685a6025da4439062c2419cc59c3f587b558b67baf8ba90ca.

Actual sales, including partial/full/risk exits, block ALL increases on the NEXT X completed trading sessions. New sales reset the clock. No delayed order queue or automatic refill. Existing risk exits/cooldown stay active.

| X sessions | Full net | MaxDD | Fills | Turnover | Train net | Validation net | Final500 | Blocked entry/add | Sell-buy <=7 | Missed up blocks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 440.98% | -10.88% | 134 | 126.40 | 85.43% | 45.98% | 99.85% | 0/0 | 29 | 0 |
| 1 | 404.39% | -11.98% | 126 | 118.40 | 79.25% | 40.80% | 99.85% | 8/0 | 22 | 1 |
| 2 | 384.82% | -11.98% | 120 | 112.21 | 76.31% | 40.80% | 95.30% | 13/3 | 17 | 3 |
| 3 | 359.26% | -11.98% | 115 | 106.81 | 76.49% | 42.61% | 82.48% | 18/4 | 9 | 5 |
| 5 | 350.48% | -11.98% | 115 | 106.81 | 76.49% | 39.88% | 82.48% | 20/4 | 8 | 5 |
| 7 | 282.54% | -12.03% | 111 | 103.41 | 56.19% | 37.54% | 78.07% | 27/3 | 0 | 7 |
| 10 | 216.77% | -14.77% | 107 | 99.41 | 42.13% | 25.16% | 78.07% | 31/3 | 0 | 10 |

Qualified:none. Selected:X0. Selection uses development1000 and validation500 only. Final500 is reused conditional historical audit. No production adoption.

## Cost and timing sensitivity

| X | Gross | Actual net | Stress20bps | Next-open net | Next-open maxDD | Next-open final500 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 476.28% | 440.98% | 347.55% | 465.36% | -9.44% | 106.91% |
| 1 | 435.15% | 404.39% | 322.31% | 420.19% | -10.28% | 106.91% |
| 2 | 412.80% | 384.82% | 309.72% | 402.12% | -10.28% | 100.87% |
| 3 | 384.45% | 359.26% | 291.27% | 368.94% | -10.28% | 86.22% |
| 5 | 375.19% | 350.48% | 283.79% | 369.27% | -10.28% | 86.22% |
| 7 | 302.84% | 282.54% | 227.57% | 299.76% | -9.39% | 77.48% |
| 10 | 232.92% | 216.77% | 172.89% | 248.74% | -9.67% | 77.48% |

Actual3bps commission+2bps slippage per side; stress20bps total per side. Gross/net differences include compounding, not just fee cash. Next-open sensitivity applies different fills to the SAME controller/cooldown path; it is not a fill-aware next-open policy. Main timing is the existing Nikkei index-close proxy, not China-product execution.

## Verification and interpretation

X0 matches every production target, final controller state, actual fill and440.9807031454993% return. All7 cases freshly audited;14 truncated prefixes and14 serialized controller+clock+cash resumes match. Every buy is later than its applicable actual-sale deadline. Economic clock fills exactly match the shared backtester. Peak observed RSS:145.9MiB below1536MiB. Source/design/code-keyed raw backup/checkpoints and full event/fill ledgers remain local in data/output.

Blocked entries/adds count attempted decisions, not independent trades. Consecutive sell-buy pairs can overlap. Missed up blocks are fixed nonoverlapping20-session blocks with>=5% raw price gain in which policy return is below baseline. Zero missed blocks does not establish no lost upside. Sample/winners/v8 have been repeatedly examined; these are historical comparisons, not untouched validation or significance claims. No production or saved-account changes.
