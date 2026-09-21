import { readFile } from "node:fs/promises";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  COGNITIO_GATEWAY_MODEL,
  COGNITIO_GATEWAY_URL,
  GATEWAY_TIMEOUT_MS,
  callCognitioGateway,
} from "../lib/gateway";

const testKey = ["test", "gateway", "credential"].join("-");
const forbiddenAuthorizationText = [
  "Authorization:",
  "Bearer",
  "something",
].join(" ");
const forbiddenLocalPath = ["", "Users", "private", "project"].join("/");

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("Cognitio gateway adapter", () => {
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
      new URL("../lib/gateway.ts", import.meta.url),
      "utf8",
    );

    expect(source.startsWith('import "server-only";')).toBe(true);
  });

  it("sends one fixed, non-streaming user message to the fixed endpoint", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: "gateway connected" } }],
      }),
    );

    const result = await callCognitioGateway("hello gateway");

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      COGNITIO_GATEWAY_URL,
      expect.objectContaining({ method: "POST" }),
    );

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(requestInit.headers);
    const body = JSON.parse(String(requestInit.body)) as Record<
      string,
      unknown
    >;

    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Authorization")).toBe(
      `Bearer ${process.env.CLASSGW_KEY}`,
    );
    expect(body).toEqual({
      model: COGNITIO_GATEWAY_MODEL,
      messages: [{ role: "user", content: "hello gateway" }],
      stream: false,
    });
    expect(body).not.toHaveProperty("tools");
    expect(body).not.toHaveProperty("functions");
    expect(body).not.toHaveProperty("response_format");
  });

  it("fails safely without configuration and makes no provider request", async () => {
    vi.stubEnv("CLASSGW_KEY", "");

    const result = await callCognitioGateway("hello gateway");

    expect(result).toMatchObject({
      ok: false,
      error: { code: "CONFIGURATION_ERROR" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("CLASSGW_KEY");
  });

  it.each(["", "   ", "x".repeat(201)])(
    "rejects invalid adapter input without fetching",
    async (input) => {
      const result = await callCognitioGateway(input);

      expect(result).toMatchObject({
        ok: false,
        error: { code: "INVALID_REQUEST" },
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("parses text, numeric usage, and safe observability headers", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          choices: [{ message: { content: "  gateway connected  " } }],
          usage: {
            prompt_tokens: 12,
            completion_tokens: 3,
            total_tokens: 15,
          },
        },
        {
          headers: {
            "Content-Type": "application/json",
            "X-Gateway-Upstream": "openai-primary",
            "X-Gateway-Fallback": "not-used",
          },
        },
      ),
    );

    const result = await callCognitioGateway("hello gateway");

    expect(result).toMatchObject({
      ok: true,
      response: "gateway connected",
      model: COGNITIO_GATEWAY_MODEL,
      usage: {
        inputTokens: 12,
        outputTokens: 3,
        totalTokens: 15,
      },
      upstream: "openai-primary",
      fallback: "not-used",
    });
    expect(result.latencyMs).toEqual(expect.any(Number));
  });

  it("ignores malformed usage fields and unsafe observability headers", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          choices: [{ message: { content: "gateway connected" } }],
          usage: {
            prompt_tokens: "12",
            completion_tokens: null,
            total_tokens: -1,
          },
        },
        {
          headers: {
            "Content-Type": "application/json",
            "X-Gateway-Upstream": "../../private/path",
            "X-Gateway-Fallback": "value with spaces and secrets",
          },
        },
      ),
    );

    const result = await callCognitioGateway("hello gateway");

    expect(result).toMatchObject({
      ok: true,
      usage: null,
      upstream: null,
      fallback: null,
    });
  });

  it("drops observability headers that contain forbidden public markers", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          choices: [{ message: { content: "gateway connected" } }],
        },
        {
          headers: {
            "Content-Type": "application/json",
            "X-Gateway-Upstream": "CLASSGW_KEY",
            "X-Gateway-Fallback": "Authorization",
          },
        },
      ),
    );

    const result = await callCognitioGateway("hello gateway");

    expect(result).toMatchObject({
      ok: true,
      upstream: null,
      fallback: null,
    });
  });

  it.each([
    "CLASSGW_KEY",
    forbiddenAuthorizationText,
    forbiddenLocalPath,
    testKey,
  ])(
    "rejects provider text containing a forbidden public marker",
    async (content) => {
      fetchMock.mockResolvedValue(
        jsonResponse({ choices: [{ message: { content } }] }),
      );

      const result = await callCognitioGateway("hello gateway");

      expect(result).toMatchObject({
        ok: false,
        error: { code: "PROVIDER_INVALID_RESPONSE" },
      });
      expect(JSON.stringify(result)).not.toContain(content);
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

    const result = await callCognitioGateway("hello gateway");

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

    const result = await callCognitioGateway("hello gateway");

    expect(result).toMatchObject({
      ok: false,
      error: { code: "PROVIDER_INVALID_RESPONSE" },
    });
  });

  it.each([
    [400, "PROVIDER_BAD_REQUEST"],
    [401, "PROVIDER_AUTH_ERROR"],
    [403, "PROVIDER_AUTH_ERROR"],
    [404, "PROVIDER_ROUTE_ERROR"],
    [429, "PROVIDER_RATE_LIMITED"],
    [500, "PROVIDER_UNAVAILABLE"],
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

      const result = await callCognitioGateway("hello gateway");
      const serialized = JSON.stringify(result);

      expect(result).toMatchObject({ ok: false, error: { code } });
      expect(serialized).not.toContain("raw provider failure");
      expect(serialized).not.toContain("CLASSGW_KEY");
      expect(serialized).not.toContain("Authorization");
    },
  );

  it("captures only a sanitized numeric Retry-After value", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 429,
        headers: { "Retry-After": "17" },
      }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 429,
        headers: { "Retry-After": "tomorrow; CLASSGW_KEY" },
      }),
    );

    const safeResult = await callCognitioGateway("hello gateway");
    const unsafeResult = await callCognitioGateway("hello gateway");

    expect(safeResult).toMatchObject({ ok: false, retryAfter: "17" });
    expect(unsafeResult).toMatchObject({ ok: false, retryAfter: null });
  });

  it("maps a network failure without exposing the thrown message", async () => {
    fetchMock.mockRejectedValue(
      new Error("network failed with Authorization and CLASSGW_KEY"),
    );

    const result = await callCognitioGateway("hello gateway");
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "PROVIDER_UNAVAILABLE" },
    });
    expect(serialized).not.toContain("network failed");
    expect(serialized).not.toContain("Authorization");
    expect(serialized).not.toContain("CLASSGW_KEY");
  });

  it("aborts after exactly twelve seconds without retrying", async () => {
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

    const resultPromise = callCognitioGateway("hello gateway");

    await vi.advanceTimersByTimeAsync(GATEWAY_TIMEOUT_MS - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(resultPromise).resolves.toMatchObject({
      ok: false,
      error: { code: "PROVIDER_TIMEOUT" },
    });
    expect(GATEWAY_TIMEOUT_MS).toBe(12_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the twelve-second timeout active while parsing the body", async () => {
    vi.useFakeTimers();
    let providerSignal: AbortSignal | undefined;
    fetchMock.mockImplementation(
      (_input: RequestInfo | URL, init?: RequestInit) => {
        providerSignal = init?.signal ?? undefined;

        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: () =>
            new Promise((_resolve, reject) => {
              providerSignal?.addEventListener(
                "abort",
                () => reject(new DOMException("Aborted", "AbortError")),
                { once: true },
              );
            }),
        } as Response);
      },
    );

    const resultPromise = callCognitioGateway("hello gateway");
    await vi.advanceTimersByTimeAsync(GATEWAY_TIMEOUT_MS);

    expect(providerSignal?.aborted).toBe(true);
    await expect(resultPromise).resolves.toMatchObject({
      ok: false,
      error: { code: "PROVIDER_TIMEOUT" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
