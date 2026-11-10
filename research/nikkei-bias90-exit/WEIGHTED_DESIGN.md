# Weighted exit contribution study

User requested this signal as one decision weight alongside other liquidation
conditions. Prior conjunctive experiments do not answer incremental score value.
No production adoption. Freeze37 cases: baseline plus2 speed conventions times
3 scopes times3 thresholds times2 context weights, before examining results.

Score: native reduction intent2; raw BIAS20 previously above causal P90 during
the current holding and currently falling raw/SMA3 SMA20 speed1; close<EMA7 AND
WMA7 declining1; at least4 of6 smoothed context curves declining1. Maximum5.
Thresholds3/4/5. Short-price conditions share a single point. All features still
derive from related prices; scores are not independent evidence or calibrated
probabilities. The context contributes a point, not a mandatory gate. Pair every
case with contextWeight0 at the same threshold/scope to isolate contribution.

Scopes: any score-qualified day; only existing native reduction intent (current
reduce signal or pending before/after native close); only native allowed actual
partial reduction. Native full exits have already happened and add no action.
Original increases always take priority. Weighted full exits can bypass normal
holding/trend guards only in the first two scopes, as explicitly tested.

Same frozen input, causal production indicators, original winners, fees,
close-proxy and next-open timing, source backup, bounded state and atomic
restart behavior as DESIGN.md. Warming/memory reset follows holding state.
No threshold optimization after inspection. Previous historical study remains
conditional reused data, not fresh holdout. No new app/lib changes.

Qualification reuses the existing first1500/final500 return/drawdown conditions
under both timings. Additionally compare every weighted case to its no-context
ablation, reporting segment returns/drawdowns and added exits. Improvements of
a scoring system do not prove value from the context point unless the paired
comparison also supports it. Saved weighted ledger stores score/context bit.
Mandatory incremental tests cover ablation, original increase priority, scope,
threshold boundaries and all37 serialized resumes/causal prefixes.
