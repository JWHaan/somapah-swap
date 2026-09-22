# Somapah Swap

Somapah Swap is a mobile-first second-hand marketplace demo for SUTD students.
It provides a validated 15-item catalogue, category filters, item detail pages,
a simulated reserve interaction, and an honest public `/notes` page.

Milestone 3 adds a value-gated, catalogue-grounded assistant on the home page.
Most questions are answered in code and never reach a model; comparisons make at
most one server-side call to a model provider, and every model citation is
validated against the retrieved listings before it is shown. Natural-language
search is still not implemented.

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
npx playwright install chromium
npm run test:e2e -- --project=mobile-chromium
npm run build
```

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
- Natural-language search, search reranking, embeddings, caching, and
  authentication are not implemented.
- There is no distributed rate limiting. A public deployment could be called
  repeatedly, so request limits and per-IP throttling are a known production
  gap.

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

## Catalogue assistant API

```bash
curl -s http://localhost:3000/api/ask \
  -H 'Content-Type: application/json' \
  -d '{"question":"What is the iPad battery health?"}'
```

The response contains `answer`, `cited_ids`, `citations`, `missing`, `scope`,
and `mode`. `mode` is `deterministic`, `ai`, or `fallback`.
