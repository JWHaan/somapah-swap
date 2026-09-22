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
            The browser calls <code>POST /api/search</code> for listing cards
            and
            <code>POST /api/ask</code> for catalogue questions. Search reads a
            bounded request, parses deterministic constraints, applies hard
            filters, retrieves lexical candidates, and decides whether fuzzy
            reranking adds value before considering one model call. Q&amp;A has
            its separate deterministic-first path. Server-only adapters own the
            gateway credential, and model output can select IDs and reasons but
            cannot rewrite authoritative product records.
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
            happen only on the server. Search uses deterministic constraint
            parsing and lexical retrieval first, with one optional reranking
            call only when multiple fuzzy candidates remain.
          </p>
          <p>
            The assistant and search reranker use{" "}
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
              Search queries are 3–300 characters. Deterministic constraints
              make zero model calls; fuzzy ordering sends at most six candidates
              to one search call and returns at most four validated results.
            </li>
            <li>
              Search uses a fixed 300-token, reasoning-disabled request with an
              8-second provider timeout and a 12-second route maximum. Q&amp;A
              keeps its separate 450-token, 25-second, and 30-second policy.
            </li>
            <li>
              Search IDs must be catalogue IDs from the retrieved candidate set.
              Hard constraints are reapplied after model output, and a
              self-negating or unsupported reason falls back to deterministic
              catalogue matching.
            </li>
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
              Q&amp;A regressions remain green, including the iPad Apple Pencil
              exclusion, missing battery health, unconfirmed Bluetooth, fridge
              capacity, bike brand, monitor fairness, same-day availability, and
              off-catalogue refusals.
            </li>
            <li>
              Deterministic search cases make zero provider calls: fan under a
              budget, monitor/MRT, Arduino/prototyping, laptop raising, tech
              under S$20, like-new tech, calculator, iPad, and dorm filters.
            </li>
            <li>
              Study/workspace retrieval keeps desk-small-05 and laptop-stand-15,
              excludes the fan and mini fridge for study-only intent, and unions
              a fan back in for a combined study-and-cooling request.
            </li>
            <li>
              Fuzzy multi-candidate search cases use exactly one mocked provider
              boundary call and cap results at four. Provider failures and
              self-negating reasons use keyword fallback.
            </li>
            <li>
              Gaming PC, invention prompts, contradictory prices, and unknown
              required features return no-match rather than unrelated filler.
            </li>
          </ul>
          <p>
            The first controlled live search request was made before the
            retrieval correction. It returned <code>mode: ai-reranked</code>
            with one provider call and validated IDs, but its candidate set
            included a fan and mini fridge while omitting the laptop stand.
            Post-correction behavior is established by deterministic and mocked
            regression tests; no second live request was made.
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
            One controlled live search request was made before the retrieval
            correction for
            <code>something compact for studying in a small hostel room</code>.
            It returned HTTP 200, <code>mode: ai-reranked</code>, exactly one
            provider call, approximately 1.55 seconds of route latency, and
            validated final IDs <code>desk-small-05</code> and
            <code>fan-hostel-01</code>. The candidate set also included
            <code>fridge-mini-03</code> and omitted
            <code>laptop-stand-15</code>, exposing a lexical purpose-matching
            weakness. The model explicitly said the fan was not study-related.
          </p>
          <p>
            I corrected that weakness deterministically with general
            study/workspace, laptop-raising, cooling, food-storage, and
            multi-intent evidence profiles. Study-only retrieval now requires
            stronger purpose evidence; generic hostel, dorm, and small-room
            words do not qualify every dorm appliance. Search also rejects
            clearly self-negating model reasons and falls back to catalogue
            matching. The correction was verified by deterministic and mocked
            regression tests, not by another live provider request.
          </p>
          <p>
            Exact dimensions, weight, and compactness remain unknown unless a
            listing states them. Natural-language search remains lexical plus
            optional one-call reranking, so unusual phrasing can still be less
            precise than a larger semantic retrieval system. The item page does
            not yet pre-fill Q&amp;A context even though the API accepts
            <code>item_id</code>, and the public deployment has no distributed
            rate limiting.
          </p>
        </section>
      </div>
    </main>
  );
}
