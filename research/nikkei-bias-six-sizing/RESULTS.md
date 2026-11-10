# BIAS and six-curve sizing results

2018-08-09..2026-10-26;2000 sessions;current v10 native458.4631387547417% exactly reproduced against real cycle report. Commission3bps+slippage2bps per side. Frozen winners; no rescreen. Identity:50427ff9eca63478f0b7e9553d612a9498a8384c5519e0984ff31a63f6fc2f34.

| Policy | Net % | MaxDD % | Fills | First1000 % | Next500 % | Final500 % | Next-open % | Stress20bps % |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 458.46 | -10.88 | 129 | 90.10 | 47.00 | 99.85 | 496.58 | 366.18 |
| weak-0.75 | 357.16 | -10.16 | 176 | 73.66 | 41.35 | 86.24 | 375.53 | 282.74 |
| weak-0.5 | 272.60 | -9.45 | 176 | 58.34 | 35.80 | 73.27 | 277.28 | 212.59 |
| weak-0.25 | 202.38 | -10.94 | 176 | 44.14 | 30.35 | 60.94 | 197.99 | 154.14 |
| weak-0 | 144.32 | -13.13 | 120 | 30.97 | 25.01 | 49.22 | 134.27 | 105.67 |
| event-0.5 | 317.02 | -10.88 | 149 | 82.62 | 33.07 | 71.61 | 357.76 | 248.33 |
| broad-0.5 | 267.66 | -9.44 | 166 | 72.94 | 32.78 | 60.10 | 295.84 | 208.52 |
| event-0 | 203.69 | -10.88 | 127 | 74.44 | 19.74 | 45.39 | 242.18 | 153.82 |
| broad-0 | 132.22 | -10.74 | 116 | 54.94 | 19.19 | 25.74 | 152.37 | 95.90 |
| event-transient-0.5 | 447.66 | -10.88 | 182 | 90.36 | 46.20 | 96.78 | 493.21 | 342.23 |
| broad-transient-0.5 | 344.56 | -11.42 | 273 | 71.40 | 40.51 | 84.59 | 382.01 | 240.20 |
| event-transient-0 | 436.75 | -10.88 | 180 | 90.52 | 45.42 | 93.74 | 489.32 | 318.82 |
| broad-transient-0 | 252.16 | -11.97 | 255 | 54.19 | 34.22 | 70.16 | 287.33 | 146.35 |
| same-close-bias | 463.09 | -10.88 | 128 | 89.67 | 48.55 | 99.85 | 496.11 | 371.03 |
| combined-add | 459.04 | -10.88 | 129 | 90.30 | 47.00 | 99.85 | 492.93 | 366.66 |

Primary strict-turn events:50; invested events:28. Combined-add is an ADDITIONAL veto on current next-session gate, not a replacement. Same-close-bias changes only that gate's lag. Event/broad sleeves reset on native target increase, event takes priority on the same day. Zero sleeve cannot reenter without a native increase. Weak sleeves restore native exposure on strong confirmation.

## cycleMarket

| State | Days | Runs | Positive runs | Mean daily % | Compound % | Mean run % | Median run % | Worst run % |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| up | 1100 | 43 | 21 | 0.08 | 121.72 | 2.13 | -0.37 | -7.57 |
| down | 899 | 44 | 25 | 0.04 | 24.12 | 0.65 | 1.05 | -20.24 |
| unknown | 0 | 0 | 0 | n/a | 0.00 | n/a | n/a | n/a |

## cycleStrategy

| State | Days | Runs | Positive runs | Mean daily % | Compound % | Mean run % | Median run % | Worst run % |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| up | 1100 | 43 | 20 | 0.09 | 150.01 | 2.35 | 0.00 | -4.53 |
| down | 899 | 44 | 29 | 0.09 | 123.37 | 1.89 | 1.25 | -4.39 |
| unknown | 0 | 0 | 0 | n/a | 0.00 | n/a | n/a | n/a |

## longMarket

| State | Days | Runs | Positive runs | Mean daily % | Compound % | Mean run % | Median run % | Worst run % |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| up | 3539 | 128 | 62 | 0.04 | 185.13 | 1.11 | -0.49 | -25.73 |
| down | 2819 | 128 | 84 | 0.03 | 44.14 | 0.53 | 1.47 | -38.93 |
| unknown | 8 | 1 | 1 | 0.46 | 3.64 | 3.64 | 3.64 | 3.64 |

## market2000to2014

| State | Days | Runs | Positive runs | Mean daily % | Compound % | Mean run % | Median run % | Worst run % |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| up | 1954 | 70 | 32 | 0.01 | 4.41 | 0.40 | -1.26 | -25.73 |
| down | 1515 | 69 | 47 | 0.02 | 8.53 | 0.45 | 1.81 | -38.93 |
| unknown | 8 | 1 | 1 | 0.46 | 3.64 | 3.64 | 3.64 | 3.64 |

## market2015to2020

| State | Days | Runs | Positive runs | Mean daily % | Compound % | Mean run % | Median run % | Worst run % |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| up | 836 | 27 | 16 | 0.07 | 76.10 | 2.30 | 1.57 | -9.03 |
| down | 629 | 27 | 18 | -0.01 | -10.70 | -0.24 | 1.18 | -20.24 |
| unknown | 0 | 0 | 0 | n/a | 0.00 | n/a | n/a | n/a |

## market2021onward

| State | Days | Runs | Positive runs | Mean daily % | Compound % | Mean run % | Median run % | Worst run % |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| up | 749 | 32 | 14 | 0.07 | 55.08 | 1.65 | -0.71 | -7.57 |
| down | 675 | 32 | 19 | 0.07 | 48.71 | 1.35 | 1.27 | -7.24 |
| unknown | 0 | 0 | 0 | n/a | 0.00 | n/a | n/a | n/a |

States label subsequent returns only. First close-to-close observation before cycle start is excluded. Partial initial/final regime runs are included; tail censor flag is in JSON. Regime compound figures stitch disjoint state days and are not annualized or stand-alone executable strategies. Current-strategy regime attribution uses prior-close state; state-change-day costs consequently belong to prior state. Long price sample:2000-01-04..2026-10-30,6570 bars; strategy and long price samples are distinct.

Sleeves preserve a shadow native controller and its original risk/range history; they do not simulate state feedback of a production integration. Next-open is identical signals shifted to next open, not a redesigned next-open strategy; it omits last-close trades with no next bar. Causal prefix and serialized native replay agree. Fixed case atomic checkpoint supports stop/resume. Peak RSS:356.47MiB. This reused historical sample and proxy fill do not establish future superiority. Production unchanged.
