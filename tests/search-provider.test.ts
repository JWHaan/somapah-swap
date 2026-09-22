import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getListingById } from "../lib/catalogue";
import { OPENROUTER_URL, OPENROUTER_MODEL } from "../lib/openrouter";
import { parseSearchQuery } from "../lib/search-query";
import type { SearchCandidate } from "../lib/search-retrieval";
import {
  SEARCH_MAX_TOKENS,
  SEARCH_PROVIDER_TIMEOUT_MS,
  callSearchRerankProvider,
  createSearchReranker,
} from "../lib/search-provider";

const testKey = ["test", "search", "credential"].join("-");

function candidate(id: string): SearchCandidate {
  const listing = getListingById(id)!;
  return {
    listing,
    score: 20,
    evidence: { score: 20, matchedConcepts: [], structuredOnly: false },
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("search provider policy", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("CLASSGW_KEY", testKey);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses the search token budget of 300", () => {
    expect(SEARCH_MAX_TOKENS).toBe(300);
  });

  it("uses an eight-second provider timeout", () => {
    expect(SEARCH_PROVIDER_TIMEOUT_MS).toBe(8_000);
  });

  it("sends one bounded, non-streaming request with the fixed policy", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: "{}" } }] }),
    );

    await callSearchRerankProvider("rerank these candidates");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;

    expect(url).toBe(OPENROUTER_URL);
    expect(body).toEqual({
      model: OPENROUTER_MODEL,
      messages: [{ role: "user", content: "rerank these candidates" }],
      stream: false,
      max_tokens: 300,
      reasoning: { effort: "none", exclude: true },
    });
    expect(body).not.toHaveProperty("tools");
    expect(body).not.toHaveProperty("functions");
  });
});

describe("value-gated reranker", () => {
  const catalogue = [
    getListingById("desk-small-05")!,
    getListingById("laptop-stand-15")!,
  ];
  const parsed = parseSearchQuery("best option for a hostel workspace");
  const candidates = [candidate("desk-small-05"), candidate("laptop-stand-15")];

  it("returns validated results from a single successful call", async () => {
    const provider = vi.fn().mockResolvedValue({
      ok: true,
      provider: "openrouter",
      response: JSON.stringify({
        results: [
          { id: "desk-small-05", reason: "A folding desk for a workspace." },
        ],
      }),
      model: OPENROUTER_MODEL,
      latencyMs: 10,
      usage: null,
    });
    const reranker = createSearchReranker(catalogue, provider);

    const outcome = await reranker({ parsed, candidates, catalogue });

    expect(outcome.ok).toBe(true);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the provider fails", async () => {
    const provider = vi.fn().mockResolvedValue({
      ok: false,
      provider: "openrouter",
      error: { code: "PROVIDER_TIMEOUT", message: "timeout" },
      latencyMs: 8_000,
      providerStatus: null,
      retryAfter: null,
    });
    const reranker = createSearchReranker(catalogue, provider);

    const outcome = await reranker({ parsed, candidates, catalogue });

    expect(outcome.ok).toBe(false);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it("fails closed on malformed output without a second call", async () => {
    const provider = vi.fn().mockResolvedValue({
      ok: true,
      provider: "openrouter",
      response: "not json",
      model: OPENROUTER_MODEL,
      latencyMs: 10,
      usage: null,
    });
    const reranker = createSearchReranker(catalogue, provider);

    const outcome = await reranker({ parsed, candidates, catalogue });

    expect(outcome.ok).toBe(false);
    expect(provider).toHaveBeenCalledTimes(1);
  });
});
