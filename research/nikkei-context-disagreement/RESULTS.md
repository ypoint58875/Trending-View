# Single-line disagreement results

Input: 2000-01-04 through 2026-10-30; 6570 bars.
SHA-256: df8c1c139c4b3984299de21d7b4eb33d42b076f7c23c41db63eedd6987bff5bd.

Event definition, bounds and causal execution: see README.md.
There are 144 qualifying first-departure events, including 0 flat events.
Raw and smoothed curves use production functions. No parameters are fitted.

## All opposite-direction events

| Side | Metric | Days | N | Mean close return % | Prior-direction hit % | Restored % | Reconfirmed % | Opposite confirmation % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| up | all | 1 | 83 | -0.10 | 42.17 | 15.66 | 0.00 | 0.00 |
| up | all | 3 | 83 | -0.08 | 59.04 | 32.53 | 1.20 | 0.00 |
| up | all | 5 | 83 | 0.12 | 55.42 | 49.40 | 6.02 | 12.05 |
| up | all | 10 | 83 | 0.36 | 57.83 | 79.52 | 22.89 | 25.30 |
| up | all | 20 | 83 | 0.38 | 55.42 | 89.16 | 37.35 | 48.19 |
| down | all | 1 | 61 | 0.01 | 50.82 | 19.67 | 0.00 | 0.00 |
| down | all | 3 | 61 | 0.47 | 31.15 | 24.59 | 4.92 | 6.56 |
| down | all | 5 | 61 | 0.87 | 27.87 | 42.62 | 6.56 | 19.67 |
| down | all | 10 | 60 | 1.12 | 33.33 | 71.67 | 21.67 | 43.33 |
| down | all | 20 | 60 | 0.96 | 36.67 | 91.67 | 51.67 | 65.00 |

## 2021 onward

| Side | Metric | Days | N | Mean close return % | Prior-direction hit % | Restored % | Reconfirmed % | Opposite confirmation % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| up | all | 5 | 18 | -0.48 | 38.89 | 38.89 | 5.56 | 16.67 |
| up | all | 10 | 18 | -0.43 | 44.44 | 66.67 | 22.22 | 33.33 |
| up | all | 20 | 18 | -1.60 | 38.89 | 83.33 | 33.33 | 55.56 |
| down | all | 5 | 12 | 0.95 | 33.33 | 58.33 | 0.00 | 16.67 |
| down | all | 10 | 11 | 2.34 | 27.27 | 81.82 | 9.09 | 45.45 |
| down | all | 20 | 11 | 1.99 | 36.36 | 100.00 | 36.36 | 54.55 |

## Per-curve 10-session outcomes

| Side | Metric | Days | N | Mean close return % | Prior-direction hit % | Restored % | Reconfirmed % | Opposite confirmation % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| up | bias20 | 10 | 16 | 0.01 | 56.25 | 56.25 | 37.50 | 18.75 |
| up | bias60 | 10 | 0 | n/a | n/a | n/a | n/a | n/a |
| up | bias200 | 10 | 0 | n/a | n/a | n/a | n/a | n/a |
| up | slope20 | 10 | 24 | 0.45 | 50.00 | 87.50 | 16.67 | 25.00 |
| up | slope60 | 10 | 24 | 1.14 | 70.83 | 87.50 | 20.83 | 25.00 |
| up | slope200 | 10 | 19 | -0.46 | 52.63 | 78.95 | 21.05 | 31.58 |
| down | bias20 | 10 | 9 | 2.96 | 11.11 | 55.56 | 11.11 | 88.89 |
| down | bias60 | 10 | 0 | n/a | n/a | n/a | n/a | n/a |
| down | bias200 | 10 | 0 | n/a | n/a | n/a | n/a | n/a |
| down | slope20 | 10 | 9 | -2.31 | 66.67 | 100.00 | 33.33 | 33.33 |
| down | slope60 | 10 | 19 | 1.53 | 31.58 | 73.68 | 15.79 | 31.58 |
| down | slope200 | 10 | 23 | 1.40 | 30.43 | 65.22 | 26.09 | 39.13 |

## More than 20-session spaced sensitivity

| Side | Metric | Days | N | Mean close return % | Prior-direction hit % | Restored % | Reconfirmed % | Opposite confirmation % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| up | all | 5 | 63 | -0.05 | 50.79 | 52.38 | 7.94 | 11.11 |
| up | all | 10 | 63 | -0.05 | 50.79 | 77.78 | 20.63 | 25.40 |
| up | all | 20 | 63 | 0.19 | 53.97 | 88.89 | 34.92 | 49.21 |
| down | all | 5 | 50 | 0.76 | 28.00 | 48.00 | 8.00 | 22.00 |
| down | all | 10 | 50 | 0.95 | 36.00 | 76.00 | 22.00 | 46.00 |
| down | all | 20 | 50 | 0.69 | 40.00 | 96.00 | 54.00 | 66.00 |

## Interpretation limits

Single-line disagreement resets the candidate count but does not reverse the retained confirmation. Reversal requires three unanimous opposite days. Restored and reversed rates can overlap; exclusive first-outcome columns are in output/cohorts.csv. Event windows overlap in the primary table; use the spaced cohort as a sensitivity check. Wilson intervals are descriptive and do not correct dependence or multiple comparisons. The last observations are censored by horizon. Research is retrospective, including repeated prior inspection of this dataset.

## Illustrative long/cash policies (5 bps per side)

| Period | Policy | Total return % | Max drawdown % | Executed sides |
| --- | --- | ---: | ---: | ---: |
| all | retain-confirmation | 114.68 | -61.50 | 256 |
| all | exit-on-single-break | 13.41 | -61.08 | 332 |
| 2000-2014 | retain-confirmation | -16.48 | -61.50 | 139 |
| 2000-2014 | exit-on-single-break | -28.95 | -61.08 | 182 |
| 2015-2020 | retain-confirmation | 71.05 | -20.19 | 54 |
| 2015-2020 | exit-on-single-break | 18.92 | -20.41 | 70 |
| 2021-2026 | retain-confirmation | 55.66 | -25.34 | 64 |
| 2021-2026 | exit-on-single-break | 37.97 | -21.94 | 80 |

Every segment starts in cash; decisions use the current close and execute no earlier than the next open. Terminal holdings are marked at close. These policies do not alter the application or constitute a validated deployment recommendation.

## Multiple reversals: initial departure

| Prior state | Reversed curves | N (10d) | 10d mean price change % | Prior-direction hit % | Original unanimity restored % | Opposite confirmed % |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| up | 1 | 83 | 0.36 | 57.83 | 79.52 | 25.30 |
| up | 2 | 27 | -0.13 | 55.56 | 85.19 | 25.93 |
| up | 3 | 25 | -0.16 | 52.00 | 64.00 | 32.00 |
| up | 4 | 29 | -0.54 | 51.72 | 58.62 | 48.28 |
| up | 5 | 46 | 0.44 | 50.00 | 73.91 | 41.30 |
| up | 6 | 16 | -1.38 | 31.25 | 50.00 | 56.25 |
| down | 1 | 60 | 1.12 | 33.33 | 71.67 | 43.33 |
| down | 2 | 35 | 0.15 | 37.14 | 85.71 | 31.43 |
| down | 3 | 20 | -0.32 | 55.00 | 75.00 | 30.00 |
| down | 4 | 26 | 0.01 | 61.54 | 76.92 | 42.31 |
| down | 5 | 39 | -0.25 | 48.72 | 79.49 | 35.90 |
| down | 6 | 28 | -0.21 | 35.71 | 71.43 | 60.71 |

## Multiple reversals: first visit to each count in an episode

| Prior state | Reversed curves | N (10d) | 10d mean price change % | Prior-direction hit % | Original unanimity restored % | Opposite confirmed % |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| up | 1 | 164 | 0.43 | 54.88 | 80.49 | 23.78 |
| up | 2 | 131 | -0.08 | 50.38 | 74.81 | 31.30 |
| up | 3 | 133 | 0.47 | 55.64 | 75.19 | 30.83 |
| up | 4 | 141 | 0.40 | 56.74 | 73.05 | 31.21 |
| up | 5 | 171 | 0.35 | 54.39 | 72.51 | 32.16 |
| up | 6 | 189 | 0.14 | 52.38 | 68.25 | 50.26 |
| down | 1 | 132 | 0.53 | 40.91 | 78.03 | 36.36 |
| down | 2 | 106 | 0.33 | 45.28 | 83.96 | 33.02 |
| down | 3 | 81 | 0.05 | 48.15 | 80.25 | 32.10 |
| down | 4 | 102 | 0.51 | 44.12 | 69.61 | 37.25 |
| down | 5 | 135 | -0.05 | 45.19 | 76.30 | 35.56 |
| down | 6 | 176 | -0.14 | 44.89 | 73.30 | 53.98 |

## Initial departure, 2021 onward

| Prior state | Reversed curves | N (10d) | 10d mean price change % | Prior-direction hit % | Original unanimity restored % | Opposite confirmed % |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| up | 1 | 18 | -0.43 | 44.44 | 66.67 | 33.33 |
| up | 2 | 2 | -2.35 | 0.00 | 100.00 | 50.00 |
| up | 3 | 9 | 0.30 | 55.56 | 88.89 | 33.33 |
| up | 4 | 10 | -0.35 | 40.00 | 40.00 | 50.00 |
| up | 5 | 18 | 1.50 | 55.56 | 66.67 | 50.00 |
| up | 6 | 3 | -2.32 | 33.33 | 66.67 | 66.67 |
| down | 1 | 11 | 2.34 | 27.27 | 81.82 | 45.45 |
| down | 2 | 5 | 2.69 | 0.00 | 100.00 | 40.00 |
| down | 3 | 6 | -0.17 | 50.00 | 100.00 | 33.33 |
| down | 4 | 6 | 0.19 | 50.00 | 83.33 | 50.00 |
| down | 5 | 13 | 0.40 | 53.85 | 69.23 | 30.77 |
| down | 6 | 8 | 0.76 | 37.50 | 50.00 | 50.00 |

## Threshold early-exit policy sensitivity (5 bps/side)

| Period | Exit at least N reversed curves | Total return % | Max drawdown % | Executed sides |
| --- | ---: | ---: | ---: | ---: |
| all | 1 | -19.01 | -30.54 | 452 |
| all | 2 | -31.37 | -37.19 | 448 |
| all | 3 | -32.53 | -38.25 | 446 |
| all | 4 | -35.79 | -43.91 | 438 |
| all | 5 | -25.48 | -35.67 | 424 |
| all | 6 | 52.31 | -31.76 | 378 |
| 2000-2014 | 1 | -3.03 | -23.20 | 234 |
| 2000-2014 | 2 | -15.33 | -28.03 | 232 |
| 2000-2014 | 3 | -15.30 | -28.24 | 232 |
| 2000-2014 | 4 | -24.11 | -36.27 | 228 |
| 2000-2014 | 5 | -10.97 | -29.12 | 220 |
| 2000-2014 | 6 | 11.79 | -31.76 | 197 |
| 2015-2020 | 1 | -7.64 | -17.80 | 100 |
| 2015-2020 | 2 | -2.85 | -17.59 | 98 |
| 2015-2020 | 3 | -1.04 | -18.56 | 96 |
| 2015-2020 | 4 | -0.25 | -17.60 | 96 |
| 2015-2020 | 5 | 1.03 | -13.14 | 92 |
| 2015-2020 | 6 | 34.66 | -14.37 | 80 |
| 2021-2026 | 1 | -9.47 | -13.81 | 120 |
| 2021-2026 | 2 | -16.48 | -18.81 | 120 |
| 2021-2026 | 3 | -19.42 | -20.77 | 120 |
| 2021-2026 | 4 | -15.09 | -21.29 | 116 |
| 2021-2026 | 5 | -14.84 | -22.69 | 112 |
| 2021-2026 | 6 | 4.80 | -27.04 | 100 |

The multiple-count tables exclude flat components; every raw event retains flat counts in multiple-events.csv. Initial departures and later stage visits are distinct cohorts. A stage visit is counted once per exact reversal count per episode. Episodes end only at a fresh three-day confirmation in either direction. Observations with six reversals are still the first opposite-unanimous day; the opposite confirmation requires two further unanimous days. Counts are correlated and are not six independent experiments.
