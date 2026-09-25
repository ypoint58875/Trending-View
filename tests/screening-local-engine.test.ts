import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { serialize } from "node:v8";
import { runScreeningWithValidation } from "../lib/analysis/screening-validation";
import type { LocalScreeningJobRequest } from "../lib/analysis/screening-local-engine-protocol";
import { STRATEGIES } from "../lib/analysis/strategies";
import {
  packMarketBars,
  unpackMarketBars,
} from "../lib/analysis/screening-worker-bars";
import { encodeLocalScreeningJobRequest } from "../lib/analysis/screening-local-engine-bars";
import { buildCheckpointIdentity } from "../lib/analysis/screening-worker-client";
import { screeningCheckpointInterval } from "../lib/analysis/screening-memory-policy";
import type { MarketBar } from "../lib/market/types";

function makeBars(length: number): MarketBar[] {
  let previousClose = 100;
  return Array.from({ length }, (_, index) => {
    const time = new Date(Date.UTC(2025, 0, index + 1))
      .toISOString()
      .slice(0, 10);
    const open = previousClose;
    const close = open + Math.sin(index / 7) * 1.8 + 0.15;
    previousClose = close;
    return {
      time,
      timestamp: Date.parse(`${time}T00:00:00Z`),
      open,
      high: Math.max(open, close) + 0.8,
      low: Math.min(open, close) - 0.8,
      close,
      volume: 10_000 + index,
      amount: close * (10_000 + index),
      amplitude: 1,
      changePercent: ((close - open) / open) * 100,
      change: close - open,
      turnoverRate: 1,
    };
  });
}

test("uses a tighter screening checkpoint cadence for KS11-sized histories", () => {
  const eightGiB = 8 * 1_073_741_824;

  assert.equal(screeningCheckpointInterval(6_680, eightGiB), 2_048);
  assert.equal(screeningCheckpointInterval(6_680), 2_048);
  assert.equal(screeningCheckpointInterval(4_000, eightGiB), 2_048);
  assert.equal(
    screeningCheckpointInterval(4_000, 16 * 1_073_741_824),
    8_192,
  );
  assert.equal(
    screeningCheckpointInterval(1_000, 32 * 1_073_741_824),
    16_384,
  );
});

test("changes the screening checkpoint identity when any market bar changes", () => {
  const bars = makeBars(20);
  const settings = {
    initialCash: 100_000,
    commissionRate: 0,
    slippageRate: 0,
    interval: "1d" as const,
  };
  const config = { mode: "sample" as const, periods: [{ sessions: 20, weight: 100 }] };
  const options = { objective: "balanced" as const, checkpointNamespace: "nikkei:1d" };
  const original = buildCheckpointIdentity(bars, settings, config, options);
  const identical = buildCheckpointIdentity(
    bars.map((bar) => ({ ...bar })),
    { ...settings },
    { mode: "sample", periods: [{ sessions: 20, weight: 100 }] },
    { ...options },
  );
  const updatedBars = bars.map((bar, index) =>
    index === bars.length - 1 ? { ...bar, close: bar.close + 0.01 } : bar,
  );
  const updated = buildCheckpointIdentity(updatedBars, settings, config, options);
  const appended = buildCheckpointIdentity(
    [...bars, { ...bars.at(-1)!, time: "2026-01-01", timestamp: Date.parse("2026-01-01T00:00:00Z") }],
    settings,
    config,
    options,
  );
  const differentObjective = buildCheckpointIdentity(bars, settings, config, {
    ...options,
    objective: "sharpe",
  });

  assert.equal(identical.signature, original.signature);
  assert.notEqual(updated.signature, original.signature);
  assert.notEqual(appended.signature, original.signature);
  assert.notEqual(differentObjective.signature, original.signature);
});

function runChildOnce(jobDirectory: string): Promise<number | null> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        resolve("scripts/screening-engine-child.ts"),
        jobDirectory,
      ],
      { cwd: resolve("."), windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0 || code === 75) resolvePromise(code);
      else reject(new Error(stderr || `Screening child exited with ${code}`));
    });
  });
}

async function runChild(jobDirectory: string): Promise<number> {
  let restarts = 0;
  while (true) {
    const code = await runChildOnce(jobDirectory);
    if (code === 0) return restarts;
    restarts += 1;
    await readFile(join(jobDirectory, "checkpoint", "manifest.json"));
    assert.ok(restarts < 100, "screening child restart loop did not converge");
  }
}

test("local screening child matches the shared in-process screening core", async () => {
  const directory = await mkdtemp(join(tmpdir(), "quantscope-screening-"));
  const bars = makeBars(160);
  const excludedStrategyIds = STRATEGIES.filter(
    (strategy) => strategy.id !== "sma-cross",
  ).map((strategy) => strategy.id);
  const request: LocalScreeningJobRequest = {
    version: 6,
    bars,
    settings: {
      initialCash: 100_000,
      commissionRate: 0.0003,
      slippageRate: 0.0002,
      interval: "1d",
      executionPolicy: "next-open",
    },
    config: { mode: "sample", periods: [{ sessions: 128, weight: 100 }] },
    checkpoint: { key: "test", signature: "deterministic-test" },
    options: { objective: "totalReturn", excludedStrategyIds },
  };
  try {
    const sharedBarsPath = join(directory, "shared-bars.bin");
    const sharedDerivedPath = join(directory, "shared-derived.bin");
    await writeFile(
      join(directory, "request.json"),
      JSON.stringify({
        ...request,
        bars: undefined,
        barCount: request.bars.length,
        sharedBarsPath,
        sharedDerivedPath,
      }),
    );
    await writeFile(
      sharedBarsPath,
      serialize(packMarketBars(request.bars)),
    );
    const expected = await runScreeningWithValidation(
      request.bars,
      request.settings,
      request.config,
      request.options,
    );
    const restarts = await runChild(directory);
    assert.ok(restarts > 0, "test must exercise disk-checkpoint continuation");
    await readFile(sharedDerivedPath);
    const actual = JSON.parse(
      await readFile(join(directory, "result.json"), "utf8"),
    );
    assert.deepEqual(actual, JSON.parse(JSON.stringify(expected)));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("local screening upload keeps bars columnar and lossless", () => {
  const bars = makeBars(12);
  const request: LocalScreeningJobRequest = {
    version: 6,
    bars,
    settings: {
      initialCash: 100_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
      executionPolicy: "next-open",
    },
    config: { mode: "sample", periods: [{ sessions: 3, weight: 100 }] },
    checkpoint: { key: "binary", signature: "binary" },
    options: {},
  };
  const encoded = encodeLocalScreeningJobRequest(request);
  const view = new DataView(encoded);
  const headerLength = view.getUint32(0, true);
  const header = JSON.parse(
    new TextDecoder().decode(new Uint8Array(encoded, 4, headerLength)),
  ) as { bars?: unknown; times: string[] };
  assert.equal(header.bars, undefined);
  const valueBytes = new Uint8Array(encoded, 4 + headerLength);
  const values = new Float64Array(valueBytes.byteLength / 8);
  new Uint8Array(values.buffer).set(valueBytes);
  assert.deepEqual(unpackMarketBars({ times: header.times, values }), bars);
  assert.deepEqual(
    unpackMarketBars({ times: header.times, values }, 5),
    bars.slice(0, 5),
  );
  assert.ok(encoded.byteLength < JSON.stringify(request).length);
});
