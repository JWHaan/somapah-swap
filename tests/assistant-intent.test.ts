import { afterEach, describe, expect, it, vi } from "vitest";

import {
  classifyAssistantIntent,
  type AssistantIntent,
  type IntentReason,
} from "../lib/assistant-intent";

describe("unified catalogue helper intent routing", () => {
  it.each([
    ["fan under $30", "search"],
    ["show tech items", "search"],
    ["something to raise my laptop", "search"],
    ["used iPad for sketching", "search"],
    ["best item for studying", "search"],
    ["What is the iPad battery health?", "ask"],
    ["Does the Keychron Bluetooth work?", "ask"],
    ["Compare the desk and laptop stand.", "ask"],
    ["Which drawing device includes a pen?", "ask"],
    ["which item is best for studying?", "ask"],
  ] satisfies Array<[string, AssistantIntent]>)(
    "routes %j to %s",
    (input, expected) => {
      expect(classifyAssistantIntent(input).intent).toBe(expected);
    },
  );

  it.each([
    ["Compare the desk and laptop stand.", "comparison-language"],
    ["What is the iPad battery health?", "question-structure"],
    ["Does the Keychron Bluetooth work?", "question-structure"],
    ["Which drawing device includes a pen?", "question-structure"],
    ["which item is best for studying?", "question-structure"],
    ["Tell me about the monitor", "fact-language"],
    ["iPad battery health", "fact-language"],
    ["how much is the stand fan", "question-structure"],
    ["fan under $30", "search-constraint"],
    ["used iPad for sketching", "search-constraint"],
    ["show tech items", "discovery-language"],
    ["something to raise my laptop", "discovery-language"],
    ["best item for studying", "default-search"],
    ["laptop stand", "default-search"],
  ] satisfies Array<[string, IntentReason]>)(
    "explains %j with the %s reason",
    (input, expected) => {
      expect(classifyAssistantIntent(input).reason).toBe(expected);
    },
  );

  it.each([
    "",
    "   ",
    "desk",
    "cheap fan",
    "course books",
    "monitor under $100",
    "condition: like-new",
    "anything for a hostel room",
    "I need a lamp",
    "items under S$50",
  ])("defaults non-question input %j to search", (input) => {
    expect(classifyAssistantIntent(input).intent).toBe("search");
  });

  it.each([
    "Is the iPad available today?",
    "Does it come with a case?",
    "why is the desk better for studying?",
    "Can I pick up the fridge today?",
    "is $70 fair for the monitor",
    "What brand is the folding bike?",
    "explain the monitor defects",
  ])("treats %j as a catalogue question", (input) => {
    expect(classifyAssistantIntent(input).intent).toBe("ask");
  });

  it("does not use an exact-query lookup table", () => {
    // Rephrasing the required cases must still route the same way.
    expect(classifyAssistantIntent("fan below $30").intent).toBe("search");
    expect(classifyAssistantIntent("show me tech listings").intent).toBe(
      "search",
    );
    expect(
      classifyAssistantIntent("something that raises my laptop").intent,
    ).toBe("search");
    expect(classifyAssistantIntent("second-hand iPad for drawing").intent).toBe(
      "search",
    );
    expect(
      classifyAssistantIntent("What's the battery health on the iPad?").intent,
    ).toBe("ask");
    expect(
      classifyAssistantIntent("Is the Keychron Bluetooth confirmed?").intent,
    ).toBe("ask");
    expect(
      classifyAssistantIntent("contrast the desk and the laptop stand.").intent,
    ).toBe("ask");
    expect(
      classifyAssistantIntent("Which tablet comes with a pen?").intent,
    ).toBe("ask");
    expect(classifyAssistantIntent("good item for studying").intent).toBe(
      "search",
    );
  });

  it("returns a decision shaped for both intent and reason", () => {
    const decision = classifyAssistantIntent("Compare the desk and stand.");

    expect(Object.keys(decision).sort()).toEqual(["intent", "reason"]);
  });

  it.each([
    ["course books", "search-constraint"],
    ["dorm items", "search-constraint"],
    ["tech gear", "search-constraint"],
    ["items under S$50", "search-constraint"],
    ["like-new calculator", "search-constraint"],
  ] satisfies Array<[string, IntentReason]>)(
    "treats %j as an explicit catalogue constraint",
    (input, expected) => {
      expect(classifyAssistantIntent(input)).toEqual({
        intent: "search",
        reason: expected,
      });
    },
  );

  it("routes exact product discovery to search", () => {
    expect(classifyAssistantIntent("laptop stand")).toEqual({
      intent: "search",
      reason: "default-search",
    });
    expect(classifyAssistantIntent("Keychron K2")).toEqual({
      intent: "search",
      reason: "default-search",
    });
    expect(classifyAssistantIntent("stand fan for a hostel room")).toEqual({
      intent: "search",
      reason: "default-search",
    });
  });

  it("never contacts a provider while classifying", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const inputs = [
      "fan under $30",
      "show tech items",
      "something to raise my laptop",
      "used iPad for sketching",
      "best item for studying",
      "laptop stand",
      "What is the iPad battery health?",
      "Does the Keychron Bluetooth work?",
      "Compare the desk and laptop stand.",
      "Which drawing device includes a pen?",
      "which item is best for studying?",
      "",
      "   ",
    ];

    const decisions = inputs.map((input) => classifyAssistantIntent(input));

    expect(decisions).toHaveLength(inputs.length);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
