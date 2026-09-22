import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getListings } from "../lib/catalogue";
import {
  answerCatalogueSearch,
  type SearchReranker,
} from "../lib/catalogue-search";
import searchCases from "./fixtures/search-cases.json";

type SearchCase = {
  query: string;
  group: "deterministic" | "ai" | "no-match";
  decision: "deterministic-results" | "ai-rerank" | "no-match";
  mode: "deterministic" | "ai-reranked" | "keyword-fallback" | "no-match";
  providerCalls: number;
  expectedTop?: string;
  allowedIds?: string[];
  prohibitedIds?: string[];
};

const cases = searchCases as SearchCase[];
const catalogueIds = new Set(getListings().map((listing) => listing.id));

describe("search evaluation fixtures", () => {
  it("references only authoritative catalogue IDs", () => {
    for (const testCase of cases) {
      for (const id of [
        ...(testCase.allowedIds ?? []),
        ...(testCase.prohibitedIds ?? []),
        ...(testCase.expectedTop ? [testCase.expectedTop] : []),
      ]) {
        expect(catalogueIds.has(id)).toBe(true);
      }
    }
  });

  it.each(cases)("$query", async (testCase) => {
    const reranker = vi.fn<SearchReranker>(async ({ candidates }) => ({
      ok: true,
      results: candidates.slice(0, 3).map((candidate) => ({
        id: candidate.listing.id,
        reason: "Relevant to your search.",
      })),
    }));

    const result = await answerCatalogueSearch(
      { query: testCase.query },
      { catalogue: getListings(), reranker },
    );

    expect(result.evaluation.decision).toBe(testCase.decision);
    expect(result.response.mode).toBe(testCase.mode);
    expect(result.evaluation.providerCallCount).toBe(testCase.providerCalls);
    expect(reranker).toHaveBeenCalledTimes(testCase.providerCalls);

    const resultIds = result.response.results.map((entry) => entry.id);

    for (const id of resultIds) {
      expect(catalogueIds.has(id)).toBe(true);
    }

    if (testCase.group === "no-match") {
      expect(resultIds).toHaveLength(0);
    }

    if (testCase.expectedTop) {
      expect(resultIds[0]).toBe(testCase.expectedTop);
    }

    if (testCase.allowedIds) {
      for (const id of resultIds) {
        expect(testCase.allowedIds).toContain(id);
      }
    }

    for (const prohibited of testCase.prohibitedIds ?? []) {
      expect(resultIds).not.toContain(prohibited);
    }

    if (testCase.group === "ai") {
      expect(resultIds.length).toBeGreaterThan(0);
      expect(resultIds.length).toBeLessThanOrEqual(4);
    }
  });
});
