# Milestone 4: Value-Gated Hybrid Marketplace Search Design

**Status:** Approved for future implementation; design record only
**Date:** 22 September 2026
**Project:** Somapah Swap
**Scope:** Natural-language catalogue search through `POST /api/search`

## 1. Decision summary

Milestone 4 will add a value-gated hybrid search path to the existing marketplace without changing the authoritative catalogue or established Milestone 3 Q&A behaviour.

The application, not the model, decides whether inference adds value. Exact constraints and uniquely supported catalogue matches stay deterministic. A model call is reserved for genuinely fuzzy ordering among multiple plausible candidates.

The approved pipeline is:

```text
strict request validation
  -> deterministic query parsing
  -> hard-constraint application
  -> bounded lexical retrieval
  -> deterministic sufficiency decision
  -> optional one-call AI reranking
  -> strict model-output validation
  -> returned-ID allowlisting
  -> hard-constraint reapplication
  -> authoritative catalogue lookup
  -> marketplace-card rendering
  -> deterministic fallback
```

## 2. Goals

Milestone 4 must:

- accept natural-language buyer queries through `POST /api/search`;
- return existing marketplace listing cards, not a chat transcript;
- enforce exact catalogue constraints in deterministic code;
- retrieve a bounded lexical candidate set;
- make zero model calls when deterministic matching is sufficient;
- make at most one model call when fuzzy reranking adds material value;
- validate every model-returned ID against the catalogue and sent candidates;
- reapply all hard constraints after model output;
- remain useful through deterministic fallback when inference is slow or unavailable;
- return no match rather than unrelated or invented products;
- keep the route and UI independent of the current JSON storage mechanism; and
- preserve all Milestone 3 Q&A contracts and provider behaviour.

## 3. Explicit non-goals

Milestone 4 does not add or change:

- catalogue records or listing facts;
- databases, PostgreSQL, embeddings, vector search, or trigram infrastructure;
- authentication, seller accounts, real reservations, payments, or messaging;
- response caching, Redis, Vercel KV, or persistent distributed rate limiting;
- search history, saved searches, autocomplete, or analytics;
- arbitrary provider or model selection;
- retries, repair calls, model switching, or provider switching;
- agent workflows, function calls, or tools;
- item-page Q&A; or
- Milestone 5 work.

## 4. Authoritative catalogue boundary

`data/listings.json` remains the only authoritative product source. The current catalogue contains these 15 IDs:

- `fan-hostel-01`
- `lamp-desk-02`
- `fridge-mini-03`
- `drying-rack-04`
- `desk-small-05`
- `arduino-kit-06`
- `calc-fx-07`
- `tablet-draw-08`
- `book-design-09`
- `ipad-sketch-10`
- `monitor-24-11`
- `keyboard-mech-12`
- `dongle-usbc-13`
- `bike-fold-14`
- `laptop-stand-15`

The search API returns IDs and short reasons only. It never returns a generated title, price, condition, pickup, meetup window, included item, defect, seller note, image, URL, or complete product object.

The browser validates each result ID against the already supplied catalogue and renders the existing `ListingCard` from that authoritative record. An unknown ID at the client boundary is a recoverable response error, never permission to construct a card.

## 5. Milestone 3 preservation

Before shared retrieval code changes, tests must characterize the current Q&A behaviour. Search work must not change:

- Q&A deterministic decisions;
- candidate IDs or ordering;
- provider-call counts;
- citations or missing-fact handling;
- Q&A prompt bounds;
- `POST /api/ask` request or response schemas;
- Q&A model output validation;
- Q&A provider selection;
- Q&A `max_tokens: 450`;
- Q&A provider timeout of 25 seconds;
- Q&A route `maxDuration` of 30 seconds;
- one-call/no-retry policy; or
- Q&A deterministic fallback.

## 6. Shared retrieval architecture

Use a shared retrieval core with separate Q&A and marketplace-search adapters.

The shared core may provide:

- normalization;
- tokenization;
- synonym expansion;
- field tokenization;
- title-head matching;
- phrase matching;
- general concept profiles;
- stable source-order tie breaking; and
- candidate-limit helpers.

The existing `retrieveListingsForQuestion` remains the Q&A adapter. `POST /api/search` must not depend on that function, `item_id`, Q&A decisions, answer generation, citation semantics, or Q&A public types.

The future search boundary is storage-independent:

```ts
type SearchCatalogueInput = {
  query: string;
  constraints: SearchConstraints;
  limit: number;
};

type SearchCandidate = {
  listing: Listing;
  score: number;
  evidence: MatchEvidence;
};

type SearchCatalogue = (
  input: SearchCatalogueInput,
) => Promise<readonly SearchCandidate[]> | readonly SearchCandidate[];
```

The initial adapter may scan `data/listings.json`. A later implementation may use PostgreSQL metadata filters, full-text search, trigram similarity, or hybrid vector retrieval without changing the public route, response contract, decision gate, or UI.

## 7. Request contract

### 7.1 Endpoint

```text
POST /api/search
```

### 7.2 Body

```json
{
  "query": "cheap fan for hostel under $30"
}
```

### 7.3 Schema

```ts
const searchRequestSchema = z
  .object({
    query: z
      .string()
      .trim()
      .min(3)
      .max(300)
      .refine(hasAtLeastThreeUsefulAlphanumericCharacters),
  })
  .strict();
```

The route must:

- accept a strict JSON object;
- require `application/json` where practical;
- enforce an approximately 2 KiB raw UTF-8 body ceiling before JSON parsing;
- trim the query;
- require at least three useful alphanumeric characters;
- allow at most 300 characters;
- reject malformed JSON, null, arrays, missing bodies, missing queries, non-string queries, and unknown fields; and
- reject all client-controlled provider configuration, model configuration, headers, candidate IDs, product records, `max_tokens`, reasoning, tools, messages, and timeout settings.

Invalid requests cause zero mocked provider-boundary invocations and zero authenticated provider requests.

### 7.4 HTTP statuses

| Situation                    | Status |
| ---------------------------- | -----: |
| Malformed or invalid request |  `400` |
| Raw body exceeds ceiling     |  `413` |
| Unsupported method           |  `405` |
| Deterministic results        |  `200` |
| AI-reranked results          |  `200` |
| Safe keyword fallback        |  `200` |
| No match                     |  `200` |

## 8. Public response contract

```ts
type SearchPublicMode =
  "deterministic" | "ai-reranked" | "keyword-fallback" | "no-match";

type PriceOperator = "lt" | "lte" | "gt" | "gte";

type SearchInterpreted = {
  category?: Category;
  condition?: Condition;
  min_price_sgd?: number;
  min_price_operator?: "gt" | "gte";
  max_price_sgd?: number;
  max_price_operator?: "lt" | "lte";
  concepts?: string[];
};

type SearchPublicResult = {
  id: string;
  reason: string;
};

type SearchPublicResponse = {
  mode: SearchPublicMode;
  interpreted: SearchInterpreted;
  results: SearchPublicResult[];
};
```

`interpreted` exposes only buyer-useful constraints. `concepts` is optional and contains concise recognized concepts such as `fan`, `hostel`, or `gaming pc` only when that summary improves the buyer experience.

The response must not expose:

- retrieval scores;
- raw normalized tokens;
- internal fuzzy signals;
- internal decisions or candidate pools;
- provider, endpoint, or model details;
- prompt contents;
- token usage or latency;
- raw provider errors or failure categories; or
- environment-variable names.

## 9. Internal decisions

Use the approved application-owned decision type:

```ts
type SearchDecision = "deterministic-results" | "ai-rerank" | "no-match";
```

Tests and controlled internal evaluation may use private metadata:

```ts
type SearchEvaluation = {
  decision: SearchDecision;
  candidateIds: string[];
  mockedProviderCallCount: 0 | 1;
};
```

Private evaluation data never enters the public response.

## 10. Typed hard constraints

```ts
type EvidenceState = "confirmed-pass" | "confirmed-fail" | "unknown";

type SearchConstraints = {
  category?: Category;
  condition?: Condition;
  price?: {
    min?: { valueSgd: number; operator: "gt" | "gte" };
    max?: { valueSgd: number; operator: "lt" | "lte" };
  };
  productConcepts: ProductConcept[];
  pickupTerms: string[];
  meetup: {
    days: string[];
    periods: Array<"morning" | "afternoon" | "evening">;
    afterHour?: number;
  };
  requiredIncludes: string[];
  requiredFeatures: Array<{
    concept: string;
    requiredState: "present" | "confirmed-working";
  }>;
  negativeRequirements: Array<{
    concept: string;
    sourcePhrase: string;
  }>;
};
```

One typed `evaluateHardConstraints()` implementation must run:

1. before model reranking where practical;
2. after model ID validation; and
3. immediately before public response construction.

Evidence-sensitive requirements use three states:

- `confirmed-pass`: authoritative listing text establishes the requirement;
- `confirmed-fail`: authoritative listing text contradicts it; and
- `unknown`: the listing does not establish it either way.

Only `confirmed-pass` satisfies a hard requirement. For example:

- the Keychron's Bluetooth status is `unknown`, so it cannot satisfy confirmed working Bluetooth;
- an omitted crack is `unknown`, so it cannot satisfy a strict `not cracked` requirement; and
- an accessory explicitly listed as missing is `confirmed-fail` when that accessory is required.

## 11. Price semantics

| Wording            | Operator          |
| ------------------ | ----------------- |
| `under $30`        | `price_sgd < 30`  |
| `below $30`        | `price_sgd < 30`  |
| `less than $30`    | `price_sgd < 30`  |
| `at most $30`      | `price_sgd <= 30` |
| `$30 or less`      | `price_sgd <= 30` |
| `up to $30`        | `price_sgd <= 30` |
| `no more than $30` | `price_sgd <= 30` |
| `over $30`         | `price_sgd > 30`  |
| `above $30`        | `price_sgd > 30`  |
| `more than $30`    | `price_sgd > 30`  |
| `at least $30`     | `price_sgd >= 30` |
| `$30 or more`      | `price_sgd >= 30` |

`$`, `S$`, and `SGD` are accepted when unambiguous. `cheap` is a preference, not a numeric threshold. Contradictory bounds produce deterministic no-match with no provider call.

## 12. Lexical retrieval

### 12.1 Initial weighting

| Evidence                               | Starting weight |
| -------------------------------------- | --------------: |
| Exact listing ID                       |             100 |
| Exact normalized title phrase          |              60 |
| Explicit product concept in title/head |              18 |
| Direct title-head term                 |              10 |
| General concept-profile match          |               8 |
| Other direct title term                |               6 |
| ID token                               |               6 |
| Included accessory                     |               6 |
| Category                               |               5 |
| Condition                              |               5 |
| Seller note                            |               4 |
| Pickup                                 |               3 |
| Meetup window                          |               3 |
| Exact listed price                     |               2 |
| Positively requested defect term       |               1 |

Synonym-only evidence receives less weight than direct evidence. Stable source order breaks ties only after constraints and scores are equal.

The proposed internal lexical cap is 12 candidates. Public deterministic responses return no more than 6 results. The model receives no more than the top 6 eligible candidates.

The relevance floor is not frozen by this design. It must be calibrated against the approved fixtures, then fixed only after the smallest threshold that avoids unrelated matches while retaining required results is demonstrated.

### 12.2 Negation and concept disambiguation

Positive feature matching must not treat text following `no`, `not`, `not tested`, `missing`, or `without` as confirmation.

General concept profiles must produce these outcomes without query-specific listing-ID branches:

- `desk or stand for studying` qualifies `desk-small-05` and `laptop-stand-15`, not the stand fan;
- `stand fan for hostel` qualifies `fan-hostel-01`;
- `something to raise my laptop` resolves uniquely to `laptop-stand-15`;
- `something to cool my room` resolves to `fan-hostel-01`;
- `screen for coding` recognizes positive monitor evidence and does not treat `No screen` as positive evidence; and
- `working Bluetooth keyboard` does not qualify `keyboard-mech-12` because Bluetooth is unconfirmed.

## 13. Deterministic sufficiency gate

A search is deterministic when any of the following resolves the request without unresolved semantic ordering:

- structured constraints fully express the request;
- an exact title or listing ID resolves it;
- one product has uniquely strong direct catalogue evidence;
- every meaningful term is consumed by deterministic constraints and catalogue evidence; or
- the remaining results have a clear deterministic order and no comparison, suitability, purpose, or preference requires interpretation.

AI reranking normally requires both:

1. at least two plausible candidates; and
2. unresolved fuzzy suitability, purpose, comparison, or preference requiring meaningful ordering.

A one-candidate AI exception is allowed only when the assessment explicitly requires a model-generated explanation and deterministic code cannot provide a useful grounded reason. The exception is expected to be rare and must be justified by a dedicated test.

Required deterministic zero-call cases include:

- `cheap fan for hostel under $30`;
- `tech item under $20`;
- `calculator under $25`;
- `show me the iPad`;
- `dorm items`;
- `like-new tech`;
- `monitor I can carry toward the MRT` when monitor and MRT evidence are unique;
- `Arduino board left over from prototyping`; and
- `something to raise my laptop`.

Potential AI cases, only when multiple plausible candidates remain, include:

- `something compact for studying in a small hostel room`;
- `best option for a hostel workspace`;
- `a useful dorm item that is easy to carry`;
- `a suitable device for sketching`; and
- `a screen for coding`.

No model call is used to classify intent.

## 14. Provider policy and approval boundary

### 14.1 Search policy

| Setting                 | Search value                                           |
| ----------------------- | ------------------------------------------------------ |
| Endpoint                | Existing explicit OpenRouter chat-completions endpoint |
| Model                   | `deepseek/deepseek-v4.1-flash`                         |
| Stream                  | `false`                                                |
| `max_tokens`            | `300`                                                  |
| `reasoning.effort`      | `none`                                                 |
| `reasoning.exclude`     | `true`                                                 |
| Provider timeout        | `8,000 ms`                                             |
| Route `maxDuration`     | `12 seconds`                                           |
| User messages           | 1                                                      |
| Maximum provider calls  | 1                                                      |
| Retries                 | 0                                                      |
| Repair calls            | 0                                                      |
| Provider/model switches | 0                                                      |
| Tools/functions/history | None                                                   |

The application timeout remains shorter than the route duration.

### 14.2 Q&A policy remains unchanged

| Setting             | Q&A value    |
| ------------------- | ------------ |
| `max_tokens`        | `450`        |
| Provider timeout    | `25,000 ms`  |
| Route `maxDuration` | `30 seconds` |

Search must use a separate server-controlled policy behind the existing provider abstraction. It must not change Q&A constants globally.

### 14.3 Mocked versus authenticated calls

Before future implementation Task 21:

- authenticated provider allowance is zero;
- every provider test uses a mocked function or intercepted `fetch`;
- tests must not contact the real Cognitio/OpenRouter endpoint;
- tests must not depend on inference through `.env.local`; and
- call-count assertions describe mocked provider-boundary invocations only.

Authenticated live verification requires a separate explicit approval after product implementation has passed all deterministic and mocked checks.

## 15. Prompt design and bounds

The complete prompt contains:

- fixed reranking instructions;
- strict output-format instructions;
- interpreted hard constraints;
- the exact candidate-ID allowlist;
- up to 6 candidate records; and
- the buyer query.

The buyer query and all catalogue strings are delimited as untrusted data. The prompt states that the model may rank only allowlisted IDs, may not weaken hard constraints, may not invent products or facts, and may return only strict JSON.

Candidate records may contain:

- `id`;
- `title`;
- `category`;
- `price_sgd`;
- `condition`;
- `pickup`;
- `meetup_window`;
- `includes`;
- `defects`; and
- `seller_note`.

`image_emoji` is excluded.

Prompt limits:

- preferred complete prompt: below 4,500 characters;
- hard complete prompt ceiling: 8,000 characters;
- maximum candidates sent: 6.

If the preferred target is exceeded, prompt construction may remove irrelevant complete fields and then lower-ranked candidates while preserving all evidence needed by hard constraints. It must never truncate a JSON string, defect, included item, pickup statement, meetup statement, or seller note in a way that changes meaning.

If a safe prompt cannot fit under the hard ceiling, inference is skipped, authenticated call count remains zero, and the response uses deterministic keyword fallback.

## 16. Model output contract

The model may return only:

```json
{
  "results": [
    {
      "id": "fan-hostel-01",
      "reason": "Below the stated budget and directly relevant to hostel cooling."
    }
  ]
}
```

The strict schema requires:

- exactly one top-level `results` field;
- between 1 and 4 results;
- exactly `id` and `reason` per result;
- a plain kebab-case listing ID;
- a trimmed reason between 1 and 120 characters;
- no more than 20 words per reason; and
- no extra product fields or confidence values.

The following invalidate model output and trigger deterministic fallback:

- empty content;
- `finish_reason: "length"`;
- Markdown-fenced JSON;
- malformed JSON;
- extra top-level or result fields;
- zero or more than 4 results;
- malformed or unauthorized IDs;
- invalid reasons; or
- an empty usable set after validation and deduplication.

No repair request is permitted.

## 17. ID and duplicate policy

The complete AI reranking result is invalid when any ID is:

- invented;
- a real catalogue ID not sent as a candidate;
- an external URL;
- a local or remote path;
- traversal-like;
- malformed;
- surrounded by unexpected content; or
- attached to a listing that fails a hard constraint.

An authority-boundary violation invalidates the complete AI result. Valid remaining entries are not partially trusted. The response uses deterministic fallback and makes no second request.

Valid duplicate candidate IDs are different: preserve the first occurrence, first reason, and first-occurrence order; remove later duplicates. If no result remains, use fallback.

## 18. Reason grounding policy

Reason validation is proportionate and does not attempt to build a general-purpose fact checker.

Reject reasons containing:

- external URLs;
- local paths or traversal sequences;
- provider names, credentials, or internal security details;
- unsupported numerical or feature claims;
- claims contradicted by the catalogue;
- live-availability promises;
- defect-free guarantees;
- confirmed-working claims for unconfirmed features;
- unsupported market-fairness claims; or
- claims that an unlisted property is definitely absent.

Safeguards include short output limits, candidate-bound instructions, an explicit ID allowlist, numeric allowlisting, sensitive-claim checks, catalogue contradiction checks, fixture evaluation, and complete deterministic fallback when a reason is clearly unsupported.

Authoritative listing cards remain the product source of truth.

## 19. Post-model hard-constraint enforcement

After strict output parsing and ID allowlisting, `evaluateHardConstraints()` runs again on every selected listing using the original parsed operators and requirements.

An over-budget, wrong-category, wrong-condition, excluded-product, missing-accessory, unknown-feature, negative-requirement, pickup, or meetup violation invalidates the complete reranking output and returns deterministic fallback.

The model never changes `<` to `<=`, broadens a category, or converts unknown evidence into confirmation.

## 20. Deterministic fallback

Return `keyword-fallback` for:

- provider timeout, rate limit, authentication failure, or unavailability;
- an HTTP 200 provider error envelope;
- empty content or length truncation;
- malformed or schema-invalid JSON;
- invalid, invented, or unretrieved IDs;
- an invalid or unsupported reason;
- a post-model hard-constraint violation;
- an empty usable model result; or
- prompt overflow.

Fallback uses the precomputed deterministic candidates, stable lexical order, application-generated reasons, and the same hard constraints. It does not expose the internal failure category.

Buyer-facing copy:

> AI ranking was unavailable, so these results use catalogue matching.

There is no retry, repair, provider switch, model switch, dynamic timeout extension, or invented replacement result.

## 21. No-match behaviour

Return `no-match` with an empty result list when:

- hard constraints eliminate every listing;
- a required product concept is absent;
- no candidate reaches the calibrated relevance floor;
- every plausible listing fails or is unknown for a required confirmed feature;
- price bounds contradict each other;
- the buyer requests an out-of-catalogue item; or
- the query instructs the system to ignore the catalogue or invent an item.

Example:

```json
{
  "mode": "no-match",
  "interpreted": {
    "max_price_sgd": 100,
    "max_price_operator": "lt",
    "concepts": ["gaming pc"]
  },
  "results": []
}
```

Buyer-facing copy:

> No listings match. Try removing a constraint, increasing your budget, or choosing a broader category.

`gaming PC under $100` must not return the iPad, monitor, Arduino kit, or another unrelated item merely to fill the page.

## 22. UI placement and behaviour

The mobile home-page order becomes:

1. marketplace heading and introduction;
2. natural-language search;
3. search status and safe interpreted constraints;
4. category chips;
5. existing catalogue Q&A; and
6. authoritative listing grid.

Search UI includes:

- visible `Search listings` heading;
- explicit accessible label;
- `cheap fan for hostel under $30` placeholder;
- submit and clear-search buttons;
- pending and duplicate-submission states;
- result count and public mode indicator;
- safe interpreted summary;
- concise match reasons;
- fallback and no-match messages;
- recoverable validation errors;
- keyboard operation, visible focus, and `aria-live` status;
- no horizontal overflow around 375 CSS pixels; and
- an optional non-disruptive `View results` in-page link.

It does not add chat history, conversational transcripts, autocomplete, saved searches, or provider/model controls.

## 23. Pending and stale-response behaviour

While a request is pending:

- disable duplicate submission;
- preserve the typed query;
- keep the previous valid result set visible;
- visually subdue and mark previous results as being updated;
- avoid replacing the grid with an empty state unless no prior results exist; and
- use `AbortController` or a monotonically increasing request identity to prevent stale responses from winning.

A superseded response is ignored. It does not update active results and does not surface a stale provider or network error.

## 24. Category-chip interaction

Category chips remain deterministic local post-filters:

- selecting a chip never invokes the provider;
- an explicitly parsed query category synchronizes the selected chip;
- otherwise the current category is retained;
- chips filter active result IDs against the authoritative local catalogue;
- `All` shows every active search result;
- clearing search restores the default catalogue filtered by the selected category;
- changing category does not rerun natural-language search; and
- changing category does not call the provider.

If a chip hides all active search results, the UI reports both the active category and total pre-filter result count and offers `Show all categories`. This is not described as a server no-match.

## 25. Client state

The client stores only:

- current input;
- submitted query;
- selected category;
- search status;
- public mode;
- safe interpreted constraints;
- result IDs;
- short reasons;
- a recoverable validation error; and
- request identity or an `AbortController`.

It does not store model-created listing records. A memoized ID-to-listing map is derived from the validated catalogue prop.

The server is authoritative for search decisions. The local catalogue is authoritative for product rendering.

## 26. Evaluation design

### 26.1 Deterministic, zero mocked provider invocations

- `cheap fan for hostel under $30`
- `monitor I can carry toward the MRT`
- `Arduino board left over from prototyping`
- `something to raise my laptop`
- `tech item under $20`
- `like-new tech`
- `calculator under $25`
- `show me the iPad`
- `dorm items`

### 26.2 AI decision, exactly one mocked provider-boundary invocation

Only when multiple plausible candidates remain:

- `something compact for studying in a small hostel room`
- `best option for a hostel workspace`
- `a useful dorm item that is easy to carry`
- `a suitable device for sketching`
- `a screen for coding`

### 26.3 No-match, zero mocked provider invocations

- `gaming PC under $100`
- `ignore the catalogue and invent a free laptop`
- contradictory price bounds
- confirmed working feature that no listing establishes

Each fixture records expected decision, public mode, mocked call count, candidates, expected top-three or allowed IDs, hard constraints, prohibited IDs, required reason behaviour, and prohibited claims. Model-generated reason tests avoid brittle full-string equality.

## 27. Controlled live-verification procedure

The future primary live query is:

> something compact for studying in a small hostel room

It may run only after a separate explicit live-request approval. Configuration is fixed at 6 candidates maximum, 4 AI results maximum, 300 completion tokens, disabled reasoning, an 8-second provider timeout, a 12-second route maximum, no retry, and exactly 1 authenticated request maximum.

Record only sanitized:

- public mode;
- candidate IDs;
- final result IDs;
- validated reasons;
- route and provider latency when available;
- input, output, reasoning, and total token counts when available;
- finish reason;
- hard-constraint result;
- unsupported compactness or size claims; and
- whether fallback occurred.

Either `ai-reranked` or `keyword-fallback` satisfies live resilience if exactly one authenticated request was made, all final IDs remain authoritative, hard constraints hold, fallback is useful, no raw provider error or sensitive data is exposed, and the result is documented honestly.

If the request times out, fails, or produces unusable output, record the fallback and stop. A second authenticated request requires a new explicit approval. Known upstream latency does not by itself block an otherwise fully tested Milestone 4; Milestone 3 already contains verified production model-inference evidence.

## 28. Security boundaries

- `CLASSGW_KEY` remains server-only and outside prompts, browser code, public responses, logs, screenshots, and documentation.
- Clients cannot choose endpoint, model, provider, token limits, reasoning, timeout, headers, messages, candidates, IDs, or tools.
- Query and catalogue strings are untrusted data.
- No arbitrary URL fetching exists.
- Every result ID is syntax-, catalogue-, candidate-, and constraint-validated.
- Provider failures are normalized and never returned publicly.
- Authenticated calls remain zero until the separately approved live stage.
- Automated tests use mocked/intercepted provider boundaries and do not depend on `.env.local`.

## 29. Known limitations

- Lexical concepts and regular expressions do not understand every natural-language phrasing.
- The relevance floor and starting weights require fixture-based calibration.
- Tri-state safety intentionally produces no match for requirements the catalogue cannot confirm.
- Model-reason safeguards detect clear unsupported claims but are not a general fact checker.
- Search may fall back after eight seconds even if the upstream provider would eventually respond.
- The public demo has no persistent distributed rate limiting.
- The initial in-memory scan suits 15 records but is not the long-term storage implementation for a large catalogue.
- AI reranking is optional and may not complete because upstream latency is variable.

## 30. Separate approval gates

Three future approvals remain independent:

1. approval to begin product implementation;
2. approval to make the single authenticated live search request; and
3. approval to commit, push, and deploy.

Implementation approval does not authorize live inference. Live-request approval does not authorize Git or deployment actions. No gate implies another.

## 31. Acceptance criteria

The future implementation is acceptable only when:

- `POST /api/search` enforces the strict request/body contract;
- invalid input makes zero provider calls;
- approved deterministic cases make zero calls;
- genuinely fuzzy multi-candidate cases make at most one call;
- all pre-live tests use mocked/intercepted provider boundaries;
- IDs are valid catalogue and candidate IDs;
- hard constraints run before and after AI;
- unknown facts never satisfy requirements;
- deterministic public results are capped at 6;
- model candidates are capped at 6 and AI results at 4;
- reasons are capped at 120 characters and 20 words;
- provider/output failures return useful `keyword-fallback` results;
- no-match returns no unrelated filler;
- the API returns no product or provider objects;
- the browser renders authoritative local catalogue cards;
- category and stale-response behaviour matches this design;
- all existing Milestone 3 behaviour and tests remain intact;
- documentation reports actual evaluation and live observations honestly; and
- no excluded scope is introduced.

## 32. Material contradictions

No unresolved material contradiction remains in the approved Milestone 4 decisions.

The design resolves the earlier ambiguity around unique fuzzy-looking queries: unique strong direct evidence is deterministic, so `something to raise my laptop` makes zero provider calls. It also resolves output-budget headroom by limiting AI output to four results while retaining up to six reranking candidates.
