# Directional bursts versus range segmentation

User purpose: distinguish rapid one-way rises/falls from back-and-forth range
movement. Do not treat every high-ATR day as a directional crash/rally or force
the whole post-July21 interval into one label. Research only; no strategy tuning.
Use all6566 frozen source bars2000-01-04..2026-10-26, and separately summarize
the existing2000-session study. Price sources/earlier outputs remain unchanged.

Compare a simple moving-average-slope plus ATR classification with adding path
efficiency and fast event flags. ADX/DMI is a mainstream alternative, but adds
another Wilder smoothing layer and does not by itself identify direction or
an unusual displacement. Prefer an interpretable EMA20/ATR14/ER10 description
for this first segmentation, without claiming universal optimal thresholds.

Freeze primary EMA20 and three-session confirmation. Sensitivity only:
EMA14/20/30 and SMA20, each at1/3/5-session confirmation (12 configurations).
No return ranking, threshold fitting or selecting the best July21 label.
Features at completed close t:
- MA direction strength=(MA[t]-MA[t-5])/(5*WilderATR14[t]), in ATR per session.
- Five-session displacement=(close[t]-close[t-5])/ATR14[t-1].
- Five-session return=close[t]/close[t-5]-1.
- ER10=absolute ten-session close displacement/sum of absolute daily moves.
- Relative volatility: ATR14/close ranked against preceding252 ATR-percent
  observations, excluding today. Wide volatility enters at rank>=0.6 and
  leaves at rank<=0.4 after the same consecutive-confirmation count.

Raw phases, evaluated in this priority:
1. Rapid-up/down: MA strength >=0.05 / <=-0.05; directional five-session
   displacement >=2 / <=-2 ATR; directional five-session return >=3% / <=-3%;
   ER10>=0.45. These are relative/absolute operational definitions, not a
   claim about every human-labeled historical crash or rally.
2. Range: ER10<=0.25, or abs(MA strength)<=0.025 and abs(displacement)<1 ATR.
3. Ordinary up/down: MA strength >=0.05 / <=-0.05 and ER10>=0.25.
4. Transition: none of the above. Warmup until all inputs and confirmation exist.
Confirmed phase switches only after the declared number of consecutive raw
labels; no retrospective backfill. Range phase has wide/normal ATR sublabels;
volatility remains an independent attribute for every other phase as well.

Separate fast shock flag: abs(today close-previous close)>=2 previous ATR,
and abs(daily return)>=2%. Up/down event is visible at today's close, without
waiting for MA confirmation. It is an event marker, not an automatic rewrite
of the background regime. A range can contain an isolated shock and remain
a range; a newly directional burst can initially carry a shock plus old label.

Store raw/confirmed close-time labels and an effective label shifted one bar
forward for causal use. Segment starts are actual effective switch dates, not
future-discovered extrema. Forward observed same-segment market returns/DD
are descriptive, never input labels or a strategy return. Closed segments end
when a different effective label appears; final segment is still open.

Report complete segment CSV/daily JSON, twelve-case fragmentation/agreement,
state occupancy, single-day segment count and median length, plus all-source,
last2000 and recent charts. Plot with local matplotlib, English labels, no
runtime product dependency. Source/bars/design/code hashes and source access
time are recorded. Small bounded twelve-case classification:16MiB/file,
10000 bars,12 configurations,RSS1.5GiB. Atomic derived outputs under
output/ma-atr-segmentation regenerate deterministically; no growing cache,
scheduler or checkpoint. Preserve all source and earlier research artifacts.
Test equal-volatility different directions, range versus burst, confirmation
without backfill, warmup, shock lag, exact segment coverage and all12 prefix
causal paths. Run focused tests/typecheck and visually inspect generated plots.
