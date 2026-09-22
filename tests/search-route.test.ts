import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const answerCatalogueSearchMock = vi.fn();

vi.mock("@/lib/catalogue-search", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/catalogue-search")>();

  return {
    ...actual,
    answerCatalogueSearch: (...args: unknown[]) =>
      answerCatalogueSearchMock(...args),
  };
});

import { POST, maxDuration } from "../app/api/search/route";
import type { CatalogueSearchResult } from "../lib/catalogue-search";

const MAX_SEARCH_BODY_BYTES = 2_048;

const deterministicResult: CatalogueSearchResult = {
  response: {
    mode: "deterministic",
    interpreted: {
      category: "tech",
      max_price_sgd: 20,
      max_price_operator: "lt",
    },
    results: [
      { id: "dongle-usbc-13", reason: "In the tech category within budget." },
    ],
  },
  evaluation: {
    decision: "deterministic-results",
    candidateIds: ["dongle-usbc-13"],
    providerCallCount: 0,
  },
};

function searchRequest(body: string, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
}

function streamedRequest(chunks: readonly string[]) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    },
  });

  return new Request("http://localhost/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: stream,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

describe("POST /api/search validation", () => {
  beforeEach(() => {
    answerCatalogueSearchMock.mockReset();
    answerCatalogueSearchMock.mockResolvedValue(deterministicResult);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("declares a twelve-second route maximum duration", () => {
    expect(maxDuration).toBe(12);
  });

  it("returns 400 for malformed JSON without orchestration", async () => {
    const response = await POST(searchRequest("{ not json"));
    expect(response.status).toBe(400);
    expect(answerCatalogueSearchMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a missing query", async () => {
    const response = await POST(searchRequest(JSON.stringify({})));
    expect(response.status).toBe(400);
    expect(answerCatalogueSearchMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-string query", async () => {
    const response = await POST(searchRequest(JSON.stringify({ query: 5 })));
    expect(response.status).toBe(400);
    expect(answerCatalogueSearchMock).not.toHaveBeenCalled();
  });

  it("returns 400 for an array body", async () => {
    const response = await POST(
      searchRequest(JSON.stringify([{ query: "fan" }])),
    );
    expect(response.status).toBe(400);
    expect(answerCatalogueSearchMock).not.toHaveBeenCalled();
  });

  it("returns 400 for null", async () => {
    const response = await POST(searchRequest("null"));
    expect(response.status).toBe(400);
    expect(answerCatalogueSearchMock).not.toHaveBeenCalled();
  });

  it.each(["  ", "ab", "!! ??", "x".repeat(301)])(
    "returns 400 for an out-of-range query %j",
    async (query) => {
      const response = await POST(searchRequest(JSON.stringify({ query })));
      expect(response.status).toBe(400);
      expect(answerCatalogueSearchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["provider", { provider: "openrouter" }],
    ["model", { model: "gpt-4" }],
    ["endpoint", { endpoint: "https://evil.example" }],
    ["max_tokens", { max_tokens: 9000 }],
    ["reasoning", { reasoning: { effort: "high" } }],
    ["tools", { tools: [] }],
    ["messages", { messages: [] }],
    ["candidate_ids", { candidate_ids: ["fan-hostel-01"] }],
    ["results", { results: [] }],
  ])("rejects a client-supplied %s override", async (_name, override) => {
    const response = await POST(
      searchRequest(JSON.stringify({ query: "cheap fan", ...override })),
    );
    expect(response.status).toBe(400);
    expect(answerCatalogueSearchMock).not.toHaveBeenCalled();
  });

  it("returns 413 when Content-Length exceeds the ceiling", async () => {
    const oversized = JSON.stringify({
      query: "x".repeat(MAX_SEARCH_BODY_BYTES),
    });
    const response = await POST(
      searchRequest(oversized, { "Content-Length": String(oversized.length) }),
    );
    expect(response.status).toBe(413);
    expect(answerCatalogueSearchMock).not.toHaveBeenCalled();
  });

  it("returns 413 while streaming an oversized body", async () => {
    const chunk = "y".repeat(1_000);
    const response = await POST(streamedRequest([chunk, chunk, chunk]));
    expect(response.status).toBe(413);
    expect(answerCatalogueSearchMock).not.toHaveBeenCalled();
  });

  it("returns a sanitized application-owned error body", async () => {
    const response = await POST(searchRequest("{ not json"));
    const body = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["error"]);
    expect(JSON.stringify(body)).not.toMatch(
      /CLASSGW_KEY|Authorization|Bearer|\/Users\//,
    );
  });
});

describe("POST /api/search success", () => {
  beforeEach(() => {
    answerCatalogueSearchMock.mockReset();
    answerCatalogueSearchMock.mockResolvedValue(deterministicResult);
  });

  it("returns the public response for a valid query", async () => {
    const response = await POST(
      searchRequest(JSON.stringify({ query: "tech item under $20" })),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      deterministicResult.response,
    );
    expect(answerCatalogueSearchMock).toHaveBeenCalledTimes(1);
  });

  it("never leaks internal evaluation metadata", async () => {
    const response = await POST(
      searchRequest(JSON.stringify({ query: "tech item under $20" })),
    );
    const serialized = JSON.stringify(await response.json());
    expect(serialized).not.toContain("candidateIds");
    expect(serialized).not.toContain("providerCallCount");
    expect(serialized).not.toContain("decision");
    expect(serialized).not.toContain("score");
  });

  it("does not export a GET handler", async () => {
    const routeModule = await import("../app/api/search/route");
    expect((routeModule as Record<string, unknown>).GET).toBeUndefined();
  });
});
