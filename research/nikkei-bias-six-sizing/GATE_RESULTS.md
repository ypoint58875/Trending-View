# Holding-add gate replacement comparison

2018-08-09..2026-10-26;2000 daily sessions;current v10;frozen winners;3bps commission+2bps slippage. Identity:9d56f7f9ecb3b8ff9651b2cff299e18e729c3ed244d209e6c93644510f0bde4b.

| Gate | Net % | MaxDD % | Fills | First1000 % | Next500 % | Final500 % | Next-open % | Stress20bps % | Blocked requests | Active days |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| current | 458.46 | -10.88 | 129 | 90.10 | 47.00 | 99.85 | 496.58 | 366.18 | 2 | 562 |
| off | 454.00 | -10.88 | 130 | 89.73 | 46.11 | 99.85 | 483.14 | 361.49 | 0 | 0 |
| bias | 463.09 | -10.88 | 128 | 89.67 | 48.55 | 99.85 | 496.11 | 371.03 | 5 | 563 |
| slope | 455.65 | -10.88 | 129 | 90.30 | 46.11 | 99.85 | 486.34 | 363.83 | 2 | 277 |
| and | 455.65 | -10.88 | 129 | 90.30 | 46.11 | 99.85 | 486.34 | 363.83 | 2 | 50 |
| or | 463.09 | -10.88 | 128 | 89.67 | 48.55 | 99.85 | 496.11 | 371.03 | 5 | 790 |
| current-plus-slope | 459.04 | -10.88 | 129 | 90.30 | 47.00 | 99.85 | 492.93 | 366.66 | 3 | 803 |
| current-plus-and | 459.04 | -10.88 | 129 | 90.30 | 47.00 | 99.85 | 492.93 | 366.66 | 3 | 580 |

Current=previous-session BIAS down3. Bias/slope/AND/OR REPLACE the current gate and act on the current close. Slope means first downturn of SMA3 of SMA20 daily point differences, not negative slope. Off disables only this add gate. Current-plus variants retain the old gate and add same-day restrictions. All gate masks only affect existing invested holding-add requests. Native flat entries,reductions,risk exits and range3 protection remain. Blocked requests counts raw increase requests while invested, not necessarily fills that would otherwise execute.

Eight cases pass serialized controller/account recovery and causal prefixes. Current and same-close BIAS match original native paths. Feature injection is per-instance and clone-isolated; shared production cache remains unchanged. No production/account changes. Bounds:10000bars,2048decisions,16MiB/file,1.5GiB RSS;peak132.83MiB. Atomic per-case state supports --limit2 then resume. Historical final500 is reused,not an untouched holdout. Next-open shifts the same close-generated targets and is only timing sensitivity. Close remains the Nikkei proxy,not actual domestic execution.
