# 001 — Deterministic-first AI

**Status:** Accepted
**Applies to:** `POST /api/ask`, `POST /api/search`, `lib/assistant-intent.ts`

## Context

The product answers questions and finds listings from a fixed 15-record
catalogue. Most buyer requests are exact: a price, a condition, an included
item, a category filter, or a known gap in the data. Sending those to a language
model adds latency, spends shared provider allowance, and creates a chance to
invent a fact that the catalogue already states.

## Decision

Deterministic code handles a request whenever it can do so exactly, and the
model is used only where language reasoning genuinely adds value.

- Intent routing is local string analysis with no model call.
- Exact facts, explicit exclusions, and known missing facts are answered in code.
- Explicit price, category, condition, and feature constraints are enforced in code.
- A model is called at most once, and only for comparisons, fuzzy ranking, or
  explanation that cannot be reduced to an exact rule.

## Consequences

- Most traffic spends no provider allowance and returns immediately.
- Deterministic answers cannot hallucinate; they can only under-answer, which is
  handled by saying the listing does not say.
- The model path needs its own validation, because it is now a minority path
  rather than the default.
- Behaviour is testable without mocks for the majority of cases.

## Measured effect

Across the evaluation fixtures, 81.5 percent of search fixtures resolve with zero
provider calls and 18.5 percent are model-worthy, each making exactly one call.
