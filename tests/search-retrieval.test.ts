import { describe, expect, it } from "vitest";

import { getListings, type Listing } from "../lib/catalogue";
import { parseSearchQuery } from "../lib/search-query";
import { searchCatalogue } from "../lib/search-retrieval";

function idsFor(query: string, limit = 6): string[] {
  const parsed = parseSearchQuery(query);
  return searchCatalogue({
    parsed,
    limit,
    catalogue: getListings(),
  }).map((candidate) => candidate.listing.id);
}

describe("search retrieval disambiguation", () => {
  it("retrieves the desk and stand, not the stand fan, for studying", () => {
    const ids = idsFor("desk or stand for studying");
    expect(ids).toContain("desk-small-05");
    expect(ids).toContain("laptop-stand-15");
    expect(ids).not.toContain("fan-hostel-01");
  });

  it("keeps study-space candidates and excludes unrelated dorm appliances", () => {
    const ids = idsFor("something compact for studying in a small hostel room");

    expect(ids).toContain("desk-small-05");
    expect(ids).toContain("laptop-stand-15");
    expect(ids).not.toContain("fan-hostel-01");
    expect(ids).not.toContain("fridge-mini-03");
    expect(ids.length).toBeLessThanOrEqual(6);
  });

  it("retrieves the stand fan for a hostel fan request", () => {
    expect(idsFor("stand fan for hostel")[0]).toBe("fan-hostel-01");
  });

  it("resolves raising a laptop uniquely to the laptop stand", () => {
    const ids = idsFor("something to raise my laptop");
    expect(ids).toEqual(["laptop-stand-15"]);
  });

  it("resolves cooling a room to the stand fan", () => {
    const ids = idsFor("something to cool my hostel room");
    expect(ids[0]).toBe("fan-hostel-01");
    expect(ids).not.toContain("laptop-stand-15");
  });

  it("preserves both study and cooling intents without admitting the fridge", () => {
    const ids = idsFor(
      "something for studying and keeping my hostel room cool",
    );

    expect(ids).toContain("fan-hostel-01");
    expect(ids).toContain("desk-small-05");
    expect(ids).not.toContain("fridge-mini-03");
    expect(ids.length).toBeLessThanOrEqual(6);
  });

  it("keeps multiple dorm candidates plausible when no purpose is named", () => {
    const ids = idsFor("a useful item for a small hostel room");
    const dormIds = new Set([
      "fan-hostel-01",
      "fridge-mini-03",
      "drying-rack-04",
      "desk-small-05",
      "bike-fold-14",
    ]);

    expect(ids.length).toBeGreaterThanOrEqual(2);
    expect(ids.some((id) => dormIds.has(id))).toBe(true);
  });

  it("treats 'No screen' as non-evidence for a coding screen", () => {
    const ids = idsFor("a portable screen for coding");
    expect(ids).toContain("monitor-24-11");
    expect(ids).not.toContain("tablet-draw-08");
  });

  it("does not satisfy working Bluetooth with the unconfirmed Keychron", () => {
    expect(idsFor("keyboard with working bluetooth")).not.toContain(
      "keyboard-mech-12",
    );
  });
});

describe("structured-only and deterministic retrieval", () => {
  it("returns tech under $20 by exact filters", () => {
    const ids = idsFor("tech item under $20");
    expect(ids.sort()).toEqual(["dongle-usbc-13", "laptop-stand-15"].sort());
  });

  it("returns like-new tech by exact filters", () => {
    const ids = idsFor("like-new tech");
    expect(ids.sort()).toEqual(["dongle-usbc-13", "laptop-stand-15"].sort());
  });

  it("returns all dorm listings for a dorm category query", () => {
    const ids = idsFor("dorm items");
    expect(ids).toHaveLength(6);
    expect(ids).toContain("fan-hostel-01");
    expect(ids).not.toContain("ipad-sketch-10");
  });

  it("returns the calculator for a calculator budget query", () => {
    expect(idsFor("calculator under $25")).toContain("calc-fx-07");
  });

  it("returns the iPad for an explicit product query", () => {
    expect(idsFor("show me the iPad")[0]).toBe("ipad-sketch-10");
  });

  it("returns the monitor uniquely for an MRT pickup query", () => {
    expect(idsFor("monitor I can carry toward the MRT")).toEqual([
      "monitor-24-11",
    ]);
  });

  it("returns the Arduino kit for a prototyping query", () => {
    expect(idsFor("arduino board left over from prototyping")[0]).toBe(
      "arduino-kit-06",
    );
  });
});

describe("no-match and bounds", () => {
  it("returns nothing for a gaming PC query", () => {
    expect(idsFor("gaming PC under $100")).toEqual([]);
  });

  it("never returns more than the requested limit", () => {
    expect(idsFor("dorm items", 3)).toHaveLength(3);
  });

  it("returns at least two candidates for a fuzzy workspace query", () => {
    const ids = idsFor("something compact for studying in a small hostel room");
    expect(ids.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps candidate limits with a larger catalogue", () => {
    const base = getListings();
    const stand = base.find((listing) => listing.id === "laptop-stand-15")!;
    const expanded: Listing[] = [
      ...base,
      ...Array.from({ length: 12 }, (_, index) => ({
        ...stand,
        id: `laptop-riser-extra-${index + 1}`,
        title: `Laptop stand riser ${index + 1}`,
      })),
    ];
    const parsed = parseSearchQuery("something to raise my laptop");
    const candidates = searchCatalogue({
      parsed,
      limit: 6,
      catalogue: expanded,
    });
    expect(candidates.length).toBeLessThanOrEqual(6);
  });
});
