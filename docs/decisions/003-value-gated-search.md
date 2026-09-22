# 003 — Value-gated hybrid search

**Status:** Accepted
**Applies to:** `POST /api/search`, `lib/search-query.ts`, `lib/search-retrieval.ts`, `lib/search-model.ts`

## Context

Natural-language search over 15 listings does not justify embeddings or a vector
database. It does need to honour explicit constraints exactly and to handle fuzzy
intent gracefully.

## Decision

Lexical retrieval with a single optional rerank call.

- Hard constraints are parsed deterministically and enforced as tri-state
  evidence: `confirmed-pass` only when the listing establishes the requirement,
  `confirmed-fail` when it contradicts it, and `unknown` when it cannot be
  established. Only `confirmed-pass` satisfies a hard requirement.
- Price comparisons keep inclusive and exclusive semantics distinct
  (`under` and `below` are exclusive; `at most` and `up to` are inclusive).
- Retrieval scores title, category, accessories, seller note, pickup, meetup
  window, condition, and defects, with a relevance floor.
- A rerank call happens only when fuzzy signals are present and at least two
  candidates qualify. It receives at most six candidates.
- Model-returned IDs and reasons are re-validated against the candidate set,
  hard constraints, and a reason-quality check. Failure collapses to the keyword
  fallback rather than a partial result.

## Consequences

- An unconfirmed requirement never becomes a match. Asking for "working
  Bluetooth" returns no match when no listing confirms it.
- Reasons cannot smuggle in ungrounded claims: self-negating reasons, unsupported
  suitability adjectives, and numeric measurements that are not prices are
  rejected.
- Retrieval quality is tuned to this catalogue. A larger catalogue would need a
  different retrieval layer, which is recorded as a known limitation.
