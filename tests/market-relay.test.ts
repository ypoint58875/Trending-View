import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createLocalMarketRelayRequest } from "../lib/market/local-relay";

test("local market relay request requires a loopback HTTP endpoint", async () => {
  const mutableEnvironment = process.env as Record<
    string,
    string | undefined
  >;
  const previousRelay = process.env.QUANTSCOPE_LOCAL_MARKET_RELAY_URL;
  const previousNodeEnv = process.env.NODE_ENV;
  try {
    mutableEnvironment.NODE_ENV = "test";
    delete process.env.QUANTSCOPE_LOCAL_MARKET_RELAY_URL;
    assert.equal(
      createLocalMarketRelayRequest(
        new URL("https://query1.finance.yahoo.com/v8/finance/chart/SPY"),
        { Accept: "application/json" },
      ),
      null,
    );

    process.env.QUANTSCOPE_LOCAL_MARKET_RELAY_URL =
      "https://example.com/fetch";
    assert.equal(
      createLocalMarketRelayRequest(
        new URL("https://query1.finance.yahoo.com/v8/finance/chart/SPY"),
        { Accept: "application/json" },
      ),
      null,
    );

    process.env.QUANTSCOPE_LOCAL_MARKET_RELAY_URL =
      "http://127.0.0.1:3001/fetch";
    const request = createLocalMarketRelayRequest(
      new URL("https://query1.finance.yahoo.com/v8/finance/chart/SPY"),
      { Accept: "application/json" },
    );
    assert.ok(request);
    assert.equal(request.method, "POST");
    assert.equal(request.url, "http://127.0.0.1:3001/fetch");
    assert.deepEqual(await request.json(), {
      url: "https://query1.finance.yahoo.com/v8/finance/chart/SPY",
      headers: { Accept: "application/json" },
    });

    delete process.env.QUANTSCOPE_LOCAL_MARKET_RELAY_URL;
    mutableEnvironment.NODE_ENV = "development";
    const developmentRequest = createLocalMarketRelayRequest(
      new URL("https://query1.finance.yahoo.com/v8/finance/chart/SPY"),
      { Accept: "application/json" },
    );
    assert.ok(developmentRequest);
    assert.equal(
      developmentRequest.url,
      "http://127.0.0.1:3001/fetch",
    );
  } finally {
    if (previousRelay === undefined) {
      delete process.env.QUANTSCOPE_LOCAL_MARKET_RELAY_URL;
    } else {
      process.env.QUANTSCOPE_LOCAL_MARKET_RELAY_URL = previousRelay;
    }
    if (previousNodeEnv === undefined) {
      delete mutableEnvironment.NODE_ENV;
    } else {
      mutableEnvironment.NODE_ENV = previousNodeEnv;
    }
  }
});

test("local relay is loopback-only and uses a strict source allowlist", async () => {
  const source = await readFile(
    new URL("../scripts/market-relay.mjs", import.meta.url),
    "utf8",
  );

  assert.match(source, /const host = "127\.0\.0\.1"/);
  assert.match(source, /allowedTargets = new Map/);
  assert.match(source, /query1\.finance\.yahoo\.com/);
  assert.match(source, /push2his\.eastmoney\.com/);
  assert.doesNotMatch(source, /authorization/i);
  assert.doesNotMatch(source, /cookie/i);
});
