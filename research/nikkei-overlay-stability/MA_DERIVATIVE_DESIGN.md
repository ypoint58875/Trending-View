# EMA20 slope and curvature refinement

Follow-up to the user's clarification: separate directional bursts from ranges
and test EMA20 slope plus second derivative. Preserve the initial12-case
segmentation and outputs. Its3-day persistence can retain a rapid-up label
after a turn; do not conceal this lag or backfill old labels.

Freeze8 comparisons: slope-only, slope+efficiency, slope+curvature and all three,
each with one-session or three-session backward differences. Primary is the
combined3-session model, not a configuration selected by returns or recent fit.
All6566 frozen bars are classified; summarize last2000 and postJuly21 separately.

Let M=EMA20, A=previous completed WilderATR14, h=1 or3:
D1=(M[t]-M[t-h])/(h*A); D2=(M[t]-2*M[t-h]+M[t-2h])/(h*h*A).
Use the same lagged ATR for both derivative numerators; do not differentiate
an ATR-normalized slope, which would mix changing volatility with MA curvature.
No centered/future differences. Slope strong boundary is +/-0.05 ATR/session;
curvature warning boundary is +/-0.005 ATR/session squared.

Background: up/down if D1 exceeds its directional boundary, else range.
With efficiency, ER20<=0.30 means range; residual weak nonflat slopes are
transition. Confirm background over2 consecutive closes. While a different
candidate is pending, publish transition instead of the stale previous label.
With curvature, a strong positive slope plus negative curvature and close<EMA20
is immediately uncertain; symmetric for a negative slope and close>EMA20.
This is not an opposite-direction trade or proof of a reversal.

Separate observed burst layer, without waiting for background confirmation:
- Shock: absolute daily close move>=2 priorATR and>=2% daily return.
- Sustained five-session move>=1.5 priorATR and>=3% in the same direction,
  with aligned D1. Efficiency models additionally require ER5>=0.55.
- Curvature models may use aligned D2 instead of already aligned D1, but only
  with the same actual directional price displacement/return evidence.
Curvature alone never creates a burst. Burst labels can sit inside a range
background. Report both layers, preserving isolated-shock versus sustained reason.
Wide/normal ATR uses previous252 ATR-percent ranks and0.6/0.4 hysteresis with
three-close confirmation, unchanged from the initial prototype.

Observed-close segmentation serves description: a day's label is known only
at that close. Also store next-bar effective labels. Segment returns include
the price move used to recognize the label and are not executable returns.
No label rewrites past dates. Final segment remains open.

Evaluate curvature as an early-warning diagnostic separately from classification.
An upward warning crosses D2 above+0.005 while D1<=0; downward warning crosses
below-0.005 while D1>=0. A later same-direction D1 zero-cross within10 sessions
is a confirmation. Report warning counts, unconfirmed fraction, median lead,
unique confirmations and5-session price-direction agreement. Multiple warnings
may refer to one crossing and are not independent events. Forward prices are
used only for evaluation; last10 sessions are censored, never called failures.
Also report D1 zero-cross counts and5-session direction agreement as a comparator.
Neither a zero-cross nor positive forward return establishes a reliable trade.

Outputs under output/ma-derivatives: daily/segments/summary JSON, segment CSV,
all-source/last2000/recent PNG and REPORT.md. Atomic bounded derived reruns,
16MiB/file,10000 bars,8 models,RSS1.5GiB; no new cache/checkpoint/scheduler.
Test discrete derivative signs, constant ATR scaling, curvature without a
direction reversal, no-future warnings, confirmation/censoring, segment coverage
and all8 prefix-causal paths. Verify typecheck and inspect plots. Update state,
feature map, methods, data pipeline and cache policy; no product rules change.
