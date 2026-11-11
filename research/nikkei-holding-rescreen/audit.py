"""Independent gate, account-mark and completed-result audit; safe during a run."""
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def load(path):
    assert path.stat().st_size <= 16 * 1024**2
    return json.loads(path.read_text(encoding="utf-8"))


latest = load(ROOT / "output/latest.json")
data, output = Path(latest["data"]), Path(latest["output"])
progress = load(data / "progress.json")
source = load(data / "input.json")
registry = load(data / "source_registry.jsonl")
assert registry["inputHash"] == hashlib.sha256((data / "input.json").read_bytes()).hexdigest()
assert registry["signalHash"] == hashlib.sha256((data / "original-signals.json").read_bytes()).hexdigest()
assert progress["identity"] == latest["identity"] == registry["identity"]
bars = source["bars"]
start = len(bars) - 2000
originals = {s["decisionIndex"]: s for s in source["snapshots"]}
extras = {s["decisionIndex"]: s for s in progress["extras"]}
units = 0
cash = source["settings"]["initialCash"]
commission = source["settings"]["commissionRate"]
slippage = source["settings"]["slippageRate"]
fills_by_time = {}
for fill in progress["fills"]:
    fills_by_time.setdefault(fill["time"], []).append(fill)
last_key = None
for n, day in enumerate(progress["days"]):
    i = start + n
    bar = bars[i]
    assert day["index"] == i and day["time"] == bar["time"]
    assert day["held"] == (units > 1e-10)
    angle = math.degrees(math.atan(((bar["close"] + bars[i - 1]["close"]) /
                                    (bars[i - 1]["close"] + bars[i - 2]["close"]) - 1) * 100))
    tolerance = max(abs(bar["open"]), abs(bar["close"]), 1) * 1e-10
    change = bar["close"] - bar["open"]
    regular = (i == start or abs(change) <= tolerance or
               (change < 0 if angle >= 30 else change > 0 if angle <= -30 else True))
    assert day["regular"] == regular == (i in originals)
    extra = not regular and units > 1e-10 and angle <= -30 and change < 0
    assert day["extra"] == extra == (i in extras)
    selected = originals.get(i) or extras.get(i)
    if selected:
        last_key = {"plan": selected["plan"], "fixedRelativeLongStrategy": selected["fixedRelativeLongStrategy"]}
    assert json.loads(day["planKey"]) == last_key
    for fill in fills_by_time.get(bar["time"], []):
        buying = fill["targetAllocation"] > fill["fromAllocation"]
        price = fill["fillPrice"] / (1 + slippage if buying else 1 - slippage)
        assert any(math.isclose(price, bar[field], rel_tol=1e-12) for field in ["open", "close"])
        equity = cash + units * price
        assert math.isclose(units * price / equity, fill["fromAllocation"], abs_tol=1e-10)
        desired = equity * fill["targetAllocation"] / price
        if buying:
            quantity = min(desired - units, cash / (fill["fillPrice"] * (1 + commission)))
            assert quantity > 0
            cash -= quantity * fill["fillPrice"] * (1 + commission)
            units += quantity
        else:
            quantity = min(units - desired, units)
            assert quantity > 0
            cash += quantity * fill["fillPrice"] * (1 - commission)
            units -= quantity
    assert math.isclose(cash, day["cash"], abs_tol=1e-6, rel_tol=1e-10)
    assert math.isclose(units, day["units"], abs_tol=1e-8, rel_tol=1e-10)
    assert math.isclose(day["equity"], day["cash"] + day["units"] * bar["close"], rel_tol=1e-12)
    assert day["cash"] >= -1e-6 and day["units"] >= -1e-10
    if extra:
        job = data / "jobs" / str(i)
        winner, request = load(job / "winner.json"), load(job / "request.json")
        assert winner["snapshot"] == selected
        assert winner["resultHash"] == hashlib.sha256((job / "result.json").read_bytes()).hexdigest()
        assert request["barCount"] == i + 1
        assert request["settings"]["startTime"] == bars[i - 9]["time"]
        assert request["settings"]["endTime"] == bar["time"]
        assert request["options"]["maxCombinationStrategies"] == 6
        assert not request["settings"].get("positionOverlay")
    units = day["units"]
    cash = day["cash"]
assert progress["state"]["index"] == start + len(progress["days"]) - 1
if progress["status"] == "complete":
    summary = load(output / "summary.json")
    for name, path in [("baseline", load(output / "baseline.json")), ("alternative", progress)]:
        days, fills = path["days"], path["fills"]
        assert len(days) == 2000
        initial = source["settings"]["initialCash"]
        peak, dd = initial, 0
        for day in days:
            peak = max(peak, day["equity"])
            dd = max(dd, (1 - day["equity"] / peak) * 100)
        metrics = summary[name]
        assert math.isclose(metrics["net"], (days[-1]["equity"] / initial - 1) * 100, abs_tol=1e-10)
        assert math.isclose(metrics["maxDrawdown"], dd, abs_tol=1e-10)
        assert metrics["fills"] == len(fills)
        assert metrics["clears"] == sum(f["fromAllocation"] > 1e-10 and f["targetAllocation"] <= 1e-10 for f in fills)
    assert summary["extraScreens"] == len(extras)
print(json.dumps({"status": progress["status"], "verified_days": len(progress["days"]),
                  "extra_full_screens": len(extras), "complete": progress["status"] == "complete"}))
