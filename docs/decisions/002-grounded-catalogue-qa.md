# 002 — Grounded catalogue Q&A

**Status:** Accepted
**Applies to:** `POST /api/ask`, `lib/catalogue-qa.ts`, `lib/qa-model.ts`, `lib/retrieval.ts`

## Context

A catalogue assistant that answers from product data must never present an
invented price, accessory, or defect as fact. The catalogue is small, and four
facts are deliberately absent so that the assistant has to admit the gap: iPad
battery health, Keychron Bluetooth status, mini-fridge capacity, and folding-bike
brand.

## Decision

The answer path is: retrieve a bounded candidate set, answer deterministically
where possible, otherwise build one grounded prompt, then validate the output
before showing anything.

- Only retrieved records are supplied to the model.
- Every cited ID must be a plain listing ID that exists in the catalogue **and**
  was in the retrieved candidate set.
- If any citation is invented, malformed, URL-like, path-like, or outside the
  candidate set, the whole answer is discarded. Nothing partial is shown.
- There is no repair call and no second attempt.
- Absence is described precisely: "the listing does not say" for missing data,
  "not confirmed" for unverified claims, and "no defects listed by the seller"
  for an empty defects array, which never implies defect-free.

## Consequences

- A model failure degrades to a grounded deterministic summary with validated
  listing links rather than an error or an invention.
- Citation validation is fail-closed, so a partially correct answer is treated as
  unusable.
- The prompt ceiling and candidate limit are enforced before any call, so an
  oversized request falls back instead of truncating a catalogue fact.
