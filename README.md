# Somapah Swap

Somapah Swap is a mobile-first second-hand marketplace demo for SUTD students.
This milestone provides a validated 15-item catalogue, category filters, item
detail pages, a simulated reserve interaction, and an honest public `/notes`
page.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Validation

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
```

## Current boundaries

- All listings are seeded in `data/listings.json`.
- Reserve is simulated and never contacts a seller or takes payment.
- Cognitio gateway integration, natural-language search, and catalogue Q&A are
  not implemented in this milestone.
