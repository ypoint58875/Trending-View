"""Independent field/count audit and export of retrospective date labels."""
import csv
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def load(path):
    assert path.stat().st_size <= 16 * 1024**2
    return json.loads(path.read_text(encoding="utf-8"))


latest = load(ROOT / "output/latest.json")
out = Path(latest["output"])
summary = load(out / "summary.json")
rows = load(out / "decisions.json")["rows"]
source = load(Path(latest["data"]) / "input.json")
assert len(rows) == len(source["snapshots"]) == summary["decisions"]
previous_plan = None
for row, snapshot in zip(rows, source["snapshots"]):
    assert row["index"] == snapshot["decisionIndex"]
    assert row["time"] == snapshot["decisionTime"]
    actual, omitted = row["actual"], row["omitted"]
    a, b = actual["state"], omitted["state"]
    assert json.loads(a["planKey"]) == {"plan": snapshot["plan"], "fixedRelativeLongStrategy": snapshot["fixedRelativeLongStrategy"]}
    assert b["planKey"] == previous_plan
    previous_plan = a["planKey"]
    fields = [key for key in a["overlay"] if a["overlay"][key] != b["overlay"][key]]
    flags = {
        "fillsEqual": actual["fills"] == omitted["fills"],
        "accountEqual": a["account"] == b["account"],
        "targetEqual": a["target"] == b["target"] and a["planned"] == b["planned"],
        "overlayEqual": not fields,
        "planEqual": a["planKey"] == b["planKey"],
    }
    for key, value in flags.items():
        assert row["comparison"][key] == value
    assert row["comparison"]["changedOverlayFields"] == fields
    assert row["comparison"]["fullEqual"] == all(flags.values())
    assert row["witnessesIndependent"] is False
    assert row["witness"] is not None
    assert not row["witness"]["comparison"]["fullEqual"]

assert sum(row["comparison"]["fillsEqual"] for row in rows) == summary["noFillDifference"]
assert sum(row["comparison"]["accountEqual"] and row["comparison"]["targetEqual"] and row["comparison"]["overlayEqual"] and row["comparison"]["fillsEqual"] for row in rows) == summary["accountAndRiskNeutral"]
assert sum(not row["comparison"]["planEqual"] for row in rows) == summary["carriedPlanChanges"]
assert sum(row["comparison"]["fullEqual"] for row in rows) == summary["hindsightExactNeutral"]
assert summary["strictPreScreenCertified"] == 0
for group in summary["groups"]:
    selected = [row for row in rows if row["rules"][group["name"]]]
    assert group["dates"] == len(selected)
    assert group["hindsightExactNeutral"] == sum(row["comparison"]["fullEqual"] for row in selected)

target = out / "date-classification.csv"
temporary = target.with_suffix(".csv.tmp")
with temporary.open("w", encoding="utf-8", newline="") as file:
    writer = csv.writer(file)
    writer.writerow(["date", "index", "fills_equal", "account_equal", "risk_equal", "plan_equal", "hindsight_exact_neutral", "changed_risk_fields", "witness"])
    for row in rows:
        flags = row["comparison"]
        writer.writerow([row["time"], row["index"], flags["fillsEqual"], flags["accountEqual"], flags["overlayEqual"], flags["planEqual"], flags["fullEqual"], "|".join(flags["changedOverlayFields"]), row["witness"]["name"]])
os.replace(temporary, target)
print(json.dumps({"verified_dates": len(rows), "hindsight_neutral": summary["hindsightExactNeutral"], "rule_only_certified": summary["strictPreScreenCertified"], "date_export": str(target)}))
