export type AssistantIntent = "search" | "ask";

export const MIN_HELPER_INPUT_LENGTH = 3;
export const MAX_HELPER_INPUT_LENGTH = 500;

export function isRoutableHelperInput(input: string): boolean {
  const trimmed = typeof input === "string" ? input.trim() : "";

  return (
    trimmed.length >= MIN_HELPER_INPUT_LENGTH &&
    trimmed.length <= MAX_HELPER_INPUT_LENGTH
  );
}

export type IntentReason =
  | "question-structure"
  | "comparison-language"
  | "fact-language"
  | "search-constraint"
  | "discovery-language"
  | "default-search";

export type IntentDecision = {
  intent: AssistantIntent;
  reason: IntentReason;
};

const comparisonPatterns = [
  /\b(?:compare|compares|comparing|comparison|contrast|contrasting)\b/,
  /\b(?:versus|vs)\b/,
  /\bbetter (?:of|than|between)\b/,
  /\bwhich (?:one )?(?:is|are) (?:better|best)\b/,
];

const leadingQuestionWords = new Set([
  "am",
  "are",
  "can",
  "could",
  "did",
  "do",
  "does",
  "has",
  "have",
  "how",
  "is",
  "may",
  "might",
  "should",
  "was",
  "were",
  "what",
  "whats",
  "when",
  "where",
  "which",
  "who",
  "whose",
  "why",
  "will",
  "would",
]);

const factPatterns = [
  /\b(?:tell|tells) me\b/,
  /\bexplain\b/,
  /\bbattery health\b/,
  /\b(?:comes?|come) with\b/,
  /\bincluded\b/,
  /\bdefects?\b/,
];

const discoveryPatterns = [
  /\b(?:show|showing|browse|browsing|find|finding|search(?:ing)? for|look(?:ing)? for)\b/,
  /\b(?:something|anything|everything|anything else)\b/,
  /\b(?:i need|i want|im looking for|help me find|options?|ideas?)\b/,
];

// A leading discovery verb is a stronger signal than a trailing question mark:
// "show tech items?" is a browse request that happens to be punctuated as a
// question. A question word at the start still wins, so "Can you show me the
// monitor price?" stays on the Q&A path.
const leadingDiscoveryPattern = /^(?:show|browse|list|display|find)\b/;

const priceConstraintPatterns = [
  /\bs?(?:gd)?\s*\$\s*\d/i,
  /\b(?:under|below|less than|at most|up to|over|above|at least|more than|max|maximum|budget of|around|about)\s+(?:s\$|sgd\s*|\$)?\s*\d/i,
];

const conditionConstraintPattern =
  /\b(?:new|like-new|like new|used|well-used|second-hand|secondhand|brand new)\b/;

const categoryConstraintPattern = /\b(?:course|dorm|tech)\b/;

function normalize(input: string): string {
  return input
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function startsWithQuestionWord(normalized: string): boolean {
  const [firstWord] = normalized.split(" ");
  return Boolean(firstWord) && leadingQuestionWords.has(firstWord);
}

function hasQuestionStructure(normalized: string, original: string): boolean {
  return original.trim().endsWith("?") || startsWithQuestionWord(normalized);
}

function matches(patterns: readonly RegExp[], value: string): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

export function classifyAssistantIntent(input: string): IntentDecision {
  const normalized = normalize(input);
  const original = typeof input === "string" ? input : "";

  if (matches(comparisonPatterns, normalized)) {
    return { intent: "ask", reason: "comparison-language" };
  }

  if (leadingDiscoveryPattern.test(normalized)) {
    return { intent: "search", reason: "discovery-language" };
  }

  if (hasQuestionStructure(normalized, original)) {
    return { intent: "ask", reason: "question-structure" };
  }

  if (matches(factPatterns, normalized)) {
    return { intent: "ask", reason: "fact-language" };
  }

  if (matches(discoveryPatterns, normalized)) {
    return { intent: "search", reason: "discovery-language" };
  }

  if (
    matches(priceConstraintPatterns, normalized) ||
    conditionConstraintPattern.test(normalized) ||
    categoryConstraintPattern.test(normalized)
  ) {
    return { intent: "search", reason: "search-constraint" };
  }

  return { intent: "search", reason: "default-search" };
}
