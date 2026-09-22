import type { Category, Listing } from "@/lib/catalogue";
import {
  clampCandidateLimit,
  expandWithSynonyms,
  fieldTerms,
  headTitleTerms as headTitleTermsCore,
  longestMatchingTitlePhrase as longestMatchingTitlePhraseCore,
  meaningfulTerms,
  normalizeText,
  overlapScore,
} from "@/lib/retrieval-core";

export const MAX_RETRIEVAL_CANDIDATES = 6;
export const MIN_RELEVANCE_SCORE = 4;

export type RetrievalConstraints = {
  category?: Category;
  maxPriceSgd?: number;
  maxPriceInclusive?: boolean;
};

export type RetrievalOptions = {
  question: string;
  itemId?: string;
  limit: number;
  catalogue: readonly Listing[];
};

export type RetrievalResult = {
  candidates: Listing[];
  constraints: RetrievalConstraints;
  broad: boolean;
};

const stopWords = new Set([
  "a",
  "about",
  "an",
  "and",
  "are",
  "at",
  "be",
  "better",
  "can",
  "do",
  "does",
  "for",
  "how",
  "i",
  "in",
  "is",
  "it",
  "item",
  "items",
  "listing",
  "listings",
  "me",
  "of",
  "or",
  "please",
  "something",
  "anything",
  "nothing",
  "need",
  "want",
  "looking",
  "find",
  "get",
  "there",
  "here",
  "the",
  "than",
  "that",
  "this",
  "to",
  "what",
  "which",
  "with",
]);

const synonymGroups = [
  ["bike", "bicycle"],
  ["cool", "cools", "cooling", "breeze", "fan"],
  ["dorm", "hostel"],
  ["fridge", "refrigerator"],
  ["hub", "dongle"],
  ["ipad", "tablet"],
  ["lamp", "light"],
  ["raise", "raises", "riser", "stand"],
  ["sketch", "sketching", "draw", "drawing"],
] as const;

const productNouns = new Set([
  "bicycle",
  "bike",
  "board",
  "book",
  "breadboard",
  "brick",
  "cable",
  "calculator",
  "case",
  "desk",
  "dongle",
  "fan",
  "fridge",
  "hub",
  "ipad",
  "keyboard",
  "lamp",
  "laptop",
  "lock",
  "monitor",
  "pen",
  "phone",
  "pouch",
  "rack",
  "refrigerator",
  "remote",
  "sensor",
  "speaker",
  "speakers",
  "stand",
  "tablet",
  "tray",
  "wire",
  "wires",
]);

const contextTerms = new Set([
  "campus",
  "cheap",
  "cheapest",
  "class",
  "classes",
  "condition",
  "dorm",
  "hostel",
  "mrt",
  "price",
  "room",
  "school",
  "size",
  "somapah",
  "student",
  "students",
  "study",
  "studying",
  "term",
  "today",
  "week",
  "weekday",
  "weekend",
]);

function expandTerms(terms: readonly string[]): Set<string> {
  return expandWithSynonyms(terms, synonymGroups);
}

function directQuestionTerms(question: string): Set<string> {
  return meaningfulTerms(question, stopWords);
}

function synonymOnlyTerms(directTerms: ReadonlySet<string>): Set<string> {
  const expanded = expandTerms([...directTerms]);
  directTerms.forEach((term) => expanded.delete(term));
  return expanded;
}

function productTermsOnly(terms: ReadonlySet<string>): Set<string> {
  return new Set([...terms].filter((term) => productNouns.has(term)));
}

function headTitleTerms(title: string): Set<string> {
  return headTitleTermsCore(title, productNouns);
}

function parseConstraints(question: string): RetrievalConstraints {
  const normalized = normalizeText(question);
  const categoryMatch = normalized.match(
    /\b(tech|dorm|course)\s+(?:item|items|listing|listings|gear)\b/,
  );
  const inclusivePriceMatch = normalized.match(
    /\b(?:at most|up to|no more than|maximum|max)\s+(?:sgd\s*)?\$?\s*(\d+(?:\.\d{1,2})?)\b/,
  );
  const exclusivePriceMatch = normalized.match(
    /\b(?:under|below|less than)\s+(?:sgd\s*)?\$?\s*(\d+(?:\.\d{1,2})?)\b/,
  );
  const priceMatch = inclusivePriceMatch ?? exclusivePriceMatch;

  return {
    ...(categoryMatch ? { category: categoryMatch[1] as Category } : {}),
    ...(priceMatch
      ? {
          maxPriceSgd: Number(priceMatch[1]),
          maxPriceInclusive: Boolean(inclusivePriceMatch),
        }
      : {}),
  };
}

function comparisonTargetTerms(question: string): Set<string> {
  const normalized = normalizeText(question);
  const match = normalized.match(
    /\b(?:which|compare)\s+(.+?)\s+(?:is|are)\s+(?:better|best)\b/,
  );

  if (!match) {
    return new Set();
  }

  return directQuestionTerms(match[1]);
}

function longestMatchingTitlePhrase(
  normalizedQuestion: string,
  title: string,
): number {
  return longestMatchingTitlePhraseCore(normalizedQuestion, title);
}

function obeysConstraints(
  listing: Listing,
  constraints: RetrievalConstraints,
): boolean {
  if (constraints.category && listing.category !== constraints.category) {
    return false;
  }

  if (constraints.maxPriceSgd !== undefined) {
    return constraints.maxPriceInclusive
      ? listing.price_sgd <= constraints.maxPriceSgd
      : listing.price_sgd < constraints.maxPriceSgd;
  }

  return true;
}

function scoreListing(
  listing: Listing,
  normalizedQuestion: string,
  directTerms: ReadonlySet<string>,
  synonymTerms: ReadonlySet<string>,
  namedProductTerms: ReadonlySet<string>,
  namedProductSynonyms: ReadonlySet<string>,
  itemId: string | undefined,
): { score: number; productHeadMatches: number } {
  let score = itemId === listing.id ? 1_000 : 0;
  const normalizedId = normalizeText(listing.id);
  const normalizedTitle = normalizeText(listing.title);
  const titleHeads = headTitleTerms(listing.title);

  if (normalizedQuestion.includes(normalizedId)) {
    score += 100;
  }

  if (normalizedQuestion.includes(normalizedTitle)) {
    score += 50;
  }

  const directHeadMatches = overlapScore(directTerms, titleHeads, 1);
  const directHeadScore = directHeadMatches * 8;
  const directBodyMatches = Math.max(
    0,
    overlapScore(directTerms, fieldTerms(listing.title), 1) - directHeadMatches,
  );

  score += directHeadScore;
  score += directBodyMatches * 3;
  const synonymHeadMatches = overlapScore(synonymTerms, titleHeads, 1);
  const productHeadMatches =
    overlapScore(namedProductTerms, titleHeads, 1) +
    overlapScore(namedProductSynonyms, titleHeads, 1);

  score += synonymHeadMatches * 3;
  score += overlapScore(synonymTerms, fieldTerms(listing.title), 1);
  score += overlapScore(directTerms, fieldTerms(listing.category), 4);
  score += overlapScore(synonymTerms, fieldTerms(listing.category), 1);
  score += overlapScore(directTerms, fieldTerms(listing.includes), 4);
  score += overlapScore(synonymTerms, fieldTerms(listing.includes), 1);
  score += overlapScore(directTerms, fieldTerms(listing.seller_note), 3);
  score += overlapScore(synonymTerms, fieldTerms(listing.seller_note), 1);
  score += overlapScore(directTerms, fieldTerms(listing.pickup), 2);
  score += overlapScore(synonymTerms, fieldTerms(listing.pickup), 1);
  score += overlapScore(directTerms, fieldTerms(listing.meetup_window), 2);
  score += overlapScore(synonymTerms, fieldTerms(listing.meetup_window), 1);
  score += overlapScore(directTerms, fieldTerms(listing.condition), 2);
  score += overlapScore(synonymTerms, fieldTerms(listing.condition), 1);
  score += overlapScore(directTerms, fieldTerms(listing.defects), 1);
  score += overlapScore(synonymTerms, fieldTerms(listing.defects), 1);

  return { score, productHeadMatches };
}

export function retrieveListingsForQuestion({
  question,
  itemId,
  limit,
  catalogue,
}: RetrievalOptions): RetrievalResult {
  const normalizedQuestion = normalizeText(question);
  const directTerms = directQuestionTerms(question);
  const synonymTerms = synonymOnlyTerms(directTerms);
  const namedProductTerms = productTermsOnly(directTerms);
  const namedProductSynonyms = productTermsOnly(synonymTerms);
  const targetTerms = comparisonTargetTerms(question);
  const constraints = parseConstraints(question);
  const boundedLimit = clampCandidateLimit(limit, MAX_RETRIEVAL_CANDIDATES);
  const seenIds = new Set<string>();
  const scoredListings = catalogue
    .map((listing, index) => {
      const { score, productHeadMatches } = scoreListing(
        listing,
        normalizedQuestion,
        directTerms,
        synonymTerms,
        namedProductTerms,
        namedProductSynonyms,
        itemId,
      );
      const titleHeads = headTitleTerms(listing.title);
      const titlePhraseLength = longestMatchingTitlePhrase(
        normalizedQuestion,
        listing.title,
      );

      return {
        listing,
        index,
        score,
        directTitleMatches: [...directTerms].filter(
          (term) => titleHeads.has(term) && !contextTerms.has(term),
        ).length,
        targetTitleMatches: overlapScore(targetTerms, titleHeads, 1),
        titlePhraseLength,
        productSignal: productHeadMatches > 0 || titlePhraseLength >= 2,
      };
    })
    .filter(({ listing, score, productSignal }) => {
      return (
        score >= MIN_RELEVANCE_SCORE &&
        obeysConstraints(listing, constraints) &&
        (namedProductTerms.size === 0 || productSignal)
      );
    });
  const isComparison =
    /\b(?:best|better|compare|comparison|recommend|versus|vs|which)\b/.test(
      normalizedQuestion,
    );
  const directTitleMatches = scoredListings.filter(
    ({ directTitleMatches: matches }) => matches > 0,
  );
  const targetTitleMatches = scoredListings.filter(
    ({ targetTitleMatches: matches }) => matches > 0,
  );
  const titlePhraseMatches = scoredListings.filter(
    ({ titlePhraseLength }) => titlePhraseLength >= 2,
  );
  const candidatePool =
    isComparison && targetTitleMatches.length >= 2
      ? targetTitleMatches
      : !itemId && !isComparison && titlePhraseMatches.length === 1
        ? titlePhraseMatches
        : !itemId && !isComparison && directTitleMatches.length === 1
          ? directTitleMatches
          : scoredListings;
  const candidates = candidatePool
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .filter(({ listing }) => {
      if (seenIds.has(listing.id)) {
        return false;
      }

      seenIds.add(listing.id);
      return true;
    })
    .slice(0, boundedLimit)
    .map(({ listing }) => listing);

  return {
    candidates,
    constraints,
    broad: /\b(?:all|compare|comparison|options|items|listings)\b/.test(
      normalizedQuestion,
    ),
  };
}
