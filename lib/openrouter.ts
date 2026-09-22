import "server-only";

import {
  classifyProviderErrorEnvelope,
  containsForbiddenPublicText,
  isRecord,
  parseProviderUsage,
  sanitizeRetryAfter,
  type ProviderUsage,
} from "@/lib/provider-support";

export const OPENROUTER_URL =
  "https://174.138.16.223/openrouter/v1/chat/completions";
export const OPENROUTER_MODEL = "deepseek/deepseek-v4.1-flash";
export const OPENROUTER_MAX_TOKENS = 450;
export const OPENROUTER_REASONING_EFFORT = "none";
export const OPENROUTER_REASONING_EXCLUDE = true;
export const OPENROUTER_TIMEOUT_MS = 25_000;
export const MAX_OPENROUTER_INPUT_LENGTH = 12_000;

export type OpenRouterErrorCode =
  | "INVALID_REQUEST"
  | "CONFIGURATION_ERROR"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_BAD_REQUEST"
  | "PROVIDER_AUTH_ERROR"
  | "PROVIDER_ROUTE_ERROR"
  | "PROVIDER_BUDGET_EXHAUSTED"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_INVALID_RESPONSE";

export type OpenRouterSuccess = {
  ok: true;
  provider: "openrouter";
  response: string;
  model: typeof OPENROUTER_MODEL;
  latencyMs: number;
  usage: ProviderUsage | null;
};

export type OpenRouterFailure = {
  ok: false;
  provider: "openrouter";
  error: { code: OpenRouterErrorCode; message: string };
  latencyMs: number;
  providerStatus: number | null;
  retryAfter: string | null;
};

export type OpenRouterResult = OpenRouterSuccess | OpenRouterFailure;

const errorMessages: Record<OpenRouterErrorCode, string> = {
  INVALID_REQUEST: "A valid input is required.",
  CONFIGURATION_ERROR: "The AI service is not configured.",
  PROVIDER_TIMEOUT: "The AI service timed out.",
  PROVIDER_BAD_REQUEST: "The AI service rejected the server request.",
  PROVIDER_AUTH_ERROR: "The AI service is not configured correctly.",
  PROVIDER_ROUTE_ERROR: "The AI service route is unavailable.",
  PROVIDER_BUDGET_EXHAUSTED: "The AI service budget is exhausted.",
  PROVIDER_RATE_LIMITED: "The AI service is busy. Please try again later.",
  PROVIDER_UNAVAILABLE: "The AI service is temporarily unavailable.",
  PROVIDER_INVALID_RESPONSE: "The AI service returned an invalid response.",
};

function latencySince(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}

function failure(
  code: OpenRouterErrorCode,
  startedAt: number,
  providerStatus: number | null = null,
): OpenRouterFailure {
  return {
    ok: false,
    provider: "openrouter",
    error: { code, message: errorMessages[code] },
    latencyMs: latencySince(startedAt),
    providerStatus,
    retryAfter: null,
  };
}

function errorCodeForStatus(status: number): OpenRouterErrorCode {
  if (status === 400) {
    return "PROVIDER_BAD_REQUEST";
  }

  if (status === 401 || status === 403) {
    return "PROVIDER_AUTH_ERROR";
  }

  if (status === 402) {
    return "PROVIDER_BUDGET_EXHAUSTED";
  }

  if (status === 404) {
    return "PROVIDER_ROUTE_ERROR";
  }

  if (status === 429) {
    return "PROVIDER_RATE_LIMITED";
  }

  return "PROVIDER_UNAVAILABLE";
}

function errorCodeForEnvelope(
  body: Record<string, unknown>,
): OpenRouterErrorCode | null {
  const kind = classifyProviderErrorEnvelope(body);

  if (kind === "rate-limit") {
    return "PROVIDER_RATE_LIMITED";
  }

  if (kind === "auth") {
    return "PROVIDER_AUTH_ERROR";
  }

  if (kind === "budget") {
    return "PROVIDER_BUDGET_EXHAUSTED";
  }

  if (kind === "unavailable") {
    return "PROVIDER_UNAVAILABLE";
  }

  return null;
}

export type OpenRouterCallOptions = {
  maxTokens: number;
  timeoutMs: number;
};

export async function callOpenRouterGateway(
  input: string,
): Promise<OpenRouterResult> {
  return callOpenRouterChat(input, {
    maxTokens: OPENROUTER_MAX_TOKENS,
    timeoutMs: OPENROUTER_TIMEOUT_MS,
  });
}

export async function callOpenRouterChat(
  input: string,
  options: OpenRouterCallOptions,
): Promise<OpenRouterResult> {
  const startedAt = Date.now();
  const normalizedInput = typeof input === "string" ? input.trim() : "";

  if (
    normalizedInput.length === 0 ||
    normalizedInput.length > MAX_OPENROUTER_INPUT_LENGTH
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
  }, options.timeoutMs);

  try {
    let providerResponse: Response;

    try {
      providerResponse = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${gatewayKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          messages: [{ role: "user", content: normalizedInput }],
          stream: false,
          max_tokens: options.maxTokens,
          reasoning: {
            effort: OPENROUTER_REASONING_EFFORT,
            exclude: OPENROUTER_REASONING_EXCLUDE,
          },
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
      const failureResult = failure(
        errorCodeForStatus(providerResponse.status),
        startedAt,
        providerResponse.status,
      );

      return {
        ...failureResult,
        retryAfter: sanitizeRetryAfter(
          providerResponse.headers.get("Retry-After"),
        ),
      };
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
      if (isRecord(responseBody)) {
        const envelopeCode = errorCodeForEnvelope(responseBody);

        if (envelopeCode) {
          return failure(envelopeCode, startedAt, providerResponse.status);
        }
      }

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
      provider: "openrouter",
      response: normalizedContent,
      model: OPENROUTER_MODEL,
      latencyMs: latencySince(startedAt),
      usage: parseProviderUsage(responseBody.usage),
    };
  } finally {
    clearTimeout(timeout);
  }
}
