import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getListings, type Listing } from "../lib/catalogue";
import { ACTIVE_QA_MODEL, type QaProviderResult } from "../lib/qa-provider";
import {
  AskInputError,
  answerCatalogueQuestion,
  type AskDecision,
  type AskPublicMode,
} from "../lib/catalogue-qa";
import qaCases from "./fixtures/qa-cases.json";

type QaCase = {
  name: string;
  question: string;
  expected_decision: AskDecision;
  expected_mode: AskPublicMode;
  expected_provider_calls: number;
  expected_candidate_ids: string[];
  expected_cited_ids: string[];
  must_include: string[];
  must_not_include: string[];
};

const deterministicCases = (qaCases as QaCase[]).filter(
  (testCase) => testCase.expected_decision !== "model-answer",
);
const modelCase = (qaCases as QaCase[]).find(
  (testCase) => testCase.expected_decision === "model-answer",
);

function providerSuccess(response: string): QaProviderResult {
  return {
    ok: true,
    provider: "openrouter",
    response,
    model: ACTIVE_QA_MODEL,
    latencyMs: 10,
    usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
  };
}

describe("deterministic catalogue Q&A", () => {
  it.each(deterministicCases)("$name", async (testCase) => {
    const provider = vi.fn();
    const result = await answerCatalogueQuestion(
      { question: testCase.question },
      { catalogue: getListings(), provider },
    );

    expect(result.evaluation).toEqual({
      decision: testCase.expected_decision,
      candidateIds: testCase.expected_candidate_ids,
    });
    expect(result.response.mode).toBe(testCase.expected_mode);
    expect(result.response.cited_ids).toEqual(testCase.expected_cited_ids);
    expect(provider).toHaveBeenCalledTimes(testCase.expected_provider_calls);

    for (const requiredText of testCase.must_include) {
      expect(result.response.answer.toLowerCase()).toContain(
        requiredText.toLowerCase(),
      );
    }

    for (const prohibitedText of testCase.must_not_include) {
      expect(result.response.answer.toLowerCase()).not.toContain(
        prohibitedText.toLowerCase(),
      );
    }
  });

  it("returns only stable buyer-facing response fields", async () => {
    const result = await answerCatalogueQuestion(
      { question: "What is the iPad battery health?" },
      { catalogue: getListings(), provider: vi.fn() },
    );

    expect(Object.keys(result.response).sort()).toEqual([
      "answer",
      "citations",
      "cited_ids",
      "missing",
      "mode",
      "scope",
    ]);
    expect(result.response.citations).toEqual([
      {
        id: "ipad-sketch-10",
        title: "iPad 8th gen, 32GB",
        href: "/item/ipad-sketch-10",
      },
    ]);
  });

  it("keeps exact deterministic behaviour with a larger catalogue", async () => {
    const base = getListings();
    const stand = base.find((listing) => listing.id === "laptop-stand-15");
    expect(stand).toBeDefined();

    const expandedCatalogue: Listing[] = [
      ...base,
      ...Array.from({ length: 20 }, (_, index) => ({
        ...stand!,
        id: `stand-expanded-${index + 1}`,
        title: `Expanded laptop stand ${index + 1}`,
      })),
    ];

    const result = await answerCatalogueQuestion(
      { question: "What is the iPad battery health?" },
      { catalogue: expandedCatalogue, provider: vi.fn() },
    );

    expect(result.evaluation).toEqual({
      decision: "answer-locally",
      candidateIds: ["ipad-sketch-10"],
    });
    expect(result.response.cited_ids).toEqual(["ipad-sketch-10"]);
  });

  it("rejects an unknown item context before any provider call", async () => {
    const provider = vi.fn();

    await expect(
      answerCatalogueQuestion(
        { question: "How much is it?", item_id: "missing-listing" },
        { catalogue: getListings(), provider },
      ),
    ).rejects.toBeInstanceOf(AskInputError);
    expect(provider).not.toHaveBeenCalled();
  });
});

describe("model-valued catalogue Q&A", () => {
  it("uses exactly one provider call for the approved comparison case", async () => {
    expect(modelCase).toBeDefined();
    const provider = vi.fn().mockResolvedValue(
      providerSuccess(
        JSON.stringify({
          answer:
            "For a hostel room, the desk provides a work surface while the stand raises a laptop; choose based on which stated function you need.",
          cited_ids: ["desk-small-05", "laptop-stand-15"],
          missing: [],
        }),
      ),
    );
    const result = await answerCatalogueQuestion(
      { question: modelCase!.question },
      { catalogue: getListings(), provider },
    );

    expect(result.evaluation).toEqual({
      decision: "model-answer",
      candidateIds: modelCase!.expected_candidate_ids,
    });
    expect(result.response.mode).toBe("ai");
    expect(result.response.cited_ids).toEqual(modelCase!.expected_cited_ids);
    expect(provider).toHaveBeenCalledTimes(1);

    const prompt = provider.mock.calls[0]?.[0] as string;
    expect(prompt.length).toBeLessThan(6_000);
    expect(prompt).toContain("desk-small-05");
    expect(prompt).toContain("laptop-stand-15");
    expect(prompt).not.toContain("ipad-sketch-10");
  });

  it.each([
    ["invented", ["desk-small-05", "invented-item-99"]],
    ["unretrieved", ["desk-small-05", "ipad-sketch-10"]],
    ["URL", ["https://example.com/desk-small-05"]],
    ["traversal", ["../desk-small-05"]],
    ["empty", []],
  ])(
    "falls back completely after %s citation validation fails",
    async (_name, citedIds) => {
      expect(modelCase).toBeDefined();
      const provider = vi.fn().mockResolvedValue(
        providerSuccess(
          JSON.stringify({
            answer: "Unsupported comparison answer.",
            cited_ids: citedIds,
            missing: [],
          }),
        ),
      );
      const result = await answerCatalogueQuestion(
        { question: modelCase!.question },
        { catalogue: getListings(), provider },
      );

      expect(result.evaluation.decision).toBe("fallback");
      expect(result.response.mode).toBe("fallback");
      expect(result.response.answer).toMatch(/could not complete/i);
      expect(
        result.response.cited_ids.every((id) =>
          modelCase!.expected_candidate_ids.includes(id),
        ),
      ).toBe(true);
      expect(provider).toHaveBeenCalledTimes(1);
    },
  );

  it("falls back after malformed provider output without a second call", async () => {
    expect(modelCase).toBeDefined();
    const provider = vi.fn().mockResolvedValue(providerSuccess("not-json"));
    const result = await answerCatalogueQuestion(
      { question: modelCase!.question },
      { catalogue: getListings(), provider },
    );

    expect(result.evaluation.decision).toBe("fallback");
    expect(result.response.mode).toBe("fallback");
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it("passes only the server-built prompt, so no caller can choose a model or provider", async () => {
    expect(modelCase).toBeDefined();
    const provider = vi.fn().mockResolvedValue(
      providerSuccess(
        JSON.stringify({
          answer: "Grounded comparison text.",
          cited_ids: ["desk-small-05", "laptop-stand-15"],
          missing: [],
        }),
      ),
    );

    await answerCatalogueQuestion(
      {
        question: "Which desk or stand is better for a hostel room?",
      },
      { catalogue: getListings(), provider },
    );

    expect(provider).toHaveBeenCalledTimes(1);
    expect(provider.mock.calls[0]).toHaveLength(1);
    expect(typeof provider.mock.calls[0]?.[0]).toBe("string");
  });

  it("falls back after provider failure without exposing provider details", async () => {
    expect(modelCase).toBeDefined();
    const provider = vi.fn().mockResolvedValue({
      ok: false,
      provider: "openrouter",
      error: {
        code: "PROVIDER_UNAVAILABLE",
        message: "The AI service is temporarily unavailable.",
      },
      latencyMs: 10,
      providerStatus: 503,
      retryAfter: null,
    } satisfies QaProviderResult);
    const result = await answerCatalogueQuestion(
      { question: modelCase!.question },
      { catalogue: getListings(), provider },
    );

    expect(result.evaluation.decision).toBe("fallback");
    expect(result.response.mode).toBe("fallback");
    expect(JSON.stringify(result.response)).not.toContain("503");
    expect(JSON.stringify(result.response)).not.toContain(
      "PROVIDER_UNAVAILABLE",
    );
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it("falls back to validated retrieved IDs after a provider timeout", async () => {
    expect(modelCase).toBeDefined();
    const provider = vi.fn().mockResolvedValue({
      ok: false,
      provider: "openrouter",
      error: {
        code: "PROVIDER_TIMEOUT",
        message: "The AI service timed out.",
      },
      latencyMs: 25_000,
      providerStatus: null,
      retryAfter: null,
    } satisfies QaProviderResult);

    const result = await answerCatalogueQuestion(
      { question: modelCase!.question },
      { catalogue: getListings(), provider },
    );

    expect(result.evaluation.decision).toBe("fallback");
    expect(result.response.mode).toBe("fallback");
    expect(result.response.cited_ids.length).toBeGreaterThan(0);
    expect(
      result.response.cited_ids.every((id) =>
        result.evaluation.candidateIds.includes(id),
      ),
    ).toBe(true);
    expect(
      result.response.cited_ids.every((id) =>
        getListings().some((listing) => listing.id === id),
      ),
    ).toBe(true);
    expect(JSON.stringify(result.response)).not.toContain("timeout");
    expect(JSON.stringify(result.response)).not.toContain("Abort");
    expect(provider).toHaveBeenCalledTimes(1);
  });
});
