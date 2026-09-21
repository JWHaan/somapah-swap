import {
  AskInputError,
  answerCatalogueQuestion,
  askRequestSchema,
} from "@/lib/catalogue-qa";

const MAX_ASK_BODY_BYTES = 2_048;

export const maxDuration = 30;

const inputErrorMessage = "A valid catalogue question is required.";
const bodyTooLargeMessage = "The request body is too large.";
const unavailableMessage =
  "The catalogue assistant is temporarily unavailable.";

function errorResponse(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

type BoundedBodyResult =
  { ok: true; text: string } | { ok: false; reason: "too-large" };

async function readBoundedBody(request: Request): Promise<BoundedBodyResult> {
  const declaredLength = request.headers.get("content-length");

  if (declaredLength && /^\d+$/.test(declaredLength.trim())) {
    if (Number(declaredLength.trim()) > MAX_ASK_BODY_BYTES) {
      return { ok: false, reason: "too-large" };
    }
  }

  const body = request.body;

  if (!body) {
    return { ok: true, text: "" };
  }

  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let totalBytes = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      totalBytes += value.byteLength;

      if (totalBytes > MAX_ASK_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "too-large" };
      }

      text += decoder.decode(value, { stream: true });
    }

    text += decoder.decode();
  } catch {
    await reader.cancel().catch(() => undefined);
    return { ok: false, reason: "too-large" };
  }

  return { ok: true, text };
}

export async function POST(request: Request): Promise<Response> {
  const body = await readBoundedBody(request);

  if (!body.ok) {
    return errorResponse(413, bodyTooLargeMessage);
  }

  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(body.text);
  } catch {
    return errorResponse(400, inputErrorMessage);
  }

  try {
    const parsedRequest = askRequestSchema.safeParse(parsedJson);

    if (!parsedRequest.success) {
      return errorResponse(400, inputErrorMessage);
    }

    const result = await answerCatalogueQuestion(parsedRequest.data);

    return Response.json(result.response);
  } catch (error) {
    if (error instanceof AskInputError) {
      return errorResponse(400, error.message);
    }

    return errorResponse(500, unavailableMessage);
  }
}
