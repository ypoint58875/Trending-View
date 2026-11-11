# Bullish-engulfing entry priority

The v12 control gives the original strategy priority over supplemental
entries. Compare promoting the existing bullish-engulfing entry over
resolved reduction signals only, and promoting it over every original
signal. Both variants require actual prior-close flatness and an expired
stop wait. The native engulfing predicate, full allocation, supplemental
hold and risk rules are reused. The winning strategy is still selected and
carried on each eligible date.

| Priority | Net return | Maximum drawdown | Last 500 | Last 250 | Fills |
| --- | ---: | ---: | ---: | ---: | ---: |
| Current v12 | 434.03% | 8.95% | 108.20% | 56.52% | 135 |
| Engulfing before reductions | 460.39% | 8.95% | 108.20% | 56.52% | 135 |
| Engulfing before all signals | 460.39% | 8.95% | 108.20% | 56.52% | 135 |

The frozen 2,000 sessions span 2018-08-09 to 2026-10-26. Each account
recalculates its holding-dependent bearish screening calendar, with all
winners available from exact cached requests. All three accounts accept
134 holding-dependent dates, with calendar differences between the
control and promoted variants. The two promoted paths are identical on
every session.

Four eligible flat engulfing dates occurred. The only signal conflict was
2022-02-04. The selected strategy's two-bar sequence increased then
reduced, which suppressed the native supplemental entry. Both variants
enter at that close, then exit on 2022-02-17. The control enters on
2022-02-16 and exits on 2022-02-24. The promoted round trip loses 0.85%
after costs versus 5.52% for the control. The promotion changes 11 target dates,
improves full return by 26.37 percentage points, and improves terminal
equity by 4.94% relative to the control. This improvement comes from one
historical conflict.

Reordering engulfing before the EMA7 supplemental entry alone leaves the
flat-account outcome unchanged when both qualify. Each sets full
allocation, clears any pending reduction and starts the same supplemental
hold. The native engulfing shape requires a bearish preceding candle, so
it cannot coincide with the two-bullish-candle restoration gate on the
same day.

Run `node --import tsx research/nikkei-holding-rescreen/engulfing-priority.ts`
after the flat-rise baseline is generated. The replay writes
`flat-rise/engulfing-priority.json` under the completed holding study's
output directory. The baseline matches the fixed-calendar control exactly.
An independent accounting pass matched the return, both trailing windows,
drawdown and fill count on all three paths. This is a research replay.
