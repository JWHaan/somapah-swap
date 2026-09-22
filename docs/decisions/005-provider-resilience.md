# 005 — Provider integration and resilience

**Status:** Accepted
**Applies to:** `lib/openrouter.ts`, `lib/gateway.ts`, `lib/qa-provider.ts`, `lib/provider-support.ts`, `app/api/ask/route.ts`

## Context

Both AI paths depend on a shared external gateway whose latency and availability
are outside the application's control. During development the default
chat-completions route stopped returning usable text and began answering with an
automatic fallback upstream, and the first explicit route spent an entire
completion budget on model reasoning.

## Decision

Treat the provider as unreliable by design.

- One call per model-worthy request: no retries, no repair calls, no model or
  provider switching, no tools, and no conversation history.
- The request shape is fixed server-side: one user message, `stream: false`, and
  a bounded `max_tokens`. A client cannot select the provider, model, endpoint,
  headers, token budget, reasoning settings, tools, or timeout.
- Reasoning is disabled explicitly, because a numerical reasoning cap was
  accepted but not honoured by the upstream route.
- The provider timeout is a hard abort boundary, and the route's maximum
  duration is longer than that boundary so a slow provider still resolves.
- Every provider failure mode is normalized to a sanitized category. Raw
  messages, headers, credentials, prompts, and stack traces never reach the
  browser.
- Usage, upstream identity, and fallback category are retained internally only.

## Consequences

- Provider problems are visible as a degraded but usable experience.
- No automatic retry means latency cannot compound and shared allowance cannot be
  spent unpredictably.
- Provider availability remains a genuine limitation, documented rather than
  hidden: a comparison can succeed or safely fall back for the same question.
