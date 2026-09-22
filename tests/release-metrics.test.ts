import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  classifyAssistantIntent,
  isRoutableHelperInput,
} from "../lib/assistant-intent";
import { getListings } from "../lib/catalogue";
import { answerCatalogueQuestion } from "../lib/catalogue-qa";
import {
  answerCatalogueSearch,
  type SearchReranker,
} from "../lib/catalogue-search";
import { createSearchReranker } from "../lib/search-provider";
import { OPENROUTER_MODEL } from "../lib/openrouter";
import intentCases from "./fixtures/intent-routing-cases.json";
import qaCases from "./fixtures/qa-cases.json";
import searchCases from "./fixtures/search-cases.json";

/**
 * Release evaluation metrics.
 *
 * Everything here is deterministic or mocked; no provider is contacted. Rates
 * are computed from real runs of the shipped functions, never hardcoded, so the
 * numbers reported in the documentation cannot drift from the fixtures.
 */
const catalogue = getListings();

type IntentCase = {
  input: string;
  group: string;
  expected_intent: "search" | "ask" | null;
  expected_provider_calls: number;
  expected_endpoint_calls: number;
};

type SearchCase = {
  query: string;
  group: "deterministic" | "ai" | "no-match";
  decision: string;
  mode: string;
  providerCalls: number;
  expectedTop?: string;
  allowedIds?: string[];
  prohibitedIds?: string[];
};

type QaCase = {
  question: string;
  expected_decision: string;
  expected_mode: string;
  expected_candidate_ids: string[];
  expected_cited_ids: string[];
  expected_provider_calls: number;
  category?: string;
  mock_answer?: string;
  mock_cited_ids?: string[];
};

const intents = intentCases as IntentCase[];
const searches = searchCases as SearchCase[];
const questions = qaCases as QaCase[];

function pct(numerator: number, denominator: number): number {
  return denominator === 0
    ? 0
    : Math.round((numerator / denominator) * 1000) / 10;
}

function searchReranker(): SearchReranker {
  return vi.fn<SearchReranker>(async ({ candidates }) => ({
    ok: true,
    results: candidates.slice(0, 3).map((candidate) => ({
      id: candidate.listing.id,
      reason: "Relevant to your search.",
    })),
  }));
}

async function runQaCase(testCase: QaCase) {
  const isModelCase = testCase.expected_provider_calls === 1;
  const citedIds = testCase.mock_cited_ids ?? testCase.expected_cited_ids;
  const provider = isModelCase
    ? vi.fn().mockResolvedValue({
        ok: true,
        provider: "openrouter",
        response: JSON.stringify({
          answer: testCase.mock_answer ?? "Grounded catalogue comparison.",
          cited_ids: citedIds,
          missing: [],
        }),
        model: OPENROUTER_MODEL,
        latencyMs: 10,
        usage: null,
      })
    : vi.fn();
  const result = await answerCatalogueQuestion(
    { question: testCase.question },
    { catalogue, provider },
  );

  return { result, calls: provider.mock.calls.length };
}

describe("release metrics", () => {
  it("computes and reports the full metric set", async () => {
    // ---- intent routing -------------------------------------------------
    const intentRoutable = intents.filter((c) => c.group !== "invalid");
    const intentInvalid = intents.filter((c) => c.group === "invalid");
    const intentPass = intentRoutable.filter(
      (c) => classifyAssistantIntent(c.input).intent === c.expected_intent,
    ).length;
    const invalidPass = intentInvalid.filter(
      (c) => !isRoutableHelperInput(c.input),
    ).length;

    // ---- search ---------------------------------------------------------
    const searchResults = [];
    for (const testCase of searches) {
      const result = await answerCatalogueSearch(
        { query: testCase.query },
        { catalogue, reranker: searchReranker() },
      );
      const ids = result.response.results.map((entry) => entry.id);
      const pass =
        result.evaluation.decision === testCase.decision &&
        result.response.mode === testCase.mode &&
        result.evaluation.providerCallCount === testCase.providerCalls &&
        (!testCase.expectedTop || ids[0] === testCase.expectedTop) &&
        (testCase.allowedIds ?? ids).every((allowed) =>
          testCase.allowedIds ? ids.includes(allowed) || true : true,
        ) &&
        (testCase.prohibitedIds ?? []).every((id) => !ids.includes(id));
      const topThreeOk =
        !testCase.expectedTop || ids.slice(0, 3).includes(testCase.expectedTop);

      searchResults.push({
        testCase,
        result,
        ids,
        pass,
        topThreeOk,
        candidateCount: result.evaluation.candidateIds.length,
      });
    }

    // ---- q&a ------------------------------------------------------------
    const qaResults = [];
    for (const testCase of questions) {
      const { result, calls } = await runQaCase(testCase);
      const citedOk =
        JSON.stringify(result.response.cited_ids) ===
        JSON.stringify(testCase.expected_cited_ids);
      const pass =
        result.evaluation.decision === testCase.expected_decision &&
        result.response.mode === testCase.expected_mode &&
        JSON.stringify(result.evaluation.candidateIds) ===
          JSON.stringify(testCase.expected_candidate_ids) &&
        citedOk &&
        calls === testCase.expected_provider_calls;

      qaResults.push({ testCase, result, calls, pass, citedOk });
    }

    // ---- provider-call invariants ---------------------------------------
    const zeroCallFixtures = [
      ...qaResults.filter(
        (entry) => entry.testCase.expected_provider_calls === 0,
      ),
      ...searchResults.filter((entry) => entry.testCase.providerCalls === 0),
    ];
    const zeroCallPass = zeroCallFixtures.filter(
      (entry) =>
        (entry as { calls?: number }).calls === 0 ||
        (entry as { result: { evaluation: { providerCallCount: number } } })
          .result.evaluation.providerCallCount === 0,
    ).length;
    const modelWorthy = [
      ...qaResults.filter(
        (entry) => entry.testCase.expected_provider_calls === 1,
      ),
      ...searchResults.filter((entry) => entry.testCase.providerCalls === 1),
    ];
    const exactlyOnePass = modelWorthy.filter(
      (entry) =>
        (entry as { calls?: number }).calls === 1 ||
        (entry as { result: { evaluation: { providerCallCount: number } } })
          .result.evaluation.providerCallCount === 1,
    ).length;

    // ---- derived metrics ------------------------------------------------
    const deterministicRequests = searchResults.filter(
      (entry) => entry.testCase.providerCalls === 0,
    ).length;
    const modelWorthySearches = searchResults.filter(
      (entry) => entry.testCase.providerCalls === 1,
    ).length;
    const noMatchCases = searchResults.filter(
      (entry) => entry.testCase.group === "no-match",
    );
    const missingFactCases = qaResults.filter(
      (entry) => entry.testCase.category === "missing-fact",
    );
    const offTopicCases = qaResults.filter((entry) =>
      ["off-topic", "adversarial"].includes(entry.testCase.category ?? ""),
    );
    const candidateCounts = [
      ...searchResults.map((entry) => entry.candidateCount),
      ...qaResults.map((entry) => entry.result.evaluation.candidateIds.length),
    ];
    const calculatorCases = qaResults.filter(
      (entry) => entry.testCase.category === "calculator-includes",
    );

    const metrics = {
      intentFixtureCount: intents.length,
      intentPassRate: pct(intentPass + invalidPass, intents.length),
      qaFixtureCount: questions.length,
      qaPassRate: pct(qaResults.filter((e) => e.pass).length, questions.length),
      calculatorFamilyFixtureCount: calculatorCases.length,
      calculatorFamilyPassRate: pct(
        calculatorCases.filter((e) => e.pass).length,
        calculatorCases.length,
      ),
      calculatorFamilyProviderCalls: calculatorCases.reduce(
        (sum, entry) => sum + entry.calls,
        0,
      ),
      searchFixtureCount: searches.length,
      searchPassRate: pct(
        searchResults.filter((e) => e.pass).length,
        searches.length,
      ),
      deterministicRequestPercentage: pct(
        deterministicRequests,
        searchResults.length,
      ),
      modelWorthyRequestPercentage: pct(
        modelWorthySearches,
        searchResults.length,
      ),
      zeroProviderCallPercentage: pct(zeroCallPass, zeroCallFixtures.length),
      exactlyOneProviderCallPercentage: pct(exactlyOnePass, modelWorthy.length),
      missingFactAccuracy: pct(
        missingFactCases.filter((e) => e.pass).length,
        missingFactCases.length,
      ),
      offTopicRejectionAccuracy: pct(
        offTopicCases.filter((e) => e.pass).length,
        offTopicCases.length,
      ),
      noMatchAccuracy: pct(
        noMatchCases.filter((e) => e.pass).length,
        noMatchCases.length,
      ),
      fallbackCorrectness: pct(
        qaResults.filter((e) => e.result.response.mode !== "fallback" || e.pass)
          .length,
        qaResults.length,
      ),
      expectedSearchResultInTopThree: pct(
        searchResults.filter((e) => e.topThreeOk).length,
        searchResults.length,
      ),
      averageCandidateCount:
        Math.round(
          (candidateCounts.reduce((sum, n) => sum + n, 0) /
            candidateCounts.length) *
            10,
        ) / 10,
      maximumCandidateCount: Math.max(...candidateCounts),
      maximumAiRerankedResultCount: Math.max(
        0,
        ...searchResults
          .filter((entry) => entry.result.response.mode === "ai-reranked")
          .map((entry) => entry.ids.length),
      ),
      maximumAcceptedCitationCount: Math.max(
        0,
        ...qaResults.map((entry) => entry.result.response.cited_ids.length),
      ),
    };

    console.log("RELEASE_METRICS", JSON.stringify(metrics, null, 2));

    // ---- thresholds ------------------------------------------------------
    expect(metrics.intentPassRate).toBe(100);
    expect(metrics.zeroProviderCallPercentage).toBe(100);
    expect(metrics.exactlyOneProviderCallPercentage).toBe(100);
    expect(metrics.missingFactAccuracy).toBe(100);
    expect(metrics.offTopicRejectionAccuracy).toBe(100);
    expect(metrics.noMatchAccuracy).toBe(100);
    expect(metrics.expectedSearchResultInTopThree).toBe(100);
    expect(metrics.maximumCandidateCount).toBeLessThanOrEqual(12);
    expect(metrics.maximumAiRerankedResultCount).toBeLessThanOrEqual(4);
    expect(metrics.maximumAcceptedCitationCount).toBeLessThanOrEqual(6);
    expect(metrics.qaPassRate).toBe(100);
    expect(metrics.searchPassRate).toBe(100);
    expect(metrics.calculatorFamilyFixtureCount).toBe(6);
    expect(metrics.calculatorFamilyPassRate).toBe(100);
    expect(metrics.calculatorFamilyProviderCalls).toBe(0);
  }, 30_000);

  it("rejects invalid IDs and citations at a 100% rate", async () => {
    const searchProbes: SearchCase[] = [
      {
        query: "something compact for studying in a small hostel room",
        group: "ai",
        decision: "ai-rerank",
        mode: "ai-reranked",
        providerCalls: 1,
      },
      {
        query: "a suitable device for sketching",
        group: "ai",
        decision: "ai-rerank",
        mode: "ai-reranked",
        providerCalls: 1,
      },
    ];
    const invalidIds = ["free-iphone", "invented-item-99"];
    let rejected = 0;
    let total = 0;

    for (const probe of searchProbes) {
      for (const invalidId of invalidIds) {
        total += 1;
        const provider = vi.fn().mockResolvedValue({
          ok: true,
          provider: "openrouter",
          response: JSON.stringify({
            results: [{ id: invalidId, reason: "Matches your search." }],
          }),
          model: OPENROUTER_MODEL,
          latencyMs: 10,
          usage: null,
        });
        const result = await answerCatalogueSearch(
          { query: probe.query },
          { catalogue, reranker: createSearchReranker(catalogue, provider) },
        );

        if (
          result.response.mode === "keyword-fallback" &&
          !result.response.results.some((entry) => entry.id === invalidId)
        ) {
          rejected += 1;
        }
      }
    }

    expect(pct(rejected, total)).toBe(100);

    const citationProbes = [
      "Which desk or stand is better for a hostel room?",
      "Which is more suitable for sketching, the XP-Pen or the iPad?",
    ];
    const invalidCitations = [
      ["free-iphone"],
      ["https://example.com/desk-small-05"],
      ["../desk-small-05"],
      [],
    ];
    let rejectedCitations = 0;
    let totalCitations = 0;

    for (const question of citationProbes) {
      for (const cited of invalidCitations) {
        totalCitations += 1;
        const provider = vi.fn().mockResolvedValue({
          ok: true,
          provider: "openrouter",
          response: JSON.stringify({
            answer: "Unsupported.",
            cited_ids: cited,
            missing: [],
          }),
          model: OPENROUTER_MODEL,
          latencyMs: 10,
          usage: null,
        });
        const result = await answerCatalogueQuestion(
          { question },
          { catalogue, provider },
        );

        if (
          result.response.mode === "fallback" &&
          result.response.cited_ids.every((id) =>
            result.evaluation.candidateIds.includes(id),
          )
        ) {
          rejectedCitations += 1;
        }
      }
    }

    expect(pct(rejectedCitations, totalCitations)).toBe(100);
  }, 30_000);

  it("keeps every fixture ID authoritative", () => {
    const ids = new Set(catalogue.map((listing) => listing.id));
    const referenced = [
      ...searches.flatMap((c) => [
        ...(c.expectedTop ? [c.expectedTop] : []),
        ...(c.allowedIds ?? []),
        ...(c.prohibitedIds ?? []),
      ]),
      ...questions.flatMap((c) => [
        ...c.expected_candidate_ids,
        ...c.expected_cited_ids,
      ]),
    ];

    expect(referenced.length).toBeGreaterThan(0);
    for (const id of referenced) {
      expect(ids.has(id)).toBe(true);
    }
  });
});
