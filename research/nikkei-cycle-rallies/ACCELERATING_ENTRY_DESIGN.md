# Positive accelerating SMA12 supplemental entry

User proposed supplementing while flat when SMA12 turns positive OR when its
daily normalized slope is already positive and strictly greater than yesterday.
Define slope as SMA12(t)/SMA12(t-1)-1. Negative-but-improving and equal slopes
cannot satisfy the added condition. No threshold is optimized in this study.

Reuse the production SmaPositionOverlay for original requests, positive turns,
SMA11 negative-slope flat-entry gate, pending exits and SMA12 >0.2% protection.
After its daily close processing, request an increase only if still flat,
there is no original raw signal, and positive acceleration is true. Route that
request through the same controller so the independent entry gate still applies.
No later automatic retry is introduced. Supplemental targets remain full exposure.

Use the frozen cycle10 source/winners/costs and close proxy. Compare the current
three-flag control with extension; also compare both with the SMA11 gate disabled
as a diagnostic. Reconcile all control fills. Next-open sensitivity is separate.
Four sequential bounded replays need no new checkpoint; atomic ledgers precede
the summary. Restart is idempotent; sources and production preferences stay intact.

The extension raises four range coverage from 63.16/20/78.57/90.91 to
71.05/80/78.57/90.91 percent, but lowers total return 83.05769 ->72.39681 percent,
increases drawdown magnitude 8.10929 ->9.67576 percent and fills 57 ->70.
Range returns become 9.65/0.46/17.37/10.84 percent. Six acceleration-triggered
entries occur in its own path; these are not a count of net additional trades.
Disabling the gate also worsens the same comparison (74.63 ->65.10 percent).
Same-target next-open sensitivity gives 79.01 ->77.16 percent with the gate.
These repeatedly viewed data are not an independent holdout. No production rule
change is justified by this comparison alone.
