"""Plot the expanded-grid sequential segmentation study."""
import csv
import json
from datetime import datetime
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from matplotlib.ticker import PercentFormatter

root = Path(__file__).resolve().parent / "output" / "blocks-5-16"
s = json.loads((root / "summary.json").read_text(encoding="utf-8"))
with (root / "daily-equity.csv").open(encoding="utf-8", newline="") as handle:
    rows = list(csv.DictReader(handle))
dates = [datetime.fromisoformat(r["time"]) for r in rows]
length = s["selectedLength"]
fig, axes = plt.subplots(3, 1, figsize=(12, 13), layout="constrained")
ax, bars, age = axes
for key, label, color in [("holding", "Holding", "#6c7588"), ("current", "Original fixed overlay", "#288c70"),
                          (f"L{length}", f"Development-selected L={length}", "#267ac0")]:
    ax.plot(dates, [float(r[key]) for r in rows], label=label, color=color, linewidth=1.7)
ax.axvspan(datetime.fromisoformat(s["final500Start"]), dates[-1], color="#dfebf4", alpha=0.5, zorder=-1)
ax.set_title("5..16 overlay search: choosing segmentation length", loc="left", fontsize=17, fontweight="bold")
ax.set_ylabel("Net equity / starting capital")
ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y"))
ax.legend(frameon=False)
ax.grid(alpha=0.2)
policies = sorted(s["policies"], key=lambda p: p["length"])
positions = list(range(len(policies)))
for offset, key, color in [(-0.18, "development", "#288c70"), (0.18, "final500", "#267ac0")]:
    bars.bar([i + offset for i in positions], [p[key]["totalReturn"] for p in policies], width=0.35, color=color,
             label="Development: 1000 sessions" if key == "development" else "Later: 500 sessions")
bars.axhline(s["controls"]["holding"]["final500"]["totalReturn"], color="#6c7588", linestyle="--", label="Holding: later 500 sessions")
bars.set_xticks(positions, [p["length"] for p in policies])
bars.set_xlabel("Training length = update interval (sessions)")
bars.set_ylabel("Net return")
bars.yaxis.set_major_formatter(PercentFormatter())
bars.legend(frameon=False, fontsize=9)
bars.grid(axis="y", alpha=0.2)
for length, color in [(40, "#b97b31"), (100, "#6c7588"), (300, "#288c70"), (s["selectedLength"], "#267ac0")]:
    values = sorted([r for r in s["ageRows"] if r["length"] == length and r["scope"] == "all-available"], key=lambda r: r["age"])
    age.plot([r["age"] for r in values], [r["medianRelativeHolding"] for r in values], marker=".", label=f"Train {length}", color=color)
age.axhline(0, color="#777", linewidth=0.8)
age.set_xlabel("Frozen parameter age (sessions)")
age.set_ylabel("Median excess wealth vs holding")
age.yaxis.set_major_formatter(PercentFormatter())
age.legend(frameon=False, ncol=4)
age.grid(alpha=0.2)
fig.text(0.01, -0.01, "Quick-screen path; close-price proxy; 5 bps per side. Shaded: later 500 sessions. Historical, previously explored data; age cohorts overlap.", fontsize=9, color="#666")
fig.savefig(root / "block-analysis.png", dpi=160, bbox_inches="tight")
fig.savefig(root / "block-analysis.svg", bbox_inches="tight")
plt.close(fig)
