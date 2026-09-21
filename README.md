# Somapah Swap

Somapah Swap is a mobile-first second-hand marketplace demo for SUTD students.
It provides a validated 15-item catalogue, category filters, item detail pages,
a simulated reserve interaction, and an honest public `/notes` page. Milestone
2 adds a minimal server-only Cognitio gateway adapter and a temporary diagnostic
route; catalogue search and Q&A remain unimplemented.

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

Set `CLASSGW_KEY` in `.env.local` before making the deliberate gateway check.
The credential is read only by server code and must never use a `NEXT_PUBLIC_`
prefix.

## Temporary gateway check

`POST /api/model-check` exists only to verify the complete Next.js server path.
It is not linked from the marketplace and must be removed or disabled before
Milestone 3 is completed. In production it accepts only this exact input after
trimming:

```text
Reply with exactly: gateway connected
```

With the local server running, make the deliberate check once:

```bash
curl --request POST http://localhost:3000/api/model-check \
  --header 'Content-Type: application/json' \
  --data '{"input":"Reply with exactly: gateway connected"}'
```

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
8. Send one canonical request to the temporary production diagnostic route,
   record sanitized evidence, then remove or disable the route before
   completing Milestone 3.

## Current boundaries

- All listings are seeded in `data/listings.json`.
- Reserve is simulated and never contacts a seller or takes payment.
- The fixed-model Cognitio connection is implemented and locally verified.
- Production gateway verification is pending Vercel configuration and
  redeployment.
- Natural-language search, catalogue Q&A, grounding, reranking, and caching are
  not implemented.
