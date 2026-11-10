import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { replaceFileAtomically } from "../../scripts/atomic-file";
import { runStrategyCycleCloseBacktest, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import { runAllocationBacktest, type BacktestSettings } from "../../lib/analysis/backtest";
import type { MarketBar } from "../../lib/market/types";
import { Features, policies, replay, type Policy } from "./model";

export class NextSessionFeatures extends Features {
  override blocked(index: number, policy: Policy): boolean { return super.blocked(index - 1, policy); }
}
export function referenceGate(bars: MarketBar[], index: number): boolean {
  const smooth = (i: number) => {
    if (i < 21) return null;
    let sum = 0;
    for (let j = i - 2; j <= i; j++) {
      const average = bars.slice(j - 19, j + 1).reduce((total, bar) => total + bar.close, 0) / 20;
      sum += (bars[j].close / average - 1) * 100;
    }
    return sum / 3;
  };
  for (let i = index - 2; i <= index; i++) {
    const current = smooth(i), prior = smooth(i - 1);
    if (current === null || prior === null || current >= prior) return false;
  }
  return true;
}
export async function runCheck() {
  const root = dirname(fileURLToPath(import.meta.url)), sha = (text: string) => createHash("sha256").update(text).digest("hex");
  async function load(path: string) { assert.ok((await stat(path)).size <= 16 * 1024 ** 2); return readFile(path, "utf8"); }
  async function atomic(path: string, value: unknown) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(`${path}.tmp`, typeof value === "string" ? value : JSON.stringify(value)); await replaceFileAtomically(`${path}.tmp`, path);
  }
  const source = join(root, "../nikkei-overlay-stability/data/full-screen-6-15");
  const inputText = await load(join(source, "input.json")), signalText = await load(join(source, "signals.json"));
  const input = JSON.parse(inputText) as { bars: MarketBar[]; settings: BacktestSettings };
  const saved = JSON.parse(signalText) as { sourceHash: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[] };
  assert.equal(saved.sourceHash, "b543028a5db9860a9ac262d8bf65cf6df06f8d625afba728d875ce0d0274873e");
  assert.equal(sha(JSON.stringify(input)), saved.sourceHash); assert.ok(input.bars.length <= 10000 && saved.rows.length <= 2048);
  const identity = sha([saved.sourceHash, await load(fileURLToPath(import.meta.url)), await load(join(root, "model.ts")),
    await load(join(root, "../../lib/analysis/sma-position-overlay.ts"))].join("\n")), output = join(root, "output", `adoption-${identity}`);
  await atomic(join(output, "input.json"), inputText); await atomic(join(output, "signals.json"), signalText);
  await atomic(join(output, "source_registry.jsonl"), JSON.stringify({ source, accessedAt: new Date().toISOString(), sourceHash: saved.sourceHash }) + "\n");
  const { bars, settings } = input, start = bars.length - 2000, decisions = new Map(saved.rows.map((row) => [row.index, row.signals]));
  const features = new Features(bars), next = new NextSessionFeatures(bars);
  const baselinePolicy = policies()[0], gate = policies().find((policy) => policy.id === "20-smooth-bias-down-D3-add")!;
  for (let i = 0; i < bars.length; i++) {
    assert.equal(features.blocked(i, gate), referenceGate(bars, i), `same-close gate at ${i}`);
    assert.equal(next.blocked(i, gate), referenceGate(bars, i - 1), `next-session gate at ${i}`);
  }
  const metrics = (targets: number[], nextOpen: boolean) => {
    const result = nextOpen ? runAllocationBacktest(bars, targets, { ...settings, positionOverlay: undefined, executionPolicy: "next-open" })
      : runStrategyCycleCloseBacktest(bars, targets, settings);
    assert.equal(result.equity.length, 2000);
    const cut = result.equity[1499].equity;
    return { full: result.totalReturn, dd: result.maxDrawdown, final500: (result.finalEquity / cut - 1) * 100, fills: result.rebalances.length };
  };
  const cases = [
    { id: "baseline", features, policy: baselinePolicy, timing: "close" },
    { id: "same-close-filter-reference", features, policy: gate, timing: "close" },
    { id: "next-session-filter-cycle-close", features: next, policy: gate, timing: "close" },
    { id: "baseline-next-open", features, policy: baselinePolicy, timing: "next-open" },
    { id: "next-open-filter-no-extra-lag", features, policy: gate, timing: "next-open" },
  ] as const;
  const rows = [];
  for (const item of cases) {
    const path = replay(item.features, decisions, start, item.policy), partial = replay(item.features, decisions, start, item.policy, start + 1000);
    assert.deepEqual(replay(item.features, decisions, start, item.policy, bars.length, JSON.parse(JSON.stringify(partial))), path);
    const prefix = item.features instanceof NextSessionFeatures ? new NextSessionFeatures(bars.slice(0, start + 1500)) : new Features(bars.slice(0, start + 1500));
    assert.deepEqual(replay(prefix, decisions, start, item.policy).targets, path.targets.slice(0, prefix.bars.length));
    const row = { id: item.id, ...metrics(path.targets, item.timing === "next-open"), blocked: path.events.length };
    rows.push(row); await atomic(join(output, `${item.id}.json`), { identity, row, path });
    assert.ok(process.memoryUsage().rss < 1.5 * 1024 ** 3);
  }
  assert.equal(rows[0].full, 440.9807031454993);
  assert.ok(Math.abs(rows[1].full - 444.10259170640904) < 1e-8);
  assert.ok(Math.abs(rows[4].full - 473.3788381599507) < 1e-8);
  await atomic(join(output, "summary.json"), { identity, rows, referenceGateChecks: bars.length * 2, prefixes: 5, resumes: 5 });
  const table = ["| Case | Full % | MaxDD % | Final500 % | Fills | Blocked adds |", "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...rows.map((row) => `| ${row.id} | ${row.full.toFixed(2)} | ${row.dd.toFixed(2)} | ${row.final500.toFixed(2)} | ${row.fills} | ${row.blocked} |`)].join("\n");
  await atomic(join(root, "ADOPTION_CHECK.md"), `# Next-session BIAS20 add-gate adoption check\n\nUser clarified that only this rule acts on the next session; the Nikkei page retains its existing close proxy. A close-confirmed BIAS20 SMA3 decline streak>=3 blocks holding adds on the following session. Flat entries, reductions and stops are unchanged. A flat/rising observation removes the next-session restriction; no deferred buy is invented.\n\n${table}\n\nOrdinary next-open execution reads the signal-close gate without another lag. Cycle close execution reads the previous session's gate. Do not claim473.38% for the cycle-close configuration. Reference gate uses independent literal20-close means and3-point averages; all${bars.length * 2} boolean comparisons agree. Five paths pass serialized account resume and causal prefixes. Same frozen2000 sessions2018-08-09..2026-10-26,3bps commission+2bps slippage; not prospective validation. No production implementation at this check stage.\n`);
  console.log(JSON.stringify({ identity, rows }));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await runCheck();
