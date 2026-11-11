# Two-session low rebound entry

The user selected the first and second trading sessions AFTER the low.
Keep every current v12 entry and add an alternative to the bullish-engulfing
empty-account branch. Use the latest lowest OPEN in the trailing five bars
including today. Its preceding ten bars' maximum CLOSE must be at least
5% above it, measured as `1 - low / peak >= 0.05`. Today must be one or two
trading bars after that low and `close / low - 1 > 0.04`.

As with the existing engulfing entry, this branch fills the target to 100%
when flat, without an original strategy signal and after the stop waiting
period. It shares that branch's priority and supplemental seven-bar minimum
hold. Its condition imposes no candle color, WMA, EMA, RSI or SMA20 gate.
The lowest open need not have occurred while the account was flat.

Use the frozen 2,000-session input ending 2026-10-26 with the current v12
overlay, 3 bps commission and 2 bps slippage, and the daily Nikkei close
execution proxy. Derive each variant's extra screening dates chronologically
from its own actual holdings. Reuse validated full ten-session/max-six
screening winners and compute only missing dates using the existing child
optimizer and atomic per-date checkpoints. Read matching jobs from the
original study, prefetch and exit-timing directories. Do not clean raw data.

Run `node --import tsx research/nikkei-holding-rescreen/entry-two-day.ts`.
Results commit atomically under `output/<identity>/entry-two-day`. The
research account is bounded to 2,000 rows and restarts cheaply from the
beginning, reusing durable optimizer jobs. Compare full, trailing 500 and
250 session returns, drawdown, fills, and actual added entry dates. Verify
baseline production parity and independently recompute every signal and
return window. This research does not alter the application's v12 rules.
