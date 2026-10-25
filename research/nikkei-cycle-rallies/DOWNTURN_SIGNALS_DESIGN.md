# Downturn-slope diagnostics

User asked which SMA/EMA/WMA period identifies more downward turning points.
User expanded the menu to3..12 sessions:30 profiles, each with
two causal signal definitions. Confirmation is positive slope crossing to
nonpositive. Early warning is still-positive normalized daily slope beginning
to decline after previously increasing or flat. Zero is a confirmation boundary,
not a negative slope. Ordinary close-derived signals cannot execute before the
following open; diagnostics here describe signal dates, not simulated fills.

Freeze the 504-session source from the existing cycle10 research, ending
2026-10-23. No new provider call, optimizer ranking or production change occurs.
Use existing registry formulas with full prior warmup. Signals are prefix causal.

Evaluation labels are retrospective, not inputs: a centered +/-5-session local
closing high followed by at least a 3% closing decline within ten sessions.
Merge peaks at most ten sessions apart, retaining the higher. Exclude incomplete
forward windows. There are22 peaks in this particular label set. Peak coverage
means a signal on/after the peak within ten sessions, not prediction accuracy.
Also count signals strictly before the first3% decline, average peak delay and
price change at the first signal. Track forward5/10-session returns and ten-day
2% declines for all signals with a complete ten-session future. These overlapping
windows are dependent and do not establish a statistical trading edge.

Primary short-period results: WMA3 has74 signals,22/22 peak coverage,1.55-session
delay and18/22 warnings before the3% decline. EMA3 has78 signals with the same
coverage/delay/timely count. WMA4 gives67,22/22,1.77 and17/22; WMA5 gives62,
22/22,2.09 and16/22. These are candidate diagnostics, not validated exit returns.

Longer-period reference results: EMA7 has60 signals,22/22 peak coverage,2.27-session delay;
WMA7 has52 signals,22/22,2.27; WMA9 has46 signals,22/22,2.95; SMA7 has44,
21/22,3.86; SMA11 has37,17/22,4.41. EMA7/WMA7 warn before the3% decline on
14/22 labels; WMA9 on13; SMA11 on6. This generous ten-day coverage does not
mean all peaks were anticipated. Only around one-fifth of EMA7/WMA7 signals
have a10-day endpoint return <=-2%; many recover after an initial decline.

SMA11 positive-slope weakening gives77 warnings,18/22 coverage and15/22 before
the3% decline. Different warning/confirmation definitions must not be ranked
as identical triggers. Current production SMA11 >0.125% protection is also
different from a zero-slope confirmation and remains unchanged.

Two focused tests verify all60 signal profiles' prefix causality and separation
of future-based label construction. Typecheck passes. The small bounded one-pass
study writes an atomic summary; restart is idempotent and requires no additional
checkpoint. Raw data and active jobs are retained without modification.

Official definitions checked2026-10-25: TradingView Moving Averages,
https://www.tradingview.com/support/solutions/43000502589-moving-averages/,
and Exponential Moving Average,
https://www.tradingview.com/support/solutions/43000592270-exponential-moving-average/.
These describe weighting/lag, not the precision of the present diagnostics.
