"""Independently verify saved research metrics and causal context definitions."""
import hashlib
import json
import math
from pathlib import Path

root = Path(__file__).resolve().parent
outputs = sorted((root / "output").glob("*/summary.json"), key=lambda p: p.stat().st_mtime)
summary = json.loads(outputs[-1].read_text())
identity = summary["identity"]
out = root / "output" / identity
data = root / "data" / identity
source = json.loads((data / "input.json").read_text())
bars = source["bars"]
start = len(bars) - 2000
context = json.loads((out / "context.json").read_text())

def near(a, b, tolerance=1e-7):
    assert (a is None and b is None) or (a is not None and b is not None and abs(a-b) < tolerance), (a, b)

def reference(items):
    closes = [b["close"] for b in items]
    bias, slope = [], []
    for period in (20, 60, 200):
        means = [None if i+1 < period else math.fsum(closes[i-period+1:i+1])/period for i in range(len(items))]
        bias.append([None if m is None else (closes[i]/m-1)*100 for i, m in enumerate(means)])
        slope.append([None if i == 0 or means[i-1] is None or m is None else m-means[i-1] for i, m in enumerate(means)])
    curves = [[None if i < 2 or any(v is None for v in c[i-2:i+1]) else math.fsum(c[i-2:i+1])/3 for i in range(len(c))] for c in bias+slope]
    candidate, confirmed, stamp, count = None, None, None, 0
    states = []
    for i in range(len(items)):
        changes = [None if i == 0 or c[i] is None or c[i-1] is None else c[i]-c[i-1] for c in curves]
        direction = "warmup" if None in changes else "up" if all(v > 0 for v in changes) else "down" if all(v < 0 for v in changes) else "mixed"
        if direction in ("up", "down"):
            count = count + 1 if candidate == direction else 1
            candidate = direction
            if count >= 3 and confirmed != direction:
                confirmed, stamp = direction, items[i]["time"]
        else:
            candidate, count = None, 0
        states.append(dict(time=items[i]["time"], direction=direction, consecutive=count, confirmed=confirmed, confirmedTime=stamp))
    return curves, states

for name, items in (("cycle", bars), ("long", json.loads((data / "long-bars.json").read_text()))):
    curves, states = reference(items)
    actual = context[name]
    for expected, observed in zip(curves, actual["curves"]["bias"]+actual["curves"]["slope"]):
        for a, b in zip(expected, observed):
            near(a, b)
    assert states == actual["states"]
    if name == "cycle":
        def falls(c, i):
            return i > 0 and c[i] is not None and c[i-1] is not None and c[i] < c[i-1]
        events = [i >= 3 and all(falls(curves[0], j) for j in (i, i-1, i-2)) and falls(curves[3], i) and curves[3][i-2] is not None and curves[3][i-1] >= curves[3][i-2] for i in range(len(items))]
        assert events == actual["event"]

for row in summary["rows"]:
    result = json.loads((out / f'{row["id"]}.json').read_text())
    equity = [e["equity"] for e in result["equity"]]
    initial = source["settings"]["initialCash"]
    near(row["full"], (equity[-1]/initial-1)*100)
    peak, dd = initial, 0
    for value in equity:
        peak = max(peak, value)
        dd = min(dd, (value/peak-1)*100)
    near(dd, row["dd"])
    for a, b, key in ((0,1000,"train"),(1000,1500,"validation"),(1500,2000,"final500")):
        near(row[key], (equity[b-1]/(initial if not a else equity[a-1])-1)*100)
    assert row["fills"] == len(result["fills"])
    cash, units, planned, previous = initial, 0, 0, 0
    fills = []
    commission, slippage = source["settings"]["commissionRate"], source["settings"]["slippageRate"]
    def execute(price, target, time):
        global cash, units
        equity_at_fill = cash + units * price
        desired = equity_at_fill * target / price
        change = desired - units
        tolerance = max(desired, units, 1) * 1e-10
        if change > tolerance:
            fill_price = price * (1+slippage)
            bought = min(change, cash/(fill_price*(1+commission)))
            if bought <= tolerance:
                return
            cash -= bought * fill_price * (1+commission)
            units += bought
        elif change < -tolerance:
            fill_price = price * (1-slippage)
            sold = min(-change, units)
            if sold <= tolerance:
                return
            cash += sold * fill_price * (1-commission)
            units -= sold
        else:
            return
        fills.append((time, target, fill_price))
    for i in range(start, len(bars)):
        target = result["targets"][i]
        if abs(previous-planned) > 1e-10:
            execute(bars[i]["open"], previous, bars[i]["time"])
            planned = previous
        if abs(target-previous) > 1e-10 and abs(target-planned) > 1e-10:
            execute(bars[i]["close"], target, bars[i]["time"])
            planned = target
        previous = target
        near(cash+units*bars[i]["close"], equity[i-start], 1e-6)
    assert len(fills) == len(result["fills"])
    for (time, target, price), observed in zip(fills, result["fills"]):
        assert time == observed["time"]
        near(target, observed["targetAllocation"])
        near(price, observed["fillPrice"])
    native = json.loads((out / "baseline.json").read_text())["targets"]
    if row["id"].startswith("weak-"):
        scale = float(row["id"].split("-")[1])
        for i in range(start, len(bars)):
            expected = native[i] * (scale if context["cycle"]["states"][i]["confirmed"] == "down" else 1)
            near(expected, result["targets"][i])

for event in summary["events"]:
    i = next(i for i,b in enumerate(bars) if b["time"] == event["time"])
    for days in (5,20):
        near(event[f"forward{days}"], (bars[i+days]["close"]/bars[i]["close"]-1)*100 if i+days < len(bars) else None)
print(f'PASS: {len(summary["rows"])} cases, 30000 daily equities and all fills, six curves/states in both samples, combined events, weak targets and forward outcomes. Identity {identity}')
