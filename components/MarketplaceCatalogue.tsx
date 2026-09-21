"use client";

import { useMemo, useState } from "react";

import { ListingCard } from "@/components/ListingCard";
import {
  filterListingsByCategory,
  type CategoryFilter,
  type Listing,
} from "@/lib/catalogue";

const categories: Array<{ label: string; value: CategoryFilter }> = [
  { label: "All", value: "all" },
  { label: "Course", value: "course" },
  { label: "Dorm", value: "dorm" },
  { label: "Tech", value: "tech" },
];

type MarketplaceCatalogueProps = {
  listings: readonly Listing[];
};

export function MarketplaceCatalogue({ listings }: MarketplaceCatalogueProps) {
  const [category, setCategory] = useState<CategoryFilter>("all");
  const filteredListings = useMemo(
    () => filterListingsByCategory(listings, category),
    [category, listings],
  );

  return (
    <section
      className="catalogue-section page-container"
      id="catalogue"
      aria-labelledby="catalogue-heading"
    >
      <div className="section-heading">
        <h2 id="catalogue-heading">Browse listings</h2>
        <p aria-live="polite">
          {filteredListings.length} listing
          {filteredListings.length === 1 ? "" : "s"} shown
        </p>
      </div>

      <div className="category-filter" aria-label="Filter listings by category">
        {categories.map((option) => (
          <button
            aria-pressed={category === option.value}
            key={option.value}
            onClick={() => setCategory(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="listing-grid">
        {filteredListings.map((listing) => (
          <ListingCard key={listing.id} listing={listing} />
        ))}
      </div>
    </section>
  );
}
