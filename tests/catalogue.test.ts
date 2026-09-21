import { describe, expect, it } from "vitest";

import {
  filterListingsByCategory,
  getListingById,
  getListings,
  parseCatalogue,
} from "../lib/catalogue";

const expectedIds = [
  "fan-hostel-01",
  "lamp-desk-02",
  "fridge-mini-03",
  "drying-rack-04",
  "desk-small-05",
  "arduino-kit-06",
  "calc-fx-07",
  "tablet-draw-08",
  "book-design-09",
  "ipad-sketch-10",
  "monitor-24-11",
  "keyboard-mech-12",
  "dongle-usbc-13",
  "bike-fold-14",
  "laptop-stand-15",
];

describe("authoritative catalogue", () => {
  it("contains exactly the 15 prescribed listings in source order", () => {
    const listings = getListings();

    expect(listings).toHaveLength(15);
    expect(listings.map((listing) => listing.id)).toEqual(expectedIds);
    expect(new Set(listings.map((listing) => listing.id)).size).toBe(15);
  });

  it("preserves the deliberate unknown and unconfirmed facts", () => {
    const ipad = getListingById("ipad-sketch-10");
    const keyboard = getListingById("keyboard-mech-12");
    const fridge = getListingById("fridge-mini-03");
    const bike = getListingById("bike-fold-14");

    expect(ipad?.includes).toEqual(["Charging cable"]);
    expect(ipad?.defects).toEqual([
      "Hairline scratch on back",
      "Battery health not stated",
    ]);
    expect(ipad?.seller_note).toContain("No Apple Pencil in this listing.");

    expect(keyboard?.seller_note).toBe(
      "Brown switches. Works wired. Bluetooth not tested recently — listing does not claim it works.",
    );

    expect(fridge).not.toHaveProperty("volume_litres");
    expect(bike).not.toHaveProperty("brand");
  });

  it("fails clearly when a duplicate ID is introduced", () => {
    const listings = getListings();
    const invalidCatalogue = [...listings.slice(0, 14), listings[0]];

    expect(() => parseCatalogue(invalidCatalogue)).toThrow(
      /duplicate listing id: fan-hostel-01/i,
    );
  });

  it("fails clearly when a listing violates the schema", () => {
    const listings = getListings();
    const invalidCatalogue = [
      ...listings.slice(0, 14),
      { ...listings[14], category: "furniture" },
    ];

    expect(() => parseCatalogue(invalidCatalogue)).toThrow(
      /invalid catalogue data/i,
    );
  });
});

describe("catalogue lookup and filtering", () => {
  it("returns the requested listing for a valid ID", () => {
    expect(getListingById("fan-hostel-01")?.title).toBe(
      "Stand fan, used one term",
    );
  });

  it("returns undefined for an unknown ID", () => {
    expect(getListingById("missing-listing")).toBeUndefined();
  });

  it.each([
    ["all", 15],
    ["course", 4],
    ["dorm", 6],
    ["tech", 5],
  ] as const)("filters %s listings", (category, expectedCount) => {
    expect(filterListingsByCategory(getListings(), category)).toHaveLength(
      expectedCount,
    );
  });
});
