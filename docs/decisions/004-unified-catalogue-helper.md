# 004 — Unified catalogue helper

**Status:** Accepted
**Applies to:** `components/CatalogueHelper.tsx`, `lib/assistant-intent.ts`, `app/page.tsx`

## Context

The homepage originally showed two inputs: a listing search box and a separate
question box. Buyers had to know which one their wording belonged to, which is an
internal distinction, not a buyer one.

## Decision

One input routes to the correct existing endpoint through local intent analysis.

- `classifyAssistantIntent` returns `search` or `ask` plus a reason code, using
  general linguistic signals rather than a query lookup table.
- Comparisons, question structures, and fact requests route to Q&A.
- Discovery verbs, budgets, categories, and conditions route to search.
- Ambiguous input defaults to search, because showing listings is the safer
  answer.
- One submission calls exactly one endpoint. The client never calls both and
  never falls through from one to the other.
- Example chips submit through the same router and validation as typed input.

The server contracts are untouched: `/api/search` and `/api/ask` keep their own
schemas, validation, and provider policies.

## Consequences

- The UI can change how requests are entered without changing how they are served.
- A misrouted request still degrades safely, because both endpoints are
  scope-limited and grounded.
- Search keeps the category chips and result grid; an answer replaces the grid and
  hides the chips, because filters do not apply to citations.
