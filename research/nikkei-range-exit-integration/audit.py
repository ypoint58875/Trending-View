"""Independent scalar cash, episode, signal, priority and risk audit."""

import importlib.util
import json
import math
import os
import sys
from pathlib import Path

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("scalar_cash", ROOT.parent / "nikkei-switch-turnover/audit.py")
oracle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(oracle)


def ema(values, period):
    output = [None] * len(values)
    value = sum(values[:period]) / period
    output[period - 1] = value
    for i in range(period, len(values)):
        value = (values[i] - value) * (2 / (period + 1)) + value
        output[i] = value
    return output


def atr(bars, period):
    ranges = [max(bar["high"] - bar["low"], abs(bar["high"] - bars[i - 1]["close"]),
                  abs(bar["low"] - bars[i - 1]["close"])) if i else bar["high"] - bar["low"]
              for i, bar in enumerate(bars)]
    output = [None] * len(bars)
    value = sum(ranges[:period]) / period
    output[period - 1] = value
    for i in range(period, len(bars)):
        value = (value * (period - 1) + ranges[i]) / period
        output[i] = value
    return output


def main():
    latest = oracle.load(ROOT / "output/latest.json")
    summary = oracle.load(ROOT / latest["summary"])
    identity = summary["identity"]
    assert identity == latest["identity"] and len(summary["rows"]) == 5
    manifest = oracle.load(ROOT / "output" / identity / "manifest.json")
    assert manifest["status"] == "complete" and manifest["nativeReportParity"]
    source = oracle.load(ROOT / "data" / identity / "input.json")
    saved = oracle.load(ROOT / "data" / identity / "signals.json")
    all_bars, settings = source["bars"], source["settings"]
    assert 2000 <= len(all_bars) <= 10000 and len(saved["rows"]) <= 2048
    assert settings["initialCash"] == 100000
    bars, start = all_bars[-2000:], len(all_bars) - 2000
    signal_by_index = {row["index"]: row["signals"] for row in saved["rows"]}
    selection_by_index = {row["decisionIndex"]: row["label"] for row in source["snapshots"]}
    average7 = ema([bar["close"] for bar in all_bars], 7)
    volatility14 = atr(all_bars, 14)
    groups, trace_checks, episode_checks, spell_checks = 0, 0, 0, 0
    for row in summary["rows"]:
        ledger = oracle.load(ROOT / "output" / identity / (row["policy"] + ".json"))
        events = ledger["events"]
        assert len(events) == 2000
        targets = [event["target"] for event in events]
        values, fills = oracle.simulate(bars, targets, settings["commissionRate"], settings["slippageRate"])
        for key, begin, end in [("full", 0, 2000), ("train", 0, 1000), ("validation", 1000, 1500), ("audit", 1500, 2000)]:
            oracle.compare(oracle.metrics(values, fills, begin, end), row[key])
            groups += 1
        assert len(fills) == len(ledger["fills"])
        for actual, expected in zip(fills, ledger["fills"]):
            assert bars[actual[0]]["time"] == expected["time"]
            for value, key in zip(actual[1:], ["fromAllocation", "targetAllocation", "fillPrice"]):
                assert math.isclose(value, expected[key], abs_tol=1e-7)
        for key, commission, slippage, next_open in [("gross", 0, 0, False), ("stress", .0018, .0002, False),
                                                    ("nextOpen", settings["commissionRate"], settings["slippageRate"], True)]:
            alternate, alternate_fills = oracle.simulate(bars, targets, commission, slippage, next_open)
            oracle.compare(oracle.metrics(alternate, alternate_fills), row[key])
            groups += 1
            if next_open:
                oracle.compare(oracle.metrics(alternate, alternate_fills, 1500), row["nextOpenAudit"])
                groups += 1
        for i, expected in enumerate(row["blocks250"]):
            oracle.compare(oracle.metrics(values, fills, i * 250, (i + 1) * 250), expected)
            groups += 1
        fill_by_time = {}
        for fill in ledger["fills"]:
            fill_by_time.setdefault(fill["time"], []).append(fill)
        previous, pending, episode = None, None, None
        for offset, event in enumerate(events):
            index, bar = start + offset, bars[offset]
            before, requested, native, accepted = [event[key] for key in ["before", "requested", "native", "accepted"]]
            assert event["index"] == index and event["time"] == bar["time"]
            assert event["signals"] == signal_by_index.get(index, [])
            assert event["selection"] == selection_by_index.get(index)
            assert event["pendingBefore"] == pending
            if previous is not None:
                assert before == previous
            inputs = event["signals"]
            invalid_sequence = any(left["direction"] == "reduce" and any(right["direction"] == "increase" for right in inputs[i + 1:])
                                   for i, left in enumerate(inputs))
            direction = None if invalid_sequence or not inputs else inputs[-1]["direction"]
            assert event["direction"] == direction
            full_exit = before["allocation"] > 1e-10 and native["allocation"] <= 1e-10
            early = (before["entryIndex"] is not None and index - before["entryIndex"] <= 5 and before["entryClose"] > 0
                     and bar["close"] <= before["entryClose"] * .96)
            shock = (average7[index] is not None and bar["close"] < average7[index] and volatility14[index - 1] is not None
                     and all_bars[index - 1]["close"] - bar["close"] >= 2 * volatility14[index - 1])
            risk = full_exit and (native["stoppedAt"] == index or early or shock)
            assert event["risk"] == risk
            necessary = full_exit and before["pending"] is not None and event["noPending"] > 1e-10
            assert event["pendingNecessary"] == necessary
            source_kind = (None if not full_exit else "risk" if risk else "base-clear"
                           if direction == "reduce" and event["requestedTarget"] <= 1e-10 else "base-pending"
                           if necessary and pending is not None and pending["origin"] == "base" else "controller")
            assert event["exitSource"] == source_kind
            if episode is not None and index > episode["index"]:
                episode["high"] = max(episode["high"], bar["high"])
                episode["low"] = min(episode["low"], bar["low"])
            assert (episode is None) == (event["episode"] is None)
            measure = None
            if episode is not None:
                for key, value in episode.items():
                    assert math.isclose(value, event["episode"][key], abs_tol=1e-8)
                measure = (episode["high"] - episode["low"]) / episode["cost"] * 100
                assert math.isclose(measure, event["measure"], abs_tol=1e-8)
                episode_checks += 1
            exempt = row["basePriority"] and source_kind in ["base-clear", "base-pending"]
            blocked = (row["threshold"] > 0 and full_exit and not risk and not exempt and measure is not None
                       and measure < row["threshold"] - 1e-10)
            assert event["blocked"] == blocked
            if blocked:
                partial = (row["basePriority"] and direction == "reduce" and event["requestedTarget"] > 1e-10
                           and requested["allocation"] > 1e-10 and requested["allocation"] < before["allocation"] - 1e-10)
                keep = requested["allocation"] if partial else before["allocation"]
                assert accepted["allocation"] == keep and accepted["pending"] == 0
                for key in ["entryIndex", "entryClose", "lastSupplement", "recoveryTarget", "stoppedAt", "blockedUntil"]:
                    assert accepted[key] == before[key]
                assert accepted["lastClosedIndex"] == index and accepted["previousCloseAllocation"] == keep
            else:
                assert accepted == native
            assert event["target"] == accepted["allocation"]
            pending = event["pendingAfter"]
            assert (pending is None) == (accepted["pending"] is None)
            for fill in fill_by_time.get(bar["time"], []):
                if fill["fromAllocation"] <= 1e-10 and fill["targetAllocation"] > 1e-10:
                    episode = dict(index=index, cost=fill["fillPrice"] * (1 + settings["commissionRate"]),
                                   high=fill["fillPrice"], low=fill["fillPrice"])
                if fill["targetAllocation"] <= 1e-10:
                    episode = None
            previous = accepted
            trace_checks += 1
        assert ledger["cursor"]["overlay"] == previous
        assert ledger["cursor"]["pending"] == pending
        # Deferred-spell boundaries are independently checked from accepted traces.
        active, spells = None, []
        for event in events:
            if active is None and event["blocked"]:
                active = dict(first=event["time"], blocked=0, late=0)
            if active is None:
                continue
            active["blocked"] += int(event["blocked"])
            before, index = event["before"], event["index"]
            active["late"] += int(before["entryIndex"] is not None and index - before["entryIndex"] > 5 and before["entryClose"] > 0
                                  and all_bars[index]["close"] <= before["entryClose"] * .96 and before["allocation"] > 1e-10)
            outcome = ("risk-exit" if event["risk"] else "full-exit") if event["target"] <= 1e-10 else (
                "cancelled-by-increase" if event["direction"] == "increase" and event["accepted"]["pending"] != 0 else None)
            if outcome:
                spells.append((active["first"], event["time"], active["blocked"], active["late"], outcome))
                active = None
        if active is not None:
            spells.append((active["first"], events[-1]["time"], active["blocked"], active["late"], "pending-at-end"))
        expected_spells = ledger["diagnostics"]["spells"]
        assert len(spells) == len(expected_spells)
        for actual, expected in zip(spells, expected_spells):
            assert actual == (expected["first"], expected["end"], expected["blockedAttempts"], expected["postEarlyLossDays"], expected["outcome"])
            spell_checks += 1
    result = dict(identity=identity, status="passed", policies=5, metricGroups=groups, traceChecks=trace_checks,
                  episodeChecks=episode_checks, deferredSpellChecks=spell_checks, independentEmaAtr=True, allEconomicFills=True)
    path = ROOT / "output" / identity / "python-audit.json"
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(result), encoding="utf-8")
    os.replace(temporary, path)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
