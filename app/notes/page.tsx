import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Notes",
};

export default function NotesPage() {
  return (
    <main className="page-section page-container" id="main-content">
      <header className="page-heading">
        <p className="eyebrow">Assessment notes</p>
        <h1>What I built</h1>
        <p>
          Somapah Swap is a seeded second-hand marketplace for SUTD students,
          with a catalogue assistant that answers only from the listing data.
          This page explains how it works and what it deliberately does not do.
        </p>
      </header>

      <div className="notes-layout">
        <section className="panel notes-section">
          <h2>Who it is for</h2>
          <p>
            A SUTD student on a phone who wants a used course, dorm, or tech
            item this week and needs to meet on or near campus at Somapah. The
            reviewer is a stranger who has never been to SUTD, so the copy
            always names the campus rather than assuming local slang.
          </p>
        </section>

        <section className="panel notes-section">
          <h2>Core buyer journey</h2>
          <p>
            Browse the 15 seeded listings, filter by category, open an item to
            read its stated condition, defects, and meetup details, ask the
            catalogue assistant a question, then try a clearly simulated
            reservation that contacts nobody and charges nothing.
          </p>
        </section>

        <section className="panel notes-section">
          <h2>Seeded, simulated, and limited</h2>
          <ul>
            <li>All 15 listings are seeded demonstration records.</li>
            <li>No real sellers or user accounts exist.</li>
            <li>Reserve does not contact anyone and takes no payment.</li>
            <li>Availability is whatever the seller wrote; nothing is live.</li>
            <li>
              Four facts are deliberately absent so the assistant has to admit
              it: iPad battery health, Keychron Bluetooth status, mini-fridge
              capacity, and folding-bike brand.
            </li>
          </ul>
        </section>

        <section className="panel notes-section">
          <h2>Architecture</h2>
          <p>
            Next.js App Router with TypeScript and a validated JSON catalogue.
            The browser calls <code>POST /api/ask</code>; the route reads a
            bounded request body, validates it strictly, retrieves a small set
            of relevant listings, decides whether the question is answerable in
            code, and only then considers the model. A single server-only
            adapter owns the gateway credential, so it never enters browser
            code, and the model never receives product objects it can rewrite.
          </p>
        </section>

        <section className="panel notes-section">
          <h2>Q&amp;A grounding design</h2>
          <p>
            Most questions never reach a model. Exact facts, explicit
            exclusions, missing facts, and off-catalogue requests are decided in
            code, which makes them faster and impossible to hallucinate. The
            model is asked only when a comparison or explanation genuinely
            benefits from language reasoning, and it receives just the retrieved
            listings.
          </p>
          <p>
            Model citations are treated as untrusted. Every cited ID must be a
            plain listing ID that exists in the catalogue and was in the
            retrieved set. If any citation is invented, external, or outside
            that set, I discard the whole answer rather than showing part of it,
            and I never ask the model to repair itself.
          </p>
        </section>

        <section className="panel notes-section">
          <h2>Tools and models used</h2>
          <p>
            I built this with Codex as the AI coding tool, working to the
            assessment brief and the Cognitio gateway documentation. Model calls
            happen only on the server. No model powers search yet, because
            natural-language search is not implemented in this milestone.
          </p>
          <p>
            The assistant currently uses{" "}
            <code>deepseek/deepseek-v4.1-flash</code> through the gateway&apos;s
            explicit OpenRouter route, which has a separate budget. The gateway
            automatic fallback is not used.
          </p>
          <p>
            GPT came first. During Milestone 2 I verified{" "}
            <code>gpt-5.6-luna</code> through the default chat-completions
            route, locally and from the deployed site. Later, that route began
            answering with <code>X-Gateway-Fallback: window_share</code> because
            the subscription share was exhausted, and the automatic fallback
            upstream returned an HTTP 200 body containing an error object
            instead of choices. Rather than wait for the share to recover, I
            moved Q&amp;A to the explicit OpenRouter route. The original GPT
            adapter is still implemented and tested behind the same
            provider-independent interface, so switching back is a one-line
            change.
          </p>
          <p>
            Reasoning is explicitly disabled for this request with{" "}
            <code>{'reasoning: { effort: "none", exclude: true }'}</code>. A
            64-token reasoning cap was tried first but the upstream route
            accepted it without honouring it, which left no room for an answer.
            Disabling reasoning produced a short structured JSON reply from the
            same 450-token completion budget.
          </p>
        </section>

        <section className="panel notes-section">
          <h2>Validation and failure handling</h2>
          <ul>
            <li>
              Questions are 3–500 characters and unknown fields are rejected.
            </li>
            <li>Raw request bodies over 2 KiB are refused before parsing.</li>
            <li>
              The model path makes at most one provider call, with a fixed model
              and endpoint, no tools, no history, and a 25-second provider
              timeout. The <code>/api/ask</code> function is allowed a 30-second
              maximum duration, which leaves bounded processing time after the
              provider cutoff.
            </li>
            <li>
              There is no automatic retry. A retry would add latency, could
              still fail, and would consume the shared provider allowance
              unpredictably.
            </li>
            <li>
              Timeouts, rate limits, malformed model output, and bad citations
              all resolve to a deterministic summary of the retrieved listings.
            </li>
            <li>
              Buyer responses never include provider status, headers, token
              counts, latency, prompts, or internal scoring.
            </li>
          </ul>
        </section>

        <section className="panel notes-section">
          <h2>Evaluation</h2>
          <ul>
            <li>
              iPad Apple Pencil question: correctly answered “no”, no model
              call.
            </li>
            <li>
              Battery health, fridge capacity, bike brand: “the listing does not
              say”.
            </li>
            <li>Keychron Bluetooth: reported as not confirmed, wired noted.</li>
            <li>
              Monitor fairness: price quoted, external market data declined.
            </li>
            <li>
              Same-day fridge pickup: meetup window quoted, live availability
              declined.
            </li>
            <li>
              Latest-news and secret-extraction prompts: declined, no model
              call.
            </li>
            <li>
              Desk-versus-stand comparison: one model call, citations validated.
            </li>
          </ul>
          <p>
            These cases run automatically in the test suite, including
            adversarial ones that assert no provider call happens at all.
          </p>
        </section>

        <section className="panel notes-section">
          <h2>Security and privacy</h2>
          <ul>
            <li>
              The gateway credential is server-side and never in model context.
            </li>
            <li>Questions and listing text are treated as untrusted data.</li>
            <li>Clients cannot choose a model, endpoint, headers, or tools.</li>
            <li>No arbitrary URL fetching exists.</li>
            <li>Raw provider errors and stack traces are never returned.</li>
          </ul>
        </section>

        <section className="panel notes-section">
          <h2>What I chose not to build</h2>
          <p>
            No authentication, payments, seller messaging, or real reservations,
            because the assessment does not require them and they would add risk
            without demonstrating anything about the buyer journey. No vector
            database or embeddings: with 15 listings, lexical retrieval plus
            targeted prompt bounds is easier to reason about and to test.
          </p>
        </section>

        <section className="panel notes-section">
          <h2>Known issues and unfinished work</h2>
          <p>
            <span className="status-badge">Verified with caveats</span>
          </p>
          <p>
            Production has shown both outcomes for the same comparison question.
            One request returned a real grounded answer: <code>mode: ai</code>,
            finish reason <code>stop</code>, zero reasoning tokens, 238 visible
            output tokens and 583 total tokens in roughly 3.2 seconds. It cited
            only the folding desk and the laptop stand, both retrieved
            candidates, and it named what the catalogue cannot establish:
            dimensions, folded size, weight, exact laptop compatibility, and
            whether either item suits a particular room.
          </p>
          <p>
            A separate production request with the same question retrieved the
            same two listings, but the provider did not answer before my
            25-second cutoff. The function ran for about 25 seconds, aborted the
            provider call, and returned <code>mode: fallback</code>: a
            deterministic summary that still linked the folding desk and laptop
            stand with their authoritative details. It finished inside the
            30-second function limit.
          </p>
          <p>
            That intermittent behaviour comes from upstream provider latency,
            which I cannot control, not from retrieval or citation logic — both
            requests selected the same two correct listings. Provider latency is
            therefore an external production limitation, and the timeout
            boundary is what makes it safe rather than invisible. The
            deterministic catalogue answers never depend on the provider at all.
          </p>
          <p>
            Earlier attempts failed honestly before this worked: the default
            fallback route returned an HTTP 200 error envelope, the first
            explicit OpenRouter attempt spent its whole budget on reasoning, and
            a later attempt exceeded the original twelve-second timeout. Each
            one fell back to the grounded deterministic summary with validated
            listings rather than inventing an answer.
          </p>
          <p>
            Natural-language marketplace search, keyword search fallback, and
            result reranking are not implemented, so the home page still uses
            category filters rather than a search box. The assistant appears on
            the home page only; the item page does not yet pre-fill its item
            context even though the API already accepts it. Retrieval is lexical
            and tuned for this small catalogue, so it would need revisiting
            before a much larger one. Very unusual phrasings can still retrieve
            a loosely related item, because the relevance rules are heuristics
            rather than true language understanding.
          </p>
        </section>
      </div>
    </main>
  );
}
