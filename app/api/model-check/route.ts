import { NextResponse } from "next/server";
import { z } from "zod";

import {
  CANONICAL_MODEL_CHECK_INPUT,
  MAX_GATEWAY_INPUT_LENGTH,
  callCognitioGateway,
  type GatewayErrorCode,
  type GatewayUsage,
} from "@/lib/gateway";

const requestSchema = z
  .object({
    input: z.string().trim().min(1).max(MAX_GATEWAY_INPUT_LENGTH),
  })
  .strict();

const errorStatuses: Record<GatewayErrorCode, number> = {
  INVALID_REQUEST: 400,
  CONFIGURATION_ERROR: 503,
  PROVIDER_TIMEOUT: 504,
  PROVIDER_BAD_REQUEST: 502,
  PROVIDER_AUTH_ERROR: 503,
  PROVIDER_ROUTE_ERROR: 503,
  PROVIDER_RATE_LIMITED: 429,
  PROVIDER_UNAVAILABLE: 503,
  PROVIDER_INVALID_RESPONSE: 502,
};

function invalidRequest(): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "INVALID_REQUEST",
        message: "A valid input is required.",
      },
    },
    { status: 400 },
  );
}

function publicUsage(
  usage: GatewayUsage | null,
): Record<string, number> | null {
  if (!usage) {
    return null;
  }

  return {
    ...(usage.inputTokens === undefined
      ? {}
      : { input_tokens: usage.inputTokens }),
    ...(usage.outputTokens === undefined
      ? {}
      : { output_tokens: usage.outputTokens }),
    ...(usage.totalTokens === undefined
      ? {}
      : { total_tokens: usage.totalTokens }),
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  let requestBody: unknown;

  try {
    requestBody = await request.json();
  } catch {
    return invalidRequest();
  }

  const parsedRequest = requestSchema.safeParse(requestBody);

  if (!parsedRequest.success) {
    return invalidRequest();
  }

  const input = parsedRequest.data.input;

  if (
    process.env.NODE_ENV === "production" &&
    input !== CANONICAL_MODEL_CHECK_INPUT
  ) {
    return invalidRequest();
  }

  const result = await callCognitioGateway(input);

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: errorStatuses[result.error.code] },
    );
  }

  return NextResponse.json({
    ok: true,
    response: result.response,
    model: result.model,
    latency_ms: result.latencyMs,
    usage: publicUsage(result.usage),
    upstream: result.upstream,
    fallback: result.fallback,
  });
}
