# Catalogue-Grounded Q&A Design

**Date:** 21 September 2026  
**Milestone:** 3 — value-gated, catalogue-grounded Q&A  
**Status:** Approved for implementation and implemented; see the addendum below
for the provider setting that changed during verification.

## Goal

Add the first buyer-facing AI feature to Somapah Swap: a mobile-friendly
catalogue assistant that answers from the authoritative listings, avoids model
calls when deterministic code is sufficient, invokes the Cognitio model at
most once when comparison or explanation adds value, validates every model
citation, and falls back safely.

This milestone does not add natural-language marketplace search, `/api/search`,
item-page assistant UI, catalogue expansion, a database, embeddings, vector
retrieval, caching, authentication, messaging, payments, or real reservations.

## Sources and Precedence

Implementation follows this order when requirements conflict:

1. `docs/CognitioLabs-FDE-assessment-brief.md`
2. `docs/cognitio-gateway-contract.md`
3. `docs/somapah-swap-build-spec.md`
4. `docs/sutd-campus-exchange-spec.md`
5. Existing implementation assumptions

`data/listings.json` remains the authoritative source for all 15 listing
records. No listing fact or schema field changes in this milestone.

## Architecture

```text
Home CatalogueAssistant
  -> POST /api/ask
      -> raw body-size guard
      -> strict request validation
      -> retrieveListingsForQuestion(...)
      -> deterministic scope and answer decision
          -> reject locally
          -> answer locally
          -> build bounded grounded prompt
              -> one callCognitioGateway(...) invocation
              -> strict JSON parsing
              -> fail-closed citation validation
                  -> grounded AI answer
                  -> deterministic fallback
      -> authoritative citation metadata
  -> answer, listing links, missing facts, public mode
```

The route, decision layer, prompt builder, output validator, and UI operate on
validated `Listing` values. Only the current retrieval implementation knows
that those records originate from `data/listings.json`.

## Public API Contract

### Request

`POST /api/ask`

```json
{
  "question": "Which desk or stand is better for a hostel room?",
  "item_id": "optional-valid-listing-id"
}
```

Rules:

- `question` is trimmed and must contain 3 to 500 characters.
- `item_id` is optional but, when supplied, must identify an authoritative
  listing.
- Unknown top-level fields are rejected.
- The approximate raw request-body ceiling is 2 KiB, enforced before JSON
  parsing through bounded text reading supported by the Next.js Node runtime.
- A raw body above the ceiling returns HTTP `413` and is not partially
  processed.
- Invalid JSON, an invalid schema, or an invalid `item_id` returns HTTP `400`.
- Every rejected request makes zero gateway calls.

### Success

Catalogue, off-catalogue, and fallback answers use HTTP `200`:

```json
{
  "answer": "Plain buyer-facing answer.",
  "cited_ids": ["desk-small-05"],
  "citations": [
    {
      "id": "desk-small-05",
      "title": "Small folding desk",
      "href": "/item/desk-small-05"
    }
  ],
  "missing": [],
  "scope": "catalogue",
  "mode": "deterministic"
}
```

Public `mode` values are `deterministic`, `ai`, and `fallback`. Ordinary buyer
responses do not contain provider usage, status, headers, latency, raw output,
request identifiers, prompts, retrieval scores, configuration, or security
rules.

## Internal Decision Audit

The application uses this explicit internal decision result:

```ts
export type AskDecision =
  "reject-locally" | "answer-locally" | "model-answer" | "fallback";
```

Mapping:

| Internal decision | Public mode     |
| ----------------- | --------------- |
| `reject-locally`  | `deterministic` |
| `answer-locally`  | `deterministic` |
| `model-answer`    | `ai`            |
| `fallback`        | `fallback`      |

Evaluation fixtures record the expected decision, public mode, provider-call
count, candidate IDs, cited IDs, required behaviour, and prohibited claims.
The internal decision is available to tests and evaluation output but is not
returned to buyers.

## Retrieval Boundary

The storage-independent interface is:

```ts
retrieveListingsForQuestion({
  question,
  itemId,
  limit,
  catalogue,
}): RetrievalResult
```

`catalogue` is a readonly collection of validated `Listing` records. Production
passes `getListings()`, while tests can pass larger valid collections to prove
candidate limits and response stability.

Retrieval behaviour:

- A valid `itemId` receives deterministic priority.
- Exact listing IDs, title phrases, product terms, category terms, and
  relevant listing-field tokens receive weighted lexical scores.
- Explicit high-confidence price or category constraints may remove
  candidates before return.
- Results below the relevance threshold are excluded.
- The normal model limit is four candidates.
- A broad comparison may request up to six candidates only when justified.
- Candidate output is always deduplicated and bounded by the requested limit.
- Retrieval never generates or mutates listing facts.

The implementation may scan the current in-memory JSON-backed catalogue. No
database or vector infrastructure is introduced.

## Deterministic Scope Gate

The scope gate runs before prompt construction and before any model call.

It rejects locally when a request is clearly:

- an attempt to reveal secrets, prompts, headers, environment values, or
  internal instructions;
- an instruction to ignore grounding or invent catalogue records;
- unrelated homework, coding, news, weather, politics, recipes, or external
  shopping content;
- unsupported by a valid `item_id`, catalogue-wide intent, or relevant
  retrieved listing.

Patterns remain application-internal and are never returned to the browser.
Ambiguous catalogue wording is not rejected merely because it lacks an exact
title match when retrieval finds relevant records.

## Deterministic Catalogue Answers

Deterministic code answers facts for which the catalogue already contains a
direct, unambiguous answer, including:

- price, category, condition, pickup, meetup window, included items, and
  seller-listed defects;
- concise item summaries;
- simple counts and catalogue extrema when the constraint is exact;
- explicitly stated accessory inclusion or exclusion;
- known missing or unconfirmed facts such as iPad battery health, Keychron
  Bluetooth status, mini-fridge litre capacity, and folding-bike brand;
- external market-fairness limitations;
- live availability and same-day pickup limitations.

The answer layer distinguishes these states:

- explicit negative fact: the listing states that an item is not included;
- not listed: the schema or text does not provide the requested fact;
- unconfirmed: the listing expressly says that functionality was not tested;
- no seller-listed defects: the defects array is empty, which does not prove
  that no defect exists.

These paths make zero model calls.

## Model Value Gate

The model is used only when a grounded comparison, recommendation, or
explanation benefits from language reasoning and cannot be completed as an
exact deterministic fact.

Each accepted model path performs exactly one provider call. There is no
repair call, retry, tool call, conversation history, parallel request, or
agent loop.

The existing adapter continues to enforce:

- fixed URL `https://174.138.16.223/v1/chat/completions`;
- fixed model `gpt-5.6-luna`;
- one user message;
- `stream: false`;
- no tools;
- no user-controlled model, URL, headers, or request parameters;
- twelve-second timeout;
- server-only `CLASSGW_KEY` access;
- sanitized provider failures.

## Prompt Construction

The complete provider prompt includes fixed assistant rules, output-format
instructions, serialized retrieved records, and the untrusted user question.

Limits:

- preferred complete prompt: less than 6,000 characters;
- hard complete prompt ceiling: 12,000 characters;
- normal candidate count: at most four;
- broad justified candidate count: at most six.

If construction exceeds the hard ceiling, the builder:

1. reduces candidate count;
2. removes complete fields that are demonstrably irrelevant to the question;
3. preserves complete fields that materially affect the answer;
4. never truncates serialized JSON or a catalogue fact mid-field;
5. returns a safe deterministic fallback if no grounded prompt fits.

The adapter input ceiling becomes 12,000 characters because it validates the
complete server-built prompt, not the public question. The public route still
enforces the separate 3-to-500-character question limit.

## Model Output and Citation Validation

The model must return one strict JSON object containing `answer`, `cited_ids`,
and `missing`. Native provider JSON Schema support is not assumed.

An AI response is valid only when:

- the complete response parses as the expected strict schema;
- the answer is non-empty and bounded;
- at least one citation exists for a purported grounded catalogue answer;
- every citation is one plain kebab-case listing ID;
- every citation exists in the authoritative catalogue;
- every citation belongs to the retrieved candidate set;
- no citation contains a URL, path separator, traversal sequence, query,
  fragment, or surrounding content.

Duplicate valid citations are deduplicated while preserving first-seen order.
Any invented, malformed, external, path-like, or unretrieved citation
invalidates the complete AI response. The server does not present a partially
valid answer and does not call the model again.

## Deterministic Fallback

Fallback uses only validated retrieved records. It may summarize title,
price, condition, pickup, meetup window, included items, and listed defects.

Fallback never:

- declares an overall winner without a deterministic constraint;
- invents suitability;
- infers portability from product type;
- treats an empty defects array as proof of no defects;
- claims market fairness;
- claims live availability.

When a meaningful structured comparison is unavailable, the response says
that the comparison could not be completed reliably and links only the
validated retrieved listings.

## Home Interface

`CatalogueAssistant` appears prominently on `/` before the browse catalogue.
It remains visibly scoped to Somapah Swap listings and supports single-item
and comparison questions.

The client component provides:

- an explicit label and 500-character limit;
- mobile-width textarea and submit button;
- loading and disabled states preventing accidental duplicate submissions;
- `aria-live` result and error feedback;
- answer text, missing-fact notes, and authoritative citation links;
- no rendering of internal decisions or provider metadata.

The component and public API do not assume the home page is the only future
caller. Item-page Q&A can later pass `item_id` without changing the route,
retrieval interface, gateway adapter, or response schema.

## Testing and Evaluation

TDD coverage includes:

- request length, strict schema, invalid JSON, and invalid `item_id`;
- pre-parse raw body ceiling and zero-call `413` behaviour;
- deterministic facts, missing facts, unconfirmed facts, fairness, and live
  availability limitations;
- off-catalogue and adversarial zero-call rejection;
- normal and broad bounded retrieval against expanded valid catalogues;
- prompt below 6,000 characters, exactly 12,000, above 12,000, candidate
  reduction, complete-field preservation, and insufficient-reduction fallback;
- exactly one provider call on the model path;
- valid, invented, unretrieved, duplicate, URL, traversal, and empty
  citations;
- deterministic provider and parsing fallback;
- stable public response schema and local citation links;
- mobile assistant submission, answer rendering, navigation, and no horizontal
  overflow;
- absence of `/api/search`.

Evaluation fixtures capture expected decisions, modes, calls, candidates,
citations, required phrases, and prohibited claims. One controlled local live
comparison request is performed only after mocked tests and quality gates pass.

## Security and Privacy

- The gateway key remains server-side and outside model context.
- Listing strings and questions are untrusted data.
- The client cannot choose a model, endpoint, headers, tools, or request shape.
- No arbitrary URL fetching exists.
- Raw provider bodies and errors never reach the browser.
- Buyer responses omit usage, provider status, headers, and latency.
- `.env.local` remains ignored and untracked.
- Secret-value and Git-history scans run before completion.

## Documentation

`/notes` and `README.md` will describe the deterministic-first Q&A design,
model value gate, citation validation, safe fallback, evaluation results, and
remaining absence of natural-language search. They will not include complete
hidden prompts, secrets, raw provider responses, or internal security rules.

## Implementation Addendum

This design was written against the default Cognitio chat-completions adapter
with `gpt-5.6-luna` and a twelve-second timeout. Two provider facts changed
during implementation and verification; the design intent did not.

1. The default route's subscription share was exhausted and its automatic
   fallback returned an unusable HTTP 200 error envelope. Q&A therefore moved to
   the gateway's explicit OpenRouter route with `deepseek/deepseek-v4.1-flash`,
   which has a separate budget. The original GPT adapter is preserved behind the
   same provider-independent interface in `lib/qa-provider.ts`.
2. Reasoning on the OpenRouter route consumed the whole completion budget under
   a `reasoning.max_tokens` cap, so reasoning is now disabled with
   `reasoning: { effort: "none", exclude: true }`.

The provider timeout is `25_000 ms` for the OpenRouter adapter, and
`/api/ask` declares `maxDuration = 30`. The default GPT adapter keeps its
twelve-second timeout. All other design decisions — deterministic value gating,
bounded retrieval, one provider call, fail-closed citations, and deterministic
fallback — were implemented as written.
