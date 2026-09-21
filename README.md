# Somapah Swap

Somapah Swap is a mobile-first second-hand marketplace demo for SUTD students.
It provides a validated 15-item catalogue, category filters, item detail pages,
a simulated reserve interaction, and an honest public `/notes` page. Milestone
2 adds a server-only Cognitio gateway adapter that was verified locally and
through Vercel. The temporary diagnostic route used for verification has been
removed; catalogue search and Q&A remain unimplemented.

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
gateway code during local development. The credential is read only by server
code and must never use a `NEXT_PUBLIC_` prefix.

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
- The fixed-model Cognitio connection is implemented and verified locally and
  through the production Vercel deployment.
- The temporary verification route has been removed and no public model API is
  exposed by this milestone.
- Natural-language search, catalogue Q&A, grounding, reranking, and caching are
  not implemented.
