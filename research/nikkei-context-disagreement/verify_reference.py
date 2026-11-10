"""Independently audit event identities, chart values and portfolio cash flows."""
import csv
from datetime import date
import hashlib
import json
from pathlib import Path
import statistics

ROOT = Path(__file__).resolve().parent
rows = list(csv.DictReader((ROOT / "data/raw.csv").open(encoding="utf-8")))
assert 0 < len(rows) <= 10000
closes = [float(row["close"]) for row in rows]
dates = [date.fromisoformat(row["date"]) for row in rows]


def mean_series(values, length):
    return [None if i < length - 1 or any(v is None for v in values[i-length+1:i+1])
            else statistics.fmean(values[i-length+1:i+1]) for i in range(len(values))]


raw_bias, raw_slope = [], []
for period in (20, 60, 200):
    average = mean_series(closes, period)
    raw_bias.append([None if value is None else (closes[i] / value - 1) * 100
                     for i, value in enumerate(average)])
    raw_slope.append([None if i == 0 or value is None or average[i-1] is None
                      else value - average[i-1] for i, value in enumerate(average)])
curves = [mean_series(values, 3) for values in raw_bias + raw_slope]
changes = [[None if i == 0 or value is None or values[i-1] is None
            else (1 if value > values[i-1] else -1 if value < values[i-1] else 0)
            for i, value in enumerate(values)] for values in curves]
states, streaks, directions = [], [], []
confirmed = candidate = count = 0
for i in range(len(rows)):
    today = [values[i] for values in changes]
    direction = 1 if all(v == 1 for v in today) else -1 if all(v == -1 for v in today) else 0
    count = count + 1 if direction and direction == candidate else 1 if direction else 0
    candidate = direction
    if count >= 3:
        confirmed = direction
    directions.append(direction)
    streaks.append(count)
    states.append(confirmed)

multiple = []
episode = None
for i in range(1, len(rows)):
    initial = False
    if episode is None and streaks[i-1] >= 3 and directions[i] != directions[i-1]:
        episode = {"time": rows[i]["date"], "side": directions[i-1], "seen": set()}
        initial = True
    if episode is None:
        continue
    today = [values[i] for values in changes]
    assert None not in today
    count = today.count(-episode["side"])
    flat = today.count(0)
    if initial:
        multiple.append((i, episode["time"], "initial", count, flat))
    if count and count not in episode["seen"]:
        multiple.append((i, episode["time"], "stage-first", count, flat))
        episode["seen"].add(count)
    if streaks[i] >= 3:
        episode = None
actual = list(csv.DictReader((ROOT / "output/multiple-events.csv").open()))
assert multiple == [(int(row["index"]), row["episode"], row["mode"], int(row["reversed"]), int(row["flat"])) for row in actual]
initial_single = [row for row in actual if row["mode"] == "initial" and row["reversed"] == "1" and row["flat"] == "0"]
single = list(csv.DictReader((ROOT / "output/events.csv").open()))
assert [row["time"] for row in initial_single] == [row["time"] for row in single]


def cutoff(stamp):
    year = stamp.year - 3
    try:
        return stamp.replace(year=year)
    except ValueError:
        return date(year, 2, 28)


for slot, reference in enumerate(json.loads((ROOT / "output/chart-reference.json").read_text())):
    for row in reference["rows"]:
        i = next(i for i, bar in enumerate(rows) if bar["date"] == row["time"])
        for key, expected in (("rawBias", raw_bias[slot][i]), ("smoothBias", curves[slot][i]),
                              ("rawSlope", raw_slope[slot][i]), ("smoothSlope", curves[slot+3][i])):
            assert abs(row[key] - expected) < 1e-7, (slot, row["time"], key)
        history = sorted(value for j, value in enumerate(raw_bias[slot][:i])
                         if value is not None and dates[j] >= cutoff(dates[i]))
        for actual_value, p in zip(row["quantiles"], (.05, .1, .9, .95)):
            rank = (len(history) - 1) * p
            lower = int(rank)
            upper = min(lower + 1, len(history) - 1)
            expected = history[lower] + (history[upper] - history[lower]) * (rank - lower)
            assert abs(actual_value - expected) < 1e-7

summary = json.loads((ROOT / "output/summary.json").read_text())
for result in summary["thresholdPolicyRows"]:
    if result["period"] != "all":
        continue
    trigger_indices = {i for i, _, mode, count, _ in multiple if mode == "stage-first" and count >= result["threshold"]}
    cash, shares, target, suspended, trades = 1.0, 0.0, False, False, 0
    for i, row in enumerate(rows):
        opening = float(row["open"])
        if target and shares == 0:
            shares, cash = cash / (opening * 1.0005), 0.0
            trades += 1
        elif not target and shares:
            cash, shares = shares * opening * .9995, 0.0
            trades += 1
        if i in trigger_indices:
            suspended = True
        if directions[i] == 1 and streaks[i] >= 3:
            suspended = False
        target = states[i] == 1 and not suspended
    assert abs((cash + shares * closes[-1] - 1) * 100 - result["totalReturn"]) < 1e-7
    assert trades == result["trades"]

manifest = json.loads((ROOT / "output/manifest.json").read_text())
assert manifest["status"] == "complete"
for name, expected in manifest["outputs"].items():
    assert hashlib.sha256((ROOT / "output" / name).read_bytes()).hexdigest() == expected
print(json.dumps({"bars": len(rows), "single_events": len(single), "initial_episodes": sum(row[2] == "initial" for row in multiple),
                  "stage_events": sum(row[2] == "stage-first" for row in multiple), "event_mismatches": 0,
                  "chart_tolerance": 1e-7, "threshold_accounts_checked": 6, "manifest_hashes": "passed"}))
