# RSI10 first overbought pullback results

Frozen2000 sessions2018-08-09..2026-10-26,1293 original decisions; current v8
baseline, not v7. Source b543028a5db9860a9ac262d8bf65cf6df06f8d625afba728d875ce0d0274873e.
Primary scope tracks market episodes, only acts when previously holding. Strict
crossing above70 arms, first RSI decline consumes; rearm on a new crossing.
RSI decline may occur while still above70. Never repeat every declining day.

## Close-proxy comparison

Percent returns and positive drawdown magnitudes; guarded retains native-buy
priority, holding period and SMA11/WMA7 protection. No-signal force skips every
original strategy signal. Risk-first force overrides ordinary signals/guards.

| Added rule | Total | Final500 | Max drawdown |
|---|---:|---:|---:|
| None: current v8 |440.98|99.85|10.88|
| First RSI fall, guarded |440.98|99.85|10.88|
| First RSI fall, no-signal force |320.88|88.63|14.82|
| First RSI fall, risk-first force |276.89|72.56|14.82|
| Cross back to <=70, guarded |402.97|99.85|10.88|
| Cross back to <=70, no-signal force |375.85|79.48|14.82|
| Cross back to <=70, risk-first force |333.45|65.50|14.82|

First closing-price decline produces exactly the same targets as first RSI
decline on this fixture. Under shared Wilder RSI these are closely related,
not independent corroborating indicators. Guarded first decline has57 market
triggers,52 while holding,50 accepted reduction requests and2 native-buy vetoes;
all2000 final targets remain identical to v8. Protection/pending cancellation
adds no marginal liquidation. Risk-first executes39 added forced liquidations;
no-signal force executes24. Trades rise from134 to185/165 respectively.

Held-only arming also fails: guarded440.98/99.85/10.88, no-signal force
337.65/88.63/14.82, risk-first285.83/69.89/14.82. Cross-back guarded changes13
market-scope target bars, despite no same-day marginal target difference: pending
requests execute later. Therefore audit omissions include all accepted requests,
not just contemporaneous target changes.

## Timing and sensitivity

Ordinary next-open matched replay baseline465.36/106.91/9.44; first-fall guarded
identical, no-signal force365.97/101.49/11.80, risk-first341.90/84.34/11.80.
Cross-back guarded432.94/106.91/9.44, no-signal force409.05/86.92/11.80,
risk-first371.56/70.10/11.80. Do not compare ordinary timing with close-proxy rows.

54 variants cover thresholds65/70/75, three definitions, two arming scopes and
three priorities. None strictly improve both full and final500 close-proxy
returns; none reduce close-proxy maximum drawdown relative to v8. These are
in-sample sensitivity checks, not independently held-out confirmation.

Omitting each primary70 market-scope forced/requested event individually still
leaves all forced variants below v8 total return: first-fall no-signal total
307.09..368.57, risk-first264.54..319.60. Guarded remains identical under all50
omissions. Cross-back guarded total402.97..427.93 under51 request omissions.
Forward returns are descriptive only: after the2026-04-17 risk-first sell signal
(RSI72.22 to64.60), index close rises7.45% over10 sessions;2023-05-08 rises7.38%.
Actual missed exposure depends on subsequent reentries, not this entire move.

## Decision and verification

Do not promote this standalone liquidation trigger. It detects momentum cooling,
not necessarily a trend reversal, and protected implementation is redundant here.
Any later price/EMA weakness conjunction is a separate hypothesis requiring a
new prespecified test, not a proven improvement. Production v8/accounts unchanged.

Five focused tests verify strict threshold, plateaus, one-shot consumption, flat
scope, causal completed prefixes, v8 target anchor and priority/omission behavior.
Typecheck and targeted ESLint pass. Reproduce with npx tsx --test
research/nikkei-overlay-stability/rsi-first-pullback.test.ts then npx tsx
research/nikkei-overlay-stability/rsi-first-pullback.ts. Atomic summary includes
source/code identities, all55 rows, event details, next-open metrics and audits
under output/rsi-first-pullback/. No full optimization or market refresh needed.
