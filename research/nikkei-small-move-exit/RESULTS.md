# Small-move ordinary full-exit protection results (v8)

2018-08-09..2026-10-26;2000 sessions;v8;1293 frozen decisions.
Source:b543028a5db9860a9ac262d8bf65cf6df06f8d625afba728d875ce0d0274873e. Identity:29943202bfc7b2831dd6bd4997000a98f81e4dbfc8e5b835431862a8b36ab0a6.

Cost=absolute current-close distance from actual first-entry unit cost (including fees/slippage). Range=post-entry high-low divided by first-entry cost. Adds/partial sales retain the reference; full flat resets. Entry-day pre-entry extrema excluded. Ordinary FULL exits only; partial sales and early4%/ATR hard exits pass. No reduction cooldown is combined. Native holding-add flag uses the cycle page's next-session lag1.

| Policy | Full net | MaxDD | Fills | Turnover | Train net | Validation net | Final500 | Blocked full-exit attempts | Sell-buy <=7 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 440.98% | -10.88% | 134 | 126.40 | 85.43% | 45.98% | 99.85% | 0 | 29 |
| cost-0.5 | 423.71% | -12.69% | 132 | 123.80 | 85.87% | 42.83% | 97.26% | 7 | 28 |
| cost-1 | 426.54% | -12.42% | 126 | 117.80 | 83.59% | 46.14% | 96.26% | 20 | 27 |
| cost-1.5 | 427.12% | -15.92% | 120 | 111.80 | 78.41% | 52.48% | 93.77% | 27 | 23 |
| cost-2 | 402.69% | -15.92% | 114 | 105.80 | 64.60% | 52.48% | 100.28% | 59 | 21 |
| cost-3 | 388.03% | -13.62% | 109 | 99.80 | 60.64% | 50.71% | 101.58% | 96 | 19 |
| cost-4 | 426.01% | -13.34% | 99 | 89.80 | 70.76% | 52.81% | 101.58% | 110 | 16 |
| cost-5 | 447.51% | -11.87% | 96 | 87.21 | 78.61% | 52.07% | 101.58% | 121 | 18 |
| cost-6 | 456.60% | -12.48% | 90 | 81.21 | 74.95% | 57.24% | 102.34% | 135 | 15 |
| cost-8 | 396.71% | -18.01% | 86 | 76.01 | 57.30% | 57.24% | 100.82% | 154 | 15 |
| cost-10 | 391.44% | -18.01% | 82 | 72.01 | 51.56% | 58.36% | 104.76% | 168 | 15 |
| range-0.5 | 440.98% | -10.88% | 134 | 126.40 | 85.43% | 45.98% | 99.85% | 0 | 29 |
| range-1 | 440.98% | -10.88% | 134 | 126.40 | 85.43% | 45.98% | 99.85% | 0 | 29 |
| range-1.5 | 440.98% | -10.88% | 134 | 126.40 | 85.43% | 45.98% | 99.85% | 0 | 29 |
| range-2 | 450.38% | -10.88% | 132 | 124.40 | 84.66% | 49.13% | 99.85% | 2 | 28 |
| range-3 | 454.00% | -10.88% | 130 | 121.80 | 89.73% | 46.11% | 99.85% | 4 | 27 |
| range-4 | 412.78% | -15.56% | 122 | 113.80 | 70.41% | 48.20% | 103.04% | 30 | 25 |
| range-5 | 455.16% | -10.18% | 114 | 105.80 | 84.39% | 51.20% | 99.12% | 47 | 22 |
| range-6 | 422.02% | -11.95% | 112 | 103.80 | 82.98% | 50.17% | 89.98% | 68 | 21 |
| range-8 | 446.00% | -11.87% | 102 | 93.21 | 69.99% | 59.84% | 100.95% | 111 | 17 |
| range-10 | 482.15% | -11.87% | 90 | 81.21 | 81.21% | 59.28% | 101.70% | 128 | 15 |

Qualified:range-5, range-6. Selected:range-5. Qualification uses first1000 and next500 only; final500 is reused conditional historical audit. No automatic adoption.

## Cost and timing sensitivity

| Policy | Gross | Actual net | Stress20bps | Next-open net | Next-open maxDD | Next-open final500 | Missed up blocks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 476.28% | 440.98% | 347.55% | 465.36% | -9.44% | 106.91% | 0 |
| cost-0.5 | 457.16% | 423.71% | 334.96% | 469.41% | -9.44% | 104.18% | 0 |
| cost-1 | 458.49% | 426.54% | 341.26% | 465.34% | -9.44% | 101.73% | 0 |
| cost-1.5 | 457.42% | 427.12% | 345.74% | 443.91% | -12.80% | 97.26% | 0 |
| cost-2 | 430.00% | 402.69% | 328.92% | 447.17% | -12.80% | 107.20% | 0 |
| cost-3 | 413.00% | 388.03% | 320.18% | 420.71% | -17.09% | 107.48% | 0 |
| cost-4 | 450.17% | 426.01% | 359.73% | 442.50% | -15.34% | 107.48% | 0 |
| cost-5 | 471.91% | 447.51% | 380.38% | 481.17% | -12.27% | 107.48% | 0 |
| cost-6 | 479.67% | 456.60% | 392.77% | 475.73% | -14.54% | 109.37% | 0 |
| cost-8 | 415.95% | 396.71% | 343.18% | 426.43% | -19.22% | 107.17% | 1 |
| cost-10 | 409.46% | 391.44% | 341.12% | 418.45% | -19.22% | 109.71% | 0 |
| range-0.5 | 476.28% | 440.98% | 347.55% | 465.36% | -9.44% | 106.91% | 0 |
| range-1 | 476.28% | 440.98% | 347.55% | 465.36% | -9.44% | 106.91% | 0 |
| range-1.5 | 476.28% | 440.98% | 347.55% | 465.36% | -9.44% | 106.91% | 0 |
| range-2 | 485.70% | 450.38% | 356.69% | 477.40% | -9.44% | 106.91% | 0 |
| range-3 | 488.78% | 454.00% | 361.49% | 483.14% | -9.44% | 106.91% | 1 |
| range-4 | 442.80% | 412.78% | 332.31% | 457.11% | -11.94% | 111.40% | 0 |
| range-5 | 485.32% | 455.16% | 373.69% | 513.03% | -9.44% | 106.76% | 0 |
| range-6 | 449.83% | 422.02% | 346.76% | 472.45% | -10.62% | 100.90% | 0 |
| range-8 | 472.05% | 446.00% | 374.76% | 482.81% | -13.38% | 110.77% | 0 |
| range-10 | 506.28% | 482.15% | 415.39% | 523.87% | -11.83% | 112.68% | 0 |

Actual3bps commission+2bps slippage per side; stress20bps total per side. Gross/net differences include compounding, not fee cash sums. Next-open uses the SAME close-derived controller/cost/range path with different execution prices, not a fill-aware redesign. Main Nikkei-close proxy is not a real China-product quote.

## Verification and limitations

Baseline target/final controller/fill identity and440.9807031454993% return match pinned v8 cycle execution. All21 cases freshly audited;42 truncated prefixes and42 serialized controller/episode/cash resumes match. Every fill and final cash equity match the shared backtester. All protected exits satisfy the declared live criterion and exclude hard risk. Peak observed RSS:240.8MiB below1536MiB.

Blocked attempts can repeat and are not independent avoided sales. Consecutive sell-buy pairs can overlap. Fixed20-session price-up>=5% underperformance blocks are descriptive. The native4% stop retains its original early-entry age coverage; it is not a lifetime4% stop. Dataset, winners and overlay rules have been repeatedly inspected; this is conditional historical evidence, not untouched holdout or significance. Product rules/accounts/archives remain unchanged by this task. DESIGN/README document deterministic atomic recovery; detailed ledgers remain ignored in output/29943202bfc7b2831dd6bd4997000a98f81e4dbfc8e5b835431862a8b36ab0a6/.
