import "server-only";

export const COGNITIO_GATEWAY_URL =
  "https://174.138.16.223/v1/chat/completions";
export const COGNITIO_GATEWAY_MODEL = "gpt-5.6-luna";
export const GATEWAY_TIMEOUT_MS = 12_000;
export const MAX_GATEWAY_INPUT_LENGTH = 200;

export type GatewayErrorCode =
  | "INVALID_REQUEST"
  | "CONFIGURATION_ERROR"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_BAD_REQUEST"
  | "PROVIDER_AUTH_ERROR"
  | "PROVIDER_ROUTE_ERROR"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_INVALID_RESPONSE";

type GatewayError = {
  code: GatewayErrorCode;
  message: string;
};

export type GatewayUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type GatewaySuccess = {
  ok: true;
  response: string;
  model: typeof COGNITIO_GATEWAY_MODEL;
  latencyMs: number;
  usage: GatewayUsage | null;
  upstream: string | null;
  fallback: string | null;
};

export type GatewayFailure = {
  ok: false;
  error: GatewayError;
  latencyMs: number;
  providerStatus: number | null;
  retryAfter: string | null;
};

export type GatewayResult = GatewaySuccess | GatewayFailure;

const errorMessages: Record<GatewayErrorCode, string> = {
  INVALID_REQUEST: "A valid input is required.",
  CONFIGURATION_ERROR: "The AI service is not configured.",
  PROVIDER_TIMEOUT: "The AI service timed out.",
  PROVIDER_BAD_REQUEST: "The AI service rejected the server request.",
  PROVIDER_AUTH_ERROR: "The AI service is not configured correctly.",
  PROVIDER_ROUTE_ERROR: "The AI service route is unavailable.",
  PROVIDER_RATE_LIMITED: "The AI service is busy. Please try again later.",
  PROVIDER_UNAVAILABLE: "The AI service is temporarily unavailable.",
  PROVIDER_INVALID_RESPONSE: "The AI service returned an invalid response.",
};

const forbiddenPublicTextPatterns = [
  /CLASSGW_KEY/i,
  /\bauthorization\b/i,
  /\bbearer\b/i,
  /\/Users\//i,
  /[A-Za-z]:\\Users\\/i,
];

function latencySince(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}

function failure(
  code: GatewayErrorCode,
  startedAt: number,
  providerStatus: number | null = null,
  retryAfter: string | null = null,
): GatewayFailure {
  return {
    ok: false,
    error: { code, message: errorMessages[code] },
    latencyMs: latencySince(startedAt),
    providerStatus,
    retryAfter,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
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

function parseUsage(value: unknown): GatewayUsage | null {
  if (!isRecord(value)) {
    return null;
  }

  const usage: GatewayUsage = {
    inputTokens: readTokenCount(value, "prompt_tokens"),
    outputTokens: readTokenCount(value, "completion_tokens"),
    totalTokens: readTokenCount(value, "total_tokens"),
  };

  return Object.values(usage).some((count) => count !== undefined)
    ? usage
    : null;
}

function containsForbiddenPublicText(
  value: string,
  gatewayKey?: string,
): boolean {
  return (
    forbiddenPublicTextPatterns.some((pattern) => pattern.test(value)) ||
    Boolean(gatewayKey && value.includes(gatewayKey))
  );
}

function sanitizeObservation(
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

function sanitizeRetryAfter(value: string | null): string | null {
  const trimmed = value?.trim();

  if (!trimmed || !/^\d{1,6}$/.test(trimmed)) {
    return null;
  }

  const seconds = Number(trimmed);
  return seconds <= 86_400 ? String(seconds) : null;
}

function errorCodeForStatus(status: number): GatewayErrorCode {
  if (status === 400) {
    return "PROVIDER_BAD_REQUEST";
  }

  if (status === 401 || status === 403) {
    return "PROVIDER_AUTH_ERROR";
  }

  if (status === 404) {
    return "PROVIDER_ROUTE_ERROR";
  }

  if (status === 429) {
    return "PROVIDER_RATE_LIMITED";
  }

  return "PROVIDER_UNAVAILABLE";
}

export async function callCognitioGateway(
  input: string,
): Promise<GatewayResult> {
  const startedAt = Date.now();
  const normalizedInput = typeof input === "string" ? input.trim() : "";

  if (
    normalizedInput.length === 0 ||
    normalizedInput.length > MAX_GATEWAY_INPUT_LENGTH
  ) {
    return failure("INVALID_REQUEST", startedAt);
  }

  const gatewayKey = process.env.CLASSGW_KEY?.trim();

  if (!gatewayKey) {
    return failure("CONFIGURATION_ERROR", startedAt);
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, GATEWAY_TIMEOUT_MS);

  try {
    let providerResponse: Response;

    try {
      providerResponse = await fetch(COGNITIO_GATEWAY_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${gatewayKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: COGNITIO_GATEWAY_MODEL,
          messages: [{ role: "user", content: normalizedInput }],
          stream: false,
        }),
        signal: controller.signal,
      });
    } catch {
      return failure(
        timedOut ? "PROVIDER_TIMEOUT" : "PROVIDER_UNAVAILABLE",
        startedAt,
      );
    }

    if (!providerResponse.ok) {
      return failure(
        errorCodeForStatus(providerResponse.status),
        startedAt,
        providerResponse.status,
        sanitizeRetryAfter(providerResponse.headers.get("Retry-After")),
      );
    }

    let responseBody: unknown;

    try {
      responseBody = await providerResponse.json();
    } catch {
      return failure(
        timedOut ? "PROVIDER_TIMEOUT" : "PROVIDER_INVALID_RESPONSE",
        startedAt,
        providerResponse.status,
      );
    }

    if (!isRecord(responseBody) || !Array.isArray(responseBody.choices)) {
      return failure(
        "PROVIDER_INVALID_RESPONSE",
        startedAt,
        providerResponse.status,
      );
    }

    const firstChoice = responseBody.choices[0];
    const message = isRecord(firstChoice) ? firstChoice.message : undefined;
    const content = isRecord(message) ? message.content : undefined;
    const normalizedContent = typeof content === "string" ? content.trim() : "";

    if (
      !normalizedContent ||
      containsForbiddenPublicText(normalizedContent, gatewayKey)
    ) {
      return failure(
        "PROVIDER_INVALID_RESPONSE",
        startedAt,
        providerResponse.status,
      );
    }

    return {
      ok: true,
      response: normalizedContent,
      model: COGNITIO_GATEWAY_MODEL,
      latencyMs: latencySince(startedAt),
      usage: parseUsage(responseBody.usage),
      upstream: sanitizeObservation(
        providerResponse.headers.get("X-Gateway-Upstream"),
        gatewayKey,
      ),
      fallback: sanitizeObservation(
        providerResponse.headers.get("X-Gateway-Fallback"),
        gatewayKey,
      ),
    };
  } finally {
    clearTimeout(timeout);
  }
}
