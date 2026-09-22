import { createServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createScreeningEngineCoordinator } from "./screening-engine-coordinator.mjs";

const host = "127.0.0.1";
const port = 3001;
const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const screeningEngine = createScreeningEngineCoordinator({ rootDirectory });
const allowedTargets = new Map([
  [
    "query1.finance.yahoo.com",
    ["/v1/finance/search", "/v8/finance/chart/"],
  ],
  [
    "query2.finance.yahoo.com",
    ["/v1/finance/search", "/v8/finance/chart/"],
  ],
  [
    "searchapi.eastmoney.com",
    ["/api/suggest/get"],
  ],
  [
    "push2his.eastmoney.com",
    ["/api/qt/stock/kline/get"],
  ],
  [
    "push2.eastmoney.com",
    ["/api/qt/stock/kline/get"],
  ],
  [
    "web.ifzq.gtimg.cn",
    ["/appstock/app/fqkline/get"],
  ],
  [
    "qt.gtimg.cn",
    ["/q="],
  ],
]);
const forwardedHeaderNames = new Set([
  "accept",
  "accept-language",
  "referer",
  "user-agent",
]);
const directDomesticHosts = new Set([
  "searchapi.eastmoney.com",
  "push2his.eastmoney.com",
  "push2.eastmoney.com",
  "web.ifzq.gtimg.cn",
  "qt.gtimg.cn",
]);
const MAX_UPSTREAM_RESPONSE_BYTES = 16 * 1024 * 1024;

function isAllowedTarget(target) {
  if (target.protocol !== "https:") return false;
  const pathPrefixes = allowedTargets.get(target.hostname);
  return Boolean(
    pathPrefixes?.some((pathPrefix) =>
      target.pathname.startsWith(pathPrefix),
    ),
  );
}

function filteredHeaders(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([name, headerValue]) =>
          forwardedHeaderNames.has(name.toLowerCase()) &&
          typeof headerValue === "string" &&
          headerValue.length <= 512,
      )
      .map(([name, headerValue]) => [name, headerValue]),
  );
}

function requestDirect(target, headers, redirectCount = 0) {
  return new Promise((resolvePromise, reject) => {
    const request = (target.protocol === "https:" ? httpsRequest : httpRequest)(
      target,
      { agent: false, headers, method: "GET", timeout: 15_000 },
      (upstream) => {
        const status = upstream.statusCode ?? 502;
        const location = upstream.headers.location;
        if (
          status >= 300 &&
          status < 400 &&
          location &&
          redirectCount < 2
        ) {
          upstream.resume();
          const redirected = new URL(location, target);
          if (!isAllowedTarget(redirected)) {
            reject(new Error("Redirect target is not allowed"));
            return;
          }
          requestDirect(redirected, headers, redirectCount + 1).then(
            resolvePromise,
            reject,
          );
          return;
        }
        const chunks = [];
        let size = 0;
        upstream.on("data", (chunk) => {
          size += chunk.length;
          if (size > MAX_UPSTREAM_RESPONSE_BYTES) {
            upstream.destroy(new Error("Upstream response is too large"));
            return;
          }
          chunks.push(chunk);
        });
        upstream.on("end", () => {
          resolvePromise({
            body: Buffer.concat(chunks),
            contentType:
              upstream.headers["content-type"] || "application/octet-stream",
            status,
          });
        });
        upstream.on("error", reject);
      },
    );
    request.on("timeout", () =>
      request.destroy(new Error("Direct request timed out")),
    );
    request.on("error", reject);
    request.end();
  });
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 32_768) throw new Error("Request body is too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function writeJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "application/json",
  });
  response.end(body);
}

async function handleRequest(request, response) {
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
      "Access-Control-Allow-Origin": "*",
    });
    response.end();
    return;
  }
  if (
    request.method === "GET" &&
    request.url === "/health"
  ) {
    writeJson(response, 200, { ready: true, ...screeningEngine.health });
    return;
  }
  if (await screeningEngine.handle(request, response)) return;
  if (request.method !== "POST" || request.url !== "/fetch") {
    writeJson(response, 404, { error: "NOT_FOUND" });
    return;
  }

  const payload = await readJsonBody(request);
  const target = new URL(
    typeof payload?.url === "string" ? payload.url : "",
  );
  if (!isAllowedTarget(target)) {
    writeJson(response, 403, { error: "TARGET_NOT_ALLOWED" });
    return;
  }

  const headers = filteredHeaders(payload.headers);
  const upstream = directDomesticHosts.has(target.hostname)
    ? await requestDirect(target, headers)
    : await fetch(target, {
        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(15_000),
      }).then(async (fetchResponse) => ({
        body: Buffer.from(await fetchResponse.arrayBuffer()),
        contentType:
          fetchResponse.headers.get("content-type") ||
          "application/octet-stream",
        status: fetchResponse.status,
      }));
  response.writeHead(upstream.status, {
    "Cache-Control": "no-store",
    "Content-Length": upstream.body.length,
    "Content-Type": upstream.contentType,
  });
  response.end(upstream.body);
}

const server = createServer((request, response) => {
  void handleRequest(request, response).catch(() => {
    if (!response.headersSent) {
      writeJson(response, 502, { error: "RELAY_REQUEST_FAILED" });
      return;
    }
    response.destroy();
  });
});

server.headersTimeout = 10_000;
server.requestTimeout = 30_000;
server.keepAliveTimeout = 5_000;
server.maxRequestsPerSocket = 100;
server.on("clientError", (_error, socket) => socket.destroy());

server.listen(port, host);

function closeServer() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", closeServer);
process.on("SIGTERM", closeServer);
