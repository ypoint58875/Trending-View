# Single-account regime detection study

This supersedes the allocation-blend recommendation as the active research
question. The user wants to identify the four rally regimes, not split capital.
They authorized longer horizons, alternative strategies, and weighted indicator
evidence such as a seven-session SMA slope turning positive.

## Rules frozen before this replay

The seven-session slope was an example, not a requested fixed parameter.
Use only completed daily bars. Compare these fourteen bounded, fixed detectors:

- Positive SMA7 one-session slope, with immediate exit on nonpositive slope.
- Positive SMA20 one-session slope, with immediate exit on nonpositive slope.
- Positive SMA7 slope for two closes, exit after two nonpositive closes.
- Price above SMA20, exit after two closes below SMA20.
- Price above SMA60, exit after two closes below SMA60.
- Price above SMA120, exit after two closes below SMA120.
- EMA10 above EMA30, immediate exit otherwise.
- Positive SMA7 slope and close above SMA20; exit after two closes below SMA60.
- Same fast entry, exit after two closes below SMA120.
- Score >=70 entry; score <=40 for two closes to exit.
- Score >=90 entry; score <=40 for two closes to exit.
- At least two positive slopes among SMA7/20/60, exit after two closes with
  fewer than two positive slopes.
- Close above the previous ten highs, exit below previous five lows.
- Close above the previous twenty highs, exit below previous ten lows.

Score = 40*I(slope7>0) + 30*I(close>SMA20) + 20*I(slope20>0)
+ 10*I(close>SMA60). Weights express evidence, never capital sleeves.
Slope is SMA(t)/SMA(t-1)-1. In particular SMA7(t)-SMA7(t-1) equals
(close(t)-close(t-7))/7, so a positive slope is a short momentum observation,
not an independent predictive guarantee. Entry is evaluated at each completed
close. A weak score in the hysteresis gap preserves the current regime.

Each detector receives two full-history replays: stand-alone long/cash, and
single-account trend-priority switching. In the latter, an active bullish
regime uses 100% target and suppresses tactical exits; regime termination
clears the account. Outside bullish regimes, subsequent original ten-session
decision signals operate on this same inherited account. A termination close
has priority over the tactical signal. No independent account or fund split
is used. A separate 10-session baseline and holding control remain.

Report exact onset dates, within-window active sessions and interruptions,
whole-history returns/drawdowns/costs, 5/10/20-session post-onset outcomes,
and close/next-open sensitivity. Post-onset nonpositive 10-session return is
explicitly a diagnostic, not a universal definition of a false signal.
All variants are disclosed; these are retrospective tests on already seen
dates, not untouched forward validation. No threshold is fit to a specific
rally's start/end. No production strategy changes are authorized by this study.

The prior frozen 298-selection input and its hashes are reused without network
refresh or repeated optimization. Atomic per-rule files/checkpoints provide
safe resume; only bounded arrays and fixed rule count are held in memory.
