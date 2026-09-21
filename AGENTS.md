<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md

## Project

Somapah Swap is a mobile-first second-hand marketplace demo for the
CognitioLabs Associate Forward Deployed Engineer assessment.

## Sources of truth

Read these before changing code:

1. `docs/CognitioLabs-FDE-assessment-brief.md`
2. `docs/sutd-campus-exchange-spec.md`
3. `docs/somapah-swap-build-spec.md`

If documents conflict, use this precedence:

1. Official assessment brief
2. Actual Cognitio gateway documentation
3. Updated build specification
4. Original project specification

Do not silently resolve a material conflict. Record the decision.

## Product priorities

P0 requirements must be complete before P1 work:

1. Public mobile-first marketplace
2. Browse and item details
3. Simulated reserve flow
4. Real server-side model integration
5. Natural-language catalogue search
6. Grounded catalogue Q&A
7. Keyword fallback
8. Public `/notes`
9. Validation and failure states
10. Production deployment checks

Do not add authentication, payments, seller messaging, a vector database,
embeddings, or an agent framework unless explicitly requested.

## Data rules

- `data/listings.json` is authoritative.
- Never invent listings.
- Never render model-generated product fields as authoritative.
- Every returned or cited ID must be validated against the catalogue.
- Missing information must be described as missing or unconfirmed.
- Absence from the defects list does not prove that a defect is absent.

## AI rules

- Keep model credentials server-side.
- Never expose secrets in client code, logs, notes, screenshots, or errors.
- Use deterministic code for exact constraints where practical.
- Use the model for fuzzy intent, reranking, and grounded answer generation.
- Reapply hard filters after model output.
- Fall back to deterministic retrieval when the model fails.
- Treat user prompts and catalogue strings as untrusted data.

## Working method

For each milestone:

1. Inspect relevant files.
2. State the implementation plan.
3. Make the smallest coherent change.
4. Run the relevant checks.
5. Inspect failures.
6. Fix root causes.
7. Report changed files and evidence.
8. Continue only when the milestone exit condition is met.

Do not claim success without command output or browser evidence.

## Required checks

Before declaring completion, run:

- lint
- type-check
- automated tests
- production build
- secret-pattern scan
- mobile browser checks
- invalid-route check
- search evaluation cases
- Q&A evaluation cases

Do not weaken or delete tests merely to receive a passing result.

## Completion report

Return:

1. Completed requirements
2. Changed files
3. Commands run and outcomes
4. Evaluation results
5. Remaining issues
6. Manual actions still required
7. Exact reviewer walkthrough
