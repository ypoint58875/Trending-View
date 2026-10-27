import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { atomic, root } from "./analyze";
import { replaceFileAtomically } from "../../scripts/atomic-file";
import type { MarketBar } from "../../lib/market/types";

async function bounded(path: string) { assert.ok((await stat(path)).size <= 16 * 1024 ** 2); return readFile(path, "utf8"); }
async function main() {
  const source = join(root, "output/exit-priority"), output = join(root, "output/exit-priority-audit");
  const input = JSON.parse(await bounded(join(root, "data/full-screen-6-15/input.json"))) as { bars: MarketBar[] };
  const sha = (value: string) => createHash("sha256").update(value).digest("hex");
  const sourceHash = sha(JSON.stringify(input));
  const baseline = JSON.parse(await bounded(join(source, "ema3-baseline.json")));
  const age10 = JSON.parse(await bounded(join(source, "ema3-best-full.json")));
  const atr2 = JSON.parse(await bounded(join(source, "ema3-balanced.json")));
  assert.equal(baseline.sourceHash, sourceHash); assert.equal(age10.sourceHash, sourceHash); assert.equal(atr2.sourceHash, sourceHash);
  assert.equal(age10.policy.method, "loss4-age10"); assert.equal(atr2.policy.method, "shock-atr2"); assert.equal(age10.exits.length, 1);
  const { bars } = input; assert.ok(bars.length <= 10000);
  const event = age10.exits[0], index = bars.findIndex(bar => bar.time === event.time); assert.ok(index >= bars.length - 2000);
  assert.deepEqual(age10.targets.slice(0, index), baseline.targets.slice(0, index));
  let entry = index;
  while (entry > 0 && baseline.targets[entry - 1] > 1e-10) entry--;
  const oldExit = baseline.targets.findIndex((target: number, cursor: number) => cursor > index && target <= 1e-10);
  const newEntry = age10.targets.findIndex((target: number, cursor: number) => cursor > index && target > 1e-10);
  assert.ok(oldExit > index && newEntry > index);
  const tailMatches = { age10: JSON.stringify(age10.targets.slice(-500)) === JSON.stringify(baseline.targets.slice(-500)),
    atr2: JSON.stringify(atr2.targets.slice(-500)) === JSON.stringify(baseline.targets.slice(-500)) };
  assert.equal(tailMatches.age10, true); assert.equal(tailMatches.atr2, true);
  const audit = { sourceHash, generatedAt: new Date().toISOString(),
    implementationHash: sha(age10.implementationHash + await readFile(fileURLToPath(import.meta.url), "utf8")),
    commonEntry: bars[entry]!.time, entryClose: bars[entry]!.close, earlyExit: event.time,
    entryAge: event.evidence.entryAge, closeEntryLossPercent: event.evidence.entryLoss * 100,
    pendingOriginalZeroRequest: event.pendingIndex, baselineExit: bars[oldExit]!.time, barsEarlier: oldExit - index,
    newReentry: bars[newEntry]!.time, atr2Exits: atr2.exits, final500TargetsIdentical: tailMatches,
    baseline: { full: baseline.totalReturn, final500: baseline.final500, dd: baseline.maxDrawdown, nextOpen: baseline.nextOpen },
    age10: { full: age10.totalReturn, final500: age10.final500, dd: age10.maxDrawdown, nextOpen: age10.nextOpen },
    atr2: { full: atr2.totalReturn, final500: atr2.final500, dd: atr2.maxDrawdown, nextOpen: atr2.nextOpen },
    limitation: "Single extra age10 exit, six ATR2 exits, all before final500. Earlier baseline exit comparison is retrospective and paths diverge after the stop; it is not additive independent-trade profit. No new validation sample or grid additions." };
  await atomic(join(output, "summary.json"), audit);
  await writeFile(join(output, "REPORT.md.tmp"), `# Concentration audit of earlier-risk exits\n\nCurrent EMA3 baseline entry:${audit.commonEntry}; additional age10 exit:${audit.earlyExit}, entry age${audit.entryAge}, close loss${audit.closeEntryLossPercent.toFixed(3)}%. No pending original full-sell request at that time. Baseline finally exits:${audit.baselineExit},${audit.barsEarlier} bars later; changed account reenters:${audit.newReentry}. Targets before the extra exit match exactly.\n\nExtending the first-five4% entry-loss stop to ten bars therefore catches a risk gap at age7, rather than overriding a pending original sell. Only one extra exit contributes to its historical change. A4% trigger is not a guaranteed4% fill loss.\n\nAge10/ATR2 final500 targets both exactly match baseline. Neither improves final500 return. ATR2 adds six exits including the same2022-12-20 event; these outcomes are correlated, not independent validations.\n\nBaseline:${audit.baseline.full.toFixed(3)}%/DD${(-audit.baseline.dd).toFixed(3)}%; age10:${audit.age10.full.toFixed(3)}%/DD${(-audit.age10.dd).toFixed(3)}%; ATR2:${audit.atr2.full.toFixed(3)}%/DD${(-audit.atr2.dd).toFixed(3)}%. Next-open age10 DD equals baseline, while ATR2 DD improves only slightly; read summary.json for matched metrics.\n\n${audit.limitation}\n`);
  await replaceFileAtomically(join(output, "REPORT.md.tmp"), join(output, "REPORT.md"));
  console.log(JSON.stringify({ earlyExit: audit.earlyExit, baselineExit: audit.baselineExit, barsEarlier: audit.barsEarlier,
    newReentry: audit.newReentry, entryAge: audit.entryAge, final500TargetsIdentical: tailMatches }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
