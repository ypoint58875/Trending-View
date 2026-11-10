# Frozen-v8 whipsaw filter results

2018-08-09..2026-10-26;153 declared candidates;149 distinct target paths.
Baseline exactly reproduces v8 440.9807031454993% and the complete production target path. Source:b543028a5db9860a9ac262d8bf65cf6df06f8d625afba728d875ce0d0274873e.

## Qualified family selection (fallback is baseline)

| Policy | Train return | Validation return | Audit return | Full return | Full maxDD | Fills | Audit fills |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 85.43% | 45.98% | 99.85% | 440.98% | -10.88% | 134 | 25 |

## Validation-return leaders, shown even if unqualified

| Policy | Train return | Validation return | Audit return | Full return | Full maxDD | Fills | Audit fills |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 85.43% | 45.98% | 99.85% | 440.98% | -10.88% | 134 | 25 |
| regime-ER30-0.15-BW0.2-D3-entry | 51.40% | 42.04% | 91.81% | 312.48% | -11.83% | 130 | 27 |
| er-only-ER30-0.15-BW1-D3-both | 26.33% | 39.67% | 45.74% | 157.16% | -13.33% | 87 | 22 |
| buffer-ATR0.25-both | 12.63% | 0.00% | 14.67% | 29.15% | -7.11% | 6 | 2 |

Selection, state handling, costs and bounds are fixed in DESIGN.md. Full CSV and detailed costs/next-open/250-session/rally-block audits are in output/. Last500 is a conditional historical check, not untouched validation. Original winners and all v8 rule settings remain fixed; production and browser accounts are unchanged.

## Diagnostic interpretation

All152 alternatives reduce full-sample fills;0 improve full-sample return.
10 closed rounds last<=7 sessions;9 lose; average net account return per such round:-1.48%.
The predeclared low-width/low-ER entry label identifies only1 of those short rounds. The broad entry-time label is not a reliable substitute for the screenshots' specific losing intervals. Partial rebalances are fills, not additional independent roundtrips.

| Entry label | Maximum holding sessions | Closed rounds | Wins | Mean net round return % |
| --- | ---: | ---: | ---: | ---: |
| low-width/ER | 7 | 1 | 0 | -2.48 |
| other | 7 | 9 | 1 | -1.37 |
| low-width/ER | 14 | 10 | 4 | -0.33 |
| other | 14 | 15 | 4 | -0.92 |
| low-width/ER | 10000 | 24 | 16 | 2.81 |
| other | 10000 | 36 | 22 | 3.16 |

## Cost and missed-rally sensitivity

| Policy | Gross full return | Net actual cost | Stress20bps full | Next-open full | Next-open final500 | Underperforming upward blocks / total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 476.28% | 440.98% | 347.55% | 465.36% | 106.91% | 0/25 |
| regime-ER30-0.15-BW0.2-D3-entry | 338.52% | 312.48% | 243.30% | 324.16% | 100.09% | 3/25 |
| er-only-ER30-0.15-BW1-D3-both | 168.11% | 157.16% | 126.92% | 157.12% | 47.59% | 9/25 |
| buffer-ATR0.25-both | 29.54% | 29.15% | 27.99% | 33.94% | 14.94% | 21/25 |

Rally blocks are fixed nonoverlapping20-session intervals with>=5% price gains, used for descriptive missed-opportunity accounting only. Actual cost is3bps commission plus2bps slippage per executed side. Gross/net differences include compounding and are not a sum of fee cash payments. The ATR-buffer definition requires persistence of the original request and a directional move from its initial price. Transient requests can disappear, so dramatic turnover reduction is accompanied by lost entries.

## Time splits and limitations

- Development:2018-08-09..2022-09-20,1000 sessions.
- Validation:2022-09-21..2024-10-03,500 sessions.
- Conditional audit:2024-10-04..2026-10-26,500 sessions.

Production v8 and the frozen winners were previously inspected and selected on this historical input. The final500 is therefore conditional, not an untouched real-world holdout. No causal inference about the screenshots' exact dates is possible because their date axes were not supplied. Risk exits remain unfiltered. No new production rule is recommended by this screen. Best full-period candidate shown solely as post-hoc context:regime-ER30-0.15-BW0.2-D3-both,329.33% return,125 fills; it still trails baseline and is not selected using audit returns.

Verification: source/bar identity, exact production baseline, full153-target/metric audit, zero-filter equivalence, serialized replay resume, causal-prefix tests and study resource bound. See output/audit.json. Peak observed process RSS:133MiB in the main run.
