import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getListingById, getListings, type Listing } from "../lib/catalogue";
import { classifyAssistantIntent } from "../lib/assistant-intent";
import { answerCatalogueQuestion } from "../lib/catalogue-qa";
import {
  MAX_AI_RESULTS,
  MAX_MODEL_CANDIDATES,
  answerCatalogueSearch,
  type SearchReranker,
} from "../lib/catalogue-search";
import { retrieveListingsForQuestion } from "../lib/retrieval";
import { createSearchReranker } from "../lib/search-provider";
import { OPENROUTER_MODEL } from "../lib/openrouter";

/**
 * Catalogue-growth regression.
 *
 * data/listings.json is never modified. Every added record here is synthetic
 * and only proves that growth stays bounded, filtered, and catalogue-owned.
 */
const baseline = getListings();
const template = getListingById("laptop-stand-15") as Listing;

function synthetic(overrides: Partial<Listing> & { id: string }): Listing {
  return { ...template, ...overrides };
}

function duplicateStands(count: number): Listing[] {
  return Array.from({ length: count }, (_, index) =>
    synthetic({
      id: `laptop-stand-synthetic-${index + 1}`,
      title: `Aluminium laptop stand ${index + 1}`,
    }),
  );
}

function providerReturning(results: Array<{ id: string; reason: string }>) {
  return vi.fn().mockResolvedValue({
    ok: true,
    provider: "openrouter",
    response: JSON.stringify({ results }),
    model: OPENROUTER_MODEL,
    latencyMs: 10,
    usage: null,
  });
}

describe("catalogue growth: retrieval stays bounded", () => {
  it("1. a second identical stand changes a unique match into a bounded multi-candidate decision", () => {
    const question = "something to raise my laptop";

    const before = retrieveListingsForQuestion({
      question,
      limit: 4,
      catalogue: baseline,
    });
    const after = retrieveListingsForQuestion({
      question,
      limit: 4,
      catalogue: [...baseline, ...duplicateStands(1)],
    });

    expect(before.candidates.map((l) => l.id)).toEqual(["laptop-stand-15"]);
    expect(after.candidates.length).toBe(2);
    expect(after.candidates.length).toBeLessThanOrEqual(4);
    expect(after.candidates.map((l) => l.id)).toContain("laptop-stand-15");
  });

  it("9. bounded deterministic selection survives more than six relevant records", async () => {
    const grown = [...baseline, ...duplicateStands(10)];
    const result = await answerCatalogueSearch(
      { query: "tech item under $20" },
      { catalogue: grown },
    );

    expect(result.response.results.length).toBeGreaterThan(0);
    expect(result.response.results.length).toBeLessThanOrEqual(6);
    for (const entry of result.response.results) {
      expect(grown.some((listing) => listing.id === entry.id)).toBe(true);
    }
  });

  it("2. at most six candidates reach search reranking", async () => {
    const grown = [...baseline, ...duplicateStands(10)];
    let observed = 0;
    const reranker: SearchReranker = vi.fn<SearchReranker>(
      async ({ candidates }) => {
        observed = candidates.length;
        return { ok: false };
      },
    );

    await answerCatalogueSearch(
      { query: "something compact for studying in a small hostel room" },
      { catalogue: grown, reranker },
    );

    expect(observed).toBeGreaterThan(0);
    expect(observed).toBeLessThanOrEqual(MAX_MODEL_CANDIDATES);
    expect(MAX_MODEL_CANDIDATES).toBe(6);
  });

  it("3. at most four AI search results are accepted, and more fail closed", async () => {
    const grown = [...baseline, ...duplicateStands(6)];
    const query = "something compact for studying in a small hostel room";

    let candidateIds: string[] = [];
    await answerCatalogueSearch(
      { query },
      {
        catalogue: grown,
        reranker: async ({ candidates }) => {
          candidateIds = candidates.map((candidate) => candidate.listing.id);
          return { ok: false };
        },
      },
    );
    expect(candidateIds.length).toBeGreaterThan(MAX_AI_RESULTS);

    const accepted = providerReturning(
      candidateIds
        .slice(0, MAX_AI_RESULTS)
        .map((id) => ({ id, reason: "Matches your study search." })),
    );
    const cappedResult = await answerCatalogueSearch(
      { query },
      { catalogue: grown, reranker: createSearchReranker(grown, accepted) },
    );

    expect(MAX_AI_RESULTS).toBe(4);
    expect(cappedResult.response.mode).toBe("ai-reranked");
    expect(cappedResult.response.results).toHaveLength(MAX_AI_RESULTS);

    // Over-asking is rejected fail-closed rather than truncated silently.
    const overAsked = providerReturning(
      candidateIds.map((id) => ({ id, reason: "Matches your study search." })),
    );
    const rejectedResult = await answerCatalogueSearch(
      { query },
      { catalogue: grown, reranker: createSearchReranker(grown, overAsked) },
    );

    expect(overAsked).toHaveBeenCalledTimes(1);
    expect(rejectedResult.response.mode).toBe("keyword-fallback");
    expect(rejectedResult.response.results.length).toBeLessThanOrEqual(6);
  });

  it("4. unrelated dorm inventory does not qualify for study-only intent", () => {
    const unrelated = [
      synthetic({
        id: "caddy-synthetic-01",
        title: "Bathroom caddy",
        category: "dorm",
      }),
      synthetic({
        id: "shoerack-synthetic-02",
        title: "Shoe rack",
        category: "dorm",
      }),
      synthetic({
        id: "pillow-synthetic-03",
        title: "Extra pillow",
        category: "dorm",
      }),
    ];

    const result = retrieveListingsForQuestion({
      question: "something compact for studying in a small hostel room",
      limit: 6,
      catalogue: [...baseline, ...unrelated],
    });
    const ids = result.candidates.map((listing) => listing.id);

    for (const listing of unrelated) {
      expect(ids).not.toContain(listing.id);
    }
  });

  it("10. no-match stays no-match when unrelated inventory is added", async () => {
    const grown = [
      ...baseline,
      ...Array.from({ length: 20 }, (_, index) =>
        synthetic({
          id: `filler-synthetic-${index + 1}`,
          title: `Unrelated dorm filler item ${index + 1}`,
          category: "dorm",
        }),
      ),
    ];
    const result = await answerCatalogueSearch(
      { query: "gaming PC under $100" },
      { catalogue: grown },
    );

    expect(result.evaluation.decision).toBe("no-match");
    expect(result.response.mode).toBe("no-match");
    expect(result.response.results).toHaveLength(0);
  });
});

describe("catalogue growth: hard constraints apply to synthetic records", () => {
  it("5a. price constraint excludes a synthetic record above the bound", async () => {
    const expensive = synthetic({
      id: "stand-expensive-synthetic",
      title: "Aluminium laptop stand premium",
      price_sgd: 999,
    });
    const result = await answerCatalogueSearch(
      { query: "tech item under $20" },
      { catalogue: [...baseline, expensive] },
    );

    expect(result.response.results.map((r) => r.id)).not.toContain(
      expensive.id,
    );
  });

  it("5b. category constraint excludes a synthetic record in another category", async () => {
    const wrongCategory = synthetic({
      id: "stand-dorm-synthetic",
      title: "Aluminium laptop stand dorm edition",
      category: "dorm",
      price_sgd: 14,
    });
    const result = await answerCatalogueSearch(
      { query: "tech item under $20" },
      { catalogue: [...baseline, wrongCategory] },
    );

    expect(result.response.results.map((r) => r.id)).not.toContain(
      wrongCategory.id,
    );
  });

  it("5c. condition constraint excludes a synthetic record", async () => {
    const wrongCondition = synthetic({
      id: "stand-wellused-synthetic",
      title: "Aluminium laptop stand worn",
      condition: "well-used",
    });
    const result = await answerCatalogueSearch(
      { query: "like-new tech" },
      { catalogue: [...baseline, wrongCondition] },
    );

    expect(result.response.results.map((r) => r.id)).not.toContain(
      wrongCondition.id,
    );
  });

  it("5d. accessory constraint applies to synthetic records", async () => {
    const withoutInclude = synthetic({
      id: "ipad-no-case-synthetic",
      title: "iPad 8th gen bundle",
      includes: ["Charging cable"],
    });
    const withInclude = synthetic({
      id: "ipad-with-case-synthetic",
      title: "iPad 8th gen with case",
      includes: ["Charging cable", "Case"],
    });
    const result = await answerCatalogueSearch(
      { query: "iPad with case" },
      { catalogue: [...baseline, withoutInclude, withInclude] },
    );
    const ids = result.response.results.map((r) => r.id);

    expect(ids).not.toContain(withoutInclude.id);
  });

  it("5e/6. a feature constraint qualifies only when a record confirms it", async () => {
    const unconfirmed = synthetic({
      id: "keyboard-unconfirmed-synthetic",
      title: "Bluetooth keyboard spare",
      category: "tech",
      seller_note: "Bluetooth not tested recently.",
    });
    const confirmed = synthetic({
      id: "keyboard-confirmed-synthetic",
      title: "Bluetooth keyboard confirmed",
      category: "tech",
      seller_note: "Working Bluetooth confirmed and tested.",
    });

    const baselineResult = await answerCatalogueSearch(
      { query: "keyboard with working bluetooth" },
      { catalogue: [...baseline, unconfirmed] },
    );
    const grownResult = await answerCatalogueSearch(
      { query: "keyboard with working bluetooth" },
      { catalogue: [...baseline, unconfirmed, confirmed] },
    );

    expect(baselineResult.response.results.map((r) => r.id)).not.toContain(
      unconfirmed.id,
    );
    expect(grownResult.response.results.map((r) => r.id)).toEqual([
      confirmed.id,
    ]);
  });
});

describe("catalogue growth: results stay catalogue-owned and bounded", () => {
  it("7. returned search IDs remain candidate-bound", async () => {
    const grown = [...baseline, ...duplicateStands(4)];
    const provider = providerReturning([
      { id: "ipad-sketch-10", reason: "Matches your study search." },
    ]);
    const result = await answerCatalogueSearch(
      { query: "something compact for studying in a small hostel room" },
      { catalogue: grown, reranker: createSearchReranker(grown, provider) },
    );
    const ids = result.response.results.map((r) => r.id);

    expect(ids).not.toContain("ipad-sketch-10");
    for (const id of ids) {
      expect(result.evaluation.candidateIds).toContain(id);
    }
  });

  it("8. Q&A citations remain retrieved-record-bound as the catalogue grows", async () => {
    const grown = [...baseline, ...duplicateStands(5)];
    const provider = vi.fn().mockResolvedValue({
      ok: true,
      provider: "openrouter",
      response: JSON.stringify({
        answer: "A comparison.",
        cited_ids: ["desk-small-05", "ipad-sketch-10"],
        missing: [],
      }),
      model: OPENROUTER_MODEL,
      latencyMs: 10,
      usage: null,
    });
    const result = await answerCatalogueQuestion(
      { question: "Which desk or stand is better for a hostel room?" },
      { catalogue: grown, provider },
    );

    expect(result.evaluation.decision).toBe("fallback");
    expect(
      result.response.cited_ids.every((id) =>
        result.evaluation.candidateIds.includes(id),
      ),
    ).toBe(true);
    expect(result.response.cited_ids).not.toContain("ipad-sketch-10");
  });

  it("11. public response schemas are unchanged by catalogue growth", async () => {
    const grown = [...baseline, ...duplicateStands(3)];
    const search = await answerCatalogueSearch(
      { query: "tech item under $20" },
      { catalogue: grown },
    );
    const provider = vi.fn().mockResolvedValue({
      ok: true,
      provider: "openrouter",
      response: JSON.stringify({
        answer: "The listing does not say the battery health.",
        cited_ids: ["ipad-sketch-10"],
        missing: ["Battery health is not provided."],
      }),
      model: OPENROUTER_MODEL,
      latencyMs: 10,
      usage: null,
    });
    const ask = await answerCatalogueQuestion(
      { question: "What is the iPad battery health?" },
      { catalogue: grown, provider },
    );

    expect(Object.keys(search.response).sort()).toEqual([
      "interpreted",
      "mode",
      "results",
    ]);
    expect(Object.keys(ask.response).sort()).toEqual([
      "answer",
      "citations",
      "cited_ids",
      "missing",
      "mode",
      "scope",
    ]);
  });

  it("12. product rendering stays catalogue-owned", async () => {
    const grown = [...baseline, ...duplicateStands(2)];
    const result = await answerCatalogueSearch(
      { query: "tech item under $20" },
      { catalogue: grown },
    );

    for (const entry of result.response.results) {
      expect(Object.keys(entry).sort()).toEqual(["id", "reason"]);
      const listing = grown.find((candidate) => candidate.id === entry.id);
      expect(listing).toBeDefined();
      expect(listing?.title).toEqual(expect.any(String));
      expect(listing?.price_sgd).toEqual(expect.any(Number));
    }
  });

  it("13. the intent router stays storage-independent", () => {
    expect(classifyAssistantIntent).toHaveLength(1);

    const first = classifyAssistantIntent("fan under $30");
    const second = classifyAssistantIntent("fan under $30");

    expect(first).toEqual(second);
    expect(first.intent).toBe("search");
  });
});
