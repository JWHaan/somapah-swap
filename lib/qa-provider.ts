import "server-only";

import { callCognitioGateway, type GatewayResult } from "@/lib/gateway";
import { OPENROUTER_MODEL, callOpenRouterGateway } from "@/lib/openrouter";
import type { ProviderUsage } from "@/lib/provider-support";

export type QaProviderId = "openrouter" | "cognitio";

export type QaProviderFailureCode =
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

export type QaProviderSuccess = {
  ok: true;
  provider: QaProviderId;
  response: string;
  model: string;
  latencyMs: number;
  usage: ProviderUsage | null;
};

export type QaProviderFailure = {
  ok: false;
  provider: QaProviderId;
  error: { code: QaProviderFailureCode; message: string };
  latencyMs: number;
  providerStatus: number | null;
  retryAfter: string | null;
};

export type QaProviderResult = QaProviderSuccess | QaProviderFailure;

export type QaProviderCaller = (input: string) => Promise<QaProviderResult>;

export const ACTIVE_QA_PROVIDER: QaProviderId = "openrouter";
export const ACTIVE_QA_MODEL = OPENROUTER_MODEL;

function toQaProviderResult(result: GatewayResult): QaProviderResult {
  return result.ok
    ? {
        ok: true,
        provider: "cognitio",
        response: result.response,
        model: result.model,
        latencyMs: result.latencyMs,
        usage: result.usage,
      }
    : {
        ok: false,
        provider: "cognitio",
        error: result.error,
        latencyMs: result.latencyMs,
        providerStatus: result.providerStatus,
        retryAfter: result.retryAfter,
      };
}

export const cognitioQaProvider: QaProviderCaller = async (input) =>
  toQaProviderResult(await callCognitioGateway(input));

export const openRouterQaProvider: QaProviderCaller = callOpenRouterGateway;

export function getCatalogueQaProvider(): QaProviderCaller {
  return ACTIVE_QA_PROVIDER === "cognitio"
    ? cognitioQaProvider
    : openRouterQaProvider;
}
