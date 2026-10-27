"""Plot observed EMA20 slope/curvature regimes without future label backfill."""
import json
from datetime import datetime, timedelta
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.dates as mdates
import matplotlib.pyplot as plt
from matplotlib.patches import Patch

output = Path(__file__).resolve().parent / "output" / "ma-derivatives"
rows = json.loads((output / "daily.json").read_text(encoding="utf-8"))["rows"]
colors = {"rapid-up": "#67c58d", "rapid-down": "#ed7a78", "range-wide": "#94b8e4",
          "range-normal": "#c9dbed", "trend-up": "#c4e4ca", "trend-down": "#efc3b8",
          "transition": "#e3d6b8", "warmup": "#ededed"}
labels = {"rapid-up": "Rapid rise", "rapid-down": "Rapid fall", "range-wide": "Wide range",
          "range-normal": "Normal range", "trend-up": "Ordinary up", "trend-down": "Ordinary down",
          "transition": "Transition", "warmup": "Warmup"}
plt.rcParams.update({"font.size": 10, "axes.spines.top": False, "axes.spines.right": False})


def render(selected, filename, title, logarithmic=False):
    dates = [datetime.fromisoformat(row["time"]) for row in selected]
    figure, axes = plt.subplots(4, 1, figsize=(15, 11), sharex=True,
                               gridspec_kw={"height_ratios": [3.5, 1, 1.2, 1.2]}, layout="constrained")
    price, volatility, slope, curvature = axes
    start = 0
    while start < len(selected):
        end = start + 1
        while end < len(selected) and selected[end]["backgroundAtClose"] == selected[start]["backgroundAtClose"] and selected[end]["volatilityAtClose"] == selected[start]["volatilityAtClose"]:
            end += 1
        right = dates[end] if end < len(dates) else dates[-1] + timedelta(days=1)
        background = selected[start]["backgroundAtClose"]
        key = f"range-{selected[start]['volatilityAtClose']}" if background == "range" else background
        price.axvspan(dates[start], right, color=colors.get(key, "#eeeeee"), alpha=0.6, linewidth=0)
        start = end
    for index, row in enumerate(selected):
        if row["labelAtClose"] in ("rapid-up", "rapid-down"):
            right = dates[index + 1] if index + 1 < len(dates) else dates[-1] + timedelta(days=1)
            price.axvspan(dates[index], right, ymin=0.96, ymax=1, color=colors[row["labelAtClose"]], linewidth=0)
    price.plot(dates, [row["close"] for row in selected], color="#20384f", linewidth=1.2, label="Nikkei close")
    price.plot(dates, [row["average"] for row in selected], color="#a66916", linewidth=1.1, label="EMA20")
    for direction, marker, color in [("up", "^", "#007c42"), ("down", "v", "#b32528")]:
        events = [(date, row["close"]) for date, row in zip(dates, selected) if row["shock"] == direction]
        if events:
            price.scatter([event[0] for event in events], [event[1] for event in events], marker=marker,
                          color=color, s=30, zorder=5, label=f"Observed shock {direction}")
    if logarithmic:
        price.set_yscale("log")
    price.set_ylabel("Index level" + (" (log)" if logarithmic else ""))
    price.set_title(title, loc="left", fontsize=16, weight="bold")
    price.legend(loc="upper left", ncol=4, frameon=False, fontsize=9)
    volatility.plot(dates, [row["atrPercent"] for row in selected], color="#734ab3", linewidth=1.1)
    volatility.set_ylabel("ATR14 / close (%)")
    slope.plot(dates, [row["d1"] for row in selected], color="#b07b18", linewidth=1.2)
    slope.set_ylabel("EMA20 D1\nATR / session")
    curvature.plot(dates, [row["d2"] for row in selected], color="#266dad", linewidth=1.1)
    curvature.set_ylabel("EMA20 D2\nATR / session squared")
    for axis, threshold in [(slope, 0.05), (curvature, 0.005)]:
        axis.axhline(0, color="#666666", linewidth=0.7)
        axis.axhline(threshold, color="#999999", linestyle="--", linewidth=0.7)
        axis.axhline(-threshold, color="#999999", linestyle="--", linewidth=0.7)
    for axis in axes:
        axis.grid(alpha=0.15)
    locator = mdates.AutoDateLocator(minticks=5, maxticks=10)
    curvature.xaxis.set_major_locator(locator)
    curvature.xaxis.set_major_formatter(mdates.ConciseDateFormatter(locator))
    figure.legend(handles=[Patch(facecolor=color, alpha=0.7, label=labels[key]) for key, color in colors.items()],
                  loc="outside lower center", ncol=8, frameon=False, fontsize=9)
    curvature.set_xlabel("Shading: broad regime. Upper strip: rapid sub-moves. Known at close; D2 is acceleration, not a reversal guarantee.", fontsize=9, labelpad=10)
    figure.savefig(output / filename, dpi=150)
    plt.close(figure)


render(rows, "all-history.png", "Nikkei: EMA20 direction / curvature / ATR | all frozen history", True)
render(rows[-2000:], "last-2000.png", "Nikkei: EMA20 derivatives | last 2000 sessions", True)
render([row for row in rows if row["time"] >= "2026-06-01"], "recent.png",
       "Nikkei: directional bursts within range backgrounds | through 2026-10-26")
print(output)
