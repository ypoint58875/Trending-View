# Downtrend continuation signal review

Research only. Preserve the existing trend-triggered screening calendar and its
frozen winners. Do not rescreen, change production rules or write browser state.

Compare baseline with three causal current-winner checks on normally skipped
strong-downtrend bearish candles: (1) any actual holding, (2) only an episode
entered below the preceding close whose subsequent closes have all declined,
and (3) a bearish-body entry followed only by bearish bodies.
Neither variant checks strong-uptrend continuation days. Extra signals retain
the production last-two-bar resolver, native buy priority and all v11 guards.
The narrow variants are diagnostics, not proposed adopted policies.

Input is the full-screen 10-session, maximum-six-strategy, 2,000-session frozen
study ending 2026-10-26, not a current browser-account export. The current v11
controller is used with the original 3bps commission and 2bps slippage.

Run from the repository root:

```powershell
npx tsx research/nikkei-downtrend-signal-review/run.ts --limit 16
npx tsx research/nikkei-downtrend-signal-review/run.ts
npx tsx --test research/nikkei-downtrend-signal-review/model.test.ts
python research/nikkei-downtrend-signal-review/audit.py
```

Atomic signal-extraction progress is stored in ignored `data/<identity>/`;
raw input and original decision signals are backed up with hashes and access
time. Derived daily traces, fills, metrics and `summary.json` are stored in
ignored `output/<identity>/`. `output/latest.json` locates the result. Each run
verifies source and implementation hashes. A changed implementation gets a
fresh identity; corrupt or incompatible state fails explicitly. Restart the
same command after cancellation, crash, reboot or timeout: only unfinished
signal extraction repeats. No external-service calls or side effects occur.

Bounds: 10,000 bars, 2,048 original decisions, 16MiB per input/output, 1.5GiB
RSS, one extraction/replay at a time, bounded progress every 16 extracted dates.
Extraction uses a prefix ending at each date. Replays verify production-baseline
parity, serialized interruption/resume and causal prefixes. Existing upstream
data provenance remains authoritative. Returns are historical index-close proxy
results with frozen winners; newly screened winners cannot be inferred here.
