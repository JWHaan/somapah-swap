# Architecture

Final architecture of the deployed application, with the trust boundaries that
matter. Design rationale is recorded in [`docs/decisions/`](decisions/).

## Runtime shape

```text
Browser
  │
  ├── GET /              marketplace + unified catalogue helper
  ├── GET /item/[id]     authoritative listing detail
  ├── GET /notes         assessment write-up
  │
  ├── POST /api/search   listing discovery
  └── POST /api/ask      catalogue questions
          │
          └── server-only provider adapters → Cognitio gateway
```

Next.js App Router on Vercel. Both API routes are dynamic; the pages are
statically rendered except for the client interactions inside the helper.

## Data

`data/listings.json` is the only source of product truth: 15 records validated at
import time by a strict Zod schema, including a unique-ID check and an exact
length check. Nothing in the UI, the model path, or the search path can create,
rename, or modify a listing.

The catalogue is loaded once per server process. Retrieval adapters receive
validated `Listing` values, so they never depend on file-storage semantics.

## Server boundaries

| Module                    | Responsibility                                                       |
| ------------------------- | -------------------------------------------------------------------- |
| `lib/catalogue.ts`        | Schema validation and catalogue lookup                               |
| `lib/retrieval-core.ts`   | Shared, behaviour-neutral lexical primitives                         |
| `lib/retrieval.ts`        | Q&A candidate retrieval                                              |
| `lib/catalogue-qa.ts`     | Q&A decision path: reject, answer, model, or fall back               |
| `lib/qa-model.ts`         | Grounded prompt construction and strict output parsing               |
| `lib/search-query.ts`     | Query parsing, price semantics, tri-state constraints                |
| `lib/search-retrieval.ts` | Search candidate scoring and concept evidence                        |
| `lib/catalogue-search.ts` | Search decision path and rerank enforcement                          |
| `lib/search-model.ts`     | Search prompt construction and fail-closed validation                |
| `lib/provider-support.ts` | Shared sanitization, usage parsing, error classification             |
| `lib/openrouter.ts`       | Explicit provider adapter for both AI paths                          |
| `lib/gateway.ts`          | Preserved default-route adapter, selectable via `lib/qa-provider.ts` |

`app/api/ask/route.ts` and `app/api/search/route.ts` own request validation,
bounded body reading, and sanitized error responses. Everything provider-related
sits behind `import "server-only"` and is unreachable from client code.

## Trust boundaries

**The browser is untrusted.** Requests are schema-validated with strict objects,
so unknown fields are rejected. The raw body is bounded before parsing. No field
lets a caller choose a provider, model, endpoint, header, token budget, reasoning
setting, tool, timeout, candidate ID, or result limit.

**Listing text is untrusted.** Catalogue strings are treated as data, never as
instructions, and are escaped by React on render. Retrieval treats text as
evidence rather than command.

**Model output is untrusted.** Retrieved IDs are allowlisted, citations must
resolve inside the candidate set, and reasons are checked for grounding. Any
failure discards the whole model answer.

**Provider responses are untrusted.** Only a validated `choices[0].message.content`
string is used. Error envelopes, non-JSON bodies, empty content, and forbidden
markers all normalize to a sanitized failure category.

## Value gating

```text
input
  → local intent routing            (no model call)
  → deterministic handling          (no model call)
  → bounded retrieval
  → optional single model call
  → validation
  → authoritative UI
```

Deterministic handling covers scope rejection, exact facts, explicit exclusions,
known missing facts, price and category filters, and no-match. A model is called
at most once, only when a comparison, fuzzy ranking, or explanation genuinely
needs language reasoning.

## Failure behaviour

| Failure                              | Result                          |
| ------------------------------------ | ------------------------------- |
| Invalid request                      | HTTP 400, no provider call      |
| Oversized body                       | HTTP 413, no provider call      |
| Missing configuration                | Sanitized 503 category          |
| Provider timeout or error            | Deterministic grounded fallback |
| Malformed or ungrounded model output | Fallback, single call only      |
| Invalid citation or returned ID      | Whole answer discarded          |
| No matching listing                  | Explicit no-match state         |

## Client boundaries

`components/CatalogueHelper.tsx` is the only interactive catalogue surface. It
holds one active request, ignores responses from superseded requests, and renders
search results from authoritative records resolved by ID. `lib/theme.ts` and
`components/ThemeSelector.tsx` own light, dark, and system themes; no client
module imports a provider adapter.
