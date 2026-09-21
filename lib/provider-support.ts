export type ProviderUsage = {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readTokenCount(
  usage: Record<string, unknown>,
  field: string,
): number | undefined {
  const value = usage[field];

  return Number.isSafeInteger(value) && Number(value) >= 0
    ? Number(value)
    : undefined;
}

export function parseProviderUsage(value: unknown): ProviderUsage | null {
  if (!isRecord(value)) {
    return null;
  }

  const inputTokens = readTokenCount(value, "prompt_tokens");
  const outputTokens = readTokenCount(value, "completion_tokens");
  const totalTokens = readTokenCount(value, "total_tokens");
  const completionDetails = isRecord(value.completion_tokens_details)
    ? value.completion_tokens_details
    : null;
  const reasoningTokens = completionDetails
    ? readTokenCount(completionDetails, "reasoning_tokens")
    : undefined;

  const usage: ProviderUsage = {
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
    ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
  };

  return Object.keys(usage).length > 0 ? usage : null;
}

const forbiddenPublicTextPatterns = [
  /CLASSGW_KEY/i,
  /\bauthorization\b/i,
  /\bbearer\b/i,
  /\/Users\//i,
  /[A-Za-z]:\\Users\\/i,
];

export function containsForbiddenPublicText(
  value: string,
  gatewayKey?: string,
): boolean {
  return (
    forbiddenPublicTextPatterns.some((pattern) => pattern.test(value)) ||
    Boolean(gatewayKey && value.includes(gatewayKey))
  );
}

export function sanitizeObservation(
  value: string | null,
  gatewayKey: string,
): string | null {
  const trimmed = value?.trim();

  if (
    !trimmed ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(trimmed) ||
    containsForbiddenPublicText(trimmed, gatewayKey)
  ) {
    return null;
  }

  return trimmed;
}

export function sanitizeRetryAfter(value: string | null): string | null {
  const trimmed = value?.trim();

  if (!trimmed || !/^\d{1,6}$/.test(trimmed)) {
    return null;
  }

  const seconds = Number(trimmed);
  return seconds <= 86_400 ? String(seconds) : null;
}

export type ProviderEnvelopeKind =
  "rate-limit" | "auth" | "budget" | "unavailable";

function numericCode(error: Record<string, unknown>): number | null {
  return Number.isSafeInteger(error.code) ? Number(error.code) : null;
}

function errorTypeText(error: Record<string, unknown>): string {
  const parts = [error.type, error.code, error.status]
    .filter((part) => typeof part === "string" || typeof part === "number")
    .map((part) => String(part).toLowerCase());

  return parts.join(" ");
}

export function classifyProviderErrorEnvelope(
  body: Record<string, unknown>,
): ProviderEnvelopeKind | null {
  if (!isRecord(body.error)) {
    return null;
  }

  const error = body.error;
  const code = numericCode(error);
  const text = errorTypeText(error);

  if (
    code === 429 ||
    text.includes("rate_limit") ||
    text.includes("rate-limit")
  ) {
    return "rate-limit";
  }

  if (
    code === 401 ||
    code === 403 ||
    text.includes("auth") ||
    text.includes("permission") ||
    text.includes("invalid_key") ||
    text.includes("unauthorized")
  ) {
    return "auth";
  }

  if (
    code === 402 ||
    text.includes("budget") ||
    text.includes("insufficient") ||
    text.includes("credit") ||
    text.includes("quota")
  ) {
    return "budget";
  }

  return "unavailable";
}
