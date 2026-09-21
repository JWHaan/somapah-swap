# Cognitio Gateway Contract

## Source

Gateway Console documentation accessed on September 21, 2026.

This file contains sanitized integration documentation only. It does not
contain the gateway key, console password, cookies, or authorization values.

## Selected Application Interface

The application uses the documented OpenAI-compatible Chat Completions
endpoint intended for tools and scripts that are not Codex.

## Base URL

```text
https://174.138.16.223
```

## Endpoint

```text
/v1/chat/completions
```

## Full Request URL

```text
https://174.138.16.223/v1/chat/completions
```

## HTTP Method

```text
POST
```

## Authentication

### Header

```text
Authorization
```

### Scheme

```text
Bearer
```

### Environment Variable

```text
CLASSGW_KEY
```

The actual value is stored only in ignored local and Vercel environment
configuration.

The forwarding routes also document support for `x-api-key` and `api-key`,
but this application uses Bearer authentication consistently.

## Initial Model

```text
gpt-5.6-luna
```

`gpt-5.6-luna` was available during both the local and production Vercel
verification requests on September 21, 2026.

Other documented permitted models include:

```text
gpt-5.6-sol
gpt-5.6-terra
gpt-6astra
```

Availability depends on the upstream subscription tier. Bare `gpt-5.6` is
not valid.

## Required Headers

```text
Authorization: Bearer <REDACTED>
Content-Type: application/json
```

## Request Body

```json
{
  "model": "gpt-5.6-luna",
  "messages": [
    {
      "role": "user",
      "content": "Reply with exactly: gateway connected"
    }
  ],
  "stream": false
}
```

The documented endpoint supports:

- `model`: required string beginning with `gpt-`
- `messages`: required standard chat-message array
- `stream`: optional boolean
- `tools`: optional function-tool array

No tools are used by this application.

## Successful Response

The endpoint is documented as OpenAI-compatible.

The September 21, 2026 local and production Milestone 2 verifications confirmed
the generated-text path:

```text
choices[0].message.content
```

The application still validates this path at runtime and does not expose the
raw provider response.

## Structured Output

```text
Not documented for /v1/chat/completions.
```

The application must not assume native JSON Schema support. Later structured
responses should be validated in the application.

## Output-Token Control

```text
Not explicitly documented for /v1/chat/completions.
```

No undocumented token-limit field should be added during the initial
verification request.

## Usage Reporting

The gateway records input and output token usage from upstream responses.

### Raw Provider Fields

The server-only adapter confirmed these numeric fields in the raw
OpenAI-compatible provider response:

```text
usage.prompt_tokens
usage.completion_tokens
usage.total_tokens
```

### Temporary Application Normalization

The temporary application verification response normalized the raw fields as
follows:

```text
usage.prompt_tokens     -> usage.input_tokens
usage.completion_tokens -> usage.output_tokens
usage.total_tokens      -> usage.total_tokens
```

The raw gateway response used `prompt_tokens` and `completion_tokens`; it did
not establish raw `input_tokens` or `output_tokens` fields.

## Streaming

```text
Supported.
```

The gateway supports SSE streaming. When the client requests a non-streamed
response, the gateway still streams upstream internally and returns one
plain JSON response after the final usage data arrives.

Milestone 2 uses:

```json
{
  "stream": false
}
```

Both verified requests used `stream: false` and returned a normal JSON
response. The production request reached `POST /v1/chat/completions` through
the deployed Vercel server route.

## Limits

### Allowed Model Prefix

```text
gpt-
```

### Concurrency

```text
Capped per student. The quota example reports max_concurrent: 2.
The actual account quota should be treated as authoritative.
```

### Hourly Requests

```text
Account-specific. Check the candidate dashboard.
```

### Weekly Allowance

```text
Rolling subscription-share allowance. Account-specific.
```

### Context Limit

```text
Not documented.
```

### Maximum Output

```text
Not documented.
```

### Timeout

```text
Not documented.
```

The application will enforce its own bounded timeout.

Milestone 2 uses a 12-second application timeout with no retry.

## Error Behaviour

### Missing Authentication

Possible status:

```text
401 or 403
```

Example:

```json
{
  "detail": "missing Bearer token"
}
```

### Invalid or Revoked Key

```text
403
```

Example:

```json
{
  "detail": "invalid key"
}
```

### Invalid Request or Unsupported Model

```text
400
```

Upstream errors may be passed through with their original status and body.

### Rate Limit or Concurrency

```text
429
```

A gateway-generated forwarding error may use:

```json
{
  "type": "error",
  "error": {
    "type": "rate_limit_error",
    "message": "<provider message>"
  }
}
```

The response may include `Retry-After`.

### Provider Unavailable

```text
503
```

This may indicate that the gateway has no upstream account configured or
cannot read the upstream allowance.

### Gateway Forwarding Error

```json
{
  "type": "error",
  "error": {
    "type": "<error type>",
    "message": "<message>"
  }
}
```

### Upstream Error

Upstream errors may be passed through unchanged.

The application must normalize these errors and must not return raw provider
details to public clients.

## Fallback Headers

The gateway may automatically switch to DeepSeek when the Codex share is
exhausted.

Relevant response headers:

```text
X-Gateway-Upstream
X-Gateway-Fallback
```

The server may record sanitized values from these headers for observability.
They must not be treated as secrets.

## Health Check

```text
GET https://174.138.16.223/healthz
```

No authentication is required.

The health check verifies gateway reachability only. It does not validate a
student key or model permission.

## Application Consumption Rules

- Exactly one gateway call per accepted adapter invocation.
- No tools.
- No agent loop.
- No conversation history.
- No unbounded retries.
- No parallel model requests.
- Server-side key only.
- Bounded input length.
- Application-enforced timeout.
- Safe provider-error normalization.
- Token usage captured when exposed by the provider response.
- Request latency recorded.
- Model output validated before use.

## Sanitized Verification Evidence

### Local

One deliberate request was sent through the local Next.js
`POST /api/model-check` route on September 21, 2026.

- HTTP status: `200`
- Selected model: `gpt-5.6-luna`
- Sanitized generated text: `gateway connected`
- Application-measured latency: approximately `1.6 seconds`
- Input tokens: `22`
- Output tokens: `6`
- Total tokens: `28`
- Sanitized upstream identifier: unavailable
- Sanitized fallback category: unavailable
- Provider requests: exactly one
- Retries: none

The public response contained only `ok`, `response`, `model`, `latency_ms`,
`usage`, `upstream`, and `fallback`. No credential, authorization value, raw
provider response, request identifier, complete response headers, stack trace,
or local path was recorded.

### Production

One deliberate request was sent through the deployed Vercel server route on
September 21, 2026.

- HTTP status: `200`
- Selected model: `gpt-5.6-luna`
- Sanitized generated text: `gateway connected`
- Observed application latency: `4058 milliseconds` (approximately `4.1 seconds`)
- Normalized `usage.input_tokens`: `22`
- Normalized `usage.output_tokens`: `6`
- Normalized `usage.total_tokens`: `28`
- `X-Gateway-Upstream`: unavailable
- `X-Gateway-Fallback`: unavailable

These counts and the latency are one observed verification result, not a
guarantee for future requests. No credential, authorization value, raw provider
payload, request identifier, complete response headers, stack trace, or local
path was recorded.

## Temporary Diagnostic Route Lifecycle

The temporary application diagnostic route was removed after successful local
and production verification. It was not reused as a search or Q&A endpoint, and
Milestone 2 exposes no public model route.

## Explicit OpenRouter Interface

### Why It Exists

During Milestone 3 the default Chat Completions route stopped returning usable
generated text. A controlled live request received:

- HTTP status: `200`
- `X-Gateway-Upstream`: `deepseek`
- `X-Gateway-Fallback`: `window_share`
- response body: an application-level error envelope instead of `choices`

The gateway was automatically falling back because the primary subscription
share was exhausted, and that fallback upstream returned an error. The body was
an HTTP `200` response, so the application classified it as an invalid provider
response and degraded safely.

The console also documents an explicit OpenRouter interface with a separate
budget. Catalogue Q&A therefore uses that explicit route instead of relying on
the automatic fallback.

### Base URL

```text
https://174.138.16.223/openrouter/v1
```

### Endpoint

```text
/chat/completions
```

### Full Request URL

```text
https://174.138.16.223/openrouter/v1/chat/completions
```

### Authentication

The same `CLASSGW_KEY` credential is used with `Authorization: Bearer`. No
separate OpenRouter key is required or configured.

### Selected Model

```text
deepseek/deepseek-v4.1-flash
```

### Request Body

```json
{
  "model": "deepseek/deepseek-v4.1-flash",
  "messages": [
    {
      "role": "user",
      "content": "<server-built grounded prompt>"
    }
  ],
  "stream": false,
  "max_tokens": 450,
  "reasoning": {
    "effort": "none",
    "exclude": true
  }
}
```

The application sends exactly one user message, no tools, no functions, no
conversation history. The request uses fixed server-side reasoning controls.

### Completion And Reasoning Bounds

| Setting             | Value    | Purpose                                   |
| ------------------- | -------- | ----------------------------------------- |
| `max_tokens`        | `450`    | Total completion budget                   |
| `reasoning.effort`  | `"none"` | Disables reasoning consumption            |
| `reasoning.exclude` | `true`   | Omits reasoning content from the response |

#### Why These Values Changed

The first explicit OpenRouter live check used a `300`-token completion budget
with no reasoning controls. The model spent that entire budget on internal
reasoning and returned `finish_reason: "length"` with no visible answer text,
so the application rejected the empty answer and returned the grounded
deterministic fallback.

`max_tokens` is treated as the total completion budget, covering both reasoning
and visible output where the upstream provider applies that behaviour.
`reasoning.effort` and `reasoning.max_tokens` are never sent together.

#### Why The Control Changed

A `reasoning.max_tokens: 64` cap was accepted with HTTP 200 but not honoured.
Usage metadata attributed all `450` completion tokens to reasoning, the finish
reason was `length`, and no visible content was produced. Because the numerical
cap did not bound consumption on this route, explicit
`reasoning.effort: "none"` disablement replaced it.

`reasoning.exclude: true` only omits reasoning content from the response; it does
not by itself reduce reasoning consumption. `reasoning.effort: "none"` is the
control that disables consumption.

The total completion budget remains bounded at `450` tokens, and the settings
apply only to the fixed server-side catalogue Q&A provider. The public client
cannot select or override the model, token bound, reasoning settings, provider,
endpoint, headers, messages, tools, or timeout.

### Reasoning Output

Reasoning content is never forwarded to the browser, never stored in a public
response, and never written to logs. Only token counts are retained internally
when the provider reports them.

### Timeout And Route Duration

| Setting                 | Value    | Scope                          |
| ----------------------- | -------- | ------------------------------ |
| `OPENROUTER_TIMEOUT_MS` | `25_000` | OpenRouter Q&A adapter only    |
| `maxDuration`           | `30`     | `app/api/ask/route.ts`         |
| `GATEWAY_TIMEOUT_MS`    | `12_000` | Default GPT adapter, unchanged |

The OpenRouter timeout was raised from twelve seconds after live evidence: a
controlled request reached the existing twelve-second abort boundary at
approximately `12,051 ms` without receiving a provider response. The abort
remains a hard boundary, and the request still makes exactly one provider call
with no retry, no automatic second attempt, and no provider or model switching.

The route declares a `30`-second maximum duration, leaving roughly five seconds
of headroom for request validation, catalogue retrieval, prompt construction,
provider-response parsing, model-output validation, citation validation, and
response serialization. The application-level provider timeout always remains
shorter than the route maximum duration. No `vercel.json` is needed.

The verified GPT adapter keeps its own twelve-second timeout and is unaffected
by the OpenRouter value; the two adapters configure their bounds independently.

### Response Handling

The endpoint is OpenAI-compatible. The application validates at runtime:

- `choices` is an array
- `choices[0]` exists
- `choices[0].message` exists
- `choices[0].message.content` is a non-empty string
- usage counts are numeric when present

Usage normalization matches the default route:

```text
usage.prompt_tokens     -> usage.inputTokens
usage.completion_tokens -> usage.outputTokens
usage.total_tokens      -> usage.totalTokens
```

When the provider reports it, the reasoning token count is also retained
internally:

```text
usage.completion_tokens_details.reasoning_tokens -> usage.reasoningTokens
```

### Error Handling

Because an HTTP `200` response can still carry an application-level error, the
adapter inspects the body for an `error` object and classifies it as a sanitized
rate-limit, authentication, budget, or generic provider failure. Status-based
mapping covers `400`, `401`, `402`, `403`, `404`, `429`, and `5xx`.

Raw provider messages, request identifiers, headers, and credentials are never
returned to the browser.

### Live Verification

Recorded separately in `app/notes/page.tsx` after the Milestone 3 controlled
request. Only sanitized fields are retained: provider, model, status, candidate
IDs, cited IDs, latency, normalized token usage, and grounding assessment.

### Preserved Default Route

The original `POST /v1/chat/completions` integration with model
`gpt-5.6-luna` remains implemented and tested in `lib/gateway.ts`. It is
reachable through the provider-independent selection point in
`lib/qa-provider.ts`, so the application can switch back by changing one
constant once the subscription share recovers.

### Live Verification Record

One controlled request was made through `POST /api/ask` on 21 September 2026
after the reasoning control change.

Request: compare the folding desk and laptop stand for a small hostel room.

| Field                 | Observed value                                               |
| --------------------- | ------------------------------------------------------------ |
| HTTP status           | `200`                                                        |
| Public mode           | `ai`                                                         |
| Provider              | `openrouter`                                                 |
| Model                 | `deepseek/deepseek-v4.1-flash`                               |
| Candidate IDs         | `desk-small-05`, `laptop-stand-15`                           |
| Cited IDs             | `desk-small-05`, `laptop-stand-15`                           |
| Finish reason         | `stop`                                                       |
| Route latency         | `3163 ms`                                                    |
| Provider latency      | `3119 ms`                                                    |
| Input tokens          | `345`                                                        |
| Completion tokens     | `238`                                                        |
| Reasoning tokens      | `0`                                                          |
| Visible output tokens | `238`                                                        |
| Total tokens          | `583`                                                        |
| Grounding result      | Accepted; every citation validated against the retrieved set |

Reasoning disablement was honoured on this route: the finish reason was `stop`,
reasoning tokens were `0`, and the completion budget produced a visible
structured answer instead of being consumed by reasoning.

This is one observed measurement, not a guarantee for future requests. No
credential, Authorization value, raw provider payload, reasoning text, request
identifier, account detail, internal prompt, or local path was recorded.
