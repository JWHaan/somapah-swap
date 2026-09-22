import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MAX_HELPER_INPUT_LENGTH,
  MIN_HELPER_INPUT_LENGTH,
  classifyAssistantIntent,
  isRoutableHelperInput,
  type IntentReason,
} from "../lib/assistant-intent";
import intentCases from "./fixtures/intent-routing-cases.json";

type IntentCase = {
  name: string;
  input: string;
  group: "search" | "ask" | "ambiguous" | "invalid";
  ambiguity: string;
  expected_intent: "search" | "ask" | null;
  expected_reason: IntentReason | null;
  expected_endpoint: "/api/search" | "/api/ask" | null;
  expected_endpoint_calls: number;
  expected_provider_calls: number;
};

const cases = intentCases as IntentCase[];
const routable = cases.filter((testCase) => testCase.group !== "invalid");
const invalid = cases.filter((testCase) => testCase.group === "invalid");

function endpointFor(intent: "search" | "ask"): string {
  return intent === "search" ? "/api/search" : "/api/ask";
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("intent-routing evaluation fixtures", () => {
  it.each(routable)("$name", (testCase) => {
    const decision = classifyAssistantIntent(testCase.input);

    expect(decision.intent).toBe(testCase.expected_intent);
    expect(decision.reason).toBe(testCase.expected_reason);
    expect(endpointFor(decision.intent)).toBe(testCase.expected_endpoint);
    expect(testCase.expected_endpoint_calls).toBe(1);
    expect(testCase.expected_provider_calls).toBe(0);
  });

  it.each(invalid)("$name is rejected locally", (testCase) => {
    expect(isRoutableHelperInput(testCase.input)).toBe(false);
    expect(testCase.expected_endpoint).toBeNull();
    expect(testCase.expected_endpoint_calls).toBe(0);
    expect(testCase.expected_provider_calls).toBe(0);
  });

  it("accepts every routable fixture input at the client boundary", () => {
    for (const testCase of routable) {
      expect(isRoutableHelperInput(testCase.input)).toBe(true);
    }
  });

  it("enforces the client boundary at both ends", () => {
    expect(MIN_HELPER_INPUT_LENGTH).toBe(3);
    expect(MAX_HELPER_INPUT_LENGTH).toBe(500);
    expect(isRoutableHelperInput("ab")).toBe(false);
    expect(isRoutableHelperInput("abc")).toBe(true);
    expect(isRoutableHelperInput("x".repeat(500))).toBe(true);
    expect(isRoutableHelperInput("x".repeat(501))).toBe(false);
    expect(isRoutableHelperInput("  abc  ")).toBe(true);
  });

  it("routes ambiguous discovery to search and comparisons to ask", () => {
    const ambiguous = cases.filter((c) => c.group === "ambiguous");

    expect(ambiguous.length).toBeGreaterThanOrEqual(4);
    for (const testCase of ambiguous) {
      expect(classifyAssistantIntent(testCase.input).intent).toBe(
        testCase.expected_intent,
      );
    }
  });

  it("makes zero provider calls while routing every fixture", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    for (const testCase of cases) {
      classifyAssistantIntent(testCase.input);
    }

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("maps each intent to exactly one endpoint", () => {
    const endpoints = new Set(
      routable.map((testCase) =>
        endpointFor(classifyAssistantIntent(testCase.input).intent),
      ),
    );

    expect(endpoints).toEqual(new Set(["/api/search", "/api/ask"]));
    expect(routable.every((c) => c.expected_endpoint_calls === 1)).toBe(true);
  });
});
