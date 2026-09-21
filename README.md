# Somapah Swap

Somapah Swap is a mobile-first second-hand marketplace demo for SUTD students.
This milestone provides a validated 15-item catalogue, category filters, item
detail pages, a simulated reserve interaction, and an honest public `/notes`
page.

## Requirements

- Node.js 20.9 or newer
- npm

## Local development

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`.

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
5. Keep the standard Next.js output settings. No `vercel.json`, database, or
   environment variables are required for this marketplace milestone.
6. Deploy, then verify `/`, `/notes`, valid item routes, and an invalid item
   route in a private browser window and at phone width.

## Current boundaries

- All listings are seeded in `data/listings.json`.
- Reserve is simulated and never contacts a seller or takes payment.
- Cognitio gateway integration, natural-language search, and catalogue Q&A are
  not implemented in this milestone.
