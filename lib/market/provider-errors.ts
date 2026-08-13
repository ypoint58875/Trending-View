export const MARKET_PROVIDER_ERROR_CODES = [
  "PROVIDER_CREDENTIAL_INVALID",
  "PROVIDER_ACCESS_DENIED",
  "PROVIDER_QUOTA_LIMITED",
  "PROVIDER_NOT_CONFIGURED",
  "UPSTREAM_UNAVAILABLE",
] as const;

export type MarketProviderErrorCode =
  (typeof MARKET_PROVIDER_ERROR_CODES)[number];

const INVALID_CREDENTIAL_PATTERNS = [
  /\bstatus\s+401\b/i,
  /\bhttp\s+401\b/i,
  /\bunauthori[sz]ed\b/i,
  /\bauthentication\s+(?:failed|required)\b/i,
  /\binvalid\s+(?:api[ _-]?)?key\b/i,
  /\b(?:api[ _-]?)?key\s+(?:is\s+)?invalid\b/i,
  /\b(?:api[ _-]?)?key\s+(?:has\s+)?expired\b/i,
  /\binvalid\s+(?:access[ _-]?)?token\b/i,
  /\btoken\s+(?:has\s+)?expired\b/i,
];

const ACCESS_DENIED_PATTERNS = [
  /\bstatus\s+403\b/i,
  /\bhttp\s+403\b/i,
  /\bforbidden\b/i,
  /\baccess\s+denied\b/i,
  /\bentitlement\b/i,
  /\bnot\s+authori[sz]ed\s+for\b/i,
];

const QUOTA_PATTERNS = [
  /\bstatus\s+429\b/i,
  /\bhttp\s+429\b/i,
  /\brate[ _-]?limit/i,
  /\btoo\s+many\s+requests\b/i,
  /\bquota\b/i,
  /\bcall\s+frequency\b/i,
  /\busage\s+limit\b/i,
];

const NOT_CONFIGURED_PATTERNS = [
  /\bnot\s+configured\b/i,
  /\bmissing\s+(?:api[ _-]?)?(?:key|token)\b/i,
  /\brequires?\s+(?:an?\s+)?(?:api[ _-]?)?(?:key|token)\b/i,
];

function matchesAny(
  message: string,
  patterns: readonly RegExp[],
): boolean {
  return patterns.some((pattern) => pattern.test(message));
}

export function classifyMarketProviderError(
  error: unknown,
): MarketProviderErrorCode {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  if (matchesAny(message, INVALID_CREDENTIAL_PATTERNS)) {
    return "PROVIDER_CREDENTIAL_INVALID";
  }
  if (matchesAny(message, ACCESS_DENIED_PATTERNS)) {
    return "PROVIDER_ACCESS_DENIED";
  }
  if (matchesAny(message, QUOTA_PATTERNS)) {
    return "PROVIDER_QUOTA_LIMITED";
  }
  if (matchesAny(message, NOT_CONFIGURED_PATTERNS)) {
    return "PROVIDER_NOT_CONFIGURED";
  }
  return "UPSTREAM_UNAVAILABLE";
}
