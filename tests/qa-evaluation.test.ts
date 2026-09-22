import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getListings } from "../lib/catalogue";
import { answerCatalogueQuestion } from "../lib/catalogue-qa";
import { OPENROUTER_MODEL, type OpenRouterResult } from "../lib/openrouter";
import {
  answerCatalogueSearch,
  type SearchReranker,
  type SearchRerankerOutcome,
} from "../lib/catalogue-search";
import { createSearchReranker } from "../lib/search-provider";
import qaCases from "./fixtures/qa-cases.json";

type QaCase = {
  name: string;
  question: string;
  expected_decision:
    "reject-locally" | "answer-locally" | "model-answer" | "fallback";
  expected_mode: "deterministic" | "ai" | "fallback";
  expected_candidate_ids: string[];
  expected_cited_ids: string[];
  must_include: string[];
  must_not_include: string[];
  expected_provider_calls: number;
  category?: string;
  mock_answer?: string;
  mock_cited_ids?: string[];
};

const cases = qaCases as QaCase[];
const mockedCases = cases.filter((testCase) => testCase.mock_cited_ids);
const catalogue = getListings();

function success(response: string): OpenRouterResult {
  return {
    ok: true,
    provider: "openrouter",
    response,
    model: OPENROUTER_MODEL,
    latencyMs: 12,
    usage: null,
  };
}

describe("mocked model-worthy Q&A evaluation", () => {
  it("has at least two mocked comparison fixtures", () => {
    expect(mockedCases.length).toBeGreaterThanOrEqual(2);
  });

  it.each(mockedCases)("$name", async (testCase) => {
    const provider = vi.fn().mockResolvedValue(
      success(
        JSON.stringify({
          answer: testCase.mock_answer,
          cited_ids: testCase.mock_cited_ids,
          missing: [],
        }),
      ),
    );

    const result = await answerCatalogueQuestion(
      { question: testCase.question },
      { catalogue, provider },
    );

    expect(result.evaluation.decision).toBe(testCase.expected_decision);
    expect(result.response.mode).toBe(testCase.expected_mode);
    expect(result.evaluation.candidateIds).toEqual(
      testCase.expected_candidate_ids,
    );
    expect(result.response.cited_ids).toEqual(testCase.expected_cited_ids);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(
      result.response.cited_ids.every((id) =>
        result.evaluation.candidateIds.includes(id),
      ),
    ).toBe(true);

    for (const required of testCase.must_include) {
      expect(result.response.answer.toLowerCase()).toContain(
        required.toLowerCase(),
      );
    }
    for (const prohibited of testCase.must_not_include) {
      expect(result.response.answer.toLowerCase()).not.toContain(
        prohibited.toLowerCase(),
      );
    }
  });
});

describe("Q&A provider resilience", () => {
  const comparison = "Which desk or stand is better for a hostel room?";

  const failures: Array<[string, OpenRouterResult]> = [
    [
      "timeout",
      {
        ok: false,
        provider: "openrouter",
        error: {
          code: "PROVIDER_TIMEOUT",
          message: "The AI service timed out.",
        },
        latencyMs: 25_000,
        providerStatus: null,
        retryAfter: null,
      },
    ],
    [
      "rate limit",
      {
        ok: false,
        provider: "openrouter",
        error: {
          code: "PROVIDER_RATE_LIMITED",
          message: "The AI service is busy. Please try again later.",
        },
        latencyMs: 40,
        providerStatus: 429,
        retryAfter: "30",
      },
    ],
    [
      "authentication failure",
      {
        ok: false,
        provider: "openrouter",
        error: {
          code: "PROVIDER_AUTH_ERROR",
          message: "The AI service is not configured correctly.",
        },
        latencyMs: 30,
        providerStatus: 403,
        retryAfter: null,
      },
    ],
    [
      "provider unavailable",
      {
        ok: false,
        provider: "openrouter",
        error: {
          code: "PROVIDER_UNAVAILABLE",
          message: "The AI service is temporarily unavailable.",
        },
        latencyMs: 60,
        providerStatus: 503,
        retryAfter: null,
      },
    ],
    [
      "HTTP 200 error envelope",
      {
        ok: false,
        provider: "openrouter",
        error: {
          code: "PROVIDER_UNAVAILABLE",
          message: "The AI service is temporarily unavailable.",
        },
        latencyMs: 70,
        providerStatus: 200,
        retryAfter: null,
      },
    ],
  ];

  it.each(failures)(
    "degrades to grounded deterministic fallback on %s",
    async (_name, failure) => {
      const provider = vi.fn().mockResolvedValue(failure);
      const result = await answerCatalogueQuestion(
        { question: comparison },
        { catalogue, provider },
      );
      const serialized = JSON.stringify(result.response);

      expect(result.evaluation.decision).toBe("fallback");
      expect(result.response.mode).toBe("fallback");
      expect(provider).toHaveBeenCalledTimes(1);
      expect(result.response.cited_ids.length).toBeGreaterThan(0);
      expect(
        result.response.cited_ids.every(
          (id) =>
            result.evaluation.candidateIds.includes(id) &&
            catalogue.some((listing) => listing.id === id),
        ),
      ).toBe(true);
      expect(serialized).not.toMatch(
        /PROVIDER_|timeout|Bearer|CLASSGW_KEY|\/Users\//i,
      );
    },
  );

  it.each([
    ["malformed JSON", "not-json"],
    ["empty content", ""],
    [
      "fenced JSON",
      '```json\n{"answer":"x","cited_ids":["desk-small-05"],"missing":[]}\n```',
    ],
  ])(
    "degrades to fallback on %s without a second call",
    async (_name, response) => {
      const provider = vi.fn().mockResolvedValue(success(response));
      const result = await answerCatalogueQuestion(
        { question: comparison },
        { catalogue, provider },
      );

      expect(result.evaluation.decision).toBe("fallback");
      expect(result.response.mode).toBe("fallback");
      expect(provider).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ["invented ID", ["desk-small-05", "free-iphone"]],
    ["unretrieved real ID", ["desk-small-05", "ipad-sketch-10"]],
    ["URL citation", ["https://example.com/desk-small-05"]],
    ["traversal citation", ["../desk-small-05"]],
    ["empty citations", []],
  ])(
    "rejects the whole answer on %s and keeps only validated IDs",
    async (_name, citedIds) => {
      const provider = vi.fn().mockResolvedValue(
        success(
          JSON.stringify({
            answer: "Unsupported comparison.",
            cited_ids: citedIds,
            missing: [],
          }),
        ),
      );
      const result = await answerCatalogueQuestion(
        { question: comparison },
        { catalogue, provider },
      );

      expect(result.evaluation.decision).toBe("fallback");
      expect(result.response.mode).toBe("fallback");
      expect(provider).toHaveBeenCalledTimes(1);
      expect(
        result.response.cited_ids.every((id) =>
          result.evaluation.candidateIds.includes(id),
        ),
      ).toBe(true);
      expect(JSON.stringify(result.response)).not.toContain("free-iphone");
    },
  );

  it("never performs a second provider call after invalid output", async () => {
    const provider = vi
      .fn()
      .mockResolvedValue(success("not-json"))
      .mockResolvedValue(
        success(
          JSON.stringify({
            answer: "Second attempt.",
            cited_ids: ["desk-small-05"],
            missing: [],
          }),
        ),
      );

    await answerCatalogueQuestion(
      { question: comparison },
      { catalogue, provider },
    );

    expect(provider).toHaveBeenCalledTimes(1);
  });
});

describe("search provider resilience", () => {
  const fuzzy = "something compact for studying in a small hostel room";

  async function run(reranker: SearchReranker) {
    return answerCatalogueSearch({ query: fuzzy }, { catalogue, reranker });
  }

  function rerankerReturning(outcome: SearchRerankerOutcome): SearchReranker {
    return vi.fn(async () => outcome);
  }

  it("falls back to keyword ranking when the reranker reports failure", async () => {
    const reranker = rerankerReturning({ ok: false });
    const result = await run(reranker);

    expect(result.response.mode).toBe("keyword-fallback");
    expect(reranker).toHaveBeenCalledTimes(1);
    expect(result.response.results.length).toBeGreaterThan(0);
  });

  it("falls back when the reranker throws", async () => {
    const reranker: SearchReranker = vi.fn(async () => {
      throw new Error("provider exploded with CLASSGW_KEY");
    });
    const result = await run(reranker);
    const serialized = JSON.stringify(result.response);

    expect(reranker).toHaveBeenCalledTimes(1);
    expect(["keyword-fallback", "no-match"]).toContain(result.response.mode);
    expect(serialized).not.toContain("CLASSGW_KEY");
    expect(serialized).not.toContain("provider exploded");
  });

  // Reason and ID validation live in the real reranker, so these cases run
  // through createSearchReranker with a mocked provider rather than an
  // injected fake reranker (which would bypass validation entirely).
  it.each([
    ["unknown ID", [{ id: "free-iphone", reason: "A free phone." }]],
    [
      "self-negating reason",
      [{ id: "lamp-desk-02", reason: "Not study-related." }],
    ],
    [
      "unsupported compactness claim",
      [{ id: "desk-small-05", reason: "It is compact for a small room." }],
    ],
    [
      "unsupported measurement",
      [{ id: "desk-small-05", reason: "Weighs 4 kg and folds to 60 cm." }],
    ],
    ["empty result set", []],
  ])(
    "falls back to catalogue matching when the model returns %s",
    async (_name, results) => {
      const provider = vi.fn().mockResolvedValue({
        ok: true,
        provider: "openrouter",
        response: JSON.stringify({ results }),
        model: OPENROUTER_MODEL,
        latencyMs: 15,
        usage: null,
      });
      const result = await answerCatalogueSearch(
        { query: fuzzy },
        { catalogue, reranker: createSearchReranker(catalogue, provider) },
      );
      const ids = result.response.results.map((entry) => entry.id);

      expect(provider).toHaveBeenCalledTimes(1);
      expect(result.response.mode).toBe("keyword-fallback");
      for (const id of ids) {
        expect(catalogue.some((listing) => listing.id === id)).toBe(true);
      }
      expect(ids).not.toContain("free-iphone");
    },
  );

  it("accepts a grounded reason and reports AI-ranked results", async () => {
    const provider = vi.fn().mockResolvedValue({
      ok: true,
      provider: "openrouter",
      response: JSON.stringify({
        results: [{ id: "desk-small-05", reason: "Provides a study surface." }],
      }),
      model: OPENROUTER_MODEL,
      latencyMs: 15,
      usage: null,
    });
    const result = await answerCatalogueSearch(
      { query: fuzzy },
      { catalogue, reranker: createSearchReranker(catalogue, provider) },
    );

    expect(provider).toHaveBeenCalledTimes(1);
    expect(result.response.mode).toBe("ai-reranked");
    expect(result.response.results.map((entry) => entry.id)).toEqual([
      "desk-small-05",
    ]);
  });
});
