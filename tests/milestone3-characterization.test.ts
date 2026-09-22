import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getListings } from "../lib/catalogue";
import { answerCatalogueQuestion } from "../lib/catalogue-qa";
import { maxDuration } from "../app/api/ask/route";
import {
  OPENROUTER_MAX_TOKENS,
  OPENROUTER_MODEL,
  OPENROUTER_REASONING_EFFORT,
  OPENROUTER_REASONING_EXCLUDE,
  OPENROUTER_TIMEOUT_MS,
  OPENROUTER_URL,
} from "../lib/openrouter";

/**
 * Milestone 3 characterization guard.
 *
 * These tests pin the established Q&A behaviour and provider policy so that
 * Milestone 4 shared-retrieval extraction and search additions cannot silently
 * change it. They must keep passing unchanged throughout Milestone 4.
 */
describe("Milestone 3 Q&A decision characterization", () => {
  it("answers a missing-fact question deterministically with zero provider calls", async () => {
    const provider = vi.fn();
    const result = await answerCatalogueQuestion(
      { question: "What is the iPad battery health?" },
      { catalogue: getListings(), provider },
    );

    expect(result.evaluation.decision).toBe("answer-locally");
    expect(result.response.mode).toBe("deterministic");
    expect(result.evaluation.candidateIds).toEqual(["ipad-sketch-10"]);
    expect(result.response.cited_ids).toEqual(["ipad-sketch-10"]);
    expect(provider).not.toHaveBeenCalled();
  });

  it("rejects an off-catalogue question deterministically with zero provider calls", async () => {
    const provider = vi.fn();
    const result = await answerCatalogueQuestion(
      { question: "What is the latest international news?" },
      { catalogue: getListings(), provider },
    );

    expect(result.evaluation.decision).toBe("reject-locally");
    expect(result.response.scope).toBe("off-catalogue");
    expect(provider).not.toHaveBeenCalled();
  });

  it("uses exactly one provider call for the approved comparison and validates citations", async () => {
    const provider = vi.fn().mockResolvedValue({
      ok: true,
      provider: "openrouter",
      response: JSON.stringify({
        answer:
          "The desk gives a work surface while the stand raises a laptop for a hostel room.",
        cited_ids: ["desk-small-05", "laptop-stand-15"],
        missing: [],
      }),
      model: OPENROUTER_MODEL,
      latencyMs: 10,
      usage: null,
    });

    const result = await answerCatalogueQuestion(
      { question: "Which desk or stand is better for a hostel room?" },
      { catalogue: getListings(), provider },
    );

    expect(result.evaluation.decision).toBe("model-answer");
    expect(result.response.mode).toBe("ai");
    expect(result.evaluation.candidateIds).toEqual([
      "desk-small-05",
      "laptop-stand-15",
    ]);
    expect(result.response.cited_ids).toEqual([
      "desk-small-05",
      "laptop-stand-15",
    ]);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it("falls back closed on an invented citation without a second call", async () => {
    const provider = vi.fn().mockResolvedValue({
      ok: true,
      provider: "openrouter",
      response: JSON.stringify({
        answer: "Unsupported comparison.",
        cited_ids: ["desk-small-05", "invented-item-99"],
        missing: [],
      }),
      model: OPENROUTER_MODEL,
      latencyMs: 10,
      usage: null,
    });

    const result = await answerCatalogueQuestion(
      { question: "Which desk or stand is better for a hostel room?" },
      { catalogue: getListings(), provider },
    );

    expect(result.evaluation.decision).toBe("fallback");
    expect(result.response.mode).toBe("fallback");
    expect(provider).toHaveBeenCalledTimes(1);
    expect(
      result.response.cited_ids.every((id) =>
        result.evaluation.candidateIds.includes(id),
      ),
    ).toBe(true);
  });
});

describe("Milestone 3 provider policy characterization", () => {
  it("keeps the fixed Q&A OpenRouter policy constants", () => {
    expect(OPENROUTER_URL).toBe(
      "https://174.138.16.223/openrouter/v1/chat/completions",
    );
    expect(OPENROUTER_MODEL).toBe("deepseek/deepseek-v4.1-flash");
    expect(OPENROUTER_MAX_TOKENS).toBe(450);
    expect(OPENROUTER_REASONING_EFFORT).toBe("none");
    expect(OPENROUTER_REASONING_EXCLUDE).toBe(true);
    expect(OPENROUTER_TIMEOUT_MS).toBe(25_000);
  });

  it("keeps the Q&A route maximum duration at thirty seconds", () => {
    expect(maxDuration).toBe(30);
    expect(OPENROUTER_TIMEOUT_MS).toBeLessThan(maxDuration * 1_000);
  });
});
