import { describe, expect, it } from "vitest";

import { getListings, type Listing } from "../lib/catalogue";
import { retrieveListingsForQuestion } from "../lib/retrieval";

function listingIds(listings: readonly Listing[]): string[] {
  return listings.map((listing) => listing.id);
}

describe("catalogue question retrieval", () => {
  it("retrieves the obvious single listing", () => {
    const result = retrieveListingsForQuestion({
      question: "What is the iPad battery health?",
      catalogue: getListings(),
      limit: 4,
    });

    expect(listingIds(result.candidates)).toEqual(["ipad-sketch-10"]);
  });

  it("prioritizes a valid item context even without lexical item terms", () => {
    const result = retrieveListingsForQuestion({
      question: "How much is it?",
      itemId: "monitor-24-11",
      catalogue: getListings(),
      limit: 4,
    });

    expect(listingIds(result.candidates)[0]).toBe("monitor-24-11");
  });

  it("retrieves both requested comparison concepts", () => {
    const result = retrieveListingsForQuestion({
      question: "Which desk or stand is better for a hostel room?",
      catalogue: getListings(),
      limit: 4,
    });

    expect(listingIds(result.candidates)).toEqual([
      "desk-small-05",
      "laptop-stand-15",
    ]);
    expect(listingIds(result.candidates)).not.toContain("fan-hostel-01");
  });

  it("applies exact category and exclusive maximum-price constraints", () => {
    const result = retrieveListingsForQuestion({
      question: "Which tech items are under $20?",
      catalogue: getListings(),
      limit: 6,
    });

    expect(result.constraints).toMatchObject({
      category: "tech",
      maxPriceSgd: 20,
      maxPriceInclusive: false,
    });
    expect(listingIds(result.candidates)).toEqual([
      "dongle-usbc-13",
      "laptop-stand-15",
    ]);
    expect(
      result.candidates.every(
        (listing) => listing.category === "tech" && listing.price_sgd < 20,
      ),
    ).toBe(true);
  });

  it("applies inclusive maximum-price wording", () => {
    const result = retrieveListingsForQuestion({
      question: "Dorm items at most $15",
      catalogue: getListings(),
      limit: 6,
    });

    expect(result.constraints).toMatchObject({
      category: "dorm",
      maxPriceSgd: 15,
      maxPriceInclusive: true,
    });
    expect(listingIds(result.candidates)).toEqual([
      "lamp-desk-02",
      "drying-rack-04",
    ]);
  });

  it("returns no candidates for an unrelated question", () => {
    const result = retrieveListingsForQuestion({
      question: "What is the latest international news?",
      catalogue: getListings(),
      limit: 4,
    });

    expect(result.candidates).toEqual([]);
  });

  it("never exceeds the requested or global candidate limits", () => {
    const base = getListings();
    const stand = base.find((listing) => listing.id === "laptop-stand-15");

    expect(stand).toBeDefined();

    const expandedCatalogue: Listing[] = [
      ...base,
      ...Array.from({ length: 12 }, (_, index) => ({
        ...stand!,
        id: `laptop-riser-extra-${index + 1}`,
        title: `Laptop stand riser ${index + 1}`,
      })),
    ];

    const normalResult = retrieveListingsForQuestion({
      question: "laptop stand",
      catalogue: expandedCatalogue,
      limit: 4,
    });
    const cappedResult = retrieveListingsForQuestion({
      question: "laptop stand",
      catalogue: expandedCatalogue,
      limit: 99,
    });

    expect(normalResult.candidates).toHaveLength(4);
    expect(cappedResult.candidates).toHaveLength(6);
    expect(new Set(listingIds(cappedResult.candidates)).size).toBe(6);
  });
});

describe("desk, stand, and stand-fan disambiguation", () => {
  function candidatesFor(question: string): string[] {
    return listingIds(
      retrieveListingsForQuestion({
        question,
        catalogue: getListings(),
        limit: 4,
      }).candidates,
    );
  }

  it("retrieves the desk and stand, but not the stand fan, for studying", () => {
    const ids = candidatesFor("desk or stand for studying");

    expect(ids).toContain("desk-small-05");
    expect(ids).toContain("laptop-stand-15");
    expect(ids).not.toContain("fan-hostel-01");
  });

  it("retrieves the stand fan when the fan itself is requested", () => {
    expect(candidatesFor("stand fan for hostel")[0]).toBe("fan-hostel-01");
  });

  it("retrieves the laptop stand for raising a laptop", () => {
    expect(candidatesFor("something to raise my laptop")[0]).toBe(
      "laptop-stand-15",
    );
  });

  it("retrieves the stand fan for cooling a hostel room", () => {
    expect(candidatesFor("something to cool my hostel room")[0]).toBe(
      "fan-hostel-01",
    );
  });

  it("retrieves only the folding desk for a small hostel room desk", () => {
    expect(candidatesFor("desk for a small hostel room")).toEqual([
      "desk-small-05",
    ]);
  });

  it("retrieves only the named products for an explicit comparison", () => {
    const ids = candidatesFor(
      "compare the folding desk and laptop stand for a small hostel room",
    );

    expect(ids).toEqual(["desk-small-05", "laptop-stand-15"]);
    expect(ids).not.toContain("fan-hostel-01");
  });
});
