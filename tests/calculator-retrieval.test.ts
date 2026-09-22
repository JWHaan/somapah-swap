import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getListingById, getListings } from "../lib/catalogue";
import { answerCatalogueQuestion } from "../lib/catalogue-qa";
import { answerCatalogueSearch } from "../lib/catalogue-search";

/**
 * Calculator-family regression.
 *
 * The authoritative record is read from data/listings.json; nothing here
 * hardcodes answer text or relies on assumed listing facts.
 */
const record = getListingById("calc-fx-07");
const catalogue = getListings();

const includesPhrases = [
  "What comes with the calculator?",
  "What is included with the calculator?",
  "Does the calculator come with a case?",
  "Show me the calculator accessories.",
  "What accessories are listed for the Casio?",
  "What comes with the Casio calculator?",
];

const inventedAccessoryTerms = [
  "charger",
  "battery",
  "batteries",
  "manual",
  "stylus",
  "cable",
  "cover",
  "warranty",
];

describe("authoritative calculator record", () => {
  it("is the Casio listing with a Case included and no stated defects", () => {
    expect(record).toBeDefined();
    expect(record?.id).toBe("calc-fx-07");
    expect(record?.title).toContain("Casio");
    expect(record?.category).toBe("course");
    expect(record?.includes).toEqual(["Case"]);
    expect(record?.defects).toEqual([]);
  });

  it("is the only record mentioning the calculator family or a case", () => {
    const familyMatches = catalogue.filter((listing) =>
      /casio|calculator|991/i.test(
        [listing.title, listing.seller_note, ...listing.includes].join(" "),
      ),
    );
    const caseMatches = catalogue.filter((listing) =>
      /case/i.test(
        [listing.title, listing.seller_note, ...listing.includes].join(" "),
      ),
    );

    expect(familyMatches.map((listing) => listing.id)).toEqual(["calc-fx-07"]);
    expect(caseMatches.map((listing) => listing.id)).toEqual(["calc-fx-07"]);
  });
});

describe("calculator inclusion questions", () => {
  it.each(includesPhrases)(
    "resolves %j deterministically from the includes field",
    async (question) => {
      const provider = vi.fn();
      const result = await answerCatalogueQuestion(
        { question },
        { catalogue, provider },
      );
      const answer = result.response.answer.toLowerCase();

      expect(result.evaluation.decision).toBe("answer-locally");
      expect(result.response.mode).toBe("deterministic");
      expect(result.response.scope).toBe("catalogue");
      expect(result.evaluation.candidateIds).toEqual(["calc-fx-07"]);
      expect(result.response.cited_ids).toEqual(["calc-fx-07"]);
      expect(result.response.citations).toEqual([
        {
          id: "calc-fx-07",
          title: record?.title,
          href: "/item/calc-fx-07",
        },
      ]);
      expect(provider).not.toHaveBeenCalled();

      expect(answer).toContain("case");
      expect(answer).not.toMatch(/does not say|cannot establish/);

      for (const invented of inventedAccessoryTerms) {
        expect(answer).not.toContain(invented);
      }
    },
  );

  it("never returns an accessory the listing does not include", async () => {
    const provider = vi.fn();
    const result = await answerCatalogueQuestion(
      { question: "What comes with the calculator?" },
      { catalogue, provider },
    );
    const listed = result.response.cited_ids.flatMap(
      (id) => getListingById(id)?.includes ?? [],
    );

    expect(listed).toEqual(["Case"]);
    expect(provider).not.toHaveBeenCalled();
  });
});

describe("calculator boundary behaviour", () => {
  it("keeps deterministic search for the calculator price query", async () => {
    const result = await answerCatalogueSearch(
      { query: "calculator under $25" },
      { catalogue },
    );

    expect(result.evaluation.decision).toBe("deterministic-results");
    expect(result.response.mode).toBe("deterministic");
    expect(result.response.results.map((entry) => entry.id)).toEqual([
      "calc-fx-07",
    ]);
    expect(result.evaluation.providerCallCount).toBe(0);
  });

  it("does not resolve an unrelated case question to the calculator", async () => {
    const provider = vi.fn();
    const result = await answerCatalogueQuestion(
      { question: "Does the desk come with a case?" },
      { catalogue, provider },
    );

    expect(result.response.cited_ids).not.toContain("calc-fx-07");
    expect(result.evaluation.candidateIds).not.toContain("calc-fx-07");
    expect(provider).not.toHaveBeenCalled();
  });

  it("keeps unrelated course and tech products out of calculator answers", async () => {
    const provider = vi.fn();
    const result = await answerCatalogueQuestion(
      { question: "What comes with the calculator?" },
      { catalogue, provider },
    );

    expect(result.evaluation.candidateIds).toHaveLength(1);
    for (const unrelated of [
      "ipad-sketch-10",
      "tablet-draw-08",
      "laptop-stand-15",
      "monitor-24-11",
    ]) {
      expect(result.evaluation.candidateIds).not.toContain(unrelated);
    }
  });
});
