import type { Category, Condition, Listing } from "@/lib/catalogue";
import { meaningfulTerms, normalizeText, tokenize } from "@/lib/retrieval-core";

export type EvidenceState = "confirmed-pass" | "confirmed-fail" | "unknown";
export type UpperPriceOperator = "lt" | "lte";
export type LowerPriceOperator = "gt" | "gte";

export type SearchConstraints = {
  category?: Category;
  condition?: Condition;
  price?: {
    min?: { valueSgd: number; operator: LowerPriceOperator };
    max?: { valueSgd: number; operator: UpperPriceOperator };
  };
  productConcepts: string[];
  pickupTerms: string[];
  meetup: {
    periods: Array<"morning" | "afternoon" | "evening">;
    days: string[];
  };
  requiredIncludes: string[];
  requiredFeatures: Array<{
    concept: string;
    requiredState: "present" | "confirmed-working";
  }>;
  negativeRequirements: Array<{ concept: string; sourcePhrase: string }>;
};

export type SearchInterpreted = {
  category?: Category;
  condition?: Condition;
  min_price_sgd?: number;
  min_price_operator?: LowerPriceOperator;
  max_price_sgd?: number;
  max_price_operator?: UpperPriceOperator;
  concepts?: string[];
};

export type ParsedSearchQuery = {
  normalizedQuery: string;
  lexicalTerms: string[];
  fuzzySignals: string[];
  constraints: SearchConstraints;
  hasAdversarialInstruction: boolean;
  contradictory: boolean;
};

const SEARCH_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "any",
  "are",
  "at",
  "be",
  "can",
  "cheap",
  "cheapest",
  "do",
  "for",
  "found",
  "get",
  "i",
  "in",
  "is",
  "it",
  "item",
  "items",
  "listing",
  "listings",
  "me",
  "my",
  "need",
  "of",
  "or",
  "please",
  "show",
  "some",
  "something",
  "that",
  "the",
  "this",
  "to",
  "under",
  "want",
  "with",
]);

const CURRENCY_NUMBER = String.raw`(?:\$\s*|s\$\s*|sgd\s*)?(\d+(?:\.\d{1,2})?)`;

const ACCESSORY_KEYWORDS = [
  "hdmi",
  "usb-c",
  "usb",
  "case",
  "remote",
  "pen",
  "pouch",
  "charger",
  "charging cable",
  "power brick",
  "cable",
  "ice tray",
  "lock",
];

const FUZZY_SIGNAL_TOKENS = [
  "best",
  "better",
  "suitable",
  "compact",
  "portable",
  "comfortable",
  "practical",
  "useful",
  "sketching",
  "studying",
  "coding",
  "workspace",
];

const FUZZY_SIGNAL_PHRASES = [
  "good for",
  "easy to carry",
  "useful for",
  "small room",
  "small hostel room",
  "hostel workspace",
  "for studying",
  "for coding",
  "for sketching",
];

const CATALOGUE_CONCEPTS: Record<string, readonly string[]> = {
  fan: ["fan"],
  lamp: ["lamp", "light"],
  fridge: ["fridge", "refrigerator"],
  "laundry-rack": ["rack", "drying", "laundry"],
  desk: ["desk"],
  arduino: ["arduino", "uno", "breadboard"],
  calculator: ["calculator", "casio"],
  "drawing-tablet": ["xp", "wireframe"],
  book: ["book", "paperback"],
  ipad: ["ipad"],
  monitor: ["monitor", "screen", "display"],
  keyboard: ["keyboard", "keychron"],
  "usb-hub": ["hub", "dongle"],
  bike: ["bike", "bicycle"],
  "laptop-stand": ["riser"],
};

function parsePrice(lower: string): {
  price?: SearchConstraints["price"];
  contradictory: boolean;
} {
  let working = lower;

  const maxLteMatch =
    working.match(
      new RegExp(
        String.raw`(?:at most|up to|no more than|maximum|max)\s+${CURRENCY_NUMBER}`,
      ),
    ) ?? working.match(new RegExp(String.raw`${CURRENCY_NUMBER}\s+or\s+less`));
  const maxLtMatch = working.match(
    new RegExp(String.raw`(?:under|below|less than)\s+${CURRENCY_NUMBER}`),
  );

  let max: { valueSgd: number; operator: UpperPriceOperator } | undefined;

  if (maxLteMatch) {
    max = { valueSgd: Number(maxLteMatch[1]), operator: "lte" };
    working = working.replace(maxLteMatch[0], " ");
  } else if (maxLtMatch) {
    max = { valueSgd: Number(maxLtMatch[1]), operator: "lt" };
    working = working.replace(maxLtMatch[0], " ");
  }

  const minGteMatch =
    working.match(
      new RegExp(String.raw`(?:at least|minimum|min)\s+${CURRENCY_NUMBER}`),
    ) ?? working.match(new RegExp(String.raw`${CURRENCY_NUMBER}\s+or\s+more`));
  const minGtMatch = working.match(
    new RegExp(String.raw`(?:over|above|more than)\s+${CURRENCY_NUMBER}`),
  );

  let min: { valueSgd: number; operator: LowerPriceOperator } | undefined;

  if (minGteMatch) {
    min = { valueSgd: Number(minGteMatch[1]), operator: "gte" };
  } else if (minGtMatch) {
    min = { valueSgd: Number(minGtMatch[1]), operator: "gt" };
  }

  if (!min && !max) {
    return { contradictory: false };
  }

  let contradictory = false;

  if (min && max) {
    if (min.valueSgd > max.valueSgd) {
      contradictory = true;
    } else if (
      min.valueSgd === max.valueSgd &&
      (min.operator === "gt" || max.operator === "lt")
    ) {
      contradictory = true;
    }
  }

  return {
    price: { ...(min ? { min } : {}), ...(max ? { max } : {}) },
    contradictory,
  };
}

function parseCategory(
  lower: string,
  tokens: readonly string[],
): Category | undefined {
  const phrase = lower.match(
    /\b(tech|dorm|course)\b\s+(?:item|items|listing|listings|gear|stuff)\b/,
  );

  if (phrase) {
    return phrase[1] as Category;
  }

  if (tokens.includes("tech")) {
    return "tech";
  }

  if (tokens.includes("course")) {
    return "course";
  }

  if (tokens.includes("dorm")) {
    return "dorm";
  }

  return undefined;
}

function parseCondition(tokens: readonly string[]): Condition | undefined {
  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (tokens[index] === "like" && tokens[index + 1] === "new") {
      return "like-new";
    }

    if (tokens[index] === "well" && tokens[index + 1] === "used") {
      return "well-used";
    }
  }

  if (tokens.includes("used")) {
    return "used";
  }

  if (tokens.includes("new")) {
    return "new";
  }

  return undefined;
}

function parseRequiredIncludes(lower: string): string[] {
  if (!/\b(includes?|comes? with|with|has)\b/.test(lower)) {
    return [];
  }

  return ACCESSORY_KEYWORDS.filter((keyword) => lower.includes(keyword)).filter(
    // "bluetooth" style features are handled separately; keep only accessories
    (keyword) => keyword.length > 0,
  );
}

function parseRequiredFeatures(
  lower: string,
): SearchConstraints["requiredFeatures"] {
  const features: SearchConstraints["requiredFeatures"] = [];

  if (
    /\bworking\s+bluetooth\b/.test(lower) ||
    /\bbluetooth\s+(?:that\s+)?works\b/.test(lower) ||
    /\bfunctional\s+bluetooth\b/.test(lower)
  ) {
    features.push({ concept: "bluetooth", requiredState: "confirmed-working" });
  }

  return features;
}

function parseNegativeRequirements(
  lower: string,
): SearchConstraints["negativeRequirements"] {
  const negatives: SearchConstraints["negativeRequirements"] = [];

  if (/\bnot\s+cracked\b/.test(lower) || /\bno\s+cracks?\b/.test(lower)) {
    negatives.push({ concept: "crack", sourcePhrase: "not cracked" });
  }

  if (/\bnot\s+broken\b/.test(lower)) {
    negatives.push({ concept: "broken", sourcePhrase: "not broken" });
  }

  return negatives;
}

function parsePickupTerms(lower: string): string[] {
  const terms: string[] = [];

  if (/\bmrt\b/.test(lower)) {
    terms.push("mrt");
  }

  return terms;
}

function parseMeetup(lower: string): SearchConstraints["meetup"] {
  const periods: Array<"morning" | "afternoon" | "evening"> = [];

  if (/\bmorning\b/.test(lower)) {
    periods.push("morning");
  }

  if (/\bafternoon\b/.test(lower)) {
    periods.push("afternoon");
  }

  if (/\bevening\b/.test(lower) || /\bafter\s+\d/.test(lower)) {
    periods.push("evening");
  }

  const days: string[] = [];

  if (/\bweekday\b/.test(lower) || /\bweekdays\b/.test(lower)) {
    days.push("weekday");
  }

  if (/\bweekend\b/.test(lower) || /\bweekends\b/.test(lower)) {
    days.push("weekend");
  }

  return { periods, days };
}

function parseConcepts(tokens: readonly string[], lower: string): string[] {
  const concepts = new Set<string>();

  for (const [concept, keywords] of Object.entries(CATALOGUE_CONCEPTS)) {
    if (keywords.some((keyword) => tokens.includes(keyword))) {
      concepts.add(concept);
    }
  }

  // Purpose-based concepts.
  if (
    /\b(raise|raising|elevate|lift)\b/.test(lower) &&
    /\blaptop\b|\bmacbook\b/.test(lower)
  ) {
    concepts.add("laptop-stand");
  }

  if (/\b(cool|cooling|breeze)\b/.test(lower)) {
    concepts.add("fan");
  }

  if (/\bdrawing tablet\b/.test(lower) || /\bsketch(?:ing)?\b/.test(lower)) {
    // sketching maps to devices used for sketching; keep ipad and drawing-tablet as fuzzy candidates
    concepts.add("drawing-tablet");
  }

  return [...concepts];
}

function detectFuzzySignals(
  lower: string,
  tokens: readonly string[],
): string[] {
  const signals = new Set<string>();

  for (const token of FUZZY_SIGNAL_TOKENS) {
    if (tokens.includes(token)) {
      signals.add(token);
    }
  }

  for (const phrase of FUZZY_SIGNAL_PHRASES) {
    if (lower.includes(phrase)) {
      signals.add(phrase);
    }
  }

  return [...signals];
}

function detectAdversarial(lower: string): boolean {
  const ignore =
    /\b(ignore|disregard|forget)\b.*\b(catalogue|catalog|instruction|instructions|rules|previous)\b/.test(
      lower,
    );
  const invent =
    /\b(invent|fabricate|make up|create)\b.*\b(listing|item|product|laptop|deal)\b/.test(
      lower,
    );

  return ignore || invent;
}

export function parseSearchQuery(query: string): ParsedSearchQuery {
  const lower = query.toLowerCase();
  const normalizedQuery = normalizeText(query);
  const tokens = tokenize(query);
  const { price, contradictory } = parsePrice(lower);

  const constraints: SearchConstraints = {
    ...(parseCategory(lower, tokens)
      ? { category: parseCategory(lower, tokens) }
      : {}),
    ...(parseCondition(tokens) ? { condition: parseCondition(tokens) } : {}),
    ...(price ? { price } : {}),
    productConcepts: parseConcepts(tokens, lower),
    pickupTerms: parsePickupTerms(lower),
    meetup: parseMeetup(lower),
    requiredIncludes: parseRequiredIncludes(lower),
    requiredFeatures: parseRequiredFeatures(lower),
    negativeRequirements: parseNegativeRequirements(lower),
  };

  return {
    normalizedQuery,
    lexicalTerms: [...meaningfulTerms(query, SEARCH_STOP_WORDS)],
    fuzzySignals: detectFuzzySignals(lower, tokens),
    constraints,
    hasAdversarialInstruction: detectAdversarial(lower),
    contradictory,
  };
}

function listingText(listing: Listing): string {
  return normalizeText(
    [
      listing.title,
      listing.seller_note,
      listing.includes.join(" "),
      listing.defects.join(" "),
    ].join(" "),
  );
}

function priceSatisfied(
  listing: Listing,
  price: NonNullable<SearchConstraints["price"]>,
): boolean {
  if (price.min) {
    const ok =
      price.min.operator === "gt"
        ? listing.price_sgd > price.min.valueSgd
        : listing.price_sgd >= price.min.valueSgd;

    if (!ok) {
      return false;
    }
  }

  if (price.max) {
    const ok =
      price.max.operator === "lt"
        ? listing.price_sgd < price.max.valueSgd
        : listing.price_sgd <= price.max.valueSgd;

    if (!ok) {
      return false;
    }
  }

  return true;
}

/**
 * Tri-state hard-constraint evaluation.
 *
 * Returns "confirmed-pass" only when the authoritative listing establishes
 * every hard requirement, "confirmed-fail" when a listing contradicts one,
 * and "unknown" when an evidence-sensitive requirement cannot be established.
 * Only "confirmed-pass" satisfies a hard requirement for the caller.
 */
export function evaluateHardConstraints(
  listing: Listing,
  constraints: SearchConstraints,
): EvidenceState {
  if (constraints.category && listing.category !== constraints.category) {
    return "confirmed-fail";
  }

  if (constraints.condition && listing.condition !== constraints.condition) {
    return "confirmed-fail";
  }

  if (constraints.price && !priceSatisfied(listing, constraints.price)) {
    return "confirmed-fail";
  }

  const includesText = normalizeText(listing.includes.join(" "));

  for (const required of constraints.requiredIncludes) {
    if (!includesText.includes(normalizeText(required))) {
      return "confirmed-fail";
    }
  }

  const pickupText = normalizeText(listing.pickup);

  for (const term of constraints.pickupTerms) {
    if (!pickupText.includes(normalizeText(term))) {
      return "confirmed-fail";
    }
  }

  const text = listingText(listing);
  let unknown = false;

  for (const feature of constraints.requiredFeatures) {
    if (feature.concept === "bluetooth") {
      const confirmed =
        /\bworking bluetooth\b/.test(text) || /\bbluetooth works\b/.test(text);
      const denied =
        /\bno bluetooth\b/.test(text) || /\bbluetooth not work/.test(text);

      if (denied) {
        return "confirmed-fail";
      }

      if (!confirmed) {
        unknown = true;
      }
    }
  }

  for (const negative of constraints.negativeRequirements) {
    if (negative.concept === "crack") {
      const isCracked = /\bcrack/.test(text);

      if (isCracked) {
        return "confirmed-fail";
      }

      // Absence of a crack in the listing cannot establish "not cracked".
      unknown = true;
    }

    if (negative.concept === "broken") {
      if (/\bbroken\b/.test(text)) {
        return "confirmed-fail";
      }

      unknown = true;
    }
  }

  return unknown ? "unknown" : "confirmed-pass";
}

export function toPublicInterpreted(
  constraints: SearchConstraints,
  concepts?: readonly string[],
): SearchInterpreted {
  const interpreted: SearchInterpreted = {};

  if (constraints.category) {
    interpreted.category = constraints.category;
  }

  if (constraints.condition) {
    interpreted.condition = constraints.condition;
  }

  if (constraints.price?.min) {
    interpreted.min_price_sgd = constraints.price.min.valueSgd;
    interpreted.min_price_operator = constraints.price.min.operator;
  }

  if (constraints.price?.max) {
    interpreted.max_price_sgd = constraints.price.max.valueSgd;
    interpreted.max_price_operator = constraints.price.max.operator;
  }

  if (concepts && concepts.length > 0) {
    interpreted.concepts = [...concepts];
  }

  return interpreted;
}
