# Somapah Swap

A mobile-first second-hand marketplace for SUTD students, with deterministic
catalogue search and bounded, grounded AI assistance.

**Production:** <https://somapah-swap.vercel.app>

## Why this exists

SUTD students buy and sell used course, dorm, and tech gear in scattered group
chats. Listings are hard to search, sellers repeat the same answers, and buyers
cannot tell whether a detail is unknown or simply missing from the post.

Somapah Swap is a small, focused answer to that: 15 seeded campus listings with
search, item detail, a simulated reservation, and a catalogue assistant that
answers only from the listing data. The assistant is built so that most questions
never reach a model, and the ones that do are validated before anything is shown.

## What buyers can do

- Browse 15 seeded listings, one column on a phone.
- Filter by category: all, course, dorm, tech.
- Search in natural language, for example `fan under $30`.
- Ask grounded catalogue questions, for example `Does the iPad include an Apple Pencil?`.
- Ask for comparisons, for example `Compare the folding desk and laptop stand for a small hostel room.`
- Open an item to read condition, defects, pickup, meetup window, and seller note.
- Simulate a reservation. Nothing is charged and no seller is contacted.

## How the catalogue helper works

One input handles both listing discovery and catalogue questions. Local code
decides which server endpoint a request belongs to; no model is used to classify
it.

```text
input
  → local intent routing            (no model call)
  → deterministic handling          (no model call)
  → bounded retrieval
  → optional single model call
  → validation
  → authoritative UI
```

- **Deterministic first.** Scope rejection, exact facts, known gaps, price and
  category filters, and no-match are handled in code.
- **One call when it counts.** A comparison or fuzzy ranking makes at most one
  provider request, with no retries and no repair calls.
- **Authoritative records only.** Search results are rendered from
  `data/listings.json` by ID. Model output can select and explain listings; it can
  never create or rewrite one.
- **Fail-closed validation.** Every returned and cited ID must exist in the
  catalogue and inside the retrieved candidate set. A single invented, malformed,
  or out-of-set citation discards the whole answer.
- **Grounded fallback.** If the provider times out, errors, or returns unusable
  output, the assistant returns a deterministic summary of the relevant listings
  instead of an error or a guess.

## Architecture

Next.js App Router with TypeScript, deployed on Vercel.

| Concern        | Implementation                                                       |
| -------------- | -------------------------------------------------------------------- |
| Catalogue      | `data/listings.json`, validated with Zod at import                   |
| Intent routing | Local string analysis in `lib/assistant-intent.ts`                   |
| Search         | Lexical retrieval plus optional one-call rerank                      |
| Q&A            | Deterministic answer path plus optional one-call grounded generation |
| Provider       | Server-only adapters behind the Cognitio gateway                     |
| Tests          | Vitest for logic and routes, Playwright for the browser              |

Both API routes validate strict request schemas, bound the raw body before
parsing, and return sanitized errors. No provider module is reachable from client
code. Full detail is in [`docs/architecture.md`](docs/architecture.md), and design
rationale is recorded in [`docs/decisions/`](docs/decisions/).

## Local setup

```bash
npm ci
cp .env.example .env.local
npm run dev
```

`.env.local` holds the server-side gateway credential:

```text
CLASSGW_KEY=
```

Set a real value locally or in the Vercel project settings. The variable is read
only by server code, is never sent to the browser, and must not use a
`NEXT_PUBLIC_` prefix. Deterministic search and Q&A work without it; only the
model-backed paths need it.

## Validation

```bash
npm run format:check
npm run lint
npm run typecheck
npm test -- --run
npm run eval
npm run build
npm run test:e2e -- --project=mobile-chromium
```

`npm run eval` is the consolidated evaluation: deterministic and mocked suites
only, no provider contact.

## Evaluation summary

Current local verification:

- 519 unit tests across 22 files.
- 71 Playwright tests in one mobile project.
- 241 evaluation tests across 11 files.
- 30 Q&A fixtures, 27 search fixtures, and 20 intent-routing fixtures, all passing.
- 81.5 percent of search fixtures resolve deterministically with zero provider
  calls; 18.5 percent are model-worthy and make exactly one call.
- Missing-fact accuracy, no-match accuracy, off-topic rejection, fallback
  correctness, and invalid-ID and invalid-citation rejection all measure 100
  percent across their fixtures.

Fixture design and the full metric table are in
[`docs/evaluation.md`](docs/evaluation.md).

## Seeded and simulated boundaries

- All 15 listings are seeded demonstration records.
- Reservation is simulated: no payment, no seller contact, no real hold.
- Availability is whatever the seller wrote. Nothing is live.
- There are no accounts, no messaging, and no payment flow.

## Known limitations

- Retrieval is lexical and tuned for this 15-record catalogue. A larger catalogue
  would need database-backed retrieval.
- Provider availability is not guaranteed. A comparison can time out and return
  the deterministic fallback for the same question that previously succeeded.
- There is no persistent distributed rate limiting, so a public deployment could
  be called repeatedly.
- The assistant covers the seeded catalogue only. Off-catalogue questions are
  declined rather than answered.
- Automated browser checks run at 375 CSS pixels. A physical-phone check is still
  a manual step.

## Reviewer walkthrough

1. Open the production URL on a phone.
2. Confirm there is one catalogue input and a category filter.
3. Select **Dorm** and confirm six seeded listings.
4. Enter `fan under $30` and confirm an authoritative listing card.
5. Enter `something to raise my laptop` and confirm the laptop stand appears
   without a model call.
6. Enter `gaming PC under $100` and confirm an honest no-match state.
7. Enter `Does the iPad include an Apple Pencil?` and confirm a deterministic answer.
8. Enter `What is the iPad battery health?` and confirm the assistant says the
   listing does not say.
9. Optionally enter one comparison such as `Compare the folding desk and laptop
stand for a small hostel room.` This is the only step that may use provider
   allowance, and it may fall back safely.
10. Follow a cited listing into its detail page and simulate a reservation.
11. Open `/notes` for the implementation narrative, evaluation, and limitations.

## Notes on AI usage

The product uses AI where language reasoning adds value: fuzzy ranking and
grounded comparisons. Everything else is deterministic. The implementation
narrative, including what did not work and what remains unfinished, is on the
public `/notes` page.

There is no license file in this repository.
