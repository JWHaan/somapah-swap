/**
 * Shared retrieval primitives.
 *
 * These helpers are behaviour-neutral building blocks used by both the Q&A
 * retrieval adapter (`lib/retrieval.ts`) and the marketplace search adapter
 * (`lib/search-retrieval.ts`). They contain no Q&A-specific or search-specific
 * vocabulary; callers pass in their own stop-word, synonym, and product-noun
 * sets so each adapter keeps its own tuned behaviour.
 */

export type SynonymGroup = readonly string[];

export function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function tokenize(value: string): string[] {
  return normalizeText(value).split(" ").filter(Boolean);
}

export function meaningfulTerms(
  value: string,
  stopWords: ReadonlySet<string>,
): Set<string> {
  return new Set(
    tokenize(value).filter(
      (term) => term.length > 1 && !stopWords.has(term) && !/^\d+$/.test(term),
    ),
  );
}

export function expandWithSynonyms(
  terms: readonly string[],
  synonymGroups: readonly SynonymGroup[],
): Set<string> {
  const expanded = new Set(terms);

  for (const group of synonymGroups) {
    if (group.some((term) => expanded.has(term))) {
      group.forEach((term) => expanded.add(term));
    }
  }

  return expanded;
}

export function fieldTerms(value: string | readonly string[]): Set<string> {
  const text = typeof value === "string" ? value : value.join(" ");
  return new Set(tokenize(text));
}

export function headTitleTerms(
  title: string,
  productNouns: ReadonlySet<string>,
): Set<string> {
  const tokens = tokenize(title);
  const heads = new Set<string>();

  tokens.forEach((token, index) => {
    const next = tokens[index + 1];

    if (!next || !productNouns.has(next)) {
      heads.add(token);
    }
  });

  return heads;
}

export function overlapScore(
  query: ReadonlySet<string>,
  field: ReadonlySet<string>,
  weight: number,
): number {
  let score = 0;

  query.forEach((term) => {
    if (field.has(term)) {
      score += weight;
    }
  });

  return score;
}

export function longestMatchingTitlePhrase(
  normalizedText: string,
  title: string,
  maxPhraseLength = 4,
): number {
  const titleTokens = tokenize(title);
  const padded = ` ${normalizedText} `;

  for (
    let length = Math.min(titleTokens.length, maxPhraseLength);
    length >= 2;
    length -= 1
  ) {
    for (let start = 0; start + length <= titleTokens.length; start += 1) {
      const phrase = titleTokens.slice(start, start + length).join(" ");

      if (padded.includes(` ${phrase} `)) {
        return length;
      }
    }
  }

  return 0;
}

export function clampCandidateLimit(limit: number, maximum: number): number {
  return Math.max(1, Math.min(Math.trunc(limit), maximum));
}
