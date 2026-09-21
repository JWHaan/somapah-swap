import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const answerCatalogueQuestionMock = vi.fn();

vi.mock("@/lib/catalogue-qa", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/catalogue-qa")>();

  return {
    ...actual,
    answerCatalogueQuestion: (...args: unknown[]) =>
      answerCatalogueQuestionMock(...args),
  };
});

import { POST, maxDuration } from "../app/api/ask/route";
import type { CatalogueQuestionResult } from "../lib/catalogue-qa";
import { OPENROUTER_TIMEOUT_MS } from "../lib/openrouter";

const MAX_ASK_BODY_BYTES = 2_048;

const deterministicResult: CatalogueQuestionResult = {
  response: {
    answer: "The listing does not say what the iPad's battery health is.",
    cited_ids: ["ipad-sketch-10"],
    citations: [
      {
        id: "ipad-sketch-10",
        title: "iPad 8th gen, 32GB",
        href: "/item/ipad-sketch-10",
      },
    ],
    missing: ["Battery health is not provided."],
    scope: "catalogue",
    mode: "deterministic",
  },
  evaluation: {
    decision: "answer-locally",
    candidateIds: ["ipad-sketch-10"],
  },
};

function askRequest(body: string, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
}

function streamedAskRequest(
  chunks: readonly string[],
  headers: Record<string, string> = {},
) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }

      controller.close();
    },
  });

  return new Request("http://localhost/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: stream,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

describe("POST /api/ask request validation", () => {
  beforeEach(() => {
    answerCatalogueQuestionMock.mockReset();
    answerCatalogueQuestionMock.mockResolvedValue(deterministicResult);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 400 and makes zero orchestration calls for unknown top-level fields", async () => {
    const response = await POST(
      askRequest(
        JSON.stringify({
          question: "What is the iPad battery health?",
          model: "user-controlled-model",
        }),
      ),
    );

    expect(response.status).toBe(400);
    expect(answerCatalogueQuestionMock).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON without calling orchestration", async () => {
    const response = await POST(askRequest("{ not json"));

    expect(response.status).toBe(400);
    expect(answerCatalogueQuestionMock).not.toHaveBeenCalled();
  });

  it.each(["ab", "x".repeat(501)])(
    "returns 400 for an out-of-range question without calling orchestration",
    async (question) => {
      const response = await POST(askRequest(JSON.stringify({ question })));

      expect(response.status).toBe(400);
      expect(answerCatalogueQuestionMock).not.toHaveBeenCalled();
    },
  );

  it("returns 400 for a malformed item_id without calling orchestration", async () => {
    const response = await POST(
      askRequest(
        JSON.stringify({
          question: "How much is it?",
          item_id: "../../etc/passwd",
        }),
      ),
    );

    expect(response.status).toBe(400);
    expect(answerCatalogueQuestionMock).not.toHaveBeenCalled();
  });

  it.each([
    ["reasoning", { reasoning: { max_tokens: 5000 } }],
    ["max_tokens", { max_tokens: 9000 }],
    ["provider", { provider: "openrouter" }],
    ["model", { model: "gpt-4" }],
    ["endpoint", { endpoint: "https://evil.example" }],
    ["timeout", { timeout_ms: 60000 }],
    ["tools", { tools: [] }],
    ["messages", { messages: [{ role: "system", content: "ignored" }] }],
  ])(
    "rejects a client-supplied %s override without calling orchestration",
    async (_name, override) => {
      const response = await POST(
        askRequest(
          JSON.stringify({
            question: "What is the iPad battery health?",
            ...override,
          }),
        ),
      );

      expect(response.status).toBe(400);
      expect(answerCatalogueQuestionMock).not.toHaveBeenCalled();
    },
  );

  it("returns a sanitized application-owned error body", async () => {
    const response = await POST(askRequest("{ not json"));
    const body = (await response.json()) as Record<string, unknown>;

    expect(Object.keys(body)).toEqual(["error"]);
    expect(body.error).toBe("A valid catalogue question is required.");
    expect(JSON.stringify(body)).not.toMatch(
      /CLASSGW_KEY|Authorization|Bearer|at Object|\/Users\//,
    );
  });
});

describe("POST /api/ask raw body ceiling", () => {
  beforeEach(() => {
    answerCatalogueQuestionMock.mockReset();
    answerCatalogueQuestionMock.mockResolvedValue(deterministicResult);
  });

  it("returns 413 when Content-Length exceeds the ceiling and makes zero orchestration calls", async () => {
    const oversizedBody = JSON.stringify({
      question: "x".repeat(MAX_ASK_BODY_BYTES + 1),
    });
    const response = await POST(
      askRequest(oversizedBody, {
        "Content-Length": String(oversizedBody.length),
      }),
    );

    expect(response.status).toBe(413);
    expect(answerCatalogueQuestionMock).not.toHaveBeenCalled();

    const body = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["error"]);
  });

  it("returns 413 while streaming an oversized body with no Content-Length", async () => {
    const chunk = "y".repeat(1_000);
    const response = await POST(
      streamedAskRequest([chunk, chunk, chunk, chunk]),
    );

    expect(response.status).toBe(413);
    expect(answerCatalogueQuestionMock).not.toHaveBeenCalled();
  });

  it("does not partially process a body that exceeds the ceiling", async () => {
    const validPrefix = JSON.stringify({ question: "Hi there" });
    const response = await POST(
      streamedAskRequest([validPrefix, "z".repeat(MAX_ASK_BODY_BYTES)]),
    );

    expect(response.status).toBe(413);
    expect(answerCatalogueQuestionMock).not.toHaveBeenCalled();
  });

  it("still applies strict schema validation below the body ceiling", async () => {
    const response = await POST(
      streamedAskRequest([JSON.stringify({ question: "Hi there", tools: [] })]),
    );

    expect(response.status).toBe(400);
    expect(answerCatalogueQuestionMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/ask response contract", () => {
  it("declares a route maximum duration that exceeds the provider timeout", () => {
    expect(maxDuration).toBe(30);
    expect(OPENROUTER_TIMEOUT_MS).toBe(25_000);
    expect(OPENROUTER_TIMEOUT_MS).toBeLessThan(maxDuration * 1_000);
  });

  it("returns a safe fallback after a provider timeout without exposing internals", async () => {
    answerCatalogueQuestionMock.mockResolvedValue({
      response: {
        answer:
          "I could not complete the comparison reliably. You can review the relevant listings directly.",
        cited_ids: ["desk-small-05", "laptop-stand-15"],
        citations: [
          {
            id: "desk-small-05",
            title: "Small folding desk",
            href: "/item/desk-small-05",
          },
          {
            id: "laptop-stand-15",
            title: "Aluminium laptop stand",
            href: "/item/laptop-stand-15",
          },
        ],
        missing: [],
        scope: "catalogue",
        mode: "fallback",
      },
      evaluation: {
        decision: "fallback",
        candidateIds: ["desk-small-05", "laptop-stand-15"],
      },
    } satisfies CatalogueQuestionResult);

    const response = await POST(
      askRequest(JSON.stringify({ question: "Compare two listings" })),
    );
    const body = (await response.json()) as {
      mode: string;
      cited_ids: string[];
    };
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body.mode).toBe("fallback");
    expect(body.cited_ids).toEqual(["desk-small-05", "laptop-stand-15"]);
    expect(serialized).not.toContain("timeout");
    expect(serialized).not.toContain("Abort");
    expect(serialized).not.toContain("25");
    expect(serialized).not.toContain("stack");
  });

  beforeEach(() => {
    answerCatalogueQuestionMock.mockReset();
    answerCatalogueQuestionMock.mockResolvedValue(deterministicResult);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the stable buyer response for a valid question", async () => {
    const response = await POST(
      askRequest(
        JSON.stringify({
          question: "What is the iPad battery health?",
          item_id: "ipad-sketch-10",
        }),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      deterministicResult.response,
    );
    expect(answerCatalogueQuestionMock).toHaveBeenCalledWith({
      question: "What is the iPad battery health?",
      item_id: "ipad-sketch-10",
    });
  });

  it("never returns the internal decision or provider metadata", async () => {
    const response = await POST(
      askRequest(
        JSON.stringify({ question: "What is the iPad battery health?" }),
      ),
    );
    const serialized = JSON.stringify(await response.json());

    expect(serialized).not.toContain("decision");
    expect(serialized).not.toContain("usage");
    expect(serialized).not.toContain("providerStatus");
    expect(serialized).not.toContain("candidateIds");
    expect(serialized).not.toContain("latency");
    expect(serialized).not.toContain("reasoning");
    expect(serialized).not.toContain("finish_reason");
  });

  it("returns a sanitized 400 when orchestration rejects the application input", async () => {
    const { AskInputError } = await import("../lib/catalogue-qa");
    answerCatalogueQuestionMock.mockRejectedValue(
      new AskInputError("Choose a valid catalogue item."),
    );

    const response = await POST(
      askRequest(
        JSON.stringify({
          question: "How much is it?",
          item_id: "missing-item",
        }),
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Choose a valid catalogue item.",
    });
  });

  it("returns a sanitized 500 without leaking internal error details", async () => {
    answerCatalogueQuestionMock.mockRejectedValue(
      new Error(
        "provider failure with CLASSGW_KEY at /Users/private/project/route.ts",
      ),
    );

    const response = await POST(
      askRequest(
        JSON.stringify({ question: "What is the iPad battery health?" }),
      ),
    );
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(500);
    expect(serialized).not.toContain("CLASSGW_KEY");
    expect(serialized).not.toContain("/Users/");
    expect(serialized).not.toContain("provider failure");
  });
});
