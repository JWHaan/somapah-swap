"use client";

import { useId, useMemo, useRef, useState } from "react";

import { ListingCard } from "@/components/ListingCard";
import {
  MAX_HELPER_INPUT_LENGTH,
  MIN_HELPER_INPUT_LENGTH,
  classifyAssistantIntent,
} from "@/lib/assistant-intent";
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

const MAX_SEARCH_LENGTH = 300;

const searchErrorMessage =
  "Search is temporarily unavailable. Please try again in a moment.";
const askErrorMessage =
  "The catalogue assistant is temporarily unavailable. Please try again.";

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

type SearchResult = {
  mode: SearchPublicMode;
  interpreted: SearchInterpreted;
  results: SearchResultEntry[];
};

type AskCitation = { id: string; title: string; href: string };

type AskResult = {
  answer: string;
  cited_ids: string[];
  citations: AskCitation[];
  missing: string[];
  scope: "catalogue" | "off-catalogue";
  mode: "deterministic" | "ai" | "fallback";
};

type HelperStatus =
  | "idle"
  | "pending-search"
  | "pending-ask"
  | "search-results"
  | "no-match"
  | "answer"
  | "error";

type CatalogueHelperProps = {
  listings: readonly Listing[];
};

function isSearchResponse(value: unknown): value is SearchResult {
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

function isCitation(value: unknown): value is AskCitation {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.href === "string" &&
    candidate.href.startsWith("/item/")
  );
}

function isAskResponse(value: unknown): value is AskResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.answer === "string" &&
    candidate.answer.trim().length > 0 &&
    Array.isArray(candidate.cited_ids) &&
    candidate.cited_ids.every((id) => typeof id === "string") &&
    Array.isArray(candidate.citations) &&
    candidate.citations.every(isCitation) &&
    Array.isArray(candidate.missing) &&
    candidate.missing.every((entry) => typeof entry === "string") &&
    (candidate.scope === "catalogue" || candidate.scope === "off-catalogue") &&
    (candidate.mode === "deterministic" ||
      candidate.mode === "ai" ||
      candidate.mode === "fallback")
  );
}

/**
 * Buyer-facing copy for search modes. Internal mode names stay out of the UI.
 */
function searchModeLabel(mode: SearchPublicMode): string {
  switch (mode) {
    case "ai-reranked":
      return "Ranked by relevance";
    case "keyword-fallback":
      return "Showing catalogue matches";
    case "deterministic":
      return "Matched from catalogue details";
    case "no-match":
      return "No matching listings";
  }
}

function fallbackExplanation(mode: SearchPublicMode): string | null {
  return mode === "keyword-fallback"
    ? "Ranking was unavailable, so these are direct catalogue matches."
    : null;
}

const HELPER_EXAMPLES = [
  "Fan under $30",
  "What comes with the calculator?",
  "Something to raise my laptop",
] as const;

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

export function CatalogueHelper({ listings }: CatalogueHelperProps) {
  const inputId = useId();
  const helpId = useId();
  const examplesId = useId();
  const [input, setInput] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [status, setStatus] = useState<HelperStatus>("idle");
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [answer, setAnswer] = useState<AskResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const pending = status === "pending-search" || status === "pending-ask";

  const listingsById = useMemo(
    () => new Map(listings.map((listing) => [listing.id, listing] as const)),
    [listings],
  );

  const catalogueForCategory = useMemo(
    () => filterListingsByCategory(listings, category),
    [category, listings],
  );

  const activeSearchListings = useMemo(() => {
    if (!searchResult) {
      return [] as Array<{ listing: Listing; reason: string }>;
    }

    return searchResult.results
      .map((entry) => {
        const listing = listingsById.get(entry.id);
        return listing ? { listing, reason: entry.reason } : null;
      })
      .filter((value): value is { listing: Listing; reason: string } =>
        Boolean(value),
      );
  }, [searchResult, listingsById]);

  const visibleSearchListings = useMemo(() => {
    if (category === "all") {
      return activeSearchListings;
    }
    return activeSearchListings.filter(
      (entry) => entry.listing.category === category,
    );
  }, [activeSearchListings, category]);

  async function submitSearch(query: string, requestId: number) {
    let response: Response;
    let payload: unknown;

    try {
      response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      payload = await response.json().catch(() => null);
    } catch {
      if (requestId !== requestIdRef.current) {
        return;
      }
      setStatus("error");
      setErrorMessage(searchErrorMessage);
      return;
    }

    if (requestId !== requestIdRef.current) {
      return;
    }

    if (!response.ok || !isSearchResponse(payload)) {
      setStatus("error");
      setErrorMessage(searchErrorMessage);
      return;
    }

    if (payload.results.some((entry) => !listingsById.has(entry.id))) {
      setStatus("error");
      setErrorMessage(searchErrorMessage);
      return;
    }

    setAnswer(null);
    setSearchResult(payload);

    if (payload.interpreted.category) {
      setCategory(payload.interpreted.category);
    }

    setStatus(payload.mode === "no-match" ? "no-match" : "search-results");
  }

  async function submitAsk(question: string, requestId: number) {
    let response: Response;
    let payload: unknown;

    try {
      response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      payload = await response.json().catch(() => null);
    } catch {
      if (requestId !== requestIdRef.current) {
        return;
      }
      setStatus("error");
      setErrorMessage(askErrorMessage);
      return;
    }

    if (requestId !== requestIdRef.current) {
      return;
    }

    if (!response.ok || !isAskResponse(payload)) {
      setStatus("error");
      setErrorMessage(askErrorMessage);
      return;
    }

    setSearchResult(null);
    setAnswer(payload);
    setStatus("answer");
  }

  function runRequest(rawInput: string) {
    const trimmed = rawInput.trim();

    if (trimmed.length < MIN_HELPER_INPUT_LENGTH) {
      setStatus("error");
      setErrorMessage(
        `Enter at least ${MIN_HELPER_INPUT_LENGTH} characters so the catalogue can help.`,
      );
      return;
    }

    const decision = classifyAssistantIntent(trimmed);

    if (decision.intent === "search" && trimmed.length > MAX_SEARCH_LENGTH) {
      setStatus("error");
      setErrorMessage(
        `That search is too long. Keep search terms under ${MAX_SEARCH_LENGTH} characters, or phrase it as a question.`,
      );
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setErrorMessage(null);

    if (decision.intent === "search") {
      setStatus("pending-search");
      void submitSearch(trimmed, requestId);
      return;
    }

    setStatus("pending-ask");
    void submitAsk(trimmed, requestId);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    runRequest(input);
  }

  function runExample(example: string) {
    setInput(example);
    runRequest(example);
  }

  function clearHelper() {
    requestIdRef.current += 1;
    setInput("");
    setCategory("all");
    setStatus("idle");
    setSearchResult(null);
    setAnswer(null);
    setErrorMessage(null);
  }

  const summary = searchResult
    ? interpretedSummary(searchResult.interpreted)
    : null;
  const showSearchResults =
    status === "search-results" || status === "no-match";
  const hiddenByCategory =
    showSearchResults &&
    category !== "all" &&
    activeSearchListings.length > 0 &&
    visibleSearchListings.length === 0;
  const showCatalogue = status !== "answer";

  return (
    <section
      className="catalogue-section page-container"
      id="catalogue-helper"
      aria-labelledby="catalogue-heading"
    >
      <div className="search-panel panel">
        <h2 id="catalogue-heading">Find or ask about listings</h2>
        <p className="search-intro">
          Search the marketplace or ask a question about the seeded listings.
        </p>
        <form className="search-form" onSubmit={handleSubmit} role="search">
          <label className="search-label" htmlFor={inputId}>
            Your search or question
          </label>
          <input
            aria-describedby={helpId}
            className="search-input"
            id={inputId}
            maxLength={MAX_HELPER_INPUT_LENGTH}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Try “fan under $30” or “Does the iPad include a pencil?”"
            type="text"
            value={input}
          />
          <p className="search-help" id={helpId}>
            Find listings with a budget, category, or purpose, or ask about
            price, condition, included items, defects, or meetup details.
          </p>
          <div className="search-examples">
            <span className="search-examples__label" id={examplesId}>
              Try an example
            </span>
            {HELPER_EXAMPLES.map((example) => (
              <button
                aria-describedby={examplesId}
                className="search-example"
                key={example}
                onClick={() => runExample(example)}
                type="button"
              >
                {example}
              </button>
            ))}
          </div>
          <div className="search-actions">
            <button className="search-submit" disabled={pending} type="submit">
              {pending
                ? status === "pending-ask"
                  ? "Checking the listings…"
                  : "Searching the catalogue…"
                : "Search or ask"}
            </button>
            <button
              className="search-clear"
              onClick={clearHelper}
              type="button"
            >
              Clear
            </button>
          </div>
        </form>

        <div aria-live="polite" className="search-status">
          {status === "pending-search" ? <p>Searching the catalogue…</p> : null}
          {status === "pending-ask" ? (
            <p>Looking through the listings…</p>
          ) : null}
          {status === "error" && errorMessage ? (
            <p className="search-error" role="alert">
              {errorMessage}
            </p>
          ) : null}
          {status === "search-results" && searchResult ? (
            <>
              <p>
                <span className="search-mode">
                  {searchModeLabel(searchResult.mode)}
                </span>
                {" — "}
                {visibleSearchListings.length} catalogue match
                {visibleSearchListings.length === 1 ? "" : "es"}
                {summary ? ` · ${summary}` : ""}.{" "}
                <a href="#catalogue-grid">View results</a>
              </p>
              {fallbackExplanation(searchResult.mode) ? (
                <p>{fallbackExplanation(searchResult.mode)}</p>
              ) : null}
            </>
          ) : null}
          {status === "no-match" ? (
            <p>
              {searchModeLabel("no-match")}. Try removing a constraint,
              increasing your budget, or choosing a broader category.
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

      {showCatalogue ? (
        <div
          className="category-filter"
          aria-label="Filter listings by category"
        >
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
      ) : null}

      {status === "answer" && answer ? (
        <div className="panel assistant-result" id="catalogue-answer">
          <p className="assistant-answer">{answer.answer}</p>

          {answer.missing.length > 0 ? (
            <div className="assistant-missing">
              <h3>Not established by the catalogue</h3>
              <ul>
                {answer.missing.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {answer.citations.length > 0 ? (
            <div className="assistant-citations">
              <h3>
                {answer.citations.length === 1
                  ? "Listing referenced"
                  : "Listings referenced"}
              </h3>
              <ul>
                {answer.citations.map((citation) => (
                  <li key={citation.id}>
                    <a href={citation.href}>
                      <span aria-hidden="true">→</span> {citation.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {answer.mode === "fallback" ? (
            <p className="assistant-note">
              The comparison could not be completed by the assistant, so it
              linked the relevant listings for you to review.
            </p>
          ) : null}
        </div>
      ) : (
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
      )}
    </section>
  );
}
