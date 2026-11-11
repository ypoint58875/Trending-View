"""Reconcile the complete slope grid against the audited control and daily equity."""
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def load(path):
    assert path.stat().st_size <= 16 * 1024**2
    return json.loads(path.read_text(encoding="utf-8"))


def main():
    latest = load(ROOT / "output/latest.json")
    output = Path(latest["output"])
    study = output / "exit-slope"
    result = load(study / "summary.json")
    assert latest["status"] == "complete" and result["sourceIdentity"] == latest["identity"]
    rows = result["summaries"]
    assert len(rows) == 26 and len({r["policy"] for r in rows}) == 26
    initial = load(Path(latest["data"]) / "input.json")["settings"]["initialCash"]
    reference_days = load(output / "baseline.json")["days"]
    for row in rows:
        key = row["policy"]
        daily = load(study / f"{key}.json")["days"]
        assert len(daily) == len(reference_days) == 2000
        assert [d["time"] for d in daily] == [d["time"] for d in reference_days]
        equity = [d["equity"] for d in daily]
        for field, base, end in [("net", initial, equity[-1]), ("first1500", initial, equity[1499]),
                                 ("last500", equity[-501], equity[-1]), ("last250", equity[-251], equity[-1])]:
            assert math.isclose(row[field], 100 * (end / base - 1), abs_tol=1e-9)
        peak = initial
        drawdown = 0
        for value in equity:
            peak = max(peak, value)
            drawdown = max(drawdown, 100 * (1 - value / peak))
        assert math.isclose(row["maxDrawdown"], drawdown, abs_tol=1e-9)
        fills = [f for day in daily for f in day["fills"]]
        assert len(fills) == row["fills"]
        assert sum(f["fromAllocation"] > 1e-10 and f["targetAllocation"] <= 1e-10 for f in fills) == row["clears"]
        if key in ("original-filter", "standard-rescreen"):
            ref = load(output / ("baseline.json" if key == "original-filter" else "alternative.json"))
            assert fills == ref["fills"]
            assert [(d["target"], d["equity"]) for d in daily] == [(d["target"], d["equity"]) for d in ref["days"]]

    candidates = [r for r in rows if r.get("slopeCase")]
    best = max(candidates, key=lambda r: r["net"])
    early_best = max(candidates, key=lambda r: r["first1500"])
    print(json.dumps({"verifiedDays": len(rows) * 2000, "bestFull": best["policy"],
                      "selectedOnFirst1500": early_best["policy"], "selectedLast500": early_best["last500"]}))


if __name__ == "__main__":
    main()
