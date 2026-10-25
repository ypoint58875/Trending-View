# Trend-quality confirmation extension

The first nine joint rules recover rallies but lose substantial extra exposure
after 2026-06, when slow selected targets remain long. This is a disclosed second
research round on already seen history, not a fresh validation sample. Freeze
these five confirmation families before replay; do not tune individual dates.
Reuse the original causal 22-candidate selections and five windows unchanged.

For each 20/40, 40/80, 60/120 pair test:

1. EMA confirmation: both selected longer targets long AND price above EMA10
   AND EMA10 rising -> full target, else accept the actual ten-session target.
2. Efficiency confirmation: both longer targets long AND close>SMA20 AND
   positive 20-session momentum AND efficiency ratio20>=0.25 -> full, else A10.
   Efficiency ratio is absolute 20-session net change divided by the sum of
   absolute daily changes over those sessions.
3. Directional confirmation: both longer targets long AND ADX14>=20 AND
   +DI14>-DI14 -> full, else A10.
4. Breakout/loss-of-support: both longer targets long AND close above the
   preceding ten highs confirms full; two closes below EMA10 or both longer
   targets cash releases to A10. Before release retain max(previous,A10).
5. Protected weighted50: original 50/20/20/10 score with entry>=50 also requires
   close>EMA10. Score<=20 or two closes below EMA10 releases to A10; otherwise
   retain max(previous,A10). Technical score component remains the original
   close>SMA20 plus positive SMA20 slope, not a newly fitted indicator.

There is one final target. The original ten-session result remains a continuously
computed evidence source; no capital is allocated between independent sleeves.
All fifteen extension outcomes and the original nine must remain visible.
Complete the same causal, cost and next-open checks and report any apparent
benchmark excess as retrospective evidence requiring independent validation.
