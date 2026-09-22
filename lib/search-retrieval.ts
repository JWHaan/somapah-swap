import type { Listing } from "@/lib/catalogue";
import {
  clampCandidateLimit,
  fieldTerms,
  headTitleTerms,
  longestMatchingTitlePhrase,
  normalizeText,
  overlapScore,
  tokenize,
} from "@/lib/retrieval-core";
import {
  evaluateHardConstraints,
  type ParsedSearchQuery,
} from "@/lib/search-query";

export const SEARCH_RELEVANCE_THRESHOLD = 10;
export const MAX_INTERNAL_CANDIDATES = 12;

export type MatchEvidence = {
  score: number;
  matchedConcepts: string[];
  structuredOnly: boolean;
};

export type SearchCandidate = {
  listing: Listing;
  score: number;
  evidence: MatchEvidence;
};

export type SearchCatalogueInput = {
  parsed: ParsedSearchQuery;
  limit: number;
  catalogue: readonly Listing[];
};

const SEARCH_PRODUCT_NOUNS = new Set([
  "fan",
  "lamp",
  "light",
  "fridge",
  "refrigerator",
  "rack",
  "desk",
  "board",
  "breadboard",
  "calculator",
  "tablet",
  "book",
  "paperback",
  "ipad",
  "monitor",
  "screen",
  "keyboard",
  "hub",
  "dongle",
  "bike",
  "bicycle",
  "stand",
  "laptop",
  "pen",
  "cable",
  "case",
  "remote",
  "brick",
  "lock",
  "tray",
  "pouch",
  "wire",
  "wires",
  "sensor",
  "phone",
  "speaker",
  "speakers",
]);

/**
 * Positive title-evidence keywords per concept. Concept matching uses the
 * authoritative listing title (and brand tokens present in the title) so that
 * a negated seller-note phrase such as "No screen" never counts as evidence.
 */
const CONCEPT_TITLE_KEYWORDS: Record<string, readonly string[]> = {
  fan: ["fan"],
  lamp: ["lamp"],
  fridge: ["fridge"],
  "laundry-rack": ["rack", "laundry"],
  desk: ["desk"],
  arduino: ["arduino"],
  calculator: ["casio", "calculator"],
  "drawing-tablet": ["drawing", "xp"],
  book: ["book", "paperback"],
  ipad: ["ipad"],
  monitor: ["monitor"],
  keyboard: ["keychron", "keyboard"],
  "usb-hub": ["hub"],
  bike: ["bike"],
  "laptop-stand": ["laptop"],
};

const CATEGORY_WORDS = new Set(["tech", "dorm", "course"]);
const CONDITION_WORDS = new Set(["new", "like", "well", "used"]);

function listingMatchesConcept(listing: Listing, concept: string): boolean {
  const keywords = CONCEPT_TITLE_KEYWORDS[concept];

  if (!keywords) {
    return false;
  }

  const title = normalizeText(listing.title);
  return keywords.some((keyword) => title.includes(keyword));
}

/**
 * Terms from free text, excluding any token immediately preceded by a negation
 * word such as "no" or "not". This prevents phrases like "No screen" or
 * "Bluetooth not tested" from contributing positive lexical evidence.
 */
function positiveFieldTerms(value: string): Set<string> {
  const tokens = tokenize(value);
  const result = new Set<string>();
  let negatedTermsRemaining = 0;

  tokens.forEach((token) => {
    if (negatedTermsRemaining > 0) {
      negatedTermsRemaining -= 1;
      return;
    }

    if (["no", "not", "missing", "without"].includes(token)) {
      // Skip the short noun phrase following a negation marker. This covers
      // "No screen", "No cooling fan", and "Bluetooth not tested" without
      // attempting to build a general natural-language negation parser.
      negatedTermsRemaining = 2;
      return;
    }

    result.add(token);
  });

  return result;
}

function contentTerms(parsed: ParsedSearchQuery): string[] {
  return parsed.lexicalTerms.filter(
    (term) => !CATEGORY_WORDS.has(term) && !CONDITION_WORDS.has(term),
  );
}

type SearchIntent = "study" | "cooling" | "food-storage" | "laptop-raising";

type IntentEvidence = Record<SearchIntent, number>;

const STUDY_QUERY_PATTERN =
  /\b(?:study|studying|workspace|work\s+surface|writing|coding|sketch|sketching|draw|drawing|laptop|desk)\b/;
const LAPTOP_RAISING_QUERY_PATTERN =
  /\b(?:raise|raising|elevate|lift)\b[\w\s-]{0,30}\b(?:laptop|macbook)\b/;
const COOLING_QUERY_PATTERN =
  /\b(?:cool|cooling|cooler|fan|breeze|airflow|heat)\b/;
const FOOD_STORAGE_QUERY_PATTERN =
  /\b(?:fridge|refrigerator|food|drink|drinks|cold|storage)\b/;

const STUDY_TITLE_TERMS = new Set([
  "desk",
  "laptop",
  "lamp",
  "monitor",
  "workspace",
  "writing",
]);
const SKETCH_TITLE_TERMS = new Set(["tablet", "ipad", "drawing"]);
const STUDY_NOTE_TERMS = new Set([
  "study",
  "studying",
  "studio",
  "laptop",
  "lamp",
  "raises",
  "macbook",
  "eye",
  "level",
  "coding",
  "sketching",
  "sketch",
  "drawing",
  "wireframes",
  "work",
  "surface",
]);
const COOLING_TITLE_TERMS = new Set(["fan"]);
const COOLING_NOTE_TERMS = new Set([
  "cool",
  "cools",
  "cooling",
  "breeze",
  "airflow",
  "heat",
]);
const FOOD_STORAGE_TITLE_TERMS = new Set(["fridge", "refrigerator"]);
const FOOD_STORAGE_NOTE_TERMS = new Set([
  "food",
  "drink",
  "drinks",
  "cold",
  "storage",
]);
const LAPTOP_RAISING_TITLE_TERMS = new Set(["laptop"]);
const LAPTOP_RAISING_NOTE_TERMS = new Set([
  "raises",
  "macbook",
  "eye",
  "level",
  "riser",
]);

function activeIntents(parsed: ParsedSearchQuery): Set<SearchIntent> {
  const query = parsed.normalizedQuery;
  const intents = new Set<SearchIntent>();

  if (LAPTOP_RAISING_QUERY_PATTERN.test(query)) {
    intents.add("laptop-raising");
  } else if (STUDY_QUERY_PATTERN.test(query)) {
    intents.add("study");
  }

  if (COOLING_QUERY_PATTERN.test(query)) {
    intents.add("cooling");
  }

  if (FOOD_STORAGE_QUERY_PATTERN.test(query)) {
    intents.add("food-storage");
  }

  return intents;
}

function countOverlap(
  terms: ReadonlySet<string>,
  vocabulary: ReadonlySet<string>,
): number {
  return [...terms].filter((term) => vocabulary.has(term)).length;
}

function intentEvidence(
  listing: Listing,
  parsed: ParsedSearchQuery,
): IntentEvidence {
  const titleTerms = positiveFieldTerms(listing.title);
  const noteTerms = positiveFieldTerms(listing.seller_note);
  const sketchIntent = /\b(?:sketch|sketching|draw|drawing)\b/.test(
    parsed.normalizedQuery,
  );

  let study =
    countOverlap(titleTerms, STUDY_TITLE_TERMS) * 8 +
    Math.min(3, countOverlap(noteTerms, STUDY_NOTE_TERMS)) * 3;

  if (sketchIntent) {
    study += countOverlap(titleTerms, SKETCH_TITLE_TERMS) * 8;
  }

  const cooling =
    countOverlap(titleTerms, COOLING_TITLE_TERMS) * 8 +
    Math.min(2, countOverlap(noteTerms, COOLING_NOTE_TERMS)) * 3;
  const foodStorage =
    countOverlap(titleTerms, FOOD_STORAGE_TITLE_TERMS) * 8 +
    Math.min(2, countOverlap(noteTerms, FOOD_STORAGE_NOTE_TERMS)) * 3;
  const laptopRaising =
    countOverlap(titleTerms, LAPTOP_RAISING_TITLE_TERMS) * 8 +
    Math.min(2, countOverlap(noteTerms, LAPTOP_RAISING_NOTE_TERMS)) * 3;

  return {
    study,
    cooling,
    "food-storage": foodStorage,
    "laptop-raising": laptopRaising,
  };
}

function passesIntentEvidence(
  listing: Listing,
  parsed: ParsedSearchQuery,
): boolean {
  const intents = activeIntents(parsed);

  if (intents.size === 0) {
    return true;
  }

  const evidence = intentEvidence(listing, parsed);
  const thresholds: Record<SearchIntent, number> = {
    study: 6,
    cooling: 6,
    "food-storage": 6,
    "laptop-raising": 6,
  };

  // Multiple active intents are a union: study items and a fan may both be
  // useful for "study and keep the room cool". Generic hostel/dorm words do
  // not create evidence for any intent by themselves.
  return [...intents].some((intent) => evidence[intent] >= thresholds[intent]);
}

function hasStructuredConstraint(parsed: ParsedSearchQuery): boolean {
  const { constraints } = parsed;
  return Boolean(
    constraints.category ||
    constraints.condition ||
    constraints.price ||
    constraints.pickupTerms.length > 0 ||
    constraints.requiredIncludes.length > 0 ||
    constraints.requiredFeatures.length > 0 ||
    constraints.meetup.periods.length > 0 ||
    constraints.meetup.days.length > 0,
  );
}

function scoreListing(
  listing: Listing,
  parsed: ParsedSearchQuery,
): { score: number; matchedConcepts: string[] } {
  const query = new Set(parsed.lexicalTerms);
  const heads = headTitleTerms(listing.title, SEARCH_PRODUCT_NOUNS);
  const titleTokens = fieldTerms(listing.title);
  const bodyTitle = new Set(
    [...titleTokens].filter((term) => !heads.has(term)),
  );

  let score = 0;
  const matchedConcepts: string[] = [];

  if (parsed.normalizedQuery.includes(normalizeText(listing.id))) {
    score += 100;
  }

  if (longestMatchingTitlePhrase(parsed.normalizedQuery, listing.title) >= 2) {
    score += 60;
  }

  for (const concept of parsed.constraints.productConcepts) {
    if (listingMatchesConcept(listing, concept)) {
      score += 18;
      matchedConcepts.push(concept);
    }
  }

  score += overlapScore(query, heads, 10);
  score += overlapScore(query, bodyTitle, 6);
  score += overlapScore(query, fieldTerms(listing.id), 6);
  score += overlapScore(query, fieldTerms(listing.includes), 6);

  if (query.has(listing.category)) {
    score += 5;
  }

  score += overlapScore(query, fieldTerms(listing.condition), 5);
  score += overlapScore(query, positiveFieldTerms(listing.seller_note), 4);
  score += overlapScore(query, fieldTerms(listing.pickup), 3);
  score += overlapScore(query, fieldTerms(listing.meetup_window), 3);

  const intents = activeIntents(parsed);
  if (intents.size > 0) {
    const evidence = intentEvidence(listing, parsed);
    score += Math.max(...[...intents].map((intent) => evidence[intent]));
  }

  return { score, matchedConcepts };
}

export function searchCatalogue({
  parsed,
  limit,
  catalogue,
}: SearchCatalogueInput): SearchCandidate[] {
  const boundedLimit = clampCandidateLimit(limit, MAX_INTERNAL_CANDIDATES);

  const eligible = catalogue
    .map((listing, index) => ({ listing, index }))
    .filter(
      ({ listing }) =>
        evaluateHardConstraints(listing, parsed.constraints) ===
          "confirmed-pass" && passesIntentEvidence(listing, parsed),
    );

  const structuredOnly =
    contentTerms(parsed).length === 0 &&
    parsed.constraints.productConcepts.length === 0 &&
    parsed.fuzzySignals.length === 0 &&
    hasStructuredConstraint(parsed);

  const scored = eligible.map(({ listing, index }) => {
    const { score, matchedConcepts } = scoreListing(listing, parsed);
    return { listing, index, score, matchedConcepts };
  });

  const sorted = [...scored].sort(
    (left, right) => right.score - left.score || left.index - right.index,
  );

  let selected: typeof sorted;

  if (structuredOnly) {
    // Structured filter-only searches bypass the relevance floor and keep
    // the authoritative source order.
    selected = [...scored].sort((left, right) => left.index - right.index);
  } else if (parsed.fuzzySignals.length > 0) {
    // Fuzzy searches prefer strong candidates. When fewer than two clear
    // matches exist they broaden to any positive lexical evidence, and only
    // when a hard constraint (such as a category) anchors the query do they
    // fall back to the full eligible set so the model can rerank within it.
    const strong = sorted.filter(
      (entry) => entry.score >= SEARCH_RELEVANCE_THRESHOLD,
    );
    const positive = sorted.filter((entry) => entry.score > 0);

    if (strong.length >= 2) {
      selected = strong;
    } else if (positive.length >= 1) {
      selected = positive;
    } else if (hasStructuredConstraint(parsed)) {
      selected = [...scored].sort((left, right) => left.index - right.index);
    } else {
      selected = positive;
    }
  } else {
    selected = sorted.filter(
      (entry) => entry.score >= SEARCH_RELEVANCE_THRESHOLD,
    );
  }

  return selected.slice(0, boundedLimit).map((entry) => ({
    listing: entry.listing,
    score: entry.score,
    evidence: {
      score: entry.score,
      matchedConcepts: entry.matchedConcepts,
      structuredOnly,
    },
  }));
}
