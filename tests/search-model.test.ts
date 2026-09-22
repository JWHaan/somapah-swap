import { describe, expect, it } from "vitest";

import { getListingById, getListings, type Listing } from "../lib/catalogue";
import { parseSearchQuery } from "../lib/search-query";
import type { SearchCandidate } from "../lib/search-retrieval";
import {
  SEARCH_PROMPT_MAX_LENGTH,
  SEARCH_PROMPT_PREFERRED_LENGTH,
  buildSearchPrompt,
  parseSearchModelOutput,
} from "../lib/search-model";

function candidate(id: string): SearchCandidate {
  const listing = getListingById(id)!;
  return {
    listing,
    score: 20,
    evidence: { score: 20, matchedConcepts: [], structuredOnly: false },
  };
}

const fuzzyParsed = parseSearchQuery(
  "something compact for studying in a small hostel room",
);
const workspaceCandidates = [
  candidate("desk-small-05"),
  candidate("laptop-stand-15"),
  candidate("lamp-desk-02"),
];

describe("search prompt construction", () => {
  it("keeps a normal candidate prompt under the preferred length", () => {
    const result = buildSearchPrompt({
      parsed: fuzzyParsed,
      candidates: workspaceCandidates,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.prompt.length).toBeLessThanOrEqual(
        SEARCH_PROMPT_PREFERRED_LENGTH,
      );
      expect(result.prompt).toContain("desk-small-05");
      expect(result.prompt).toContain("ALLOWED_IDS");
    }
  });

  it("sends at most six candidates", () => {
    const many = getListings()
      .slice(0, 10)
      .map((listing) => candidate(listing.id));
    const result = buildSearchPrompt({ parsed: fuzzyParsed, candidates: many });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.candidateIds.length).toBeLessThanOrEqual(6);
    }
  });

  it("fails closed when a single record cannot fit under the ceiling", () => {
    const huge: Listing = {
      ...getListingById("desk-small-05")!,
      seller_note: "x".repeat(SEARCH_PROMPT_MAX_LENGTH + 500),
    };
    const result = buildSearchPrompt({
      parsed: fuzzyParsed,
      candidates: [
        {
          listing: huge,
          score: 10,
          evidence: { score: 10, matchedConcepts: [], structuredOnly: false },
        },
      ],
    });
    expect(result.ok).toBe(false);
  });
});

describe("strict model-output validation", () => {
  const candidates = [candidate("desk-small-05"), candidate("laptop-stand-15")];
  const parsed = parseSearchQuery("best option for a hostel workspace");
  const catalogue = getListings();

  function parse(text: string) {
    return parseSearchModelOutput(text, candidates, parsed, catalogue);
  }

  it("accepts valid candidate-bound results", () => {
    const result = parse(
      JSON.stringify({
        results: [
          {
            id: "desk-small-05",
            reason: "A folding desk for a hostel workspace.",
          },
          {
            id: "laptop-stand-15",
            reason: "Raises a laptop to free desk space.",
          },
        ],
      }),
    );
    expect(result).toEqual([
      { id: "desk-small-05", reason: "A folding desk for a hostel workspace." },
      { id: "laptop-stand-15", reason: "Raises a laptop to free desk space." },
    ]);
  });

  it("deduplicates a valid repeated ID by first occurrence", () => {
    const result = parse(
      JSON.stringify({
        results: [
          { id: "desk-small-05", reason: "First reason for the desk." },
          { id: "desk-small-05", reason: "Second duplicate reason." },
        ],
      }),
    );
    expect(result).toEqual([
      { id: "desk-small-05", reason: "First reason for the desk." },
    ]);
  });

  it.each([
    ["invented", "invented-item-99"],
    ["unretrieved real", "ipad-sketch-10"],
    ["external URL", "https://example.com/desk-small-05"],
    ["path-like", "../desk-small-05"],
    ["nested path", "/item/desk-small-05"],
  ])("fails closed on an %s ID", (_name, id) => {
    expect(
      parse(JSON.stringify({ results: [{ id, reason: "Looks relevant." }] })),
    ).toBeNull();
  });

  it("fails closed on fenced JSON", () => {
    expect(
      parse('```json\n{"results":[{"id":"desk-small-05","reason":"ok"}]}\n```'),
    ).toBeNull();
  });

  it("fails closed on malformed JSON", () => {
    expect(parse("{ not json")).toBeNull();
  });

  it("fails closed on empty content", () => {
    expect(parse("")).toBeNull();
  });

  it("fails closed on more than four results", () => {
    const results = Array.from({ length: 5 }, () => ({
      id: "desk-small-05",
      reason: "Repeated.",
    }));
    expect(parse(JSON.stringify({ results }))).toBeNull();
  });

  it("fails closed on an overlong reason", () => {
    expect(
      parse(
        JSON.stringify({
          results: [{ id: "desk-small-05", reason: "x".repeat(200) }],
        }),
      ),
    ).toBeNull();
  });

  it("fails closed on a reason with too many words", () => {
    const reason = Array.from({ length: 25 }, () => "word").join(" ");
    expect(
      parse(JSON.stringify({ results: [{ id: "desk-small-05", reason }] })),
    ).toBeNull();
  });

  it.each([
    "This item is not study-related.",
    "Unrelated to the request.",
    "Does not match the requested use.",
    "Not suitable for the stated purpose.",
  ])("fails closed on a self-negating reason %j", (reason) => {
    expect(
      parse(JSON.stringify({ results: [{ id: "desk-small-05", reason }] })),
    ).toBeNull();
  });

  it.each([
    "Dimensions are not provided.",
    "Portability is not established.",
    "Compatibility is unconfirmed.",
  ])("accepts an honest limitation qualification %j", (reason) => {
    expect(
      parse(JSON.stringify({ results: [{ id: "desk-small-05", reason }] })),
    ).toEqual([{ id: "desk-small-05", reason }]);
  });

  it("fails closed on an unsupported positive suitability claim", () => {
    expect(
      parse(
        JSON.stringify({
          results: [
            {
              id: "desk-small-05",
              reason: "This item is compact and ideal for studying.",
            },
          ],
        }),
      ),
    ).toBeNull();
  });

  it.each([
    "See https://example.com for details.",
    "Guaranteed defect-free and available today.",
    "Weighs less than 900 grams for portability.",
  ])("fails closed on an ungrounded reason %j", (reason) => {
    expect(
      parse(JSON.stringify({ results: [{ id: "desk-small-05", reason }] })),
    ).toBeNull();
  });

  it("fails closed when a returned listing violates a hard constraint", () => {
    const budgetParsed = parseSearchQuery("workspace under $20");
    const budgetCandidates = [candidate("desk-small-05")]; // $40, over budget
    const result = parseSearchModelOutput(
      JSON.stringify({
        results: [{ id: "desk-small-05", reason: "A desk within budget." }],
      }),
      budgetCandidates,
      budgetParsed,
      catalogue,
    );
    expect(result).toBeNull();
  });
});
