# BIAS20 P90 exit study

2018-08-09..2026-10-26,2000 sessions. Costs:3bps commission plus2bps slippage. Current-v8 frozen winners. Main returns use existing Nikkei close proxy; next-open sensitivity is separate.

| Policy | Full % | First1500 % | Final500 % | MaxDD % | Fills | Extra sales | Entry vetoes | Reentry within5 | Next-open full % |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 440.98 | 170.69 | 99.85 | -10.88 | 134 | 0 | 0 | 0 | 465.36 |
| raw-raw-armed | 261.87 | 106.63 | 75.13 | -11.65 | 174 | 38 | 6 | 13 | 321.68 |
| raw-smooth-armed | 300.70 | 130.69 | 73.70 | -12.54 | 172 | 38 | 1 | 10 | 366.47 |
| raw-raw-armed-two-day | 351.27 | 155.16 | 76.85 | -11.65 | 168 | 30 | 2 | 13 | 354.86 |
| raw-raw-armed-ema7 | 288.60 | 154.29 | 52.82 | -15.69 | 168 | 32 | 0 | 19 | 301.92 |
| raw-raw-armed-sma20 | 334.29 | 151.67 | 72.56 | -10.88 | 141 | 6 | 0 | 4 | 367.77 |
| raw-raw-armed-slope60 | 357.46 | 167.93 | 70.74 | -15.69 | 166 | 37 | 0 | 14 | 432.71 |
| raw-raw-armed-four-down | 312.59 | 144.96 | 68.43 | -15.69 | 168 | 34 | 2 | 12 | 322.03 |
| raw-raw-armed-two-day-ema7 | 315.62 | 151.21 | 65.45 | -14.82 | 160 | 22 | 0 | 14 | 329.18 |
| raw-raw-armed-wma7 | 305.97 | 161.63 | 55.17 | -15.69 | 166 | 33 | 0 | 18 | 331.08 |
| raw-raw-armed-native-guards | 339.44 | 151.39 | 74.81 | -10.88 | 142 | 8 | 0 | 7 | 369.75 |
| raw-raw-armed-ema7-half | 322.87 | 140.61 | 75.75 | -11.19 | 174 | 28 | 1 | 10 | 339.25 |
| raw-raw-armed-two-day-ema7-half | 317.51 | 135.05 | 77.63 | -11.19 | 160 | 20 | 0 | 5 | 338.67 |
| raw-smooth-armed-two-day | 358.29 | 157.55 | 77.94 | -11.65 | 174 | 35 | 0 | 19 | 376.17 |
| raw-smooth-armed-ema7 | 300.13 | 158.64 | 54.70 | -15.69 | 164 | 28 | 0 | 16 | 335.21 |
| raw-smooth-armed-sma20 | 334.29 | 151.67 | 72.56 | -10.88 | 141 | 6 | 0 | 4 | 367.77 |
| raw-smooth-armed-slope60 | 251.87 | 120.60 | 59.51 | -15.69 | 174 | 37 | 0 | 15 | 325.56 |
| raw-smooth-armed-four-down | 269.65 | 126.02 | 63.55 | -15.69 | 172 | 36 | 1 | 12 | 307.87 |
| raw-smooth-armed-two-day-ema7 | 299.96 | 144.01 | 63.91 | -14.82 | 158 | 21 | 0 | 16 | 332.86 |
| raw-smooth-armed-wma7 | 289.30 | 150.23 | 55.58 | -15.69 | 166 | 30 | 0 | 17 | 319.22 |
| raw-smooth-armed-native-guards | 336.49 | 153.57 | 72.14 | -10.88 | 144 | 9 | 0 | 8 | 350.37 |
| raw-smooth-armed-ema7-half | 317.59 | 141.23 | 73.11 | -11.19 | 172 | 26 | 1 | 9 | 347.65 |
| raw-smooth-armed-two-day-ema7-half | 356.15 | 145.47 | 85.83 | -9.79 | 159 | 19 | 1 | 8 | 391.54 |

Primary raw-smooth-armed forward price statistics after actual additional sales:

```json
{
  "5": {
    "n": 38,
    "mean": 0.32775418613339574,
    "median": 0.2732261501726785,
    "downPct": 47.368421052631575
  },
  "10": {
    "n": 38,
    "mean": 0.7464085363202794,
    "median": 0.24417617477722198,
    "downPct": 44.73684210526316
  },
  "20": {
    "n": 38,
    "mean": 1.9496757162131946,
    "median": 2.8452821358922242,
    "downPct": 31.57894736842105
  }
}
```

Primary positive-speed sales:38/38. These exits can occur while SMA20 is still rising. Reentry rules are unchanged; no extra cooldown. Armed threshold memory resets at native flat or additional exit. Native entry vetoes do not represent a buy and sell at the same close.

P90 uses preceding three calendar years of raw BIAS, excluding current close, minimum252. Raw and smooth refer to tested current curve values, not different quantile samples. Strict-turn requires a nonnegative prior speed change followed by a negative change; negative means speed below zero.

Baseline targets AND final state match production; all23 variants pass causal prefixes and serialized resume. Forward windows overlap and ignore whether the account reentered; they are descriptive, not avoided-loss estimates. Whole-account returns include inherited path and fees. Final500 is reused historical data, not an untouched holdout. No production adoption.

## Isolating one-day versus three-day speed

| Raw BIAS20 gate | Speed | Full % | Final500 % | MaxDD % | Extra sales | Forward20 mean % | Forward20 down % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| armed | raw | 261.87 | 75.13 | -11.65 | 38 | 2.39 | 28.95 |
| armed | smooth | 300.70 | 73.70 | -12.54 | 38 | 1.95 | 31.58 |
| armed | raw | 351.27 | 76.85 | -11.65 | 30 | 3.36 | 23.33 |
| armed | raw | 288.60 | 52.82 | -15.69 | 32 | 3.70 | 28.13 |
| armed | raw | 334.29 | 72.56 | -10.88 | 6 | 3.95 | 16.67 |
| armed | raw | 357.46 | 70.74 | -15.69 | 37 | 1.71 | 35.14 |
| armed | raw | 312.59 | 68.43 | -15.69 | 34 | 3.08 | 32.35 |
| armed | raw | 315.62 | 65.45 | -14.82 | 22 | 4.13 | 27.27 |
| armed | raw | 305.97 | 55.17 | -15.69 | 33 | 2.84 | 33.33 |
| armed | raw | 339.44 | 74.81 | -10.88 | 8 | 5.01 | 12.50 |
| armed | raw | 322.87 | 75.75 | -11.19 | 28 | 2.97 | 32.14 |
| armed | raw | 317.51 | 77.63 | -11.19 | 20 | 3.67 | 30.00 |
| armed | smooth | 358.29 | 77.94 | -11.65 | 35 | 2.21 | 34.29 |
| armed | smooth | 300.13 | 54.70 | -15.69 | 28 | 3.42 | 32.14 |
| armed | smooth | 334.29 | 72.56 | -10.88 | 6 | 3.95 | 16.67 |
| armed | smooth | 251.87 | 59.51 | -15.69 | 37 | 2.73 | 29.73 |
| armed | smooth | 269.65 | 63.55 | -15.69 | 36 | 2.94 | 30.56 |
| armed | smooth | 299.96 | 63.91 | -14.82 | 21 | 4.12 | 28.57 |
| armed | smooth | 289.30 | 55.58 | -15.69 | 30 | 3.28 | 33.33 |
| armed | smooth | 336.49 | 72.14 | -10.88 | 9 | 6.03 | 11.11 |
| armed | smooth | 317.59 | 73.11 | -11.19 | 26 | 3.01 | 34.62 |
| armed | smooth | 356.15 | 85.83 | -9.79 | 19 | 3.55 | 31.58 |

Here BIAS input remains raw in every row. Raw speed is SMA20[t]-SMA20[t-1]; smooth speed is its trailing3 mean. See full and final500 results together; do not select on full return alone. Combined cap.5 cases reduce to half rather than zero. For those cases sales include reductions; entry vetoes include capped new/add requests, and reentry means allocation above the cap. Native-guards probes production request/release protection and gives original increase priority. No new cooldown is introduced.

Predeclared combination screening pass count under both timing conventions:0. Qualified IDs:[]. Conditions: first1500 return within3 percentage points of baseline or better, first1500 drawdown no worse, final500 return and drawdown no worse. This is conditional screening on reused data.
