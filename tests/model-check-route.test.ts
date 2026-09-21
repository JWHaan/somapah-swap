import { readFile } from "node:fs/promises";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { POST } from "../app/api/model-check/route";
import {
  CANONICAL_MODEL_CHECK_INPUT,
  COGNITIO_GATEWAY_MODEL,
} from "../lib/gateway";

const testKey = ["test", "route", "credential"].join("-");
const forbiddenProviderText = [
  "CLASSGW_KEY",
  "Authorization:",
  "Bearer",
  "secret",
  "/Users/private/project",
].join(" ");

function routeRequest(body?: unknown, rawBody?: string): Request {
  return new Request("http://localhost/api/model-check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
}

function successResponse(content = "gateway connected"): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/model-check", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("CLASSGW_KEY", testKey);
    vi.stubEnv("NODE_ENV", "test");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    ["missing body", routeRequest()],
    ["malformed JSON", routeRequest(undefined, "{")],
    ["missing input", routeRequest({})],
    ["non-string input", routeRequest({ input: 123 })],
    ["blank input", routeRequest({ input: "   " })],
    ["oversized input", routeRequest({ input: "x".repeat(201) })],
  ])(
    "returns 400 for %s without calling the provider",
    async (_name, request) => {
      const response = await POST(request);

      expect(response.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
      await expect(response.json()).resolves.toMatchObject({
        ok: false,
        error: { code: "INVALID_REQUEST" },
      });
    },
  );

  it("accepts a trimmed 200-character input outside production", async () => {
    fetchMock.mockResolvedValue(successResponse());

    const response = await POST(
      routeRequest({ input: ` ${"x".repeat(200)} ` }),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const providerBody = JSON.parse(String(requestInit.body)) as {
      messages: Array<{ content: string }>;
    };
    expect(providerBody.messages[0]?.content).toHaveLength(200);
  });

  it("rejects non-canonical production input with zero provider calls", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const response = await POST(routeRequest({ input: "hello gateway" }));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts only the trimmed canonical production input and calls once", async () => {
    vi.stubEnv("NODE_ENV", "production");
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "gateway connected" } }],
          usage: {
            prompt_tokens: 8,
            completion_tokens: 2,
            total_tokens: 10,
          },
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-Gateway-Upstream": "openai-primary",
            "X-Gateway-Fallback": "not-used",
          },
        },
      ),
    );

    const response = await POST(
      routeRequest({ input: `  ${CANONICAL_MODEL_CHECK_INPUT}  ` }),
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(Object.keys(body).sort()).toEqual(
      [
        "fallback",
        "latency_ms",
        "model",
        "ok",
        "response",
        "upstream",
        "usage",
      ].sort(),
    );
    expect(body).toMatchObject({
      ok: true,
      response: "gateway connected",
      model: COGNITIO_GATEWAY_MODEL,
      usage: {
        input_tokens: 8,
        output_tokens: 2,
        total_tokens: 10,
      },
      upstream: "openai-primary",
      fallback: "not-used",
    });

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const providerBody = JSON.parse(String(requestInit.body)) as Record<
      string,
      unknown
    >;
    expect(providerBody).toEqual({
      model: COGNITIO_GATEWAY_MODEL,
      messages: [{ role: "user", content: CANONICAL_MODEL_CHECK_INPUT }],
      stream: false,
    });
  });

  it.each([
    { model: "user-controlled-model" },
    { endpoint: "https://example.invalid/model" },
  ])("rejects user-controlled provider parameters", async (extraField) => {
    const response = await POST(
      routeRequest({ input: CANONICAL_MODEL_CHECK_INPUT, ...extraField }),
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps missing server configuration to a safe 503", async () => {
    vi.stubEnv("CLASSGW_KEY", "");

    const response = await POST(
      routeRequest({ input: CANONICAL_MODEL_CHECK_INPUT }),
    );
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(serialized).not.toContain("CLASSGW_KEY");
  });

  it.each([
    [400, 502],
    [401, 503],
    [403, 503],
    [404, 503],
    [429, 429],
    [500, 503],
    [503, 503],
    [418, 503],
  ])(
    "maps provider status %i to public status %i",
    async (providerStatus, publicStatus) => {
      fetchMock.mockResolvedValue(
        new Response("raw private provider response", {
          status: providerStatus,
        }),
      );

      const response = await POST(
        routeRequest({ input: CANONICAL_MODEL_CHECK_INPUT }),
      );
      const serialized = JSON.stringify(await response.json());

      expect(response.status).toBe(publicStatus);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(serialized).not.toContain("raw private provider response");
    },
  );

  it("maps malformed provider success to a safe 502", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ choices: [] }), { status: 200 }),
    );

    const response = await POST(
      routeRequest({ input: CANONICAL_MODEL_CHECK_INPUT }),
    );

    expect(response.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps a provider network failure to a safe 503", async () => {
    fetchMock.mockRejectedValue(
      new Error("network failure with Authorization and CLASSGW_KEY"),
    );

    const response = await POST(
      routeRequest({ input: CANONICAL_MODEL_CHECK_INPUT }),
    );
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(serialized).not.toContain("network failure");
    expect(serialized).not.toContain("Authorization");
    expect(serialized).not.toContain("CLASSGW_KEY");
  });

  it("maps a provider timeout to 504 with one provider request", async () => {
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

    const responsePromise = POST(
      routeRequest({ input: CANONICAL_MODEL_CHECK_INPUT }),
    );
    await vi.advanceTimersByTimeAsync(12_000);
    const response = await responsePromise;

    expect(response.status).toBe(504);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never returns provider secrets, headers, errors, or stack details", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          detail:
            "CLASSGW_KEY Authorization Bearer stack /Users/private/project",
        }),
        { status: 503, headers: { "X-Request-Id": "private-request-id" } },
      ),
    );

    const response = await POST(
      routeRequest({ input: CANONICAL_MODEL_CHECK_INPUT }),
    );
    const serialized = JSON.stringify(await response.json());

    expect(serialized).not.toContain("CLASSGW_KEY");
    expect(serialized).not.toContain("Authorization");
    expect(serialized).not.toContain("Bearer");
    expect(serialized).not.toContain("private-request-id");
    expect(serialized).not.toContain("/Users/");
    expect(serialized).not.toContain("stack");
  });

  it("fails closed when successful provider text contains forbidden markers", async () => {
    fetchMock.mockResolvedValue(successResponse(forbiddenProviderText));

    const response = await POST(
      routeRequest({ input: CANONICAL_MODEL_CHECK_INPUT }),
    );
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(502);
    expect(serialized).not.toContain("CLASSGW_KEY");
    expect(serialized).not.toContain("Authorization");
    expect(serialized).not.toContain("Bearer");
    expect(serialized).not.toContain("/Users/");
  });

  it("is not exposed through marketplace navigation", async () => {
    const headerSource = await readFile(
      new URL("../components/SiteHeader.tsx", import.meta.url),
      "utf8",
    );

    expect(headerSource).not.toContain("/api/model-check");
    expect(headerSource).not.toContain("model-check");
  });
});
