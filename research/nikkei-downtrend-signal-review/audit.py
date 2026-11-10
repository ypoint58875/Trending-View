"""Independently verify scalar accounting and trigger masks without TS imports."""
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def load(path):
    assert path.stat().st_size <= 16 * 1024**2
    return json.loads(path.read_text(encoding="utf-8"))


latest = load(ROOT / "output/latest.json")
source = load(Path(latest["data"]) / "input.json")
summary = load(Path(latest["output"]) / "summary.json")
bars, settings = source["bars"], source["settings"]
regular = {row["decisionIndex"] for row in source["snapshots"]}
observations = 0
for row in summary["rows"]:
    case = load(Path(latest["output"]) / f'{row["policy"]}.json')
    cash, units, previous, planned, peak = settings["initialCash"], 0.0, 0.0, 0.0, settings["initialCash"]
    fills, equities = [], []
    drawdown = 0.0

    def trade(bar, price, target):
        global cash, units
        desired = (cash + units * price) * target / price
        delta = desired - units
        tolerance = max(desired, units, 1) * 1e-10
        if delta > tolerance:
            fill = price * (1 + settings["slippageRate"])
            cost = fill * (1 + settings["commissionRate"])
            amount = min(delta, cash / cost)
            if amount <= tolerance:
                return
            cash -= amount * cost
            units += amount
        elif delta < -tolerance:
            fill = price * (1 - settings["slippageRate"])
            amount = min(-delta, units)
            if amount <= tolerance:
                return
            cash += amount * fill * (1 - settings["commissionRate"])
            units -= amount
        else:
            return
        fills.append((bar["time"], target, fill))

    for day in case["path"]["days"]:
        i, target = day["index"], day["target"]
        bar = bars[i]
        current_ma = (bar["close"] + bars[i - 1]["close"]) / 2
        previous_ma = (bars[i - 1]["close"] + bars[i - 2]["close"]) / 2
        angle = math.degrees(math.atan((current_ma / previous_ma - 1) * 100))
        tolerance = max(abs(bar["open"]), abs(bar["close"]), 1) * 1e-10
        skipped_down = i not in regular and angle <= -30 and bar["close"] - bar["open"] < -tolerance
        assert skipped_down == day["skippedDown"]
        assert (units > 1e-10) == day["held"]
        episode = day["episode"]
        if episode:
            entry = episode["index"]
            assert episode["downEntry"] == (bars[entry]["close"] < bars[entry - 1]["close"])
            assert episode["bearishEntry"] == (bars[entry]["close"] < bars[entry]["open"])
            assert episode["uninterrupted"] == all(bars[j]["close"] < bars[j - 1]["close"] for j in range(entry + 1, i + 1))
            assert episode["uninterruptedBearish"] == all(bars[j]["close"] < bars[j]["open"] for j in range(entry + 1, i + 1))
        policy = row["policy"]
        allowed = policy == "holding-downtrend" or policy == "down-entry-run" and episode and episode["downEntry"] and episode["uninterrupted"] or policy == "bearish-entry-run" and episode and episode["bearishEntry"] and episode["uninterruptedBearish"]
        assert bool(skipped_down and units > 1e-10 and allowed) == day["checked"]
        if abs(previous - planned) > 1e-10:
            trade(bar, bar["open"], previous)
            planned = previous
        if abs(target - previous) > 1e-10 and abs(target - planned) > 1e-10:
            trade(bar, bar["close"], target)
            planned = target
        equity = cash + units * bar["close"]
        for actual, saved in [(cash, day["cash"]), (units, day["units"]), (equity, day["equity"])]:
            assert math.isclose(actual, saved, rel_tol=1e-12, abs_tol=1e-7)
        peak = max(peak, equity)
        drawdown = max(drawdown, (1 - equity / peak) * 100)
        equities.append(equity)
        previous = target
        observations += 1
    assert len(fills) == len(case["path"]["fills"]) == row["fills"]
    for actual, saved in zip(fills, case["path"]["fills"]):
        assert actual[0] == saved["time"]
        assert abs(actual[1] - saved["targetAllocation"]) < 1e-10
        assert abs(actual[2] - saved["fillPrice"]) < 1e-7
    assert abs((equities[-1] / settings["initialCash"] - 1) * 100 - row["net"]) < 1e-9
    assert abs(drawdown - row["maxDrawdown"]) < 1e-9
    print(f'{policy}: scalar ledger, {len(equities)} observations, {len(fills)} fills and trigger masks passed')
print(f"Verified {observations} daily observations across {len(summary['rows'])} policies")
