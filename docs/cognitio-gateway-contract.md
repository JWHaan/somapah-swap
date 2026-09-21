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

Expected generated-text path:

```text
choices[0].message.content
```

The exact successful response body must be captured and confirmed through a
sanitized Milestone 2 live request before relying on it without runtime
validation.

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

The exact non-streaming Chat Completions usage response fields must be
confirmed through the Milestone 2 live request.

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

- Exactly one gateway call per incoming verification request.
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
