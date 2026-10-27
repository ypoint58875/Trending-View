# Actual entry and full-liquidation source shares

Research only. Use the unchanged frozen full-screen-6-15 source, decisions,
current v6 daily4-ema3-baseline account and2000-bar contribution ledger.
Do not modify product rules, rescreen winners or fetch market data.

An entry means actual target allocation0->positive; liquidation means positive
->0 at the completed Nikkei-close proxy. Partial increases/decreases are
separate. Raw signal days, flat-to-held transitions and fills have different
denominators. Every event is counted once. Entry sources: original strategy,
native EMA turn/SMA20, bullish engulfing, stopped-target recovery, extra rebound.

Liquidation attribution distinguishes original sell intention from timing:
original immediate zero-target request; earlier original zero-target request
released later by protection rules; independent native early hard stop. Preserve
the first still-pending zero request's date across repeated reductions; original
increases cancel it. Partial reduction requests cannot originate a liquidation.
Stops take execution precedence and clear pending origin. Original signals
present on the stop day do not turn an independent stop into a strategy exit.
Deferred exits remain strategy-originated, rule-timed joint actions, not an
independent sell signal emitted by a moving average.

Trace the existing research DualAccount only after asserting every before/after
target against the unchanged production SmaPositionOverlay and prior contribution
ledger. Track pending origins causally; assert each ordinary full liquidation
has a valid zero-target request. Persist all entry/exit events, pending origins,
delays and execution-date signal presence. Full, final500 and postJuly21 windows
inherit one continuous account and count events by execution date, with no
synthetic boundary entries/exits. Report count fractions, not profit shares.

Files: signal-share-study.ts/test and this design. Separate atomic bounded
output/signal-share/{summary.json,events.json,REPORT.md}; update CODEX_STATE,
FEATURE_MAP, TECH_RESEARCH, DATA_PIPELINE and CACHE_POLICY. Validate source/bar/
decision identities, all2000 targets, event totals, percentages, hold/conflict,
pending cancellation/repetition and partial-versus-full semantics. This finite
2000-step read-only replay needs no checkpoint, growing cache or scheduler;
interruption reruns safely. Bounds16MiB/input,10000 bars,2048 decisions. Preserve
all frozen sources, existing checkpoints and outputs.
