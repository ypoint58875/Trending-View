# WMA3 exit assistance

User asked how WMA3 helps identify clears. Test two explicit meanings against
the current EMA7/SMA11/WMA14 profile: (1) WMA3 slope nonpositive disables SMA11
protection only for an existing pending original reduction; (2) positive-to-
nonpositive WMA3 crossing clears the account regardless of an original sell.
In the forced mode, the clear overrides same-day increases/supplements and
cancels pending sells. A subsequent original buy or EMA turn may reenter under
the unchanged WMA14 flat-entry gate. Missing warmup cannot trigger either mode.

Original two-bar signal direction, fresh-buy pending cancellation and current
entry rules remain unchanged. Also run the same modes with the previous
unadopted EMA-priority hypothesis so the two hypotheses are not conflated.
Baseline complete ledgers reconcile91.44772% and70.70105%, respectively.

Current-entry comparison:91.45%/8.26% drawdown/45 fills becomes66.91%/8.87%/64
for pending release and33.99%/11.18%/80 for forced clear. Four rally coverage
falls from73.68/100/89.29/90.91% to23.68/20/57.14/45.45% and
21.05/20/57.14/45.45%. May21,2026 entry clears May28 under assistance rather
than June8; that rally's account return falls10.84 ->4.77%. Thus earlier
turn detection does not establish profitable exits under the existing reentry
logic. EMA-priority bases also worsen70.70 ->48.82/20.95%.

Signal dates use completed close data and the existing cycle close proxy with
costs; ordinary next-open sensitivity is separate. No forced terminal sell or
new optimizer ranking is introduced. Three tests cover pending-only semantics,
independent forced exit and prefix causality. Typecheck passes. Six bounded
replays atomically write ledgers then summary; restart is idempotent and needs
no new checkpoint. Production rules, source inputs and active queues stay intact.
