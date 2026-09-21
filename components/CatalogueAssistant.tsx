"use client";

import { useId, useState } from "react";

const MAX_QUESTION_LENGTH = 500;
const MIN_QUESTION_LENGTH = 3;
const genericErrorMessage =
  "The catalogue assistant is temporarily unavailable. Please try again.";

type AskCitation = {
  id: string;
  title: string;
  href: string;
};

type AskResponse = {
  answer: string;
  cited_ids: string[];
  citations: AskCitation[];
  missing: string[];
  scope: "catalogue" | "off-catalogue";
  mode: "deterministic" | "ai" | "fallback";
};

type AskStatus = "idle" | "pending" | "answered" | "error";

function isCitation(value: unknown): value is AskCitation {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.href === "string" &&
    candidate.href.startsWith("/item/")
  );
}

function isAskResponse(value: unknown): value is AskResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.answer === "string" &&
    candidate.answer.trim().length > 0 &&
    Array.isArray(candidate.cited_ids) &&
    candidate.cited_ids.every((id) => typeof id === "string") &&
    Array.isArray(candidate.citations) &&
    candidate.citations.every(isCitation) &&
    Array.isArray(candidate.missing) &&
    candidate.missing.every((entry) => typeof entry === "string") &&
    (candidate.scope === "catalogue" || candidate.scope === "off-catalogue") &&
    (candidate.mode === "deterministic" ||
      candidate.mode === "ai" ||
      candidate.mode === "fallback")
  );
}

export function CatalogueAssistant() {
  const inputId = useId();
  const helpId = useId();
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<AskStatus>("idle");
  const [result, setResult] = useState<AskResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const pending = status === "pending";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedQuestion = question.trim();

    if (
      trimmedQuestion.length < MIN_QUESTION_LENGTH ||
      trimmedQuestion.length > MAX_QUESTION_LENGTH
    ) {
      setStatus("error");
      setResult(null);
      setErrorMessage(
        `Enter a question between ${MIN_QUESTION_LENGTH} and ${MAX_QUESTION_LENGTH} characters.`,
      );
      return;
    }

    setStatus("pending");
    setResult(null);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmedQuestion }),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const safeError =
          typeof payload === "object" &&
          payload !== null &&
          typeof (payload as Record<string, unknown>).error === "string"
            ? ((payload as Record<string, unknown>).error as string)
            : genericErrorMessage;

        setStatus("error");
        setErrorMessage(safeError);
        return;
      }

      if (!isAskResponse(payload)) {
        setStatus("error");
        setErrorMessage(genericErrorMessage);
        return;
      }

      setResult(payload);
      setStatus("answered");
    } catch {
      setStatus("error");
      setErrorMessage(genericErrorMessage);
    }
  }

  return (
    <section
      className="assistant-section page-container"
      id="catalogue-assistant"
      aria-labelledby="assistant-heading"
    >
      <div className="panel assistant-panel">
        <p className="eyebrow">Catalogue assistant</p>
        <h2 id="assistant-heading">Ask about the catalogue</h2>
        <p className="assistant-intro">
          Ask about price, condition, included items, defects, or meetup details
          for the seeded Somapah Swap listings. It does not answer anything
          outside this catalogue.
        </p>

        <form className="assistant-form" onSubmit={handleSubmit}>
          <label className="assistant-label" htmlFor={inputId}>
            Your question
          </label>
          <textarea
            aria-describedby={helpId}
            className="assistant-input"
            id={inputId}
            maxLength={MAX_QUESTION_LENGTH}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Does the iPad include an Apple Pencil?"
            rows={3}
            value={question}
          />
          <p className="assistant-help" id={helpId}>
            Up to {MAX_QUESTION_LENGTH} characters. Answers come from the seeded
            listings only.
          </p>
          <button className="assistant-submit" disabled={pending} type="submit">
            {pending
              ? "Checking the catalogue…"
              : "Ask the catalogue assistant"}
          </button>
        </form>

        <div aria-live="polite" className="assistant-status">
          {status === "pending" ? <p>Looking through the listings…</p> : null}

          {status === "error" && errorMessage ? (
            <p className="assistant-error" role="alert">
              {errorMessage}
            </p>
          ) : null}

          {status === "answered" && result ? (
            <div className="assistant-result">
              <p className="assistant-answer">{result.answer}</p>

              {result.missing.length > 0 ? (
                <div className="assistant-missing">
                  <h3>Not established by the catalogue</h3>
                  <ul>
                    {result.missing.map((entry) => (
                      <li key={entry}>{entry}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {result.citations.length > 0 ? (
                <div className="assistant-citations">
                  <h3>
                    {result.citations.length === 1
                      ? "Listing referenced"
                      : "Listings referenced"}
                  </h3>
                  <ul>
                    {result.citations.map((citation) => (
                      <li key={citation.id}>
                        <a href={citation.href}>
                          <span aria-hidden="true">→</span> {citation.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {result.mode === "fallback" ? (
                <p className="assistant-note">
                  The comparison could not be completed by the assistant, so it
                  linked the relevant listings for you to review.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
