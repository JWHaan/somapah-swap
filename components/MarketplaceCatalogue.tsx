"use client";

import { useId, useMemo, useRef, useState, type ReactNode } from "react";

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

const MIN_QUERY_LENGTH = 3;
const MAX_QUERY_LENGTH = 300;
const genericError =
  "Search is temporarily unavailable. Please try again in a moment.";

type SearchPublicMode =
  "deterministic" | "ai-reranked" | "keyword-fallback" | "no-match";

type SearchResultEntry = { id: string; reason: string };

type SearchInterpreted = {
  category?: CategoryFilter;
  condition?: string;
  min_price_sgd?: number;
  min_price_operator?: string;
  max_price_sgd?: number;
  max_price_operator?: string;
  concepts?: string[];
};

type SearchStatus = "idle" | "pending" | "results" | "no-match" | "error";

type MarketplaceCatalogueProps = {
  listings: readonly Listing[];
  assistantSlot?: ReactNode;
};

function isSearchResponse(value: unknown): value is {
  mode: SearchPublicMode;
  interpreted: SearchInterpreted;
  results: SearchResultEntry[];
} {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const modeOk =
    candidate.mode === "deterministic" ||
    candidate.mode === "ai-reranked" ||
    candidate.mode === "keyword-fallback" ||
    candidate.mode === "no-match";
  const resultsOk =
    Array.isArray(candidate.results) &&
    candidate.results.every(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as Record<string, unknown>).id === "string" &&
        typeof (entry as Record<string, unknown>).reason === "string",
    );
  const interpretedOk =
    typeof candidate.interpreted === "object" && candidate.interpreted !== null;

  return modeOk && resultsOk && interpretedOk;
}

function modeLabel(mode: SearchPublicMode): string {
  switch (mode) {
    case "ai-reranked":
      return "AI-ranked results";
    case "keyword-fallback":
      return "AI ranking was unavailable, so these results use catalogue matching.";
    case "deterministic":
      return "Catalogue matches";
    case "no-match":
      return "No matches";
  }
}

function interpretedSummary(interpreted: SearchInterpreted): string | null {
  const parts: string[] = [];

  if (interpreted.category) {
    parts.push(`category ${interpreted.category}`);
  }

  if (interpreted.condition) {
    parts.push(`condition ${interpreted.condition}`);
  }

  if (interpreted.max_price_sgd !== undefined) {
    const inclusive = interpreted.max_price_operator === "lte";
    parts.push(
      `${inclusive ? "at most" : "under"} S$${interpreted.max_price_sgd}`,
    );
  }

  if (interpreted.min_price_sgd !== undefined) {
    const inclusive = interpreted.min_price_operator === "gte";
    parts.push(
      `${inclusive ? "at least" : "over"} S$${interpreted.min_price_sgd}`,
    );
  }

  if (interpreted.concepts && interpreted.concepts.length > 0) {
    parts.push(interpreted.concepts.join(", "));
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

export function MarketplaceCatalogue({
  listings,
  assistantSlot,
}: MarketplaceCatalogueProps) {
  const searchInputId = useId();
  const searchHelpId = useId();
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [mode, setMode] = useState<SearchPublicMode | null>(null);
  const [interpreted, setInterpreted] = useState<SearchInterpreted | null>(
    null,
  );
  const [resultEntries, setResultEntries] = useState<SearchResultEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const lastQueryRef = useRef<string | null>(null);
  const pending = status === "pending";
  const showSearchResults =
    status === "results" ||
    status === "no-match" ||
    (status === "pending" && resultEntries.length > 0);

  const listingsById = useMemo(() => {
    const map = new Map<string, Listing>();
    listings.forEach((listing) => map.set(listing.id, listing));
    return map;
  }, [listings]);

  const catalogueForCategory = useMemo(
    () => filterListingsByCategory(listings, category),
    [category, listings],
  );

  const activeSearchListings = useMemo(() => {
    return resultEntries
      .map((entry) => {
        const listing = listingsById.get(entry.id);
        return listing ? { listing, reason: entry.reason } : null;
      })
      .filter((value): value is { listing: Listing; reason: string } =>
        Boolean(value),
      );
  }, [resultEntries, listingsById]);

  const visibleSearchListings = useMemo(() => {
    if (category === "all") {
      return activeSearchListings;
    }
    return activeSearchListings.filter(
      (entry) => entry.listing.category === category,
    );
  }, [activeSearchListings, category]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();

    if (
      trimmed.length < MIN_QUERY_LENGTH ||
      trimmed.length > MAX_QUERY_LENGTH
    ) {
      setStatus("error");
      setErrorMessage(
        `Enter a search between ${MIN_QUERY_LENGTH} and ${MAX_QUERY_LENGTH} characters.`,
      );
      return;
    }

    if (pending && lastQueryRef.current === trimmed) {
      return; // Ignore duplicate submission of the same in-flight query.
    }

    lastQueryRef.current = trimmed;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setStatus("pending");
    setErrorMessage(null);

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (requestId !== requestIdRef.current) {
        return; // A newer search superseded this one.
      }

      if (!response.ok || !isSearchResponse(payload)) {
        setStatus("error");
        setErrorMessage(genericError);
        return;
      }

      const unknownId = payload.results.some(
        (entry) => !listingsById.has(entry.id),
      );

      if (unknownId) {
        setStatus("error");
        setErrorMessage(genericError);
        return;
      }

      setMode(payload.mode);
      setInterpreted(payload.interpreted);
      setResultEntries(payload.results);

      if (payload.interpreted.category) {
        setCategory(payload.interpreted.category);
      }

      setStatus(payload.mode === "no-match" ? "no-match" : "results");
    } catch {
      if (requestId !== requestIdRef.current) {
        return;
      }
      setStatus("error");
      setErrorMessage(genericError);
    }
  }

  function clearSearch() {
    requestIdRef.current += 1;
    setQuery("");
    setStatus("idle");
    setMode(null);
    setInterpreted(null);
    setResultEntries([]);
    setErrorMessage(null);
  }

  const summary = interpreted ? interpretedSummary(interpreted) : null;
  const hiddenByCategory =
    showSearchResults &&
    category !== "all" &&
    activeSearchListings.length > 0 &&
    visibleSearchListings.length === 0;

  return (
    <section
      className="catalogue-section page-container"
      id="catalogue"
      aria-labelledby="catalogue-heading"
    >
      <div className="search-panel panel">
        <h2 id="catalogue-heading">Search listings</h2>
        <p className="search-intro">
          Describe what you need in plain language. Results are real catalogue
          listings.
        </p>
        <form className="search-form" onSubmit={handleSubmit} role="search">
          <label className="search-label" htmlFor={searchInputId}>
            Search the Somapah Swap catalogue
          </label>
          <input
            aria-describedby={searchHelpId}
            className="search-input"
            id={searchInputId}
            maxLength={MAX_QUERY_LENGTH}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="cheap fan for hostel under $30"
            type="text"
            value={query}
          />
          <p className="search-help" id={searchHelpId}>
            Try a budget, a category, or a purpose such as “something to raise
            my laptop”.
          </p>
          <div className="search-actions">
            <button className="search-submit" type="submit">
              Search
            </button>
            <button
              className="search-clear"
              onClick={clearSearch}
              type="button"
            >
              Clear search
            </button>
          </div>
        </form>

        <div aria-live="polite" className="search-status">
          {status === "pending" ? <p>Searching the catalogue…</p> : null}
          {status === "error" && errorMessage ? (
            <p className="search-error" role="alert">
              {errorMessage}
            </p>
          ) : null}
          {status === "results" && mode ? (
            <p>
              <span className="search-mode">{modeLabel(mode)}</span>
              {" — "}
              {visibleSearchListings.length} listing
              {visibleSearchListings.length === 1 ? "" : "s"} shown
              {summary ? ` (${summary})` : ""}.{" "}
              <a href="#catalogue-grid">View results</a>
            </p>
          ) : null}
          {status === "no-match" ? (
            <p>
              No listings match. Try removing a constraint, increasing your
              budget, or choosing a broader category.
            </p>
          ) : null}
          {hiddenByCategory ? (
            <p>
              {activeSearchListings.length} search result
              {activeSearchListings.length === 1 ? "" : "s"} found, but none are
              in {category}.{" "}
              <button
                className="link-button"
                onClick={() => setCategory("all")}
                type="button"
              >
                Show all categories
              </button>
            </p>
          ) : null}
        </div>
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

      {assistantSlot ? (
        <div className="assistant-slot">{assistantSlot}</div>
      ) : null}

      <div
        className={`listing-grid${pending ? " listing-grid--updating" : ""}`}
        id="catalogue-grid"
        aria-busy={pending}
      >
        {showSearchResults
          ? visibleSearchListings.map((entry) => (
              <ListingCard
                key={entry.listing.id}
                listing={entry.listing}
                reason={entry.reason}
              />
            ))
          : catalogueForCategory.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
      </div>
    </section>
  );
}
