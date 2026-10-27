# RSI first pullback after overbought

Research only; production v8 and saved accounts remain unchanged. Reuse frozen
2000 sessions ending2026-10-26 and1293 original decisions, with v8 as baseline.
Compare first RSI decline after a strict crossing above70, first closing-price
decline, and crossing back to <=70. A trigger consumes its episode even if flat,
protected or vetoed by a native buy; rearm only on a new crossing above threshold.
An RSI plateau is not a decline. Simultaneous crossing and trigger is allowed.
Market scope tracks all episodes; held scope only arms when already holding and
resets when flat. No future bars or data from before evaluation arm a trigger.

Test thresholds65/70/75 as neighbors, both scopes, three triggers and priorities:
guarded pending reduction with native-buy veto; force only without native signal;
risk-first force. Existing v8 entries and hard risks remain. Force resets account
entry/recovery state without adding a waiting period, matching prior research.
Compare close-proxy and ordinary next-open full2000/final500 returns and drawdown,
four chronological500-session blocks, trigger counts and marginal executions.
Omit each marginal event for representative70-market rows and the best primary
row to expose dependence. These are in-sample variants, not independent holdout.

Files: rsi-first-pullback.ts/test.ts and this design/results; docs CODEX_STATE,
FEATURE_MAP, TECH_RESEARCH, DATA_PIPELINE, CACHE_POLICY and DATA_SOURCES.
No production, optimizer, protocol, UI or account migration changes. Inputs are
bounded to10000 bars/16MiB, grid55 rows; synchronous replay is short-lived and
bounded. Persist atomic output with source/code hashes; deterministic full rerun
is cheaper than checkpoint complexity. Preserve old source and research output.

References accessed2026-10-27:
- https://www.tradingview.com/support/solutions/43000614331-technical-ratings/
  uses RSI above70 and falling as a sell component, not this exact first event.
- https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/RSI
  warns that RSI can remain overbought in strong trends.
Compare early momentum warning versus confirmed threshold exit; neither is
assumed superior. Evaluate through the existing versioned account, not a second
indicator/backtesting implementation.
