"""Export standalone comparison plots from a completed audited replay."""
import json
import sys
from datetime import datetime
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parent


def load(path):
    assert path.stat().st_size <= 16 * 1024**2
    return json.loads(path.read_text(encoding="utf-8"))


latest = load(Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "output/latest.json")
assert latest["status"] == "complete"
output = Path(latest["output"])
initial = load(Path(latest["data"]) / "input.json")["settings"]["initialCash"]
baseline = load(output / "baseline.json")["days"]
alternative = load(output / "alternative.json")["days"]
carried = load(output / "carried-strategy-only.json")["days"]
analysis = load(output / "difference-analysis.json")
assert len(baseline) == len(alternative) == len(carried) == 2000
dates = [datetime.fromisoformat(d["time"]) for d in baseline]
fig, axes = plt.subplots(4, 1, figsize=(13, 12), sharex=True, constrained_layout=True)
colors = ["#64748b", "#059669", "#b45309"]
for days, label, color in zip([baseline, alternative, carried],
                              ["Original filter", "Holding: full rescreen", "Holding: carried signals only"], colors):
    equity = [d["equity"] / initial for d in days]
    axes[0].plot(dates, equity, label=label, color=color, linewidth=1.3)
    peak = 1
    drawdowns = []
    for value in equity:
        peak = max(peak, value)
        drawdowns.append((value / peak - 1) * 100)
    axes[1].plot(dates, drawdowns, color=color, linewidth=1)
axes[0].set_ylabel("Equity / initial cash")
axes[0].legend(loc="upper left")
axes[1].set_ylabel("Drawdown %")
advantage = [(a["equity"] - b["equity"]) / initial * 100 for a, b in zip(alternative, baseline)]
axes[2].plot(dates, advantage, color="#2563eb", linewidth=1.3)
axes[2].axhline(0, color="#64748b", linewidth=.8)
axes[2].set_ylabel("Advantage vs original (pp)")
axes[3].step(dates, [(a["target"] - b["target"]) * 100 for a, b in zip(alternative, baseline)],
             where="post", color="#7c3aed", linewidth=1)
axes[3].axhline(0, color="#64748b", linewidth=.8)
axes[3].set_ylabel("Target difference (pp)")
for axis in axes:
    axis.grid(alpha=.2)
fig.suptitle("10-session Nikkei cycle: holding-dependent rescreening\n"
             "Frozen completed closes; current v11; commission 3bps + slippage 2bps", fontsize=13)
fig.savefig(output / "comparison.png", dpi=160)
fig.savefig(output / "comparison.svg")
plt.close(fig)
fig, axis = plt.subplots(figsize=(13, 4.5), constrained_layout=True)
rows = analysis["months"]
axis.bar([r["period"] for r in rows], [r["contributionPoints"] for r in rows],
         color=["#059669" if r["contributionPoints"] >= 0 else "#dc2626" for r in rows])
axis.set_xticks(range(0, len(rows), 6), [rows[i]["period"] for i in range(0, len(rows), 6)], rotation=45)
axis.set_ylabel("Additive final-return advantage (pp)")
axis.set_title("Where the difference accumulated: monthly cash contribution / initial cash")
axis.axhline(0, color="#64748b", linewidth=.8)
axis.grid(axis="y", alpha=.2)
fig.savefig(output / "monthly-contributions.png", dpi=160)
plt.close(fig)
print(json.dumps({"plots": [str(output / "comparison.png"), str(output / "monthly-contributions.png")]}))
