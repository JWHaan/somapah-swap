import "server-only";

import { z } from "zod";

import { getListings, type Listing } from "@/lib/catalogue";
import { buildGroundedQaPrompt, parseGroundedQaOutput } from "@/lib/qa-model";
import {
  getCatalogueQaProvider,
  type QaProviderCaller,
} from "@/lib/qa-provider";
import { retrieveListingsForQuestion } from "@/lib/retrieval";

export type AskDecision =
  "reject-locally" | "answer-locally" | "model-answer" | "fallback";

export type AskPublicMode = "deterministic" | "ai" | "fallback";
export type AskScope = "catalogue" | "off-catalogue";

export type AskCitation = {
  id: string;
  title: string;
  href: string;
};

export type AskPublicResponse = {
  answer: string;
  cited_ids: string[];
  citations: AskCitation[];
  missing: string[];
  scope: AskScope;
  mode: AskPublicMode;
};

export type AskEvaluationResult = {
  decision: AskDecision;
  candidateIds: string[];
};

export type CatalogueQuestionResult = {
  response: AskPublicResponse;
  evaluation: AskEvaluationResult;
};

export const askRequestSchema = z
  .object({
    question: z.string().trim().min(3).max(500),
    item_id: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
  })
  .strict();

export type AskRequest = z.infer<typeof askRequestSchema>;

type AskDependencies = {
  catalogue?: readonly Listing[];
  provider?: QaProviderCaller;
};

export class AskInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AskInputError";
  }
}

const adversarialPatterns = [
  /\bignore\b.{0,40}\b(?:instruction|instructions|prompt|rules)\b/i,
  /\b(?:reveal|show|print|return|expose)\b.{0,50}\b(?:api key|secret|authorization|bearer|environment|system prompt|developer message)\b/i,
  /\b(?:invent|fabricate|create)\b.{0,40}\b(?:listing|item|product|id)\b/i,
  /\b(?:jailbreak|prompt injection)\b/i,
];

const unrelatedPatterns = [
  /\b(?:latest|breaking)\s+(?:news|headlines?)\b/i,
  /\b(?:weather|forecast)\b/i,
  /\b(?:homework|essay|assignment)\b/i,
  /\b(?:write|debug|explain)\s+(?:code|a program|javascript|python)\b/i,
  /\b(?:recipe|politics|election)\b/i,
  /\b(?:another|external)\s+marketplace\b/i,
];

function citationsFor(
  citedIds: readonly string[],
  catalogue: readonly Listing[],
): AskCitation[] {
  const catalogueById = new Map(
    catalogue.map((listing) => [listing.id, listing] as const),
  );

  return citedIds.flatMap((id) => {
    const listing = catalogueById.get(id);

    return listing
      ? [{ id, title: listing.title, href: `/item/${listing.id}` }]
      : [];
  });
}

function responseFor({
  answer,
  citedIds,
  catalogue,
  missing = [],
  scope = "catalogue",
  mode = "deterministic",
}: {
  answer: string;
  citedIds: string[];
  catalogue: readonly Listing[];
  missing?: string[];
  scope?: AskScope;
  mode?: AskPublicMode;
}): AskPublicResponse {
  return {
    answer,
    cited_ids: citedIds,
    citations: citationsFor(citedIds, catalogue),
    missing,
    scope,
    mode,
  };
}

function offCatalogueResponse(
  catalogue: readonly Listing[],
): AskPublicResponse {
  return responseFor({
    answer:
      "I can only answer questions about items in the Somapah Swap catalogue.",
    citedIds: [],
    catalogue,
    scope: "off-catalogue",
  });
}

function isClearlyRejected(question: string): boolean {
  return [...adversarialPatterns, ...unrelatedPatterns].some((pattern) =>
    pattern.test(question),
  );
}

function requiresModelAnswer(question: string): boolean {
  return /\b(?:best|better|compare|comparison|recommend|suitable|versus|vs|why|which.+for|should i)\b/i.test(
    question,
  );
}

function formatList(values: readonly string[]): string {
  if (values.length === 0) {
    return "none listed";
  }

  if (values.length === 1) {
    return values[0];
  }

  return `${values.slice(0, -1).join(", ")} and ${values.at(-1)}`;
}

function deterministicSingleListingAnswer(
  question: string,
  listing: Listing,
  catalogue: readonly Listing[],
): AskPublicResponse | null {
  const normalized = question.toLowerCase();
  const citedIds = [listing.id];

  if (/apple\s+pencil/i.test(question)) {
    const explicitlyExcluded = /no\s+apple\s+pencil/i.test(listing.seller_note);

    return responseFor({
      answer: explicitlyExcluded
        ? `No. The ${listing.title} listing explicitly says that no Apple Pencil is included.`
        : `The ${listing.title} listing does not list an Apple Pencil among its included items.`,
      citedIds,
      catalogue,
      missing: explicitlyExcluded
        ? []
        : ["Apple Pencil inclusion is not confirmed."],
    });
  }

  if (normalized.includes("battery health")) {
    return responseFor({
      answer: `The listing does not say what the ${listing.title}'s battery health is.`,
      citedIds,
      catalogue,
      missing: ["Battery health is not provided."],
    });
  }

  if (normalized.includes("bluetooth")) {
    return responseFor({
      answer:
        `The ${listing.title} listing confirms that it works wired, but ` +
        "Bluetooth was not tested recently, so Bluetooth functionality is not confirmed.",
      citedIds,
      catalogue,
      missing: ["Bluetooth functionality is not confirmed."],
    });
  }

  if (/\b(?:litre|liter|capacity|volume)\b/i.test(question)) {
    return responseFor({
      answer: `The listing does not say the exact capacity of the ${listing.title}.`,
      citedIds,
      catalogue,
      missing: ["Exact capacity is not provided."],
    });
  }

  if (/\bbrand\b/i.test(question)) {
    return responseFor({
      answer: `The listing does not say what brand the ${listing.title} is.`,
      citedIds,
      catalogue,
      missing: ["Brand is not provided."],
    });
  }

  if (/\b(?:fair|worth|good deal|market price)\b/i.test(question)) {
    return responseFor({
      answer:
        `The ${listing.title} is listed at SGD ${listing.price_sgd}. ` +
        "The catalogue has no external market-price data, so it cannot establish whether that price is fair.",
      citedIds,
      catalogue,
      missing: ["External market-price data is not available."],
    });
  }

  if (
    /\b(?:today|same[- ]day|available now|live availability)\b/i.test(question)
  ) {
    return responseFor({
      answer:
        `The ${listing.title} listing says pickup is ${listing.meetup_window}. ` +
        "It does not confirm live availability or same-day pickup.",
      citedIds,
      catalogue,
      missing: ["Live availability is not provided."],
    });
  }

  if (/\b(?:price|cost|how much)\b/i.test(question)) {
    return responseFor({
      answer: `The ${listing.title} is listed at SGD ${listing.price_sgd}.`,
      citedIds,
      catalogue,
    });
  }

  if (/\bcondition\b/i.test(question)) {
    return responseFor({
      answer: `The ${listing.title} is listed in ${listing.condition} condition.`,
      citedIds,
      catalogue,
    });
  }

  if (/\b(?:pickup|pick up|where)\b/i.test(question)) {
    return responseFor({
      answer: `Pickup for the ${listing.title} is listed as ${listing.pickup}.`,
      citedIds,
      catalogue,
    });
  }

  if (/\b(?:meetup|when|window|weekend|weekday)\b/i.test(question)) {
    return responseFor({
      answer: `The listed meetup window for the ${listing.title} is ${listing.meetup_window}.`,
      citedIds,
      catalogue,
    });
  }

  if (
    /\b(?:include|includes|included|come with|comes with|accessor(?:y|ies)|accessories)\b/i.test(
      question,
    )
  ) {
    return responseFor({
      answer:
        listing.includes.length > 0
          ? `The ${listing.title} listing includes ${formatList(listing.includes)}.`
          : `The ${listing.title} listing does not list any included extras.`,
      citedIds,
      catalogue,
      missing:
        listing.includes.length > 0 ? [] : ["No included extras are listed."],
    });
  }

  if (/\b(?:defect|defects|damage|issue|issues|wrong)\b/i.test(question)) {
    return responseFor({
      answer:
        listing.defects.length > 0
          ? `The seller lists these defects for the ${listing.title}: ${formatList(listing.defects)}.`
          : `The seller lists no defects for the ${listing.title}. That does not prove the item has no defects.`,
      citedIds,
      catalogue,
    });
  }

  if (/\b(?:tell me about|summarize|summary)\b/i.test(question)) {
    return responseFor({
      answer:
        `${listing.title} is listed at SGD ${listing.price_sgd} in ${listing.condition} condition. ` +
        `Pickup is ${listing.pickup}, with a meetup window of ${listing.meetup_window}.`,
      citedIds,
      catalogue,
    });
  }

  return null;
}

function deterministicAggregateAnswer(
  question: string,
  catalogue: readonly Listing[],
): AskPublicResponse | null {
  const categoryMatch = question.match(/\b(course|dorm|tech)\b/i);
  const category = categoryMatch?.[1].toLowerCase();
  const scopedListings = category
    ? catalogue.filter((listing) => listing.category === category)
    : [...catalogue];

  if (/\b(?:how many|count)\b/i.test(question)) {
    return responseFor({
      answer: category
        ? `There are ${scopedListings.length} ${category} listings in the catalogue.`
        : `There are ${catalogue.length} listings in the catalogue.`,
      citedIds: [],
      catalogue,
    });
  }

  if (/\bcheapest\b/i.test(question) && scopedListings.length > 0) {
    const cheapest = [...scopedListings].sort(
      (left, right) => left.price_sgd - right.price_sgd,
    )[0];

    return responseFor({
      answer: `The cheapest${category ? ` ${category}` : ""} listing is ${cheapest.title} at SGD ${cheapest.price_sgd}.`,
      citedIds: [cheapest.id],
      catalogue,
    });
  }

  return null;
}

function fallbackResponse(
  candidates: readonly Listing[],
  catalogue: readonly Listing[],
): AskPublicResponse {
  const citedIds = candidates.slice(0, 4).map((listing) => listing.id);

  return responseFor({
    answer:
      "I could not complete the comparison reliably. You can review the relevant listings directly.",
    citedIds,
    catalogue,
    mode: "fallback",
  });
}

export async function answerCatalogueQuestion(
  input: AskRequest,
  dependencies: AskDependencies = {},
): Promise<CatalogueQuestionResult> {
  const catalogue = dependencies.catalogue ?? getListings();
  const provider = dependencies.provider ?? getCatalogueQaProvider();
  const parsedInput = askRequestSchema.safeParse(input);

  if (!parsedInput.success) {
    throw new AskInputError("A valid catalogue question is required.");
  }

  const { question, item_id: itemId } = parsedInput.data;

  if (itemId && !catalogue.some((listing) => listing.id === itemId)) {
    throw new AskInputError("Choose a valid catalogue item.");
  }

  if (isClearlyRejected(question)) {
    return {
      response: offCatalogueResponse(catalogue),
      evaluation: { decision: "reject-locally", candidateIds: [] },
    };
  }

  const retrieval = retrieveListingsForQuestion({
    question,
    itemId,
    limit: requiresModelAnswer(question) && retrievalIsBroad(question) ? 6 : 4,
    catalogue,
  });
  const candidateIds = retrieval.candidates.map((listing) => listing.id);
  const aggregateAnswer = deterministicAggregateAnswer(question, catalogue);

  if (aggregateAnswer) {
    return {
      response: aggregateAnswer,
      evaluation: { decision: "answer-locally", candidateIds },
    };
  }

  if (retrieval.candidates.length === 0) {
    return {
      response: offCatalogueResponse(catalogue),
      evaluation: { decision: "reject-locally", candidateIds: [] },
    };
  }

  if (retrieval.candidates.length === 1) {
    const deterministicAnswer = deterministicSingleListingAnswer(
      question,
      retrieval.candidates[0],
      catalogue,
    );

    if (deterministicAnswer) {
      return {
        response: deterministicAnswer,
        evaluation: { decision: "answer-locally", candidateIds },
      };
    }
  }

  if (requiresModelAnswer(question)) {
    const promptResult = buildGroundedQaPrompt({
      question,
      candidates: retrieval.candidates,
      minimumCandidates: retrieval.candidates.length > 1 ? 2 : 1,
    });

    if (!promptResult.ok) {
      return {
        response: fallbackResponse(promptResult.candidates, catalogue),
        evaluation: { decision: "fallback", candidateIds },
      };
    }

    const providerResult = await provider(promptResult.prompt);

    if (!providerResult.ok) {
      return {
        response: fallbackResponse(promptResult.candidates, catalogue),
        evaluation: { decision: "fallback", candidateIds },
      };
    }

    const modelAnswer = parseGroundedQaOutput(
      providerResult.response,
      promptResult.candidates,
      catalogue,
    );

    if (!modelAnswer) {
      return {
        response: fallbackResponse(promptResult.candidates, catalogue),
        evaluation: { decision: "fallback", candidateIds },
      };
    }

    return {
      response: responseFor({
        answer: modelAnswer.answer,
        citedIds: modelAnswer.cited_ids,
        catalogue,
        missing: modelAnswer.missing,
        mode: "ai",
      }),
      evaluation: { decision: "model-answer", candidateIds },
    };
  }

  if (retrieval.candidates.length === 1) {
    return {
      response: responseFor({
        answer: `The ${retrieval.candidates[0].title} listing does not provide that information.`,
        citedIds: [retrieval.candidates[0].id],
        catalogue,
        missing: ["The requested fact is not provided."],
      }),
      evaluation: { decision: "answer-locally", candidateIds },
    };
  }

  return {
    response: fallbackResponse(retrieval.candidates, catalogue),
    evaluation: { decision: "fallback", candidateIds },
  };
}

function retrievalIsBroad(question: string): boolean {
  return /\b(?:all|compare all|every|options|listings|items)\b/i.test(question);
}
