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
