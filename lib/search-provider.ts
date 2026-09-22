import "server-only";

import type { Listing } from "@/lib/catalogue";
import { callOpenRouterChat, type OpenRouterResult } from "@/lib/openrouter";
import type {
  SearchReranker,
  SearchRerankerOutcome,
} from "@/lib/catalogue-search";
import { buildSearchPrompt, parseSearchModelOutput } from "@/lib/search-model";

export const SEARCH_MAX_TOKENS = 300;
export const SEARCH_PROVIDER_TIMEOUT_MS = 8_000;

export type SearchRerankProvider = (
  prompt: string,
) => Promise<OpenRouterResult>;

export const callSearchRerankProvider: SearchRerankProvider = (prompt) =>
  callOpenRouterChat(prompt, {
    maxTokens: SEARCH_MAX_TOKENS,
    timeoutMs: SEARCH_PROVIDER_TIMEOUT_MS,
  });

/**
 * Build a value-gated reranker. It makes at most one provider call, never
 * retries or repairs, and fails closed to deterministic keyword fallback when
 * the prompt cannot fit, the provider fails, or the output does not validate.
 */
export function createSearchReranker(
  catalogue: readonly Listing[],
  provider: SearchRerankProvider = callSearchRerankProvider,
): SearchReranker {
  return async ({ parsed, candidates }): Promise<SearchRerankerOutcome> => {
    const prompt = buildSearchPrompt({ parsed, candidates });

    if (!prompt.ok) {
      return { ok: false };
    }

    const providerResult = await provider(prompt.prompt);

    if (!providerResult.ok) {
      return { ok: false };
    }

    const results = parseSearchModelOutput(
      providerResult.response,
      candidates,
      parsed,
      catalogue,
    );

    if (!results) {
      return { ok: false };
    }

    return { ok: true, results };
  };
}
