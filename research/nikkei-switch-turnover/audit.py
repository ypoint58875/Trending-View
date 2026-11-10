"""Independently verify saved policy ledgers with scalar Python cash accounting."""

import json
import math
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def load(path):
    if path.stat().st_size > 16 * 1024**2:
        raise ValueError("JSON exceeds16MiB")
    return json.loads(path.read_text(encoding="utf-8"))


def simulate(bars, targets, commission, slippage, next_open=False):
    cash, units, planned = 100000.0, 0.0, 0.0
    values, fills = [], []
    for offset, bar in enumerate(bars):
        target = targets[offset - 1] if next_open and offset else 0 if next_open else targets[offset]
        if abs(target - planned) > 1e-10:
            price = bar["open"] if next_open else bar["close"]
            equity = cash + units * price
            before = min(1, max(0, units * price / equity))
            desired = equity * target / price
            delta = desired - units
            tolerance = max(desired, units, 1) * 1e-10
            if delta > tolerance:
                fill_price = price * (1 + slippage)
                quantity = min(delta, cash / (fill_price * (1 + commission)))
                if quantity > tolerance:
                    cash -= quantity * fill_price * (1 + commission)
                    units += quantity
                    fills.append((offset, before, target, fill_price))
            elif delta < -tolerance:
                fill_price = price * (1 - slippage)
                quantity = min(-delta, units)
                if quantity > tolerance:
                    cash += quantity * fill_price * (1 - commission)
                    units -= quantity
                    fills.append((offset, before, target, fill_price))
            planned = target
        values.append(cash + units * bar["close"])
    return values, fills


def metrics(values, fills, start=0, end=2000):
    base = values[start - 1] if start else 100000.0
    peak, drawdown = base, 0.0
    for value in values[start:end]:
        peak = max(peak, value)
        drawdown = min(drawdown, (value / peak - 1) * 100)
    selected = [row for row in fills if start <= row[0] < end]
    return dict(totalReturn=(values[end - 1] / base - 1) * 100,
                maxDrawdown=drawdown, fills=len(selected),
                turnover=sum(abs(row[2] - row[1]) for row in selected))


def compare(actual, expected):
    for key, value in actual.items():
        if not math.isclose(value, expected[key], abs_tol=1e-7, rel_tol=1e-10):
            raise AssertionError((key, value, expected[key]))


def main():
    latest = load(ROOT / "output/latest.json")
    summary = load(ROOT / latest["summary"])
    identity = summary["identity"]
    assert identity == latest["identity"]
    manifest = load(ROOT / "output" / identity / "manifest.json")
    assert manifest["status"] == "complete" and manifest["identity"] == identity
    source = load(ROOT / "data" / identity / "input.json")
    bars = source["bars"][-2000:]
    assert len(bars) == 2000 and len(source["bars"]) <= 10000
    count = 0
    for row in summary["rows"]:
        ledger = load(ROOT / "output" / identity / (row["policy"] + ".json"))
        events = {event["time"]: event["target"] for event in ledger["events"]}
        target, targets = 0, []
        for bar in bars:
            target = events.get(bar["time"], target)
            targets.append(target)
        values, fills = simulate(bars, targets, .0003, .0002)
        for key, start, end in [("full", 0, 2000), ("train", 0, 1000),
                                ("validation", 1000, 1500), ("audit", 1500, 2000)]:
            compare(metrics(values, fills, start, end), row[key])
            count += 1
        assert len(fills) == len(ledger["fills"])
        for actual, expected in zip(fills, ledger["fills"]):
            assert bars[actual[0]]["time"] == expected["time"]
            for value, key in zip(actual[1:], ["fromAllocation", "targetAllocation", "fillPrice"]):
                assert math.isclose(value, expected[key], abs_tol=1e-7)
        for key, commission, slippage, next_open in [("gross", 0, 0, False),
                                                    ("stress", .0018, .0002, False),
                                                    ("nextOpen", .0003, .0002, True)]:
            alternate, alternate_fills = simulate(bars, targets, commission, slippage, next_open)
            compare(metrics(alternate, alternate_fills), row[key])
            count += 1
            if next_open:
                compare(metrics(alternate, alternate_fills, 1500), row["nextOpenAudit"])
                count += 1
        for i, expected in enumerate(row["blocks250"]):
            compare(metrics(values, fills, i * 250, (i + 1) * 250), expected)
            count += 1
    result = dict(identity=identity, status="passed", policies=7, metricGroups=count,
                  economicFillsVerified=True, tolerance=1e-7)
    path = ROOT / "output" / identity / "python-audit.json"
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(result), encoding="utf-8")
    os.replace(temporary, path)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
