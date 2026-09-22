import type { Listing } from "@/lib/catalogue";
import { z } from "zod";
import {
  evaluateHardConstraints,
  parseSearchQuery,
  toPublicInterpreted,
  type ParsedSearchQuery,
  type SearchInterpreted,
} from "@/lib/search-query";
import { searchCatalogue, type SearchCandidate } from "@/lib/search-retrieval";

export const MAX_MODEL_CANDIDATES = 6;
export const MAX_AI_RESULTS = 4;
export const MAX_PUBLIC_RESULTS = 6;
export const REASON_MAX_CHARACTERS = 120;
export const REASON_MAX_WORDS = 20;

function hasThreeUsefulCharacters(value: string): boolean {
  return (value.match(/[a-z0-9]/gi)?.length ?? 0) >= 3;
}

export const searchRequestSchema = z
  .object({
    query: z.string().trim().min(3).max(300).refine(hasThreeUsefulCharacters, {
      message: "Query needs at least three useful characters.",
    }),
  })
  .strict();

export type SearchDecision = "deterministic-results" | "ai-rerank" | "no-match";

export type SearchPublicMode =
  "deterministic" | "ai-reranked" | "keyword-fallback" | "no-match";

export type SearchPublicResult = {
  id: string;
  reason: string;
};

export type SearchPublicResponse = {
  mode: SearchPublicMode;
  interpreted: SearchInterpreted;
  results: SearchPublicResult[];
};

export type SearchEvaluation = {
  decision: SearchDecision;
  candidateIds: string[];
  providerCallCount: 0 | 1;
};

export type CatalogueSearchResult = {
  response: SearchPublicResponse;
  evaluation: SearchEvaluation;
};

export type SearchRerankerInput = {
  parsed: ParsedSearchQuery;
  candidates: SearchCandidate[];
  catalogue: readonly Listing[];
};

export type SearchRerankerOutcome =
  { ok: true; results: SearchPublicResult[] } | { ok: false };

export type SearchReranker = (
  input: SearchRerankerInput,
) => Promise<SearchRerankerOutcome>;

export type SearchRequest = { query: string };

type SearchDependencies = {
  catalogue?: readonly Listing[];
  reranker?: SearchReranker;
};

function humanizeConcept(concept: string): string {
  return concept.replace(/-/g, " ");
}

function interpretedConcepts(parsed: ParsedSearchQuery): string[] {
  return parsed.constraints.productConcepts.map(humanizeConcept);
}

function clampReason(text: string): string {
  const words = text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, REASON_MAX_WORDS);
  let reason = words.join(" ");

  if (reason.length > REASON_MAX_CHARACTERS) {
    reason = reason.slice(0, REASON_MAX_CHARACTERS).trim();
  }

  return reason;
}

function deterministicReason(
  candidate: SearchCandidate,
  parsed: ParsedSearchQuery,
): string {
  const bits: string[] = [];
  const { constraints } = parsed;

  if (candidate.evidence.matchedConcepts.length > 0) {
    bits.push(
      `matches ${humanizeConcept(candidate.evidence.matchedConcepts[0])}`,
    );
  }

  if (constraints.category) {
    bits.push(`in the ${constraints.category} category`);
  }

  if (constraints.condition) {
    bits.push(`in ${constraints.condition} condition`);
  }

  if (constraints.price?.max) {
    bits.push(`within your S$${constraints.price.max.valueSgd} budget`);
  }

  if (constraints.price?.min) {
    bits.push(`at or above S$${constraints.price.min.valueSgd}`);
  }

  if (constraints.pickupTerms.includes("mrt")) {
    bits.push("with pickup toward the MRT");
  }

  if (bits.length === 0) {
    return "Matches your search terms.";
  }

  const sentence = bits.join(", ");
  return clampReason(
    `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`,
  );
}

function decide(
  parsed: ParsedSearchQuery,
  candidates: readonly SearchCandidate[],
): SearchDecision {
  if (parsed.hasAdversarialInstruction || parsed.contradictory) {
    return "no-match";
  }

  if (candidates.length === 0) {
    return "no-match";
  }

  if (parsed.fuzzySignals.length > 0 && candidates.length >= 2) {
    return "ai-rerank";
  }

  return "deterministic-results";
}

function deterministicResponse(
  parsed: ParsedSearchQuery,
  candidates: SearchCandidate[],
): SearchPublicResponse {
  return {
    mode: "deterministic",
    interpreted: toPublicInterpreted(
      parsed.constraints,
      interpretedConcepts(parsed),
    ),
    results: candidates.slice(0, MAX_PUBLIC_RESULTS).map((candidate) => ({
      id: candidate.listing.id,
      reason: deterministicReason(candidate, parsed),
    })),
  };
}

function keywordFallbackResponse(
  parsed: ParsedSearchQuery,
  candidates: SearchCandidate[],
): SearchPublicResponse {
  return {
    mode: "keyword-fallback",
    interpreted: toPublicInterpreted(
      parsed.constraints,
      interpretedConcepts(parsed),
    ),
    results: candidates.slice(0, MAX_PUBLIC_RESULTS).map((candidate) => ({
      id: candidate.listing.id,
      reason: deterministicReason(candidate, parsed),
    })),
  };
}

function noMatchResponse(parsed: ParsedSearchQuery): SearchPublicResponse {
  return {
    mode: "no-match",
    interpreted: toPublicInterpreted(
      parsed.constraints,
      interpretedConcepts(parsed),
    ),
    results: [],
  };
}

/**
 * Reapply authority to reranked results: every returned ID must be a retrieved
 * candidate that still passes hard constraints. Duplicates are dropped by first
 * occurrence, reasons are bounded, and the result is capped. Any authority
 * failure collapses to the deterministic keyword fallback.
 */
function enforceRerankedResults(
  results: readonly SearchPublicResult[],
  parsed: ParsedSearchQuery,
  candidates: readonly SearchCandidate[],
): SearchPublicResult[] | null {
  const candidateById = new Map(
    candidates.map((candidate) => [candidate.listing.id, candidate.listing]),
  );
  const seen = new Set<string>();
  const enforced: SearchPublicResult[] = [];

  for (const result of results) {
    const listing = candidateById.get(result.id);

    if (!listing) {
      return null;
    }

    if (
      evaluateHardConstraints(listing, parsed.constraints) !== "confirmed-pass"
    ) {
      return null;
    }

    if (seen.has(result.id)) {
      continue;
    }

    seen.add(result.id);
    enforced.push({ id: result.id, reason: clampReason(result.reason) });
  }

  if (enforced.length === 0) {
    return null;
  }

  return enforced.slice(0, MAX_AI_RESULTS);
}

export async function answerCatalogueSearch(
  input: SearchRequest,
  dependencies: SearchDependencies = {},
): Promise<CatalogueSearchResult> {
  const catalogue = dependencies.catalogue ?? [];
  const parsed = parseSearchQuery(input.query);
  const candidates = searchCatalogue({
    parsed,
    limit: MAX_MODEL_CANDIDATES,
    catalogue,
  });
  const candidateIds = candidates.map((candidate) => candidate.listing.id);
  const decision = decide(parsed, candidates);

  if (decision === "no-match") {
    return {
      response: noMatchResponse(parsed),
      evaluation: { decision, candidateIds: [], providerCallCount: 0 },
    };
  }

  if (decision === "deterministic-results") {
    return {
      response: deterministicResponse(parsed, candidates),
      evaluation: { decision, candidateIds, providerCallCount: 0 },
    };
  }

  // decision === "ai-rerank"
  if (!dependencies.reranker) {
    return {
      response: keywordFallbackResponse(parsed, candidates),
      evaluation: { decision, candidateIds, providerCallCount: 0 },
    };
  }

  // A reranker that throws (rather than returning { ok: false }) must not
  // escape the orchestrator: the provider adapter normalizes its own failures,
  // and anything that still throws degrades to catalogue keyword matching.
  let outcome: SearchRerankerOutcome;

  try {
    outcome = await dependencies.reranker({
      parsed,
      candidates,
      catalogue,
    });
  } catch {
    outcome = { ok: false };
  }

  if (outcome.ok) {
    const enforced = enforceRerankedResults(
      outcome.results,
      parsed,
      candidates,
    );

    if (enforced) {
      return {
        response: {
          mode: "ai-reranked",
          interpreted: toPublicInterpreted(
            parsed.constraints,
            interpretedConcepts(parsed),
          ),
          results: enforced,
        },
        evaluation: { decision, candidateIds, providerCallCount: 1 },
      };
    }
  }

  return {
    response: keywordFallbackResponse(parsed, candidates),
    evaluation: { decision, candidateIds, providerCallCount: 1 },
  };
}
