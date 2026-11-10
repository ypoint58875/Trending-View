# Small-move ordinary full-exit protection results (v9)

2018-08-09..2026-10-26;2000 sessions;v9;1293 frozen decisions.
Source:b543028a5db9860a9ac262d8bf65cf6df06f8d625afba728d875ce0d0274873e. Identity:57bdd392fa3566c6f513886624f14a071e18da6c6c2459cd3bdde27f5da7316e.

Cost=absolute current-close distance from actual first-entry unit cost (including fees/slippage). Range=post-entry high-low divided by first-entry cost. Adds/partial sales retain the reference; full flat resets. Entry-day pre-entry extrema excluded. Ordinary FULL exits only; partial sales and early4%/ATR hard exits pass. No reduction cooldown is combined. Native holding-add flag uses the cycle page's next-session lag1.

| Policy | Full net | MaxDD | Fills | Turnover | Train net | Validation net | Final500 | Blocked full-exit attempts | Sell-buy <=7 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 445.34% | -10.88% | 133 | 125.01 | 85.79% | 46.87% | 99.85% | 0 | 28 |
| cost-0.5 | 427.94% | -12.69% | 131 | 122.41 | 86.23% | 43.71% | 97.26% | 7 | 27 |
| cost-1 | 430.79% | -12.42% | 125 | 116.41 | 83.94% | 47.03% | 96.26% | 20 | 26 |
| cost-1.5 | 431.37% | -15.92% | 119 | 110.41 | 78.76% | 53.41% | 93.77% | 27 | 22 |
| cost-2 | 406.74% | -15.92% | 113 | 104.41 | 64.93% | 53.41% | 100.28% | 59 | 20 |
| cost-3 | 391.96% | -13.45% | 108 | 98.41 | 60.95% | 51.63% | 101.58% | 96 | 18 |
| cost-4 | 418.10% | -15.16% | 98 | 88.41 | 67.17% | 53.74% | 101.58% | 110 | 15 |
| cost-5 | 439.27% | -13.36% | 95 | 85.82 | 74.85% | 53.00% | 101.58% | 121 | 17 |
| cost-6 | 448.22% | -14.32% | 89 | 79.82 | 71.27% | 58.20% | 102.34% | 135 | 14 |
| cost-8 | 396.95% | -18.47% | 85 | 74.62 | 56.42% | 58.20% | 100.82% | 154 | 14 |
| cost-10 | 391.68% | -18.47% | 81 | 70.62 | 50.71% | 59.33% | 104.76% | 168 | 14 |
| range-0.5 | 445.34% | -10.88% | 133 | 125.01 | 85.79% | 46.87% | 99.85% | 0 | 28 |
| range-1 | 445.34% | -10.88% | 133 | 125.01 | 85.79% | 46.87% | 99.85% | 0 | 28 |
| range-1.5 | 445.34% | -10.88% | 133 | 125.01 | 85.79% | 46.87% | 99.85% | 0 | 28 |
| range-2 | 454.81% | -10.88% | 131 | 123.01 | 85.02% | 50.04% | 99.85% | 2 | 27 |
| range-3 | 458.46% | -10.88% | 129 | 120.41 | 90.10% | 47.00% | 99.85% | 4 | 26 |
| range-4 | 416.91% | -15.56% | 121 | 112.41 | 70.74% | 49.11% | 103.04% | 30 | 24 |
| range-5 | 446.80% | -10.18% | 113 | 104.41 | 80.51% | 52.13% | 99.12% | 47 | 21 |
| range-6 | 414.17% | -11.95% | 111 | 102.41 | 79.13% | 51.08% | 89.98% | 68 | 20 |
| range-8 | 437.78% | -12.68% | 101 | 91.82 | 66.41% | 60.82% | 100.95% | 111 | 16 |
| range-10 | 482.44% | -11.87% | 89 | 79.82 | 80.20% | 60.25% | 101.70% | 128 | 14 |

Qualified:none. Selected:baseline. Qualification uses first1000 and next500 only; final500 is reused conditional historical audit. No automatic adoption.

## Cost and timing sensitivity

| Policy | Gross | Actual net | Stress20bps | Next-open net | Next-open maxDD | Next-open final500 | Missed up blocks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 480.52% | 445.34% | 352.10% | 478.39% | -9.28% | 106.91% | 0 |
| cost-0.5 | 461.26% | 427.94% | 339.38% | 482.53% | -9.28% | 104.18% | 0 |
| cost-1 | 462.60% | 430.79% | 345.75% | 478.37% | -9.28% | 101.73% | 0 |
| cost-1.5 | 461.53% | 431.37% | 350.27% | 456.45% | -12.80% | 97.26% | 0 |
| cost-2 | 433.90% | 406.74% | 333.28% | 459.78% | -12.80% | 107.20% | 0 |
| cost-3 | 416.77% | 391.96% | 324.45% | 432.71% | -16.13% | 107.48% | 0 |
| cost-4 | 441.51% | 418.10% | 353.76% | 439.85% | -16.69% | 107.48% | 0 |
| cost-5 | 462.91% | 439.27% | 374.14% | 478.33% | -13.67% | 107.48% | 0 |
| cost-6 | 470.55% | 448.22% | 386.37% | 472.91% | -15.90% | 109.37% | 0 |
| cost-8 | 415.84% | 396.95% | 344.32% | 426.68% | -20.08% | 107.17% | 1 |
| cost-10 | 409.35% | 391.68% | 342.26% | 418.71% | -20.08% | 109.71% | 0 |
| range-0.5 | 480.52% | 445.34% | 352.10% | 478.39% | -9.28% | 106.91% | 0 |
| range-1 | 480.52% | 445.34% | 352.10% | 478.39% | -9.28% | 106.91% | 0 |
| range-1.5 | 480.52% | 445.34% | 352.10% | 478.39% | -9.28% | 106.91% | 0 |
| range-2 | 490.01% | 454.81% | 361.33% | 490.71% | -9.28% | 106.91% | 0 |
| range-3 | 493.12% | 458.46% | 366.18% | 496.58% | -9.28% | 106.91% | 1 |
| range-4 | 446.80% | 416.91% | 336.71% | 469.95% | -11.94% | 111.40% | 0 |
| range-5 | 476.11% | 446.80% | 367.54% | 510.03% | -9.28% | 106.76% | 0 |
| range-6 | 441.18% | 414.17% | 340.96% | 469.65% | -10.62% | 100.90% | 0 |
| range-8 | 463.05% | 437.78% | 368.59% | 479.96% | -14.76% | 110.77% | 0 |
| range-10 | 506.15% | 482.44% | 416.72% | 524.18% | -12.77% | 112.68% | 0 |

Actual3bps commission+2bps slippage per side; stress20bps total per side. Gross/net differences include compounding, not fee cash sums. Next-open uses the SAME close-derived controller/cost/range path with different execution prices, not a fill-aware redesign. Main Nikkei-close proxy is not a real China-product quote.

## Verification and limitations

Baseline target/final controller/fill identity and445.34209325762885% return match pinned v9 cycle execution. All21 cases freshly audited;42 truncated prefixes and42 serialized controller/episode/cash resumes match. Every fill and final cash equity match the shared backtester. All protected exits satisfy the declared live criterion and exclude hard risk. Peak observed RSS:252.3MiB below1536MiB.

Blocked attempts can repeat and are not independent avoided sales. Consecutive sell-buy pairs can overlap. Fixed20-session price-up>=5% underperformance blocks are descriptive. The native4% stop retains its original early-entry age coverage; it is not a lifetime4% stop. Dataset, winners and overlay rules have been repeatedly inspected; this is conditional historical evidence, not untouched holdout or significance. Product rules/accounts/archives remain unchanged by this task. DESIGN/README document deterministic atomic recovery; detailed ledgers remain ignored in output/57bdd392fa3566c6f513886624f14a071e18da6c6c2459cd3bdde27f5da7316e/.
