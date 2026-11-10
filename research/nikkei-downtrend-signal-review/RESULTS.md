# Downtrend signal review results

2018-08-09..2026-10-26;2,000 sessions;10-session frozen full-screen winners;current v11;3bps commission+2bps slippage. No production/account changes.

| Policy | Net % | MaxDD % | Fills | Extra checks | Extra reduce signals | Extra clears | Changed fill dates |
|---|---:|---:|---:|---:|---:|---:|---:|
| baseline | 463.0923 | 10.8753 | 128 | 0 | 0 | 0 | 0 |
| holding-downtrend | 350.5911 | 12.6174 | 141 | 149 | 38 | 39 | 34 |
| down-entry-run | 462.9048 | 10.8753 | 130 | 4 | 2 | 0 | 2 |
| bearish-entry-run | 463.0923 | 10.8753 | 128 | 2 | 0 | 0 | 0 |

Baseline skipped-down holding dates:144;with signals:54;reduce:38. Close-down entry uninterrupted subset:4 dates across3 episodes;reduce:2. Bearish-body entry uninterrupted subset:2 dates;reduce:0. Counts are two-bar signal-check days,not unique independent signals. Extra fills include normal daily risk/guard handling and must not all be attributed causally to the added request. Same-state no-request probes identify direct marginal request effects in each policy JSON.

Yesterday bullish/today bearish dates skipped by the actual MA2 rule:94;invested:41. The production trigger is not a candle-sign-flip trigger.

Full traces,observed signal sequences,pending/risk state and entry dates are in output/<identity>/summary.json and policy files. Identity:1601f4b0768a9c27cdfbad3cd527a56a4f98ca444a116c3dc6aedd9b59255467. Baseline economic fills and return equal production. 12 serialized resumes and 12 causal replay prefixes passed;extraction always uses the completed causal prefix. Max RSS observed during extraction:67.2MiB.

This is NOT a current browser-account export or a full-rescreening estimate. Later state-dependent checks use each variant's own actual holding. Down-entry-run means close below prior close on entry,then every subsequent close below its predecessor;bearish-entry-run uses close below open for entry and continuation. Both differ from MA2 trend. Existing protection can defer a discovered sell. No policy adopted.
