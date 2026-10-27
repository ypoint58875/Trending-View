# Additive six-percent held-peak stop

Compare current fixed v4 with an additional close-based six-percent trailing
exit throughout each held episode. Retain the first-five entry-close four-
percent stop, all original sequencing, SMA20/WMA gates, hold5, wait5 and trend
recovery. A partial reduction or add does not reset the held price peak. A
flat-to-held transition, including recovery, starts a new peak at that close.
Apply inclusive close <= highest held close * 0.94, only to a position that
existed before today's actions and remains held. Emergency exits clear pending
targets and holding locks. Either stop uses the same five subsequent sessions
without buys; reentry is possible at stop+6. Record both reasons when applicable.

Use the existing frozen full-screen 2000-session input and decisions. Require
exact target parity between the no-addition research account and production
v4. Also compare a replacement-only six-percent peak stop to distinguish the
two meanings, and five/seven-percent additive neighbors without selecting a
new winner. Report full return/drawdown, first1500/final500, fill count, stop
dates, double costs and next-open target replay. Main results retain the
Nikkei close proxy; do not infer fills at the threshold or intraday monitoring.
Peak price decline is distinct from account equity drawdown under partial
exposure and successive episodes. Previously explored data is descriptive.

Reuse ExpandedAccount and baseRule from the existing risk studies. Keep this
small finite five-case run synchronous and bounded: files <=16MiB, <=10000
bars, <=2048 decisions and <1.5GiB RSS. Validate source hashes/index alignment;
commit each completed ledger and final summary atomically under
output/trailing-stop-six/. A rerun deterministically regenerates these tiny
derived artifacts; no extra checkpoint/scheduler/cache lifecycle is needed.
Preserve frozen/raw inputs and earlier output. Production/UI remain unchanged.

Technical comparison: an entry-loss stop protects initial capital only, while
a held-peak stop also reacts to surrendered profit. Combine rather than replace
for the primary request so existing early protection remains. A close signal
can exceed its threshold; actual stop orders also do not guarantee execution
price (SEC Investor.gov, accessed 2026-10-26):
https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins-15
