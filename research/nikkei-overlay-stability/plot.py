"""Render standalone publication-style research charts from local CSV outputs."""
import csv
import json
from datetime import datetime
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from matplotlib.ticker import PercentFormatter

root = Path(__file__).resolve().parent / "output"
with (root / "report-equity.csv").open(encoding="utf-8", newline="") as handle:
    data = list(csv.DictReader(handle))
summary = json.loads((root / "summary.json").read_text(encoding="utf-8"))
plt.rcParams.update({"font.size": 11, "axes.spines.top": False, "axes.spines.right": False})
fig, (ax, bars) = plt.subplots(2, 1, figsize=(12, 9), gridspec_kw={"height_ratios": [2, 1]}, layout="constrained")
dates = [datetime.fromisoformat(row["time"]) for row in data]
colors = {"holding": "#6b758b", "current": "#218b70", "ema8": "#267ac0", "adaptive": "#c47a37"}
labels = {"holding": "Holding", "current": "Current: EMA7 / SMA11 / WMA14", "ema8": "EMA8 only (post hoc diagnostic)", "adaptive": "Adaptive: 756 history / 252 update"}
for key in colors:
    ax.plot(dates, [float(row[key]) for row in data], label=labels[key], color=colors[key], linewidth=1.7)
ax.axvspan(datetime.fromisoformat(summary["final500Start"]), dates[-1], color="#e1eaf2", alpha=0.45, zorder=-1)
ax.set_title("Nikkei 225: 2000-session overlay stability", loc="left", fontsize=17, fontweight="bold")
ax.set_ylabel("Net equity / initial capital")
ax.xaxis.set_major_locator(mdates.YearLocator())
ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y"))
ax.grid(alpha=0.18)
ax.legend(loc="upper left", frameon=False, fontsize=10)
ax.text(0.99, 0.02, "Shaded: final 500 sessions (previously explored history)", transform=ax.transAxes, ha="right", fontsize=9, color="#5e6875")
width = 0.24
for n, key in enumerate(["current", "noOverlay", "holding"]):
    values = [block["totalReturn"] for block in summary["controls"][key]["blocks"]]
    bars.bar([i + (n - 1) * width for i in range(4)], values, width=width,
             label={"current": "Current", "noOverlay": "All overlays off", "holding": "Holding"}[key],
             color={"current": "#218b70", "noOverlay": "#c47a37", "holding": "#6b758b"}[key])
bars.set_xticks(range(4), ["2018-08 to 2020-09", "2020-09 to 2022-09", "2022-09 to 2024-10", "2024-10 to 2026-10"], fontsize=10)
bars.set_ylabel("500-session net return")
bars.yaxis.set_major_formatter(PercentFormatter())
bars.axhline(0, color="#777", linewidth=0.7)
bars.legend(frameon=False, ncol=3, loc="upper left")
bars.grid(axis="y", alpha=0.18)
fig.text(0.01, -0.025, "Actual quick-screen winners; close-price proxy; 3 bps commission + 2 bps slippage per side. Historical research, not independent validation.", fontsize=9, color="#5e6875")
fig.savefig(root / "analysis.png", dpi=170, bbox_inches="tight")
fig.savefig(root / "analysis.svg", bbox_inches="tight")
plt.close(fig)
