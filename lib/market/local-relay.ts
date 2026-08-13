const LOCAL_MARKET_RELAY_ENV = "QUANTSCOPE_LOCAL_MARKET_RELAY_URL";
const DEFAULT_LOCAL_MARKET_RELAY_URL =
  "http://127.0.0.1:3001/fetch";

function configuredLocalMarketRelayUrl(): string | null {
  if (typeof process === "undefined") return null;
  const configured = process.env[LOCAL_MARKET_RELAY_ENV]?.trim();
  if (configured) return configured;
  return process.env.NODE_ENV === "development"
    ? DEFAULT_LOCAL_MARKET_RELAY_URL
    : null;
}

export function createLocalMarketRelayRequest(
  target: URL,
  headers: Record<string, string>,
): Request | null {
  const relayUrl = configuredLocalMarketRelayUrl();
  if (!relayUrl) return null;

  let parsedRelay: URL;
  try {
    parsedRelay = new URL(relayUrl);
  } catch {
    return null;
  }
  if (
    parsedRelay.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(parsedRelay.hostname)
  ) {
    return null;
  }

  return new Request(parsedRelay, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: target.toString(),
      headers,
    }),
  });
}
