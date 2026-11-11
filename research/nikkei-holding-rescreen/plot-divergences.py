"""Plot the completed replay's divergent target intervals and trailing returns."""
import json
from collections import defaultdict
from itertools import groupby
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
from matplotlib.patches import Patch, Rectangle
from matplotlib.ticker import StrMethodFormatter

ROOT = Path(__file__).resolve().parent


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def return_percent(days, start, end):
    return 100 * (days[end]["equity"] / days[start - 1]["equity"] - 1)


def main():
    latest = load(ROOT / "output/latest.json")
    assert latest["status"] == "complete"
    output = Path(latest["output"])
    summary = load(output / "summary.json")
    analysis = load(output / "difference-analysis.json")
    baseline, alternative = [load(output / f"{name}.json") for name in ("baseline", "alternative")]
    source = load(Path(latest["data"]) / "input.json")["bars"]
    daily = analysis["daily"]
    assert latest["identity"] == summary["identity"] == analysis["identity"] == alternative["identity"]
    assert len(daily) == len(baseline["days"]) == len(alternative["days"]) == summary["sessions"]
    for row, b, a in zip(daily, baseline["days"], alternative["days"]):
        assert row["time"] == b["time"] == a["time"] == source[row["index"]]["time"]
        assert (row["baselineTarget"], row["alternativeTarget"]) == (b["target"], a["target"])
    intervals = []
    for differs, group in groupby(range(len(daily)), lambda i:
                                  abs(daily[i]["baselineTarget"] - daily[i]["alternativeTarget"]) > 1e-10):
        if differs:
            indexes = list(group)
            intervals.append((indexes[0], indexes[-1]))
    assert sum(end - start + 1 for start, end in intervals) == analysis["changedTargetDays"]
    target = output / "divergence-charts"
    target.mkdir(exist_ok=True)
    fills = []
    for policy in (baseline, alternative):
        by_date = defaultdict(list)
        for fill in policy["fills"]:
            by_date[fill["time"]].append(fill)
        fills.append(by_date)
    items = []
    for number, (start, end) in enumerate(intervals, 1):
        left, right = max(0, start - 4), min(len(daily) - 1, end + 4)
        rows = daily[left:right + 1]
        bars = [source[row["index"]] for row in rows]
        labels = [row["time"] for row in rows]
        chart_name = f"{number:02d}-{daily[start]['time']}.png"
        fig, axes = plt.subplots(2, 1, figsize=(13, 7), sharex=True, sharey=True)
        fig.subplots_adjust(top=.82, bottom=.13, left=.08, right=.91, hspace=.20)
        for axis, name, policy, trades in zip(axes, ("Original filter", "Holding: full rescreen"),
                                              (baseline, alternative), fills):
            axis.axvspan(start - left - .5, end - left + .5, color="#fef3c7", zorder=0)
            for i, bar in enumerate(bars):
                color = "#b91c1c" if bar["close"] >= bar["open"] else "#047857"
                axis.vlines(i, bar["low"], bar["high"], color=color, linewidth=1)
                low = min(bar["open"], bar["close"])
                height = max(abs(bar["close"] - bar["open"]), .1)
                axis.add_patch(Rectangle((i - .28, low), .56, height, facecolor=color, edgecolor=color))
                for fill in trades[labels[i]]:
                    adding = fill["targetAllocation"] > fill["fromAllocation"]
                    axis.scatter(i, fill["fillPrice"], marker="^" if adding else "v",
                                 color="#2563eb" if adding else "#c026d3", s=95,
                                 edgecolor="white", linewidth=.8, zorder=4)
            alloc = axis.twinx()
            position = [policy["days"][i]["target"] * 100 for i in range(left, right + 1)]
            alloc.step(range(len(rows) + 1), [*position, position[-1]], where="post",
                       color="#475569", linestyle="--", linewidth=1.2)
            alloc.set(ylim=(-8, 108), yticks=[0, 50, 100], ylabel="Target (%)")
            ret = return_percent(policy["days"], start, end)
            axis.set_title(f"{name}   |   Shaded-window account return: {ret:+.2f}%", loc="left")
            axis.set_ylabel("Nikkei 225")
            axis.yaxis.set_major_formatter(StrMethodFormatter("{x:,.0f}"))
            axis.grid(axis="y", alpha=.2)
        axes[-1].set_xlim(-.55, len(rows) - .45)
        axes[-1].set_xticks(range(len(rows)), [t[5:] for t in labels], rotation=35, ha="right")
        fig.suptitle(f"{number:02d}   {daily[start]['time']} to {daily[end]['time']}"
                     f"   |   {end - start + 1} divergent sessions", y=.98)
        fig.legend(handles=[
            Patch(facecolor="#fef3c7", label="Different target allocation"),
            Line2D([], [], color="#475569", linestyle="--", label="Close target allocation"),
            Line2D([], [], color="#2563eb", marker="^", linestyle="none", label="Buy / add fill"),
            Line2D([], [], color="#c026d3", marker="v", linestyle="none", label="Reduce / clear fill"),
        ], loc="upper center", bbox_to_anchor=(.5, .94), ncol=4, frameon=False)
        fig.savefig(target / chart_name, dpi=145)
        plt.close(fig)
        items.append(f'<section id="interval-{number}"><h2>{number:02d} · {daily[start]["time"]} '
                     f'to {daily[end]["time"]}</h2><img src="{chart_name}" '
                     f'alt="Original and rescreen price and allocation, interval {number}"></section>')

    returns = []
    for length in (500, 250):
        start = len(daily) - length
        b, a = [return_percent(policy["days"], start, len(daily) - 1) for policy in (baseline, alternative)]
        returns.append({"sessions": length, "start": daily[start]["time"], "end": daily[-1]["time"],
                        "baseClose": daily[start - 1]["time"], "baseline": b, "rescreen": a, "deltaPoints": a - b})
    assert abs(returns[0]["baseline"] - summary["baseline"]["segments"][-1]) < 1e-9
    assert abs(returns[0]["rescreen"] - summary["alternative"]["segments"][-1]) < 1e-9
    table = "".join(f'<tr><td>{r["sessions"]}</td><td>{r["start"]} to {r["end"]}</td>'
                    f'<td>{r["baseline"]:+.2f}%</td><td>{r["rescreen"]:+.2f}%</td>'
                    f'<td>{r["deltaPoints"]:+.2f} pp</td></tr>' for r in returns)
    nav = " ".join(f'<a href="#interval-{i}">{i:02d}</a>' for i in range(1, len(items) + 1))
    (target / "index.html").write_text(
        '<!doctype html><html lang="en"><meta charset="utf-8"><title>Nikkei replay comparison</title>'
        '<style>body{margin:28px auto;max-width:1250px;padding:0 20px;font:16px system-ui;color:#172033}'
        'img{display:block;width:100%;height:auto}table{border-collapse:collapse}td,th{padding:8px 14px;'
        'text-align:left;border-bottom:1px solid #ddd}a{margin-right:10px}section{margin-top:32px}</style>'
        '<h1>Nikkei replay: divergent intervals</h1>'
        '<p>Top: original filter. Bottom: full rescreen while holding. Both use the same price scale.</p>'
        '<h2>Trailing account returns</h2><p>Final close divided by the close immediately before each window, '
        'minus one. Positions carry through from the full replay; fees and slippage are included.</p>'
        '<table><tr><th>Sessions</th><th>Window</th><th>Original</th><th>Rescreen</th>'
        f'<th>Difference</th></tr>{table}</table><p>Jump to interval: {nav}</p>'
        '<p>Shading marks divergent close targets. Each chart includes up to four context sessions on either '
        'side. Chart return labels use the shaded window only.</p>' + "".join(items) + "</html>", encoding="utf-8")
    (target / "trailing-returns.json").write_text(json.dumps(returns, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"album": str(target / "index.html"), "intervals": len(intervals), "returns": returns}))


if __name__ == "__main__":
    main()
