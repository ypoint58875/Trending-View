# Next-session BIAS20 add-gate adoption check

User clarified that only this rule acts on the next session; the Nikkei page retains its existing close proxy. A close-confirmed BIAS20 SMA3 decline streak>=3 blocks holding adds on the following session. Flat entries, reductions and stops are unchanged. A flat/rising observation removes the next-session restriction; no deferred buy is invented.

| Case | Full % | MaxDD % | Final500 % | Fills | Blocked adds |
| --- | ---: | ---: | ---: | ---: | ---: |
| baseline | 440.98 | -10.88 | 99.85 | 134 | 0 |
| same-close-filter-reference | 444.10 | -10.88 | 99.85 | 133 | 4 |
| next-session-filter-cycle-close | 445.34 | -10.88 | 99.85 | 133 | 2 |
| baseline-next-open | 465.36 | -9.44 | 106.91 | 134 | 0 |
| next-open-filter-no-extra-lag | 473.38 | -9.28 | 106.91 | 133 | 4 |

Ordinary next-open execution reads the signal-close gate without another lag. Cycle close execution reads the previous session's gate. Do not claim473.38% for the cycle-close configuration. Reference gate uses independent literal20-close means and3-point averages; all13132 boolean comparisons agree. Five paths pass serialized account resume and causal prefixes. Same frozen2000 sessions2018-08-09..2026-10-26,3bps commission+2bps slippage; not prospective validation. No production implementation at this check stage.
