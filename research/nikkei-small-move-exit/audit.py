"""Independently verify all21 small-move policy cash ledgers."""

import importlib.util
import json
import math
import os
import sys
from pathlib import Path

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("scalar_cash_oracle", ROOT.parent / "nikkei-switch-turnover/audit.py")
oracle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(oracle)


def main():
    latest = oracle.load(ROOT / ("output/latest-v9.json" if "--current" in sys.argv else "output/latest.json"))
    summary = oracle.load(ROOT / latest["summary"])
    identity = summary["identity"]
    assert identity == latest["identity"] and len(summary["rows"]) == 21
    manifest = oracle.load(ROOT / "output" / identity / "manifest.json")
    assert manifest["status"] == "complete" and manifest["identity"] == identity
    source = oracle.load(ROOT / "data" / identity / "input.json")
    bars = source["bars"][-2000:]
    count, episode_checks = 0, 0
    for row in summary["rows"]:
        ledger = oracle.load(ROOT / "output" / identity / (row["policy"] + ".json"))
        events = {event["time"]: event["target"] for event in ledger["events"]}
        target, targets = 0, []
        for bar in bars:
            target = events.get(bar["time"], target)
            targets.append(target)
        values, fills = oracle.simulate(bars, targets, .0003, .0002)
        for key, start, end in [("full", 0, 2000), ("train", 0, 1000), ("validation", 1000, 1500), ("audit", 1500, 2000)]:
            oracle.compare(oracle.metrics(values, fills, start, end), row[key])
            count += 1
        assert len(fills) == len(ledger["fills"])
        for actual, expected in zip(fills, ledger["fills"]):
            assert bars[actual[0]]["time"] == expected["time"]
            for value, key in zip(actual[1:], ["fromAllocation", "targetAllocation", "fillPrice"]):
                assert math.isclose(value, expected[key], abs_tol=1e-7)
        for key, commission, slippage, next_open in [("gross", 0, 0, False), ("stress", .0018, .0002, False), ("nextOpen", .0003, .0002, True)]:
            alternate, alternate_fills = oracle.simulate(bars, targets, commission, slippage, next_open)
            oracle.compare(oracle.metrics(alternate, alternate_fills), row[key])
            count += 1
            if next_open:
                oracle.compare(oracle.metrics(alternate, alternate_fills, 1500), row["nextOpenAudit"])
                count += 1
        for i, expected in enumerate(row["blocks250"]):
            oracle.compare(oracle.metrics(values, fills, i * 250, (i + 1) * 250), expected)
            count += 1
        # Independently reconstruct live episode anchors/extrema from economic fills.
        event_by_time = {event["time"]: event for event in ledger["events"]}
        fill_by_time = {}
        for fill in ledger["fills"]:
            fill_by_time.setdefault(fill["time"], []).append(fill)
        episode = None
        base_index = len(source["bars"]) - 2000
        for offset, bar in enumerate(bars):
            index = base_index + offset
            if episode is not None and index > episode["index"]:
                episode["high"] = max(episode["high"], bar["high"])
                episode["low"] = min(episode["low"], bar["low"])
            event = event_by_time.get(bar["time"])
            if event is not None:
                expected = event["episode"]
                assert (episode is None) == (expected is None)
                if episode is not None:
                    for key, value in episode.items():
                        assert math.isclose(value, expected[key], abs_tol=1e-8)
                    value = ((episode["high"] - episode["low"]) / episode["cost"] * 100
                             if row["kind"] == "range" else abs(bar["close"] / episode["cost"] - 1) * 100)
                    assert math.isclose(value, event["measure"], abs_tol=1e-8)
                    if event["blocked"]:
                        assert value < row["threshold"] and not event["risk"]
                    episode_checks += 1
            for fill in fill_by_time.get(bar["time"], []):
                if fill["fromAllocation"] <= 1e-10 and fill["targetAllocation"] > 1e-10:
                    episode = dict(index=index, cost=fill["fillPrice"] * 1.0003,
                                   high=fill["fillPrice"], low=fill["fillPrice"])
                if fill["targetAllocation"] <= 1e-10:
                    episode = None
    result = dict(identity=identity, status="passed", policies=21, metricGroups=count, episodeChecks=episode_checks,
                  economicFillsVerified=True, tolerance=1e-7)
    path = ROOT / "output" / identity / "python-audit.json"
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(result), encoding="utf-8")
    os.replace(temporary, path)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
