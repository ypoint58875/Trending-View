# Post-reduction increase cooldown

User confirmed the restriction includes reopening after a full exit. No
production trading rules, accounts, screening winners or source archives changed.

## Conclusion

The fixed seven-case test does not support adding a universal cooldown on this
sample. X0 returns440.98%,maxDD10.88%,134 fills. X1 gives404.39%/11.98%/126;
X2 384.82%/11.98%/120; X3 359.26%/11.98%/115; X5 350.48%/11.98%/115;
X7 282.54%/12.03%/111; X10 216.77%/14.77%/107. No case meets declared
development/validation conditions; keep baseline. Next-open full-return
sensitivity also trails baseline for every X>0.

X3 reduces <=7-session sell-buy pairs from29 to9, but blocks18 flat reentry
decisions versus4 holding adds, and underperforms baseline in5 fixed upward
blocks. X7 removes these short sell-buy pairs entirely but loses substantial
return. Fewer pairs alone is not a better account. These diagnostics cannot
attribute all lost return additively or establish future predictive reliability.

## Exact rule and files

Actual partial/full/risk sales start or reset the clock. The NEXT X trading
sessions cannot increase accepted exposure, including native recovery and new
flat entries. Further sales remain allowed. Native stop wait overlaps by the
later eligible date. No old buy is queued for automatic refill after expiry.
See DESIGN.md for the complete fixed pre-result definition and selection.

- model.ts: accepted native controller and economic-sale clock replay.
- run.ts: bounded resumable comparison, baseline/ledger/prefix/resume audit.
- model.test.ts:9 boundary, pending, partial/full, risk, recovery and bounds tests.
- audit.py: reuses the independent Python cash oracle without modifying it.
- RESULTS.md: generated comparison, fees and execution sensitivities.

Run from repository root:

```powershell
npx tsx research/nikkei-reduction-cooldown/run.ts --limit 2
npx tsx research/nikkei-reduction-cooldown/run.ts
python research/nikkei-reduction-cooldown/audit.py
npx tsx --test research/nikkei-reduction-cooldown/model.test.ts research/nikkei-overlay-stability/rsi-shape-integration.test.ts
npm run typecheck
```

## Verification and recovery

13 focused tests passed (9 new+4 archived integrations), project typecheck and
scoped ESLint passed. Independent Python verifies112 metric groups and every
actual fill. X0 matches all production targets, final controller state, fills and
440.9807031454993% net return. Every actual buy respects its sale deadline. All
seven fresh replays,14 causal prefixes and14 serialized controller/clock/cash
resumes match. An actual2-case stop resumed the remaining5; latest recheck RSS145.9MiB.
No complete app suite rerun for this isolated research; the immediately preceding
production gate passed473 unit tests, build and4 rendered/source tests.

Identityc75518b2e7b7375685a6025da4439062c2419cc59c3f587b558b67baf8ba90ca;
complete7/7,pending0. Source parsed SHA256
b543028a5db9860a9ac262d8bf65cf6df06f8d625afba728d875ce0d0274873e.
Raw JSON backups and timestamped machine-readable registry remain in ignored
data/<identity>; derived case ledgers/manifests in output/<identity>, located by
output/latest.json. Atomic hashed progress rejects corrupt/reordered/incompatible
rows. On crash/reboot/cancellation/timeout rerun the same command; at most one
unfinished case repeats with no external effects. Source/code/design changes
create another identity without deleting previous state. Missing raw input fails.
RSS ceiling1.5GiB;10000 bars,2048 decisions,16MiB/JSON,one live replay,seven cases.

Full sample2018-08-09..2026-10-26 is repeatedly used historical research. Final500
is conditional audit, not untouched validation. Main execution is a Nikkei-close
proxy. Next-open reuses the same controller clock and is not a redesigned
fill-aware next-open policy. Real China-product execution is untested.

Concurrent product work adopted v9 during this research. This comparison now
explicitly pins archived RSI_SHAPE_POSITION_OVERLAY_OPTIONS(v8); fresh seven-case
replay/audit reproduces original target hashes/metrics.440.98% is not the newer
v9 cycle baseline445.34%. Previous identity/output preserved; latest.json points
to the reverified archived run. Concurrent production upgrade remains untouched.
