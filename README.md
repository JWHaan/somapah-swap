# Somapah Swap

Somapah Swap is a mobile-first second-hand marketplace demo for SUTD students.
It provides a validated 15-item catalogue, category filters, item detail pages,
a simulated reserve interaction, and an honest public `/notes` page.

Milestone 3 adds a value-gated, catalogue-grounded assistant on the home page. Milestone 4 adds value-gated hybrid natural-language catalogue search: exact constraints and uniquely supported matches are deterministic, while fuzzy ordering may make at most one server-side model call. Search results are always authoritative local listing cards, and invalid model output falls back to deterministic catalogue matching.

## Requirements

- Node.js 20.9 or newer
- npm

## Local development

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

Set `CLASSGW_KEY` in the ignored `.env.local` file when exercising server-only
gateway code during local development. Provide the value only in that file or
in the Vercel environment settings; never commit it. The credential is read only
by server code and must never use a `NEXT_PUBLIC_` prefix.

## Validation

```bash
npm run format:check
npm run lint
npm run typecheck
npm test -- --run
npm run eval
npx playwright install chromium
npm run test:e2e -- --project=mobile-chromium
npm run build
```

`npm run eval` is the consolidated release evaluation. It runs deterministic and
mocked suites only — intent routing, Q&A decisions and grounding, missing facts,
search decisions and relevance, hard constraints, provider-call counts, ID and
citation validation, fallback, no-match, retrieval regressions, catalogue-growth
regressions, and the computed release metrics. It never contacts Cognitio,
OpenRouter, or any live model endpoint.

### Production

- Public URL: <https://somapah-swap.vercel.app>
- `/` — public homepage with the unified helper
- `/notes` — public assessment write-up
- `POST /api/search` — listing discovery
- `POST /api/ask` — catalogue questions

## Deploying to Vercel

1. Push the repository to GitHub with `main` as the default branch.
2. Import the repository into Vercel and confirm the detected framework is
   Next.js.
3. Keep the repository root (`./`) as the project root.
4. Use `npm ci` as the install command and `npm run build` as the build
   command.
5. Keep the standard Next.js output settings. No `vercel.json` or database is
   required.
6. Add `CLASSGW_KEY` as a server-side Vercel environment variable for
   Production and, if needed, Preview.
7. Deploy, then verify `/`, `/notes`, valid item routes, and an invalid item
   route in a private browser window and at phone width.

## Current boundaries

- All listings are seeded in `data/listings.json`.
- Reserve is simulated and never contacts a seller or takes payment.
- `POST /api/ask` answers catalogue questions. It rejects unknown fields and
  bodies over 2 KiB, and it never exposes provider metadata to the browser.
- `POST /api/search` accepts a bounded natural-language query. Deterministic
  constraints and uniquely supported catalogue matches make zero provider
  calls; fuzzy multi-candidate ordering makes at most one server-side call.
  Results contain validated IDs and short reasons, while the browser renders
  all product details from the local catalogue.
- The search provider uses the fixed OpenRouter route with
  `deepseek/deepseek-v4.1-flash`, `max_tokens: 300`, disabled reasoning, an
  8-second provider timeout, and a 12-second route `maxDuration`. Q&A keeps
  its separate 450-token, 25-second, and 30-second policy.
- Search provider failures, malformed output, invalid IDs, unsupported
  reasons, or hard-constraint violations degrade to a useful deterministic
  `keyword-fallback`. No-match is preferred to unrelated filler.
- Search retrieval is lexical with general study/workspace, cooling, and
  food-storage evidence profiles. Generic hostel, dorm, or small-room words
  do not by themselves make every dorm listing relevant. Multi-intent queries
  union the relevant profiles.
- The assistant appears on the home page only, but `/api/ask` already accepts an
  optional `item_id` so an item page can reuse it later without an API change.
- Q&A uses the gateway's explicit OpenRouter route with
  `deepseek/deepseek-v4.1-flash`. The GPT adapter is retained behind the same
  provider-independent interface in `lib/qa-provider.ts`.
- Deterministic questions make zero provider calls, and provider failures
  degrade to a grounded deterministic fallback.
- The model path makes at most one provider call and never retries. The
  OpenRouter request is cut off at 25 seconds, and `/api/ask` declares a
  30-second `maxDuration`, so a slow provider still resolves to the fallback
  inside the function limit.
- Upstream provider latency varies. An AI comparison can complete, or can
  time out and fall back, for the same question. The fallback is grounded and
  still links the relevant local listings.
- Natural-language search remains lexical plus optional one-call reranking; embeddings,
  caching, and authentication are not implemented.
- There is no distributed rate limiting. A public deployment could be called
  repeatedly, so request limits and per-IP throttling are a known production
  gap.
- Provider availability is not guaranteed. A model-backed comparison can time
  out and fall back to the deterministic summary.
- Calculator inclusion questions ("What comes with the calculator?") are
  answered deterministically from the authoritative `includes` field, citing
  only `calc-fx-07`.
- All 15 listings are seeded demonstration data. Reserve is simulated, no
  payment is taken, and no real seller is contacted.

## Catalogue Q&A architecture

`POST /api/ask` is deterministic-first:

1. The route reads a bounded raw body and rejects unknown fields.
2. A strict scope gate rejects off-topic, adversarial, and no-match questions.
3. Simple facts, explicit exclusions, and missing facts are answered in code.
4. Otherwise bounded lexical retrieval returns at most 4 candidates, or 6 for a
   justified broad comparison.
5. Only a question that needs comparison or explanation reaches the model, once.
6. Model output must be strict JSON, and every cited ID is checked against the
   retrieved candidate set before anything is shown.
7. Provider errors, malformed output, or a bad citation fall back to a grounded
   deterministic summary of the retrieved listings.

Fail-closed citations mean an invented, external, path-like, or unretrieved ID
invalidates the whole model answer rather than showing part of it.

Bounded retrieval is lexical: exact item context, title phrases, head nouns, and
explicit price or category constraints, with a relevance floor.

## One homepage control

The home page exposes a single control, "Find or ask about listings", instead of
separate search and question boxes. `lib/assistant-intent.ts` classifies the
wording locally with no model call:

- comparisons, question structures, and fact requests go to `POST /api/ask`;
- discovery wording, budgets, categories, and conditions go to `POST /api/search`;
- anything ambiguous defaults to search.

One submission reaches exactly one endpoint, the client never calls both, and it
never falls through from one to the other. Search results keep the category
chips and render authoritative cards; a grounded answer replaces the grid and
hides the chips. Clearing the control returns to the default catalogue.

Intent routing is deterministic local code with no model call. The helper is not
a chatbot: there is no conversation history, no stored questions, no message
bubbles, no regeneration control, and no multi-turn memory. Both routes keep
their own validation and provider policy, and this consolidation changed no
provider, model, endpoint, timeout, or token setting.

## Natural-language search architecture

`POST /api/search` is deterministic-first:

1. The route reads a bounded strict request body.
2. Deterministic parsing extracts category, condition, price operators,
   product concepts, pickup/meetup terms, accessories, and evidence-sensitive
   requirements.
3. Hard constraints are applied before retrieval.
4. Bounded lexical retrieval uses title, seller-note, pickup, meetup, includes,
   defects, and category evidence, with general study/workspace, cooling, and
   food-storage profiles. Negated phrases do not count as positive evidence.
5. The application decides whether deterministic results are sufficient. It
   never asks the model to classify whether it should be called.
6. Only fuzzy ordering among multiple plausible candidates reaches the model,
   once, with at most six candidates and a maximum of four returned results.
7. Model IDs and reasons are validated, hard constraints are reapplied, and
   product details are loaded from the local catalogue.
8. Provider or validation failure returns `keyword-fallback`; impossible or
   unsupported requests return `no-match` rather than unrelated filler.

### Milestone 4 live evidence before retrieval correction

One authorized local `POST /api/search` request used:

`something compact for studying in a small hostel room`

It returned HTTP 200 with `mode: "ai-reranked"`, internal decision
`"ai-rerank"`, exactly one provider request, approximately 1.55 seconds of
route latency, candidate IDs `desk-small-05`, `fan-hostel-01`, and
`fridge-mini-03`, and final IDs `desk-small-05` and `fan-hostel-01`. IDs,
reasons, and hard constraints validated, and no sensitive provider data was
exposed. This verified the complete live pipeline, but also exposed a lexical
purpose-matching weakness: study intent admitted a fan and fridge while
omitting `laptop-stand-15`; the model explicitly described the fan as not
study-related.

### Post-correction non-live evidence

The retrieval correction strengthened general study/workspace, laptop-raising,
cooling, and food-storage evidence, added multi-intent union behavior, and
rejects clearly self-negating model reasons. No second live request was made.
The post-correction behavior is established by deterministic and mocked tests,
not by a new provider observation. Dimensions, weight, and compactness remain
unknown unless a listing states them.

## Providers

Model calls are server-only and centralized:

| Module              | Provider            | Endpoint                          | Model                          |
| ------------------- | ------------------- | --------------------------------- | ------------------------------ |
| `lib/gateway.ts`    | Cognitio default    | `/v1/chat/completions`            | `gpt-5.6-luna`                 |
| `lib/openrouter.ts` | Cognitio OpenRouter | `/openrouter/v1/chat/completions` | `deepseek/deepseek-v4.1-flash` |

`lib/qa-provider.ts` selects the active provider, so switching back to the
verified GPT adapter is a one-line change. The public client cannot choose a
provider, model, endpoint, headers, token bound, reasoning settings, messages,
tools, or timeout.

The OpenRouter request fixes `max_tokens: 450` and disables reasoning with
`reasoning: { effort: "none", exclude: true }`, and the route declares
`maxDuration = 30` with a 25-second provider timeout.

### Observed live verification

One controlled request through `POST /api/ask` returned `mode: "ai"` with
`finish_reason: "stop"`, `345` input tokens, `238` completion tokens, `0`
reasoning tokens, and `583` total tokens in `3163 ms`. This is one measurement,
not a guarantee.

A separate production request for the same comparison retrieved the same two
listings but exceeded the 25-second provider timeout, so it returned
`mode: "fallback"` with zero retries and the same two validated citations. The
application is correct and safe in both outcomes; AI comparison is not
guaranteed to complete.

## Reviewer walkthrough

1. Open <https://somapah-swap.vercel.app> on a phone.
2. Confirm one helper input is visible; the old separate search and question
   boxes are gone.
3. Press **Dorm** and confirm six seeded listings.
4. Submit `fan under $30` — authoritative search cards appear, routed to
   `/api/search` only.
5. Submit `something to raise my laptop` — the laptop stand appears
   deterministically with no provider call.
6. Submit `gaming PC under $100` — a no-match state appears with no unrelated
   products.
7. Submit `Does the iPad include an Apple Pencil?` — a deterministic grounded
   answer.
8. Submit `What is the iPad health?` → use `What is the iPad battery health?` —
   the assistant states the listing does not say.
9. Optionally submit one grounded comparison: `Compare the folding desk and
laptop stand for a small hostel room.` This is the only step that may spend
   provider allowance, and it may fall back safely if the provider is slow.
10. Follow a cited listing link to its local `/item/[id]` page.
11. Trigger **Reserve (simulated)** and confirm the honest no-seller message.
12. Open `/notes` and review architecture, evaluation, resilience, and
    limitations.

Keep model-backed requests to at most one per review.

## Catalogue assistant API

```bash
curl -s http://localhost:3000/api/ask \
  -H 'Content-Type: application/json' \
  -d '{"question":"What is the iPad battery health?"}'
```

The response contains `answer`, `cited_ids`, `citations`, `missing`, `scope`,
and `mode`. `mode` is `deterministic`, `ai`, or `fallback`.
