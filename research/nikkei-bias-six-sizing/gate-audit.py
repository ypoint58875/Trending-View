"""Independent reference masks, all daily equities and economic fills."""
import json
import math
from pathlib import Path

root = Path(__file__).resolve().parent
path = max((root / "output" / "gates").glob("*/summary.json"), key=lambda p: p.stat().st_mtime)
summary = json.loads(path.read_text())
identity = summary["identity"]
source = json.loads((root / "data" / "gates" / identity / "input.json").read_text())
bars = source["bars"]
start = len(bars)-2000
closes = [b["close"] for b in bars]
means = [None if i < 19 else math.fsum(closes[i-19:i+1])/20 for i in range(len(bars))]
raw_bias = [None if m is None else (closes[i]/m-1)*100 for i, m in enumerate(means)]
raw_slope = [None if i < 20 else m-means[i-1] for i, m in enumerate(means)]
def smooth(values):
    return [None if i < 2 or None in values[i-2:i+1] else math.fsum(values[i-2:i+1])/3 for i in range(len(values))]
bias, slope = smooth(raw_bias), smooth(raw_slope)
def falls(values, i):
    return i > 0 and values[i] is not None and values[i-1] is not None and values[i] < values[i-1]
b = [i >= 3 and all(falls(bias, j) for j in (i,i-1,i-2)) for i in range(len(bars))]
s = [falls(slope,i) and slope[i-2] is not None and slope[i-1] >= slope[i-2] for i in range(len(bars))]
current = [False] + b[:-1]
expected = {"current":current,"off":[False]*len(bars),"bias":b,"slope":s,
            "and":[x and y for x,y in zip(b,s)],"or":[x or y for x,y in zip(b,s)],
            "current-plus-slope":[x or y for x,y in zip(current,s)],
            "current-plus-and":[x or (y and z) for x,y,z in zip(current,b,s)]}
def near(a,b,tol=1e-6):
    assert abs(a-b)<tol, (a,b)
for row in summary["rows"]:
    case = json.loads((path.parent / f'{row["id"]}.json').read_text())
    assert case["mask"] == expected[row["id"]]
    cash, units, previous, planned = source["settings"]["initialCash"],0,0,0
    commission,slippage = source["settings"]["commissionRate"],source["settings"]["slippageRate"]
    fills=[]
    def trade(price,target,time):
        global cash,units
        desired=(cash+units*price)*target/price
        delta=desired-units
        tolerance=max(desired,units,1)*1e-10
        if delta > tolerance:
            fill_price=price*(1+slippage)
            quantity=min(delta,cash/(fill_price*(1+commission)))
            if quantity<=tolerance:return
            cash-=quantity*fill_price*(1+commission)
            units+=quantity
        elif delta < -tolerance:
            fill_price=price*(1-slippage)
            quantity=min(-delta,units)
            if quantity<=tolerance:return
            cash+=quantity*fill_price*(1-commission)
            units-=quantity
        else:return
        fills.append((time,target,fill_price))
    equity=[]
    for i in range(start,len(bars)):
        target=case["path"]["targets"][i]
        if abs(previous-planned)>1e-10:
            trade(bars[i]["open"],previous,bars[i]["time"])
            planned=previous
        if abs(target-previous)>1e-10 and abs(target-planned)>1e-10:
            trade(bars[i]["close"],target,bars[i]["time"])
            planned=target
        previous=target
        value=cash+units*bars[i]["close"]
        near(value,case["equity"][i-start]["equity"])
        equity.append(value)
    assert len(fills)==len(case["fills"])==row["fills"]
    for (time,target,price),fill in zip(fills,case["fills"]):
        assert time==fill["time"]
        near(target,fill["targetAllocation"])
        near(price,fill["fillPrice"])
    near(row["full"],(equity[-1]/source["settings"]["initialCash"]-1)*100)
    for left,right,key in ((0,1000,"train"),(1000,1500,"validation"),(1500,2000,"final500")):
        near(row[key],(equity[right-1]/(equity[left-1] if left else source["settings"]["initialCash"])-1)*100)
    peak=source["settings"]["initialCash"]
    dd=0
    for value in equity:
        peak=max(peak,value)
        dd=min(dd,(value/peak-1)*100)
    near(dd,row["dd"])
print(f"PASS:8 independent gate masks,16000 daily equities,all fills/full and split returns/drawdowns;{identity}")
