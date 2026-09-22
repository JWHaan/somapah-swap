# Evaluation

How the application is evaluated, what the fixtures cover, and how to reproduce
the numbers. `npm run eval` runs the deterministic and mocked suites only; it
never contacts the provider.

## Commands

```bash
npm test -- --run   # full unit suite
npm run eval        # consolidated deterministic + mocked evaluation
npm run test:e2e -- --project=mobile-chromium
```

## Coverage by suite

| Area                             | Suite                                       | Tests |
| -------------------------------- | ------------------------------------------- | ----- |
| Catalogue schema and lookup      | `catalogue.test.ts`                         | 10    |
| Unified intent routing           | `assistant-intent.test.ts`                  | 58    |
| Intent-routing fixtures          | `intent-routing-evaluation.test.ts`         | 25    |
| Q&A decisions and fixtures       | `catalogue-qa.test.ts`                      | 40    |
| Q&A mocked model path            | `qa-evaluation.test.ts`                     | 25    |
| Q&A prompt and parsing           | `qa-model.test.ts`                          | 14    |
| Calculator inclusion regressions | `calculator-retrieval.test.ts`              | 12    |
| Q&A retrieval                    | `retrieval.test.ts`                         | 13    |
| Search query parsing             | `search-query.test.ts`                      | 53    |
| Search retrieval                 | `search-retrieval.test.ts`                  | 20    |
| Search orchestration             | `catalogue-search.test.ts`                  | 15    |
| Search fixtures                  | `search-evaluation.test.ts`                 | 28    |
| Search model output              | `search-model.test.ts`                      | 28    |
| Search provider limits           | `search-provider.test.ts`                   | 6     |
| Route validation and bodies      | `ask-route.test.ts`, `search-route.test.ts` | 49    |
| Provider adapters                | `gateway.test.ts`, `openrouter.test.ts`     | 78    |
| Catalogue growth                 | `catalogue-growth.test.ts`                  | 16    |
| Theme model                      | `theme.test.ts`                             | 20    |
| Behavioural freeze               | `qa-characterization.test.ts`               | 6     |
| Release metrics                  | `release-metrics.test.ts`                   | 3     |

The consolidated evaluation command runs 241 of these tests across 11 files in
under a second.

## Fixtures

| Fixture                                    | Cases | Purpose                                                                                          |
| ------------------------------------------ | ----- | ------------------------------------------------------------------------------------------------ |
| `tests/fixtures/qa-cases.json`             | 30    | Decisions, modes, candidate and cited IDs, provider-call counts, required and prohibited wording |
| `tests/fixtures/search-cases.json`         | 27    | Decisions, modes, expected top hit, allowed and prohibited IDs, provider-call counts             |
| `tests/fixtures/intent-routing-cases.json` | 20    | Expected intent, routing reason, endpoint, endpoint-call count, provider-call count              |

Every fixture asserts an expected provider-call count, so a change that silently
adds or removes a model call fails the suite.

## Measured results

Computed from the fixtures on every run by `release-metrics.test.ts`; the values
below are the current output.

| Metric                                    | Value      |
| ----------------------------------------- | ---------- |
| Intent fixtures                           | 20 at 100% |
| Q&A fixtures                              | 30 at 100% |
| Search fixtures                           | 27 at 100% |
| Deterministic requests                    | 81.5%      |
| Model-worthy requests                     | 18.5%      |
| Zero-provider-call fixtures               | 100%       |
| Exactly one call (model-worthy)           | 100%       |
| Missing-fact accuracy                     | 100%       |
| Off-topic and adversarial rejection       | 100%       |
| No-match accuracy                         | 100%       |
| Fallback correctness                      | 100%       |
| Expected result in top three              | 100%       |
| Invalid-ID and invalid-citation rejection | 100%       |
| Average candidate count                   | 2.1        |
| Maximum candidate count                   | 6          |
| Maximum AI-reranked results               | 4 (cap)    |

## What the fixtures deliberately pin

- **Zero-call paths.** Scope rejection, exact facts, known missing facts, price and
  category filters, exact-product lookups, and no-match all assert zero provider
  calls.
- **One-call paths.** Comparisons and fuzzy ranking assert exactly one call.
- **Fail-closed validation.** Invented IDs, real-but-unretrieved IDs, URL-like
  citations, traversal strings, duplicate citations, empty citation lists,
  self-negating reasons, unsupported suitability claims, and ungrounded numeric
  claims all invalidate the whole model answer.
- **Catalogue growth.** Synthetic records prove candidate limits, constraint
  enforcement on new records, candidate-bound results, and stable public schemas
  without modifying `data/listings.json`.
- **Provider resilience.** Timeout, rate limit, authentication failure,
  unavailability, an HTTP 200 error envelope, malformed JSON, empty content,
  fenced JSON, and thrown errors all degrade to the deterministic fallback with no
  second call.

## Provider observations

Live provider results are individual observations, not guarantees, and are
recorded separately in [`cognitio-gateway-contract.md`](cognitio-gateway-contract.md).
No token or latency averages are derived from mocked tests.

## Browser evaluation

Playwright runs one mobile project at 375 CSS pixels and covers the marketplace
journey, the unified helper, search and Q&A states, intent routing, theme
selection and persistence, reduced motion, touch targets, keyboard focus, text
resize, and a six-size responsive matrix.

Automated 375-pixel evidence exists. A physical-phone check remains a manual step.
