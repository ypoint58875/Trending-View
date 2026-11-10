# Current-v8 rebound gate comparison

2018-08-09..2026-10-26,2000 sessions, costs3bps commission+2bps slippage. Main timing is the existing Nikkei close proxy; next-open results and ledgers are saved separately.

| Policy | Full return % | First1500 % | Final500 % | MaxDD % | Audit DD % | Fills | Rebound-only entries |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| current-below-ema3 | 440.98 | 170.69 | 99.85 | -10.88 | -7.47 | 134 | 1 |
| disable-rebound | 450.90 | 175.66 | 99.85 | -10.88 | -7.47 | 132 | 0 |
| above-ema3 | 415.85 | 158.12 | 99.85 | -11.38 | -7.47 | 136 | 6 |
| any-ema3 | 415.85 | 158.12 | 99.85 | -11.38 | -7.47 | 136 | 6 |
| below-prior-high | 450.90 | 175.66 | 99.85 | -10.88 | -7.47 | 132 | 0 |
| below-sma20-nondecreasing | 450.90 | 175.66 | 99.85 | -10.88 | -7.47 | 132 | 0 |
| below-ema4 | 440.98 | 170.69 | 99.85 | -10.88 | -7.47 | 134 | 1 |
| above-prior-high | 401.86 | 151.12 | 99.85 | -11.38 | -7.47 | 136 | 6 |
| below-wma14-extra | 440.98 | 170.69 | 99.85 | -10.88 | -7.47 | 134 | 1 |

Rebound-only entry labels exclude overlapping native entries that already buy. All variants preserve native priorities, stop rules and existing-position adds. Baseline reproduces all production targets and final controller state exactly. Every variant passes serialized resume and causal-prefix checks.

## Baseline rebound-only episodes

| Entry | Exit | Net account return % | MFE % | MAE % |
| --- | --- | ---: | ---: | ---: |
| 2022-06-29 | 2022-07-12 | -1.84 | 0.03 | -3.24 |

Episode net returns include subsequent inherited account behavior and costs, and are not additive causal effects. Final500 is conditional historical research because v8 and this dataset were previously examined. No automatic parameter adoption or universal safety claim. Extra WMA14 is applied only to this fallback and does not restore old all-entry behavior.
