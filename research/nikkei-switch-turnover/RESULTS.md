# Strategy replacement turnover results

2018-08-09..2026-10-26;2000 sessions;1293 frozen decisions;1112 plan replacements;45 opposite-direction conflicts.
Source:b543028a5db9860a9ac262d8bf65cf6df06f8d625afba728d875ce0d0274873e. Identity:47797501a0c8f317e4086ddbe222579e63ec94a4e3487fb80b7830d882a92753.

| Policy | Full net | MaxDD | Fills | Turnover | Train net | Validation net | Final500 net | Vetoes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 440.98% | -10.88% | 134 | 126.40 | 85.43% | 45.98% | 99.85% | 0 |
| old-on-conflict | 302.95% | -14.72% | 141 | 133.01 | 73.20% | 40.28% | 65.84% | 0 |
| consensus-both | 221.89% | -12.62% | 108 | 102.24 | 58.71% | 20.72% | 68.01% | 412 |
| consensus-reduce | 377.52% | -14.67% | 105 | 102.21 | 80.84% | 38.80% | 90.25% | 260 |
| consensus-increase | 239.84% | -11.79% | 129 | 127.40 | 57.90% | 23.77% | 73.89% | 152 |
| small-switch-10pp | 440.98% | -10.88% | 134 | 126.40 | 85.43% | 45.98% | 99.85% | 0 |
| small-switch-25pp | 440.98% | -10.88% | 134 | 126.40 | 85.43% | 45.98% | 99.85% | 0 |

Qualified:none. Selected:baseline. Qualification uses train and validation only; final500 is a reused conditional audit. No automatic adoption.

## Actual economic fill provenance

| Local fill mechanism | Fills | Turnover |
| --- | ---: | ---: |
| switch-current | 22 | 17.01 |
| switch-pending | 31 | 29.40 |
| native-request | 11 | 10.40 |
| controller | 65 | 64.60 |
| risk | 5 | 5.00 |
| unmapped | 0 | 0.00 |

| Maximum sessions | Consecutive opposite fill pairs | With switch-sensitive leg |
| --- | ---: | ---: |
| 3 | 26 | 17 |
| 5 | 33 | 20 |
| 7 | 42 | 27 |

Local same-state probes identify mechanisms, not additive causal profit. Consecutive pairs may overlap; future reversal is diagnostic-only. Pending-origin propagation is included. Full ledgers, pairs, short rounds and eight250-session blocks are in output/47797501a0c8f317e4086ddbe222579e63ec94a4e3487fb80b7830d882a92753/.

## Execution and cost sensitivity

| Policy | Gross | Actual net | Stress20bps | Next-open net | Next-open final500 |
| --- | ---: | ---: | ---: | ---: | ---: |
| baseline | 476.28% | 440.98% | 347.55% | 465.36% | 106.91% |
| old-on-conflict | 330.66% | 302.95% | 230.08% | 305.59% | 71.00% |
| consensus-both | 238.76% | 221.89% | 176.14% | 229.33% | 74.56% |
| consensus-reduce | 402.56% | 377.52% | 309.65% | 425.37% | 104.48% |
| consensus-increase | 262.20% | 239.84% | 180.73% | 234.18% | 73.33% |
| small-switch-10pp | 476.28% | 440.98% | 347.55% | 465.36% | 106.91% |
| small-switch-25pp | 476.28% | 440.98% | 347.55% | 465.36% | 106.91% |

Actual3bps commission+2bps slippage per side. Gross/net differences include compounding and are not fee cash sums. Next-open uses the same controller decisions with different fills; actual China-product execution is untested.

## Verification and limitations

Baseline complete targets/final state and440.9807031454993% match production. All7 cases freshly audited, two causal prefixes and two serialized controller resumes per case pass. Signal derivation validates all cached incoming decisions against fresh causal timelines. Peak observed RSS:251.2MiB below1536MiB. Raw/source/implementation identities and atomic progress retained. Sample, winners and v8 have been inspected previously; no untouched holdout or significance claim. Product rules, accounts and archives unchanged.
