# BIAS20 P90 exit study

2018-08-09..2026-10-26,2000 sessions. Costs:3bps commission plus2bps slippage. Current-v8 frozen winners. Main returns use existing Nikkei close proxy; next-open sensitivity is separate.

| Policy | Full % | First1500 % | Final500 % | MaxDD % | Fills | Extra sales | Entry vetoes | Reentry within5 | Next-open full % |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 440.98 | 170.69 | 99.85 | -10.88 | 134 | 0 | 0 | 0 | 465.36 |
| weighted-raw-any-T3-C0 | 95.73 | 63.29 | 19.87 | -14.82 | 220 | 93 | 0 | 39 | 148.13 |
| weighted-raw-any-T3-C1 | 108.93 | 64.98 | 26.64 | -12.00 | 232 | 100 | 0 | 42 | 145.31 |
| weighted-raw-any-T4-C0 | 209.28 | 120.36 | 40.36 | -15.69 | 188 | 57 | 0 | 32 | 267.30 |
| weighted-raw-any-T4-C1 | 217.02 | 110.23 | 50.79 | -15.69 | 196 | 63 | 0 | 29 | 269.62 |
| weighted-raw-any-T5-C0 | 440.98 | 170.69 | 99.85 | -10.88 | 134 | 0 | 0 | 0 | 465.36 |
| weighted-raw-any-T5-C1 | 337.28 | 177.67 | 57.48 | -15.69 | 154 | 25 | 0 | 13 | 394.23 |
| weighted-raw-native-intent-T3-C0 | 95.73 | 63.29 | 19.87 | -14.82 | 220 | 93 | 0 | 39 | 148.13 |
| weighted-raw-native-intent-T3-C1 | 113.24 | 63.07 | 30.77 | -12.00 | 226 | 96 | 0 | 41 | 154.34 |
| weighted-raw-native-intent-T4-C0 | 209.28 | 120.36 | 40.36 | -15.69 | 188 | 57 | 0 | 32 | 267.30 |
| weighted-raw-native-intent-T4-C1 | 217.02 | 110.23 | 50.79 | -15.69 | 196 | 63 | 0 | 29 | 269.62 |
| weighted-raw-native-intent-T5-C0 | 440.98 | 170.69 | 99.85 | -10.88 | 134 | 0 | 0 | 0 | 465.36 |
| weighted-raw-native-intent-T5-C1 | 337.28 | 177.67 | 57.48 | -15.69 | 154 | 25 | 0 | 13 | 394.23 |
| weighted-raw-executed-reduce-T3-C0 | 431.21 | 166.95 | 98.99 | -11.27 | 128 | 9 | 0 | 5 | 469.34 |
| weighted-raw-executed-reduce-T3-C1 | 431.21 | 166.95 | 98.99 | -11.27 | 128 | 9 | 0 | 5 | 469.34 |
| weighted-raw-executed-reduce-T4-C0 | 416.23 | 159.42 | 98.99 | -11.45 | 131 | 7 | 0 | 4 | 447.50 |
| weighted-raw-executed-reduce-T4-C1 | 430.12 | 166.40 | 98.99 | -11.45 | 130 | 8 | 0 | 5 | 470.06 |
| weighted-raw-executed-reduce-T5-C0 | 440.98 | 170.69 | 99.85 | -10.88 | 134 | 0 | 0 | 0 | 465.36 |
| weighted-raw-executed-reduce-T5-C1 | 439.67 | 171.20 | 98.99 | -10.88 | 131 | 2 | 0 | 1 | 459.38 |
| weighted-smooth-any-T3-C0 | 95.73 | 63.29 | 19.87 | -14.82 | 220 | 93 | 0 | 39 | 148.13 |
| weighted-smooth-any-T3-C1 | 109.61 | 66.52 | 25.88 | -12.00 | 224 | 96 | 0 | 38 | 153.92 |
| weighted-smooth-any-T4-C0 | 209.28 | 120.36 | 40.36 | -15.69 | 188 | 57 | 0 | 32 | 267.30 |
| weighted-smooth-any-T4-C1 | 159.33 | 74.80 | 48.36 | -15.69 | 200 | 64 | 0 | 29 | 226.79 |
| weighted-smooth-any-T5-C0 | 440.98 | 170.69 | 99.85 | -10.88 | 134 | 0 | 0 | 0 | 465.36 |
| weighted-smooth-any-T5-C1 | 325.68 | 170.52 | 57.35 | -15.69 | 156 | 25 | 0 | 14 | 375.51 |
| weighted-smooth-native-intent-T3-C0 | 95.73 | 63.29 | 19.87 | -14.82 | 220 | 93 | 0 | 39 | 148.13 |
| weighted-smooth-native-intent-T3-C1 | 107.18 | 64.59 | 25.88 | -12.00 | 220 | 93 | 0 | 38 | 154.01 |
| weighted-smooth-native-intent-T4-C0 | 209.28 | 120.36 | 40.36 | -15.69 | 188 | 57 | 0 | 32 | 267.30 |
| weighted-smooth-native-intent-T4-C1 | 159.33 | 74.80 | 48.36 | -15.69 | 200 | 64 | 0 | 29 | 226.79 |
| weighted-smooth-native-intent-T5-C0 | 440.98 | 170.69 | 99.85 | -10.88 | 134 | 0 | 0 | 0 | 465.36 |
| weighted-smooth-native-intent-T5-C1 | 325.68 | 170.52 | 57.35 | -15.69 | 156 | 25 | 0 | 14 | 375.51 |
| weighted-smooth-executed-reduce-T3-C0 | 431.21 | 166.95 | 98.99 | -11.27 | 128 | 9 | 0 | 5 | 469.34 |
| weighted-smooth-executed-reduce-T3-C1 | 431.21 | 166.95 | 98.99 | -11.27 | 128 | 9 | 0 | 5 | 469.34 |
| weighted-smooth-executed-reduce-T4-C0 | 416.23 | 159.42 | 98.99 | -11.45 | 131 | 7 | 0 | 4 | 447.50 |
| weighted-smooth-executed-reduce-T4-C1 | 430.12 | 166.40 | 98.99 | -11.45 | 130 | 8 | 0 | 5 | 470.06 |
| weighted-smooth-executed-reduce-T5-C0 | 440.98 | 170.69 | 99.85 | -10.88 | 134 | 0 | 0 | 0 | 465.36 |
| weighted-smooth-executed-reduce-T5-C1 | 439.67 | 171.20 | 98.99 | -10.88 | 131 | 2 | 0 | 1 | 459.38 |

Primary weighted-smooth-native-intent-T4-C1 forward price statistics after actual additional sales:

```json
{
  "5": {
    "n": 64,
    "mean": 0.7264116189308416,
    "median": 0.6496522193060295,
    "downPct": 43.75
  },
  "10": {
    "n": 64,
    "mean": 1.3345017510287933,
    "median": 0.5956021579075266,
    "downPct": 32.8125
  },
  "20": {
    "n": 64,
    "mean": 2.0937374529548896,
    "median": 1.7977794264841807,
    "downPct": 40.625
  }
}
```

Primary positive-speed sales:57/64. These exits can occur while SMA20 is still rising. Reentry rules are unchanged; no extra cooldown. Armed threshold memory resets at native flat or additional exit. Native entry vetoes do not represent a buy and sell at the same close.

P90 uses preceding three calendar years of raw BIAS, excluding current close, minimum252. Raw and smooth refer to tested current curve values, not different quantile samples. Strict-turn requires a nonnegative prior speed change followed by a negative change; negative means speed below zero.

Baseline targets AND final state match production; all37 variants pass causal prefixes and serialized resume. Forward windows overlap and ignore whether the account reentered; they are descriptive, not avoided-loss estimates. Whole-account returns include inherited path and fees. Final500 is reused historical data, not an untouched holdout. No production adoption.

## Isolating one-day versus three-day speed

| Raw BIAS20 gate | Speed | Full % | Final500 % | MaxDD % | Extra sales | Forward20 mean % | Forward20 down % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| armed | raw | 95.73 | 19.87 | -14.82 | 93 | 2.07 | 38.71 |
| armed | raw | 108.93 | 26.64 | -12.00 | 100 | 2.11 | 38.00 |
| armed | raw | 209.28 | 40.36 | -15.69 | 57 | 2.34 | 40.35 |
| armed | raw | 217.02 | 50.79 | -15.69 | 63 | 1.76 | 42.86 |
| armed | raw | 440.98 | 99.85 | -10.88 | 0 | undefined | undefined |
| armed | raw | 337.28 | 57.48 | -15.69 | 25 | 2.80 | 32.00 |
| armed | raw | 95.73 | 19.87 | -14.82 | 93 | 2.07 | 38.71 |
| armed | raw | 113.24 | 30.77 | -12.00 | 96 | 1.93 | 38.54 |
| armed | raw | 209.28 | 40.36 | -15.69 | 57 | 2.34 | 40.35 |
| armed | raw | 217.02 | 50.79 | -15.69 | 63 | 1.76 | 42.86 |
| armed | raw | 440.98 | 99.85 | -10.88 | 0 | undefined | undefined |
| armed | raw | 337.28 | 57.48 | -15.69 | 25 | 2.80 | 32.00 |
| armed | raw | 431.21 | 98.99 | -11.27 | 9 | 1.49 | 33.33 |
| armed | raw | 431.21 | 98.99 | -11.27 | 9 | 1.49 | 33.33 |
| armed | raw | 416.23 | 98.99 | -11.45 | 7 | 0.57 | 42.86 |
| armed | raw | 430.12 | 98.99 | -11.45 | 8 | 1.35 | 37.50 |
| armed | raw | 440.98 | 99.85 | -10.88 | 0 | undefined | undefined |
| armed | raw | 439.67 | 98.99 | -10.88 | 2 | 0.27 | 50.00 |
| armed | smooth | 95.73 | 19.87 | -14.82 | 93 | 2.07 | 38.71 |
| armed | smooth | 109.61 | 25.88 | -12.00 | 96 | 2.05 | 38.54 |
| armed | smooth | 209.28 | 40.36 | -15.69 | 57 | 2.34 | 40.35 |
| armed | smooth | 159.33 | 48.36 | -15.69 | 64 | 2.09 | 40.63 |
| armed | smooth | 440.98 | 99.85 | -10.88 | 0 | undefined | undefined |
| armed | smooth | 325.68 | 57.35 | -15.69 | 25 | 3.13 | 32.00 |
| armed | smooth | 95.73 | 19.87 | -14.82 | 93 | 2.07 | 38.71 |
| armed | smooth | 107.18 | 25.88 | -12.00 | 93 | 1.98 | 38.71 |
| armed | smooth | 209.28 | 40.36 | -15.69 | 57 | 2.34 | 40.35 |
| armed | smooth | 159.33 | 48.36 | -15.69 | 64 | 2.09 | 40.63 |
| armed | smooth | 440.98 | 99.85 | -10.88 | 0 | undefined | undefined |
| armed | smooth | 325.68 | 57.35 | -15.69 | 25 | 3.13 | 32.00 |
| armed | smooth | 431.21 | 98.99 | -11.27 | 9 | 1.49 | 33.33 |
| armed | smooth | 431.21 | 98.99 | -11.27 | 9 | 1.49 | 33.33 |
| armed | smooth | 416.23 | 98.99 | -11.45 | 7 | 0.57 | 42.86 |
| armed | smooth | 430.12 | 98.99 | -11.45 | 8 | 1.35 | 37.50 |
| armed | smooth | 440.98 | 99.85 | -10.88 | 0 | undefined | undefined |
| armed | smooth | 439.67 | 98.99 | -10.88 | 2 | 0.27 | 50.00 |

Here BIAS input remains raw in every row. Raw speed is SMA20[t]-SMA20[t-1]; smooth speed is its trailing3 mean. See full and final500 results together; do not select on full return alone. Combined cap.5 cases reduce to half rather than zero. For those cases sales include reductions; entry vetoes include capped new/add requests, and reentry means allocation above the cap. Native-guards probes production request/release protection and gives original increase priority. No new cooldown is introduced.

Predeclared combination screening pass count under both timing conventions:0. Qualified IDs:[]. Conditions: first1500 return within3 percentage points of baseline or better, first1500 drawdown no worse, final500 return and drawdown no worse. This is conditional screening on reused data.

## Context-point ablation

Native reduction intent2, hot-BIAS/speed-decline context1, close below EMA7 plus declining WMA7 jointly1, four-of-six down1. Thresholds3/4/5; original increases retain priority. Context is not mandatory and is removed in each paired case. See WEIGHTED_DESIGN.md for scopes.

| Context-point case | Full delta pp | First1500 delta pp | Final500 delta pp | DD delta pp (positive better) | Next-open full delta pp | Next-open final500 delta pp | Extra sales |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| weighted-raw-any-T3-C1 | 13.20 | 1.69 | 6.77 | 2.82 | -2.81 | 5.17 | 7 |
| weighted-raw-any-T4-C1 | 7.73 | -10.12 | 10.44 | 0.00 | 2.32 | 6.44 | 6 |
| weighted-raw-any-T5-C1 | -103.70 | 6.98 | -42.37 | -4.81 | -71.13 | -37.29 | 25 |
| weighted-raw-native-intent-T3-C1 | 17.51 | -0.22 | 10.90 | 2.82 | 6.22 | 10.18 | 3 |
| weighted-raw-native-intent-T4-C1 | 7.73 | -10.12 | 10.44 | 0.00 | 2.32 | 6.44 | 6 |
| weighted-raw-native-intent-T5-C1 | -103.70 | 6.98 | -42.37 | -4.81 | -71.13 | -37.29 | 25 |
| weighted-raw-executed-reduce-T3-C1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0 |
| weighted-raw-executed-reduce-T4-C1 | 13.89 | 6.98 | 0.00 | -0.00 | 22.56 | 0.00 | 1 |
| weighted-raw-executed-reduce-T5-C1 | -1.31 | 0.50 | -0.85 | 0.00 | -5.99 | -2.85 | 2 |
| weighted-smooth-any-T3-C1 | 13.88 | 3.23 | 6.01 | 2.82 | 5.80 | 6.24 | 3 |
| weighted-smooth-any-T4-C1 | -49.96 | -45.56 | 8.00 | -0.00 | -40.51 | 7.18 | 7 |
| weighted-smooth-any-T5-C1 | -115.30 | -0.17 | -42.49 | -4.81 | -89.85 | -36.68 | 25 |
| weighted-smooth-native-intent-T3-C1 | 11.45 | 1.30 | 6.01 | 2.82 | 5.88 | 6.24 | 0 |
| weighted-smooth-native-intent-T4-C1 | -49.96 | -45.56 | 8.00 | -0.00 | -40.51 | 7.18 | 7 |
| weighted-smooth-native-intent-T5-C1 | -115.30 | -0.17 | -42.49 | -4.81 | -89.85 | -36.68 | 25 |
| weighted-smooth-executed-reduce-T3-C1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0 |
| weighted-smooth-executed-reduce-T4-C1 | 13.89 | 6.98 | 0.00 | -0.00 | 22.56 | 0.00 | 1 |
| weighted-smooth-executed-reduce-T5-C1 | -1.31 | 0.50 | -0.85 | 0.00 | -5.99 | -2.85 | 2 |

These are account-path deltas, not isolated trade profits. Raw and smoothed speeds are separate alternatives, never two simultaneous points. Related indicators do not constitute independent votes. A higher score is not a calibrated risk probability.
