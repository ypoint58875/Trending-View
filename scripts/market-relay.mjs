import { createServer } from "node:http";

const host = "127.0.0.1";
const port = 3001;
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
]);
const forwardedHeaderNames = new Set([
  "accept",
  "accept-language",
  "referer",
  "user-agent",
]);

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
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "application/json",
  });
  response.end(body);
}

const server = createServer(async (request, response) => {
  if (
    request.method === "GET" &&
    request.url === "/health"
  ) {
    writeJson(response, 200, { ready: true });
    return;
  }
  if (request.method !== "POST" || request.url !== "/fetch") {
    writeJson(response, 404, { error: "NOT_FOUND" });
    return;
  }

  try {
    const payload = await readJsonBody(request);
    const target = new URL(
      typeof payload?.url === "string" ? payload.url : "",
    );
    if (!isAllowedTarget(target)) {
      writeJson(response, 403, { error: "TARGET_NOT_ALLOWED" });
      return;
    }

    const upstream = await fetch(target, {
      headers: filteredHeaders(payload.headers),
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    const body = Buffer.from(await upstream.arrayBuffer());
    response.writeHead(upstream.status, {
      "Cache-Control": "no-store",
      "Content-Length": body.length,
      "Content-Type":
        upstream.headers.get("content-type") || "application/octet-stream",
    });
    response.end(body);
  } catch {
    writeJson(response, 502, { error: "RELAY_UPSTREAM_UNAVAILABLE" });
  }
});

server.listen(port, host);

function closeServer() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", closeServer);
process.on("SIGTERM", closeServer);
