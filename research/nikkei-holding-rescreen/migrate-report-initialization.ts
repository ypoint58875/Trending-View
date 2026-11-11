/** One-time, exact-code-verified migration; optimizer/account semantics are unchanged. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, readFile, readdir, writeFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deserialize, serialize } from "node:v8";
import { replaceFileAtomically } from "../../scripts/atomic-file";
const root = dirname(fileURLToPath(import.meta.url)), project = resolve(root, "../..");
const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const latestPath = join(root, "output/latest.json"), latest = JSON.parse(await readFile(latestPath, "utf8"));
assert.equal(latest.identity, "37085861a3cb27628e39539a27f07517e41f83d1bf6add0a762007cee5ae901a");
const oldData: string = latest.data, progress = JSON.parse(await readFile(join(oldData, "progress.json"), "utf8"));
assert.equal(progress.status, "failed", "Stop the owned runner before migration");
const inputText = await readFile(join(oldData, "input.json"), "utf8");
const signalText = await readFile(join(oldData, "original-signals.json"), "utf8");
const paths = (await readdir(join(project, "lib/analysis"), { recursive: true })).filter(p => p.endsWith(".ts")).sort();
const code = await Promise.all([...paths.map(p => join(project, "lib/analysis", p)),
  join(root, "run.ts"), join(root, "model.ts"), join(root, "../nikkei-screening-skip-audit/model.ts"),
  join(project, "scripts/screening-engine-child.ts"), join(project, "scripts/atomic-file.ts")].map(p => readFile(p, "utf8")));
const runOffset = paths.length, oldCode = [...code];
oldCode[runOffset] = code[runOffset]
  .replace("    const baselineStepper = new Stepper(bars, settings);\n    let state = baselineStepper.initial(start);", "    let state = stepper.initial(start);")
  .replace("const selected = originals.get(index), next = baselineStepper.step(state", "const selected = originals.get(index), next = stepper.step(state");
assert.notEqual(oldCode[runOffset], code[runOffset]);
assert.equal(sha([inputText, signalText, sha(oldCode.join("\n"))].join("\n")), latest.identity,
  "Migration accepts only the exact baseline-controller initialization fix; all other code/source must match");
const identity = sha([inputText, signalText, sha(code.join("\n"))].join("\n"));
const data = join(root, "data", identity);
assert.ok(resolve(data).startsWith(resolve(root, "data") + "\\"));
await assert.rejects(stat(data), { code: "ENOENT" });
await cp(oldData, data, { recursive: true, errorOnExist: true, force: false });
let jobs = 0, manifests = 0;
for (const name of await readdir(join(data, "jobs"))) {
  assert.match(name, /^\d+$/);
  const job = join(data, "jobs", name), path = join(job, "request.json");
  const request = JSON.parse(await readFile(path, "utf8")), oldSignature = request.checkpoint.signature;
  const signature = JSON.parse(oldSignature);
  assert.ok(signature.namespace.includes(latest.identity));
  signature.namespace = signature.namespace.replace(latest.identity, identity);
  request.checkpoint = { key: `screening:${signature.namespace}`, signature: JSON.stringify(signature) };
  assert.equal(request.sharedBarsPath, join(oldData, "bars.bin")); request.sharedBarsPath = join(data, "bars.bin");
  await writeFile(path, JSON.stringify(request)); jobs++;
  const entries = await readdir(job);
  if (entries.includes("winner.json")) {
    const winnerPath = join(job, "winner.json"), winner = JSON.parse(await readFile(winnerPath, "utf8"));
    winner.requestHash = sha(JSON.stringify(request)); await writeFile(winnerPath, JSON.stringify(winner));
  }
  if (entries.includes("checkpoint")) {
    for (const entry of await readdir(join(job, "checkpoint"))) {
      if (!entry.startsWith("manifest")) continue;
      const manifestPath = join(job, "checkpoint", entry);
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      assert.equal(manifest.signature, oldSignature);
      manifest.signature = request.checkpoint.signature;
      await writeFile(manifestPath, JSON.stringify(manifest)); manifests++;
    }
  }
  if (entries.includes("checkpoint.bin")) {
    const checkpointPath = join(job, "checkpoint.bin"), saved = deserialize(await readFile(checkpointPath));
    assert.equal(saved.signature, oldSignature); saved.signature = request.checkpoint.signature;
    await writeFile(checkpointPath, serialize(saved));
  }
}
progress.identity = identity; progress.status = "interrupted"; progress.lastError = null;
progress.migration = { fromIdentity: latest.identity, migratedAt: new Date().toISOString(),
  reason: "Initialize baseline report with a fresh controller; optimizer and alternative account are byte-identical", jobs, manifests };
await writeFile(join(data, "progress.json"), JSON.stringify(progress));
const migrated = { ...latest, identity, data, output: join(root, "output", identity), status: "interrupted", migration: progress.migration };
await writeFile(`${latestPath}.tmp`, JSON.stringify(migrated)); await replaceFileAtomically(`${latestPath}.tmp`, latestPath);
console.log(JSON.stringify({ identity, daysRetained: progress.days.length, extraWinnersRetained: progress.extras.length, jobs, manifests }));
