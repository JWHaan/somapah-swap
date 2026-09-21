import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getListings, type Listing } from "../lib/catalogue";
import {
  MAX_QA_PROMPT_LENGTH,
  PREFERRED_QA_PROMPT_LENGTH,
  buildGroundedQaPrompt,
  parseGroundedQaOutput,
} from "../lib/qa-model";

function listing(id: string): Listing {
  const match = getListings().find((candidate) => candidate.id === id);

  if (!match) {
    throw new Error(`Missing test listing: ${id}`);
  }

  return match;
}

describe("grounded Q&A prompt construction", () => {
  it("keeps a normal four-candidate prompt below the preferred target", () => {
    const result = buildGroundedQaPrompt({
      question: "Which desk or stand is better for a hostel room?",
      candidates: [
        listing("fan-hostel-01"),
        listing("desk-small-05"),
        listing("lamp-desk-02"),
        listing("laptop-stand-15"),
      ],
      minimumCandidates: 2,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.prompt.length).toBeLessThan(PREFERRED_QA_PROMPT_LENGTH);
      expect(result.candidates).toHaveLength(4);
    }
  });

  it("accepts a complete prompt exactly at the hard ceiling", () => {
    const baseListing = { ...listing("desk-small-05"), seller_note: "" };
    const baseline = buildGroundedQaPrompt({
      question: "Why is this suitable for a hostel room?",
      candidates: [baseListing],
      minimumCandidates: 1,
      preferredLength: 20_000,
      maxLength: 20_000,
    });

    expect(baseline.ok).toBe(true);
    if (!baseline.ok) {
      return;
    }

    const exactListing = {
      ...baseListing,
      seller_note: "x".repeat(MAX_QA_PROMPT_LENGTH - baseline.prompt.length),
    };
    const result = buildGroundedQaPrompt({
      question: "Why is this suitable for a hostel room?",
      candidates: [exactListing],
      minimumCandidates: 1,
      preferredLength: MAX_QA_PROMPT_LENGTH,
      maxLength: MAX_QA_PROMPT_LENGTH,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.prompt).toHaveLength(MAX_QA_PROMPT_LENGTH);
    }
  });

  it("reduces lower-ranked candidates to meet the preferred target", () => {
    const candidates = getListings()
      .slice(0, 4)
      .map((candidate, index) => ({
        ...candidate,
        seller_note: `${index}`.repeat(900),
      }));
    const result = buildGroundedQaPrompt({
      question: "Compare these options for a hostel room",
      candidates,
      minimumCandidates: 2,
      preferredLength: 3_000,
      maxLength: MAX_QA_PROMPT_LENGTH,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.candidates.length).toBeLessThan(4);
      expect(result.candidates.length).toBeGreaterThanOrEqual(2);
      expect(result.prompt.length).toBeLessThanOrEqual(3_000);
    }
  });

  it("removes an irrelevant complete field instead of truncating it", () => {
    const marker = "irrelevant-seller-note-".repeat(800);
    const result = buildGroundedQaPrompt({
      question: "What is the price?",
      candidates: [
        {
          ...listing("monitor-24-11"),
          seller_note: marker,
        },
      ],
      minimumCandidates: 1,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.projected).toBe(true);
      expect(result.prompt).not.toContain(marker.slice(0, 40));
      expect(result.prompt.length).toBeLessThanOrEqual(MAX_QA_PROMPT_LENGTH);
    }
  });

  it("returns a safe failure when one relevant record still exceeds the ceiling", () => {
    const result = buildGroundedQaPrompt({
      question: "Why is this suitable for a hostel room?",
      candidates: [
        {
          ...listing("desk-small-05"),
          seller_note: "x".repeat(MAX_QA_PROMPT_LENGTH + 1),
        },
      ],
      minimumCandidates: 1,
    });

    expect(result).toEqual({
      ok: false,
      reason: "prompt-too-large",
      candidates: [
        {
          ...listing("desk-small-05"),
          seller_note: "x".repeat(MAX_QA_PROMPT_LENGTH + 1),
        },
      ],
    });
  });
});

describe("grounded Q&A model output validation", () => {
  const candidates = [listing("desk-small-05"), listing("laptop-stand-15")];
  const validOutput = {
    answer: "The desk offers a work surface, while the stand raises a laptop.",
    cited_ids: ["desk-small-05", "laptop-stand-15"],
    missing: [],
  };

  it("accepts citations that all belong to the retrieved candidates", () => {
    expect(
      parseGroundedQaOutput(
        JSON.stringify(validOutput),
        candidates,
        getListings(),
      ),
    ).toEqual(validOutput);
  });

  it("invalidates one valid plus one invented citation", () => {
    expect(
      parseGroundedQaOutput(
        JSON.stringify({
          ...validOutput,
          cited_ids: ["desk-small-05", "invented-item-99"],
        }),
        candidates,
        getListings(),
      ),
    ).toBeNull();
  });

  it("invalidates one valid plus one unretrieved real citation", () => {
    expect(
      parseGroundedQaOutput(
        JSON.stringify({
          ...validOutput,
          cited_ids: ["desk-small-05", "ipad-sketch-10"],
        }),
        candidates,
        getListings(),
      ),
    ).toBeNull();
  });

  it("deduplicates otherwise valid citations", () => {
    expect(
      parseGroundedQaOutput(
        JSON.stringify({
          ...validOutput,
          cited_ids: ["desk-small-05", "desk-small-05", "laptop-stand-15"],
        }),
        candidates,
        getListings(),
      )?.cited_ids,
    ).toEqual(["desk-small-05", "laptop-stand-15"]);
  });

  it.each([
    "https://example.com/item/desk-small-05",
    "../desk-small-05",
    "/item/desk-small-05",
    "desk-small-05?source=external",
  ])("invalidates URL or path-like citation %s", (citation) => {
    expect(
      parseGroundedQaOutput(
        JSON.stringify({ ...validOutput, cited_ids: [citation] }),
        candidates,
        getListings(),
      ),
    ).toBeNull();
  });

  it("invalidates an empty citation list for a grounded answer", () => {
    expect(
      parseGroundedQaOutput(
        JSON.stringify({ ...validOutput, cited_ids: [] }),
        candidates,
        getListings(),
      ),
    ).toBeNull();
  });
});
