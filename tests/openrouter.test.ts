import { readFile } from "node:fs/promises";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  OPENROUTER_MAX_TOKENS,
  OPENROUTER_MODEL,
  OPENROUTER_REASONING_EXCLUDE,
  OPENROUTER_REASONING_EFFORT,
  OPENROUTER_TIMEOUT_MS,
  OPENROUTER_URL,
  callOpenRouterGateway,
} from "../lib/openrouter";

const testKey = ["test", "openrouter", "credential"].join("-");

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("explicit OpenRouter adapter", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("CLASSGW_KEY", testKey);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("retains the Next.js server-only boundary", async () => {
    const source = await readFile(
      new URL("../lib/openrouter.ts", import.meta.url),
      "utf8",
    );

    expect(source.startsWith('import "server-only";')).toBe(true);
  });

  it("sends exactly one bounded, non-streaming user message to the fixed endpoint", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: "grounded answer" } }],
      }),
    );

    const result = await callOpenRouterGateway("compare two listings");

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      OPENROUTER_URL,
      expect.objectContaining({ method: "POST" }),
    );

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(requestInit.headers);
    const body = JSON.parse(String(requestInit.body)) as Record<
      string,
      unknown
    >;

    expect(OPENROUTER_URL).toBe(
      "https://174.138.16.223/openrouter/v1/chat/completions",
    );
    expect(OPENROUTER_MODEL).toBe("deepseek/deepseek-v4.1-flash");
    expect(OPENROUTER_MAX_TOKENS).toBe(450);
    expect(OPENROUTER_REASONING_EFFORT).toBe("none");
    expect(OPENROUTER_REASONING_EXCLUDE).toBe(true);
    expect(headers.get("Authorization")).toBe(`Bearer ${testKey}`);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(body).toEqual({
      model: "deepseek/deepseek-v4.1-flash",
      messages: [{ role: "user", content: "compare two listings" }],
      stream: false,
      max_tokens: 450,
      reasoning: { effort: "none", exclude: true },
    });
    expect(
      (body.reasoning as Record<string, unknown>).max_tokens,
    ).toBeUndefined();
    expect(body.reasoning).not.toHaveProperty("max_tokens");
    expect(body.reasoning).not.toHaveProperty("enabled");
    expect(body).not.toHaveProperty("tools");
    expect(body).not.toHaveProperty("functions");
    expect(body).not.toHaveProperty("response_format");
    expect(body).not.toHaveProperty("reasoning_effort");
    expect(body.messages).toHaveLength(1);
  });

  it("sends exactly one string prompt, so callers cannot override fixed settings", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: "grounded answer" } }],
      }),
    );

    await callOpenRouterGateway("compare two listings");

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(requestInit.body)) as Record<
      string,
      unknown
    >;

    expect(callOpenRouterGateway).toHaveLength(1);
    expect(body.model).toBe(OPENROUTER_MODEL);
    expect(body.max_tokens).toBe(450);
    expect(body.reasoning).toEqual({ effort: "none", exclude: true });
  });

  it("treats a length-truncated empty answer as an invalid provider response", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        choices: [
          {
            finish_reason: "length",
            message: {
              role: "assistant",
              content: null,
              reasoning: "internal",
            },
          },
        ],
        usage: {
          prompt_tokens: 400,
          completion_tokens: 450,
          total_tokens: 850,
        },
      }),
    );

    const result = await callOpenRouterGateway("compare two listings");

    expect(result).toMatchObject({
      ok: false,
      error: { code: "PROVIDER_INVALID_RESPONSE" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never forwards reasoning content from a successful response", async () => {
    const reasoningText = "secret chain of thought about CLASSGW_KEY";
    fetchMock.mockResolvedValue(
      jsonResponse({
        choices: [
          {
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: "grounded answer",
              reasoning: reasoningText,
              reasoning_details: [{ text: reasoningText }],
            },
          },
        ],
      }),
    );

    const result = await callOpenRouterGateway("compare two listings");
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({ ok: true, response: "grounded answer" });
    expect(serialized).not.toContain(reasoningText);
    expect(serialized).not.toContain("chain of thought");
    expect(serialized).not.toContain("CLASSGW_KEY");
    expect(result).not.toHaveProperty("reasoning");
  });

  it("normalizes provider usage fields", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: "grounded answer" } }],
        usage: {
          prompt_tokens: 321,
          completion_tokens: 45,
          total_tokens: 366,
        },
      }),
    );

    const result = await callOpenRouterGateway("compare two listings");

    expect(result).toMatchObject({
      ok: true,
      response: "grounded answer",
      model: OPENROUTER_MODEL,
      usage: {
        inputTokens: 321,
        outputTokens: 45,
        totalTokens: 366,
      },
    });
    expect(result.latencyMs).toEqual(expect.any(Number));
  });

  it("captures reasoning tokens from usage metadata without exposing them", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: "grounded answer" } }],
        usage: {
          prompt_tokens: 321,
          completion_tokens: 120,
          total_tokens: 441,
          completion_tokens_details: { reasoning_tokens: 64 },
        },
      }),
    );

    const result = await callOpenRouterGateway("compare two listings");

    expect(result).toMatchObject({
      ok: true,
      usage: {
        inputTokens: 321,
        outputTokens: 120,
        totalTokens: 441,
        reasoningTokens: 64,
      },
    });
  });

  it("omits reasoning token counts when the provider does not report them", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: "grounded answer" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    );

    const result = await callOpenRouterGateway("compare two listings");

    expect(result.ok && result.usage).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    });
  });

  it("ignores non-numeric usage fields", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: "grounded answer" } }],
        usage: { prompt_tokens: "321", completion_tokens: null },
      }),
    );

    const result = await callOpenRouterGateway("compare two listings");

    expect(result).toMatchObject({ ok: true, usage: null });
  });

  it("fails safely without configuration and makes no provider request", async () => {
    vi.stubEnv("CLASSGW_KEY", "");

    const result = await callOpenRouterGateway("compare two listings");

    expect(result).toMatchObject({
      ok: false,
      error: { code: "CONFIGURATION_ERROR" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("CLASSGW_KEY");
  });

  it.each(["", "   ", "x".repeat(12_001)])(
    "rejects invalid adapter input without fetching",
    async (input) => {
      const result = await callOpenRouterGateway(input);

      expect(result).toMatchObject({
        ok: false,
        error: { code: "INVALID_REQUEST" },
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    null,
    {},
    { choices: null },
    { choices: [] },
    { choices: [{}] },
    { choices: [{ message: null }] },
    { choices: [{ message: {} }] },
    { choices: [{ message: { content: 42 } }] },
    { choices: [{ message: { content: "" } }] },
    { choices: [{ message: { content: "   " } }] },
  ])("rejects malformed successful provider output", async (body) => {
    fetchMock.mockResolvedValue(jsonResponse(body));

    const result = await callOpenRouterGateway("compare two listings");

    expect(result).toMatchObject({
      ok: false,
      error: { code: "PROVIDER_INVALID_RESPONSE" },
    });
  });

  it("rejects invalid JSON from a successful provider response", async () => {
    fetchMock.mockResolvedValue(
      new Response("not-json", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await callOpenRouterGateway("compare two listings");

    expect(result).toMatchObject({
      ok: false,
      error: { code: "PROVIDER_INVALID_RESPONSE" },
    });
  });

  it("rejects an HTTP 200 error envelope without exposing its message", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        type: "error",
        error: {
          type: "forwarding_error",
          message: "raw upstream detail mentioning CLASSGW_KEY and Bearer",
        },
      }),
    );

    const result = await callOpenRouterGateway("compare two listings");
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "PROVIDER_UNAVAILABLE" },
    });
    expect(serialized).not.toContain("raw upstream detail");
    expect(serialized).not.toContain("CLASSGW_KEY");
    expect(serialized).not.toContain("Bearer");
  });

  it("classifies a budget refusal as a sanitized budget failure", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            type: "budget_exceeded",
            message: "insufficient credits with CLASSGW_KEY",
          },
        }),
        { status: 402, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await callOpenRouterGateway("compare two listings");
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "PROVIDER_BUDGET_EXHAUSTED" },
    });
    expect(serialized).not.toContain("insufficient credits");
    expect(serialized).not.toContain("CLASSGW_KEY");
  });

  it.each([
    [400, "PROVIDER_BAD_REQUEST"],
    [401, "PROVIDER_AUTH_ERROR"],
    [403, "PROVIDER_AUTH_ERROR"],
    [404, "PROVIDER_ROUTE_ERROR"],
    [429, "PROVIDER_RATE_LIMITED"],
    [500, "PROVIDER_UNAVAILABLE"],
    [502, "PROVIDER_UNAVAILABLE"],
    [503, "PROVIDER_UNAVAILABLE"],
    [418, "PROVIDER_UNAVAILABLE"],
  ] as const)(
    "normalizes provider status %i without exposing its body",
    async (status, code) => {
      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({
            detail:
              "raw provider failure with CLASSGW_KEY and Authorization data",
          }),
          { status, headers: { "Content-Type": "application/json" } },
        ),
      );

      const result = await callOpenRouterGateway("compare two listings");
      const serialized = JSON.stringify(result);

      expect(result).toMatchObject({ ok: false, error: { code } });
      expect(serialized).not.toContain("raw provider failure");
      expect(serialized).not.toContain("CLASSGW_KEY");
      expect(serialized).not.toContain("Authorization");
    },
  );

  it("maps a network failure without exposing the thrown message", async () => {
    fetchMock.mockRejectedValue(
      new Error("network failed with Authorization and CLASSGW_KEY"),
    );

    const result = await callOpenRouterGateway("compare two listings");
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "PROVIDER_UNAVAILABLE" },
    });
    expect(serialized).not.toContain("network failed");
    expect(serialized).not.toContain("CLASSGW_KEY");
  });

  it("aborts at the configured twenty-five second boundary without retrying", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );

    const resultPromise = callOpenRouterGateway("compare two listings");

    await vi.advanceTimersByTimeAsync(OPENROUTER_TIMEOUT_MS - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(resultPromise).resolves.toMatchObject({
      ok: false,
      error: { code: "PROVIDER_TIMEOUT" },
    });
    expect(OPENROUTER_TIMEOUT_MS).toBe(25_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("marks a timed-out request with the normalized provider timeout category", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () =>
              reject(
                new DOMException(
                  "The operation was aborted at /Users/private/stack.ts",
                  "AbortError",
                ),
              ),
            { once: true },
          );
        }),
    );

    const resultPromise = callOpenRouterGateway("compare two listings");
    await vi.advanceTimersByTimeAsync(OPENROUTER_TIMEOUT_MS);
    const result = await resultPromise;
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "PROVIDER_TIMEOUT",
        message: "The AI service timed out.",
      },
    });
    expect(serialized).not.toContain("AbortError");
    expect(serialized).not.toContain("Abort");
    expect(serialized).not.toContain("/Users/");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never returns the credential or authorization value", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: "grounded answer" } }],
      }),
    );

    const result = await callOpenRouterGateway("compare two listings");
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain(testKey);
    expect(serialized).not.toContain("CLASSGW_KEY");
    expect(serialized).not.toContain("Authorization");
  });
});
