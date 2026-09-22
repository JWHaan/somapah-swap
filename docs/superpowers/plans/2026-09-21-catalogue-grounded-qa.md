# Catalogue-Grounded Q&A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a value-gated `/api/ask` feature and mobile home assistant that answer only from validated Somapah Swap listings, call the model at most once when useful, fail closed on citations, and fall back deterministically.

**Architecture:** Pure retrieval, model-contract, and catalogue-decision modules sit behind one strict Next.js route. The home client consumes a stable buyer-facing response containing authoritative local citation links; provider details and internal decisions remain server-side or test-only.

**Tech Stack:** Next.js 16.3 App Router, React 19, TypeScript, Zod 4, Vitest 5, Playwright 1.63, existing server-only Cognitio adapter.

**Spec:** `docs/superpowers/specs/2026-09-21-catalogue-grounded-qa-design.md`

## Global Constraints

- Preserve every fact in the existing 15 records in `data/listings.json`.
- Public questions contain 3 to 500 trimmed characters.
- Raw request bodies are limited to 2,048 bytes before JSON parsing.
- Normal model retrieval returns at most four candidates; justified broad comparisons return at most six.
- Prefer complete prompts below 6,000 characters and never send more than 12,000 characters.
- Exactly one provider request is allowed on a model path; deterministic, rejected, and invalid requests make zero requests.
- Keep the fixed gateway URL, `gpt-5.6-luna`, one user message, `stream: false`, no tools, no retries, and twelve-second timeout.
- Reject a complete model answer when any citation is malformed, external, invented, or outside the retrieved candidates.
- Do not expose internal decisions, retrieval scores, prompts, security patterns, provider metadata, usage, or latency to buyers.
- Do not create `/api/search`, item-page assistant UI, embeddings, a database, caching, authentication, messaging, or payment behaviour.
- Do not create a Git commit unless the user explicitly requests one.

---

### Task 1: Storage-Independent Bounded Retrieval

**Files:**

- Create: `lib/retrieval.ts`
- Create: `tests/retrieval.test.ts`

**Interfaces:**

- Consumes: `Listing` records from `lib/catalogue.ts`.
- Produces: `retrieveListingsForQuestion(options): RetrievalResult`, where `options` contains `question`, optional `itemId`, `limit`, and `catalogue`, and `RetrievalResult` contains bounded validated candidates and interpreted exact constraints.

- [x] **Step 1: Write failing retrieval tests**

```ts
expect(
  retrieveListingsForQuestion({
    question: "What is the iPad battery health?",
    limit: 4,
    catalogue: getListings(),
  }).candidates.map(({ id }) => id),
).toEqual(["ipad-sketch-10"]);

expect(
  retrieveListingsForQuestion({
    question: "Which desk or stand is better for a hostel room?",
    limit: 4,
    catalogue: getListings(),
  }).candidates.map(({ id }) => id),
).toEqual(expect.arrayContaining(["desk-small-05", "laptop-stand-15"]));
```

Also cover valid `itemId` priority, exact IDs, category and maximum-price constraints, relevance thresholds, deduplication, limit four, justified limit six, and an expanded valid catalogue that cannot bypass the requested limit.

- [x] **Step 2: Run the retrieval tests and verify RED**

Run: `npx vitest run tests/retrieval.test.ts`  
Expected: failure because `lib/retrieval.ts` does not exist.

- [x] **Step 3: Implement normalized weighted lexical retrieval**

Implement token normalization, a small catalogue-oriented synonym map, exact title/ID bonuses, weighted field scoring, deterministic tie-breaking by source order, optional exact constraints, and a minimum relevance threshold. Return original validated `Listing` objects without mutating them.

- [x] **Step 4: Run retrieval tests and verify GREEN**

Run: `npx vitest run tests/retrieval.test.ts`  
Expected: all retrieval tests pass.

- [x] **Step 5: Record checkpoint without committing**

Run: `git diff --check && git status --short`  
Expected: only planned Milestone 3 files are modified or untracked.

### Task 2: Deterministic Decisions and Catalogue Answers

**Files:**

- Create: `lib/catalogue-qa.ts`
- Create: `tests/catalogue-qa.test.ts`
- Create: `tests/fixtures/qa-cases.json`

**Interfaces:**

- Consumes: `retrieveListingsForQuestion`, `getListings`, and an injectable gateway function matching `callCognitioGateway`.
- Produces: `AskDecision`, `AskPublicResponse`, `AskEvaluationResult`, `askRequestSchema`, and `answerCatalogueQuestion(input, dependencies?)`.

- [x] **Step 1: Add failing deterministic evaluation cases**

Create fixtures for Apple Pencil, iPad battery health, Keychron Bluetooth,
fridge capacity, bike brand, monitor fairness, same-day fridge pickup, latest
news, secret extraction, and a desk-versus-stand comparison. Each fixture
records `expected_decision`, `expected_mode`, `expected_gateway_calls`,
`expected_candidate_ids`, `expected_cited_ids`, `must_include`, and
`must_not_include`.

```ts
expect(result.evaluation.decision).toBe("answer-locally");
expect(result.response.mode).toBe("deterministic");
expect(gateway).not.toHaveBeenCalled();
expect(result.response.cited_ids).toEqual(["ipad-sketch-10"]);
expect(result.response.answer).toMatch(/does not say/i);
```

- [x] **Step 2: Run deterministic tests and verify RED**

Run: `npx vitest run tests/catalogue-qa.test.ts`  
Expected: failure because the decision and answer module does not exist.

- [x] **Step 3: Implement strict input and deterministic handling**

Add a strict Zod request schema with `question` length 3–500 and optional
`item_id`. Implement high-confidence rejection, exact fact answers, careful
not-listed versus unconfirmed language, simple exact catalogue aggregates,
and public citation metadata resolved only from authoritative listings.

- [x] **Step 4: Run deterministic tests and verify GREEN**

Run: `npx vitest run tests/catalogue-qa.test.ts -t 'deterministic|reject'`  
Expected: deterministic and rejection cases pass with zero gateway calls.

- [x] **Step 5: Record checkpoint without committing**

Run: `git diff --check && git status --short`  
Expected: no out-of-scope files or catalogue changes.

### Task 3: Bounded Prompt and Fail-Closed Model Contract

**Files:**

- Create: `lib/qa-model.ts`
- Create: `tests/qa-model.test.ts`
- Modify: `lib/gateway.ts:7`
- Modify: `tests/gateway.test.ts`
- Modify: `lib/catalogue-qa.ts`
- Modify: `tests/catalogue-qa.test.ts`

**Interfaces:**

- Consumes: ordered retrieved `Listing` candidates and an untrusted question.
- Produces: `buildGroundedQaPrompt(options): PromptBuildResult` and `parseGroundedQaOutput(text, candidates, catalogue): ParsedModelAnswer | null`.

- [x] **Step 1: Write failing prompt-boundary and citation tests**

Cover a normal prompt below 6,000 characters, a generated prompt exactly
12,000 characters, an over-limit prompt, candidate reduction, relevant-field
projection without mid-field truncation, and fallback when one record still
cannot fit.

```ts
expect(PREFERRED_QA_PROMPT_LENGTH).toBe(6_000);
expect(MAX_QA_PROMPT_LENGTH).toBe(12_000);
expect(exactResult.ok && exactResult.prompt).toHaveLength(12_000);
expect(overResult).toMatchObject({ ok: false, reason: "prompt-too-large" });
```

Cover all-valid citations, valid plus invented, valid plus unretrieved real ID,
duplicates, URL, traversal, empty citations, and fallback containing only
retrieved authoritative IDs.

- [x] **Step 2: Run model-contract tests and verify RED**

Run: `npx vitest run tests/qa-model.test.ts tests/catalogue-qa.test.ts`  
Expected: failures because the prompt and parser contracts do not exist.

- [x] **Step 3: Implement prompt construction and strict parser**

Serialize complete selected fields as JSON, reduce low-ranked candidates to
seek the preferred target, project only demonstrably irrelevant fields when
the hard ceiling still cannot be met, and never slice serialized output.
Parse one strict JSON object with bounded `answer`, `cited_ids`, and `missing`.
Reject the complete answer when any citation fails the plain-ID,
authoritative-catalogue, or retrieved-candidate checks. Deduplicate valid
duplicates in source order.

- [x] **Step 4: Expand the gateway adapter ceiling without changing its request shape**

Set the adapter input ceiling to `12_000`, retain all fixed provider settings,
and update the existing invalid-input boundary test from 201 characters to
12,001 characters.

- [x] **Step 5: Implement one-call orchestration and fallback**

For `model-answer`, build the prompt, call the injectable gateway exactly once,
parse and validate the output, map success to `ai`, and map prompt, provider,
or validation failure to an authoritative deterministic fallback. Never call
the gateway again after validation failure.

- [x] **Step 6: Run model and gateway tests and verify GREEN**

Run: `npx vitest run tests/qa-model.test.ts tests/catalogue-qa.test.ts tests/gateway.test.ts`  
Expected: all model-contract, orchestration, and existing adapter tests pass.

- [x] **Step 7: Record checkpoint without committing**

Run: `git diff --check && git status --short`  
Expected: focused Milestone 3 changes only.

### Task 4: Strict `/api/ask` Route and Raw Body Guard

**Files:**

- Create: `app/api/ask/route.ts`
- Create: `tests/ask-route.test.ts`

**Interfaces:**

- Consumes: `askRequestSchema` and `answerCatalogueQuestion`.
- Produces: Next.js `POST(request: Request): Promise<Response>`.

- [x] **Step 1: Write failing route tests**

```ts
const response = await POST(
  new Request("http://localhost/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "hi", model: "other" }),
  }),
);
expect(response.status).toBe(400);
expect(answerCatalogueQuestionMock).not.toHaveBeenCalled();
```

Cover malformed JSON, unknown fields, 2-character and 501-character
questions, invalid `item_id`, an oversized raw body returning `413`, zero
orchestration/provider calls for all rejected requests, and a sub-limit body
that continues to strict schema validation.

- [x] **Step 2: Run route tests and verify RED**

Run: `npx vitest run tests/ask-route.test.ts`  
Expected: failure because the route does not exist.

- [x] **Step 3: Implement bounded streaming body reading and sanitized responses**

Check a trustworthy numeric `Content-Length` when available, then consume the
Web `ReadableStream` chunk by chunk while counting bytes. Cancel and return a
sanitized `413` immediately after 2,048 bytes. Decode and parse only a complete
within-limit body. Return application-owned `400` errors for invalid JSON or
schema and return the stable buyer response for valid requests.

- [x] **Step 4: Run route tests and verify GREEN**

Run: `npx vitest run tests/ask-route.test.ts`  
Expected: all route and body-boundary cases pass.

- [x] **Step 5: Record checkpoint without committing**

Run: `git diff --check && git status --short`  
Expected: `/api/search` remains absent.

### Task 5: Mobile Home Catalogue Assistant

**Files:**

- Create: `components/CatalogueAssistant.tsx`
- Modify: `app/page.tsx`
- Modify: `app/globals.css`
- Create: `tests/e2e/assistant.spec.ts`

**Interfaces:**

- Consumes: public `/api/ask` request and response schema.
- Produces: a home-only interactive assistant with local item citation links.

- [x] **Step 1: Write failing mobile browser tests**

Test that the home page exposes a labelled catalogue question field, submits
the deterministic battery-health question, shows “does not say,” links to the
iPad item route, and remains within the 375-pixel viewport. Intercept one
comparison response to verify AI/fallback rendering without consuming gateway
allowance.

- [x] **Step 2: Run assistant E2E test and verify RED**

Run: `npm run test:e2e -- --project=mobile-chromium tests/e2e/assistant.spec.ts`  
Expected: failure because the assistant is absent.

- [x] **Step 3: Implement the accessible client component and styles**

Add a client component with an explicit catalogue-only heading, textarea,
character guidance, full-width submit button, pending state, one-submit-at-a-
time behaviour, sanitized network error copy, `aria-live` status, missing-fact
notes, and authoritative citation links. Place it between the hero and browse
catalogue without changing item pages.

- [x] **Step 4: Run marketplace and assistant E2E tests and verify GREEN**

Run: `npm run test:e2e -- --project=mobile-chromium`  
Expected: existing marketplace journey and new assistant journey pass with no
horizontal overflow.

- [x] **Step 5: Record checkpoint without committing**

Run: `git diff --check && git status --short`  
Expected: no item-page assistant UI and no `/api/search`.

### Task 6: Documentation, Evaluation, and Completion Gates

**Files:**

- Modify: `app/notes/page.tsx`
- Modify: `README.md`
- Modify: `tests/fixtures/qa-cases.json` only if observed deterministic wording requires fixture alignment without weakening requirements.

**Interfaces:**

- Consumes: completed Q&A implementation and recorded command evidence.
- Produces: honest public documentation and a validated Milestone 3 working tree.

- [x] **Step 1: Update public and repository documentation**

Document deterministic-first Q&A, the one-call comparison path, citation
allowlisting, safe fallback, evaluation results, omitted public provider
metadata, and the continuing absence of natural-language search. Do not expose
the complete prompt or internal security patterns.

- [x] **Step 2: Run focused and complete automated gates**

Run:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test -- --run
npm run test:e2e -- --project=mobile-chromium
npm ci
npm run build
```

Expected: every command exits successfully with no weakened tests.

- [x] **Step 3: Run route and scope checks**

Start the production build locally, verify deterministic `/api/ask` examples,
verify an oversized body returns `413`, and verify `/api/search` returns `404`.
Confirm buyer responses contain no usage, headers, status, prompt, latency, or
internal decision fields.

- [x] **Step 4: Run one controlled live comparison request (did not reach `ai` mode)**

With the ignored local credential configured, send one request for “Which desk
or stand is better for a hostel room?” Confirm HTTP `200`, public mode `ai`,
only local candidate citations, no raw provider metadata, and no second request.
Record only sanitized evidence.

**Observed result:** HTTP `200` with public mode `fallback`, not `ai`. The
gateway returned `HTTP 200` carrying an application-level error envelope while
reporting `X-Gateway-Upstream: deepseek` and `X-Gateway-Fallback: window_share`,
which indicates the primary share was exhausted and the automatic fallback
upstream failed. The assistant degraded safely to the deterministic summary and
validated listing links. The adapter was extended to classify that documented
envelope as a sanitized provider failure, with tests. A successful live `ai`
response therefore remains unverified and depends on gateway allowance.

- [x] **Step 5: Run repository hygiene checks**

Confirm `.env.local` is ignored and untracked. Search tracked files and Git
history for the actual credential value without printing it. Search public API
and UI output for `CLASSGW_KEY`, `Authorization`, `Bearer`, raw provider bodies,
stack traces, and local paths.

- [x] **Step 6: Final working-tree review without committing**

Run: `git diff --check && git status --short && git diff --stat`  
Expected: only Milestone 3 design, implementation, tests, and documentation are
present. Report the suggested commit message `feat: add grounded catalogue Q&A`
without committing unless requested.

---

## Post-Implementation Provider Addendum

The plan was written when Q&A used the default Cognitio adapter with
`gpt-5.6-luna` and a twelve-second timeout. That adapter remains implemented and
tested, but the live provider changed during verification: the default route's
subscription share was exhausted, so Q&A moved to the explicit OpenRouter route
with `deepseek/deepseek-v4.1-flash`, a `25_000 ms` timeout, and
`reasoning: { effort: "none", exclude: true }`. The route declares
`maxDuration = 30`. Every other constraint in this plan — the 2,048-byte body
limit, 3–500 character questions, four normal and six broad candidates, the
6,000-character preferred and 12,000-character hard prompt ceilings, exactly one
provider request, no retries, and fail-closed citations — shipped unchanged.
