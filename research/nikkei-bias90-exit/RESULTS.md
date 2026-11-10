# BIAS20 P90 exit study

2018-08-09..2026-10-26,2000 sessions. Costs:3bps commission plus2bps slippage. Current-v8 frozen winners. Main returns use existing Nikkei close proxy; next-open sensitivity is separate.

| Policy | Full % | First1500 % | Final500 % | MaxDD % | Fills | Extra sales | Entry vetoes | Reentry within5 | Next-open full % |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 440.98 | 170.69 | 99.85 | -10.88 | 134 | 0 | 0 | 0 | 465.36 |
| raw-raw-same-day | 343.62 | 123.18 | 98.77 | -11.65 | 164 | 31 | 5 | 8 | 412.18 |
| raw-raw-armed | 261.87 | 106.63 | 75.13 | -11.65 | 174 | 38 | 6 | 13 | 321.68 |
| raw-smooth-same-day | 427.61 | 164.48 | 99.49 | -11.65 | 157 | 22 | 1 | 4 | 458.91 |
| raw-smooth-armed | 300.70 | 130.69 | 73.70 | -12.54 | 172 | 38 | 1 | 10 | 366.47 |
| smooth-raw-same-day | 331.07 | 134.03 | 84.20 | -11.65 | 168 | 31 | 6 | 9 | 368.74 |
| smooth-raw-armed | 329.48 | 133.98 | 83.55 | -12.54 | 172 | 37 | 6 | 12 | 338.50 |
| smooth-smooth-same-day | 381.90 | 150.78 | 92.16 | -11.65 | 162 | 27 | 2 | 7 | 423.41 |
| smooth-smooth-armed | 313.80 | 132.16 | 78.24 | -12.54 | 168 | 36 | 2 | 8 | 370.48 |
| smooth-smooth-same-day-turn | 360.52 | 139.65 | 92.16 | -11.65 | 160 | 25 | 1 | 6 | 406.80 |
| smooth-smooth-armed-turn | 296.98 | 122.72 | 78.24 | -12.54 | 168 | 35 | 1 | 9 | 355.10 |
| smooth-smooth-armed-negative | 435.76 | 176.26 | 93.93 | -10.88 | 134 | 5 | 0 | 1 | 473.20 |

Primary smooth-smooth-armed forward price statistics after actual additional sales:

```json
{
  "5": {
    "n": 36,
    "mean": 0.3109033054907888,
    "median": 0.2732261501726785,
    "downPct": 47.22222222222222
  },
  "10": {
    "n": 36,
    "mean": 0.742824490210583,
    "median": 0.142984781672284,
    "downPct": 47.22222222222222
  },
  "20": {
    "n": 36,
    "mean": 1.8477560486702673,
    "median": 2.5699610362134195,
    "downPct": 36.11111111111111
  }
}
```

Primary positive-speed sales:35/36. These exits can occur while SMA20 is still rising. Reentry rules are unchanged; no extra cooldown. Armed threshold memory resets at native flat or additional exit. Native entry vetoes do not represent a buy and sell at the same close.

P90 uses preceding three calendar years of raw BIAS, excluding current close, minimum252. Raw and smooth refer to tested current curve values, not different quantile samples. Strict-turn requires a nonnegative prior speed change followed by a negative change; negative means speed below zero.

Baseline targets AND final state match production; all12 variants pass causal prefixes and serialized resume. Forward windows overlap and ignore whether the account reentered; they are descriptive, not avoided-loss estimates. Whole-account returns include inherited path and fees. Final500 is reused historical data, not an untouched holdout. No production adoption.

## Isolating one-day versus three-day speed

| Raw BIAS20 gate | Speed | Full % | Final500 % | MaxDD % | Extra sales | Forward20 mean % | Forward20 down % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| same-day | raw | 343.62 | 98.77 | -11.65 | 31 | 2.16 | 35.48 |
| armed | raw | 261.87 | 75.13 | -11.65 | 38 | 2.39 | 28.95 |
| same-day | smooth | 427.61 | 99.49 | -11.65 | 22 | 1.91 | 27.27 |
| armed | smooth | 300.70 | 73.70 | -12.54 | 38 | 1.95 | 31.58 |

Here BIAS input remains raw in every row. Raw speed is SMA20[t]-SMA20[t-1]; smooth speed is its trailing3 mean. See full and final500 results together; do not select on full return alone. Combined cap.5 cases reduce to half rather than zero. For those cases sales include reductions; entry vetoes include capped new/add requests, and reentry means allocation above the cap. Native-guards probes production request/release protection and gives original increase priority. No new cooldown is introduced.

Predeclared combination screening pass count under both timing conventions:0. Qualified IDs:[]. Conditions: first1500 return within3 percentage points of baseline or better, first1500 drawdown no worse, final500 return and drawdown no worse. This is conditional screening on reused data.
