"""Render causal directional/range labels and separate observed shock events."""
import json
from datetime import datetime, timedelta
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.dates as mdates
import matplotlib.pyplot as plt
from matplotlib.patches import Patch

output = Path(__file__).resolve().parent / "output" / "ma-atr-segmentation"
payload = json.loads((output / "daily.json").read_text(encoding="utf-8"))
rows = payload["rows"]
colors = {
    "rapid-up": "#67c58d", "rapid-down": "#ed7a78", "range-wide": "#94b8e4",
    "range-normal": "#c9dbed", "trend-up": "#c4e4ca", "trend-down": "#efc3b8",
    "transition": "#e3d6b8", "warmup": "#ededed",
}
labels = {
    "rapid-up": "Rapid rise", "rapid-down": "Rapid fall", "range-wide": "Wide range",
    "range-normal": "Normal range", "trend-up": "Ordinary up", "trend-down": "Ordinary down",
    "transition": "Transition", "warmup": "Warmup",
}
plt.rcParams.update({"font.size": 10, "axes.spines.top": False})


def render(selected, name, title, logarithmic=False):
    dates = [datetime.fromisoformat(row["time"]) for row in selected]
    figure, axes = plt.subplots(3, 1, figsize=(15, 10), sharex=True,
                               gridspec_kw={"height_ratios": [3.2, 1, 1.3]}, layout="constrained")
    price, volatility, strength = axes
    start = 0
    while start < len(selected):
        end = start + 1
        while end < len(selected) and selected[end]["effectiveLabel"] == selected[start]["effectiveLabel"]:
            end += 1
        right = dates[end] if end < len(dates) else dates[-1] + timedelta(days=1)
        price.axvspan(dates[start], right, color=colors.get(selected[start]["effectiveLabel"], "#eeeeee"), alpha=0.55, linewidth=0)
        start = end
    price.plot(dates, [row["close"] for row in selected], color="#20384f", linewidth=1.2, label="Nikkei close")
    price.plot(dates, [row["average"] for row in selected], color="#a66916", linewidth=1.1, label="EMA20")
    for direction, marker, color in [("up", "^", "#007c42"), ("down", "v", "#b32528")]:
        events = [(date, row["close"]) for date, row in zip(dates, selected) if row["shock"] == direction]
        if events:
            price.scatter([event[0] for event in events], [event[1] for event in events],
                          marker=marker, color=color, s=32, zorder=5, label=f"Observed shock {direction}")
    if logarithmic:
        price.set_yscale("log")
    price.set_ylabel("Index level" + (" (log)" if logarithmic else ""))
    price.set_title(title, loc="left", fontsize=16, weight="bold")
    price.legend(loc="upper left", frameon=False, ncol=4, fontsize=9)
    volatility.plot(dates, [row["atrPercent"] for row in selected], color="#734ab3", linewidth=1.2)
    volatility.set_ylabel("ATR14 / close (%)")
    strength.plot(dates, [row["slopeAtr"] for row in selected], color="#b07b18", linewidth=1, label="EMA20 5-day slope / ATR")
    strength.axhline(0.05, color="#999999", linestyle="--", linewidth=0.8)
    strength.axhline(-0.05, color="#999999", linestyle="--", linewidth=0.8)
    strength.axhline(0, color="#777777", linewidth=0.7)
    strength.set_ylabel("ATR per session")
    efficiency_axis = strength.twinx()
    efficiency_axis.plot(dates, [row["er10"] for row in selected], color="#266dad", alpha=0.7, linewidth=0.9, label="ER10")
    efficiency_axis.set_ylim(0, 1)
    efficiency_axis.set_ylabel("ER10 (0..1)")
    strength.legend(loc="upper left", frameon=False, fontsize=8)
    efficiency_axis.legend(loc="upper right", frameon=False, fontsize=8)
    for axis in axes:
        axis.grid(alpha=0.15)
    locator = mdates.AutoDateLocator(minticks=5, maxticks=10)
    strength.xaxis.set_major_locator(locator)
    strength.xaxis.set_major_formatter(mdates.ConciseDateFormatter(locator))
    figure.legend(handles=[Patch(facecolor=color, alpha=0.65, label=labels[key]) for key, color in colors.items()],
                  loc="outside lower center", ncol=4, frameon=False, fontsize=9)
    figure.supxlabel("Background: confirmed at prior close; triangles: observed at marked close. No label backfill or prediction.", fontsize=9)
    figure.savefig(output / name, dpi=150)
    plt.close(figure)


render(rows, "all-history.png", "Nikkei: directional bursts versus ranges | frozen source", True)
render(rows[-2000:], "last-2000.png", "Nikkei: causal segmentation | last 2000 sessions", True)
render([row for row in rows if row["time"] >= "2026-06-01"], "recent.png",
       "Nikkei: wide ranges can contain rapid sub-moves | through 2026-10-26")
print(output)
