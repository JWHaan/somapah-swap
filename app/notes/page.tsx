import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Notes",
};

export default function NotesPage() {
  return (
    <main className="page-section page-container" id="main-content">
      <header className="page-heading">
        <p className="eyebrow">Assessment notes</p>
        <h1 id="top">What I built</h1>
        <p>
          Somapah Swap is a seeded second-hand marketplace for SUTD students,
          with a catalogue assistant that answers only from the listing data.
          This page explains how it works and what it deliberately does not do.
        </p>
      </header>

      <nav aria-label="Notes contents" className="notes-nav">
        <h2>On this page</h2>
        <ul>
          <li>
            <a href="#who-it-is-for">Who it is for</a>
          </li>
          <li>
            <a href="#core-buyer-journey">Core buyer journey</a>
          </li>
          <li>
            <a href="#seeded-simulated-and-limited">
              Seeded, simulated, and limited
            </a>
          </li>
          <li>
            <a href="#architecture">Architecture</a>
          </li>
          <li>
            <a href="#one-input-two-routes">One input, two routes</a>
          </li>
          <li>
            <a href="#qanda-grounding-design">Q&amp;A grounding design</a>
          </li>
          <li>
            <a href="#tools-and-models-used">Tools and models used</a>
          </li>
          <li>
            <a href="#validation-and-failure-handling">
              Validation and failure handling
            </a>
          </li>
          <li>
            <a href="#evaluation">Evaluation</a>
          </li>
          <li>
            <a href="#security-and-privacy">Security and privacy</a>
          </li>
          <li>
            <a href="#what-i-chose-not-to-build">What I chose not to build</a>
          </li>
          <li>
            <a href="#release-evaluation-23-september-2026">
              Release evaluation, 23 September 2026
            </a>
          </li>
          <li>
            <a href="#interface-and-themes">
              Interface, themes, and accessibility
            </a>
          </li>
          <li>
            <a href="#what-i-would-build-next">What I would build next</a>
          </li>
          <li>
            <a href="#known-issues-and-unfinished-work">
              Known issues and unfinished work
            </a>
          </li>
        </ul>
      </nav>

      <div className="notes-layout">
        <section className="panel notes-section">
          <h2 id="who-it-is-for">Who it is for</h2>
          <p>
            A SUTD student on a phone who wants a used course, dorm, or tech
            item this week and needs to meet on or near campus at Somapah. The
            reviewer is a stranger who has never been to SUTD, so the copy
            always names the campus rather than assuming local slang.
          </p>
        </section>

        <section className="panel notes-section">
          <h2 id="core-buyer-journey">Core buyer journey</h2>
          <p>
            Browse the 15 seeded listings, filter by category, open an item to
            read its stated condition, defects, and meetup details, ask the
            catalogue assistant a question, then try a clearly simulated
            reservation that contacts nobody and charges nothing.
          </p>
        </section>

        <section className="panel notes-section">
          <h2 id="seeded-simulated-and-limited">
            Seeded, simulated, and limited
          </h2>
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
          <h2 id="architecture">Architecture</h2>
          <p>
            The repository carries three supporting documents:{" "}
            <code>docs/architecture.md</code> for the final component boundaries
            and trust model, <code>docs/evaluation.md</code> for fixture design
            and the full metric table, and <code>docs/decisions/</code> for the
            durable design records behind deterministic-first handling,
            grounding, value-gated search, the unified input, and provider
            resilience. This page is the narrative; those files are the detail.
          </p>
          <p>
            Next.js App Router with TypeScript and a validated JSON catalogue.
            One homepage input answers both “find me listings” and “tell me
            about a listing”. A local, deterministic intent router reads the
            wording and sends the request to <code>POST /api/search</code> for
            listing cards or <code>POST /api/ask</code> for catalogue questions.
            The router makes no model call, and one submission reaches exactly
            one endpoint. The two routes keep their own schemas, validation, and
            provider policy; the unified control is only a client-side front
            door.
          </p>
          <p>
            Search reads a bounded request, parses deterministic constraints,
            applies hard filters, retrieves lexical candidates, and decides
            whether fuzzy reranking adds value before considering one model
            call. Q&amp;A has its separate deterministic-first path. Server-only
            adapters own the gateway credential, and model output can select IDs
            and reasons but cannot rewrite authoritative product records.
          </p>
        </section>

        <section className="panel notes-section">
          <h2 id="one-input-two-routes">One input, two routes</h2>
          <p>
            Buyers previously saw a search box and a separate question box,
            which forced them to know which one to use. There is now a single
            control labelled “Find or ask about listings”. Question-shaped
            wording, comparisons, and fact requests go to the assistant;
            discovery wording, budgets, categories, and conditions go to search.
            Anything ambiguous defaults to search, because showing listings is
            the safer answer.
          </p>
          <p>
            A search keeps the category chips and the authoritative listing
            grid, so chips still filter results without any new request. A
            grounded answer replaces the grid and hides the chips, because
            category filters do not apply to citations. Clearing the control
            returns to the full catalogue with All selected.
          </p>
          <p>
            The intent router is plain deterministic code. It makes no model
            call, and buying behaviour does not change based on which route
            answers: search still returns authoritative marketplace cards with
            match reasons, and Q&amp;A still returns grounded answers with
            validated local citations. Each submission calls exactly one
            endpoint, and neither route falls through to the other.
          </p>
          <p>
            This is deliberately not a chatbot. There are no message bubbles, no
            conversation history, no stored questions, no regeneration controls,
            no multi-turn memory, and no automatic follow-up model calls. The
            search and Q&amp;A routes keep their own validation and provider
            policies, and the consolidation changed nothing about the provider,
            model, endpoint, allowance, timeout, or token settings.
          </p>
          <p>
            <strong>Implementation status, 23 September 2026.</strong> After a
            usability review I consolidated the two separate homepage controls
            into this single helper. The original two-input design was the
            starting point, not a mistake to hide; buyers simply should not need
            to know whether their words are a search or a question.
          </p>
        </section>

        <section className="panel notes-section">
          <h2 id="qanda-grounding-design">Q&amp;A grounding design</h2>
          <p>
            Most questions never reach a model. Exact facts, explicit
            exclusions, missing facts, and off-catalogue requests are decided in
            code, which keeps those paths free of model-generated claims. The
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
          <h2 id="tools-and-models-used">Tools and models used</h2>
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
            GPT came first. The initial server-side integration verified{" "}
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
          <h2 id="validation-and-failure-handling">
            Validation and failure handling
          </h2>
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
          <h2 id="evaluation">Evaluation</h2>
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
          <h2 id="security-and-privacy">Security and privacy</h2>
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
          <h2 id="what-i-chose-not-to-build">What I chose not to build</h2>
          <p>
            No authentication, payments, seller messaging, or real reservations,
            because the assessment does not require them and they would add risk
            without demonstrating anything about the buyer journey. No vector
            database or embeddings: with 15 listings, lexical retrieval plus
            targeted prompt bounds is easier to reason about and to test.
          </p>
        </section>

        <section className="panel notes-section">
          <h2 id="release-evaluation-23-september-2026">
            Release evaluation, 23 September 2026
          </h2>
          <p>
            Every figure below is computed from this repository&apos;s named
            evaluation fixtures, so it describes fixture behaviour rather than
            general marketplace accuracy.
          </p>
          <p>
            I consolidated the deterministic and mocked suites into one command,
            <code>npm run eval</code>, which never contacts a provider. Across{" "}
            <strong>20 intent-routing fixtures</strong>,{" "}
            <strong>30 catalogue Q&amp;A fixtures,</strong> and{" "}
            <strong>27 search fixtures</strong>, every scored case passes:
            routing 100%, Q&amp;A 100%, and search 100%.
          </p>
          <ul className="metric-grid">
            <li className="metric-card">
              <span className="metric-card__label">Intent fixtures</span>
              <span className="metric-card__value">20 / 100%</span>
            </li>
            <li className="metric-card">
              <span className="metric-card__label">Q&amp;A fixtures</span>
              <span className="metric-card__value">30 / 100%</span>
            </li>
            <li className="metric-card">
              <span className="metric-card__label">Search fixtures</span>
              <span className="metric-card__value">27 / 100%</span>
            </li>
            <li className="metric-card">
              <span className="metric-card__label">
                Zero-provider-call fixtures
              </span>
              <span className="metric-card__value">100%</span>
            </li>
            <li className="metric-card">
              <span className="metric-card__label">Deterministic requests</span>
              <span className="metric-card__value">81.5%</span>
            </li>
            <li className="metric-card">
              <span className="metric-card__label">
                Max AI results observed
              </span>
              <span className="metric-card__value">3</span>
            </li>
          </ul>
          <ul>
            <li>
              81.5% of search fixtures are resolved deterministically with zero
              provider calls; 18.5% are genuinely model-worthy and make exactly
              one call.
            </li>
            <li>
              Zero-provider-call fixtures and exactly-one-call fixtures both
              hold at 100% across their fixtures. No retries, no repair calls,
              no provider or model switching, no tools, and no endpoint
              fall-through.
            </li>
            <li>
              Missing-fact accuracy, off-topic and adversarial rejection, and
              no-match accuracy are all 100% across their fixtures.
            </li>
            <li>
              Invalid listing IDs and invalid citations are rejected in 100% of
              their fixtures, and the whole answer is discarded rather than
              partially shown.
            </li>
            <li>
              For the search fixtures that declare an expected top hit, the
              expected listing appears in the top three in 100% of them. The
              average candidate count is 2.1 and the maximum is 6. AI reranking
              returned 3 results in the fixtures that exercised it; the
              configured cap is 4.
            </li>
          </ul>
          <p>
            The suite breakdown, fixture design, and the full metric table live
            in <code>docs/evaluation.md</code>; this section records what the
            numbers mean.
          </p>
          <p>
            Provider resilience is evaluated with mocks only: timeout, rate
            limit, authentication failure, unavailable provider, an HTTP 200
            error envelope, malformed JSON, empty content, fenced JSON, unknown
            IDs, self-negating reasons, unsupported claims, and ungrounded
            measurements. Q&amp;A degrades to a grounded deterministic fallback
            and search degrades to catalogue keyword matching, with exactly one
            provider call in every case.
          </p>
          <p>
            Catalogue-growth regressions use synthetic records only;{" "}
            <code>data/listings.json</code> is never modified. Sixteen checks
            confirm that candidate counts stay bounded, hard price, category,
            condition, accessory, and feature constraints still apply to new
            records, unconfirmed features never qualify, results stay
            candidate-bound, and public response schemas do not change.
          </p>
          <p>
            Two defects surfaced during this evaluation and were fixed with
            tests: price-comparator filler such as “below” and “less than” was
            leaking into lexical terms, so eight of nine price phrasings
            returned no match instead of applying the bound; and a reranker that
            threw escaped the search orchestrator instead of degrading to
            catalogue matching.
          </p>
          <p>
            One gap found during this evaluation was fixed rather than left
            open. Q&amp;A lexical retrieval had no <code>calculator</code>/
            <code>casio</code> alias, so “What comes with the calculator?”
            declined instead of naming the included case. The calculator family
            now resolves through a general product-alias rule, and inclusion
            questions are answered deterministically from the authoritative{" "}
            <code>includes</code> field. Six strict fixtures cover the phrasing
            variants, and a boundary fixture keeps unrelated “case” questions
            from resolving to the calculator.
          </p>
          <p>
            Privacy and security were re-audited: the credential is absent from
            tracked files, the browser bundle, the server build, and reachable
            history; no provider payload, reasoning text, request identifier, or
            local path is committed; and no client component imports a provider
            adapter.
          </p>
        </section>

        <section className="panel notes-section">
          <section className="panel notes-section">
            <h2 id="interface-and-themes">
              Interface, themes, and accessibility
            </h2>
            <p>
              I rebuilt the visual layer on one semantic token system instead of
              scattered colours. Surfaces, text roles, borders, actions, states,
              shadows, radii, spacing, type scale, and motion durations are all
              named tokens, with light and dark values resolved through{" "}
              <code>light-dark()</code> and <code>color-scheme</code>.
            </p>
            <p>
              The header has a labelled Light, Dark, and System control. The
              choice persists in <code>localStorage</code> and is applied with a{" "}
              <code>data-theme</code> attribute, and a tiny inline script
              applies an explicit choice before the first paint so there is no
              wrong-theme flash. System mode sets no attribute at all, which
              means the page still picks the right theme with JavaScript delayed
              or storage unavailable.
            </p>
            <p>
              I worked against WCAG 2.2 AA-oriented practices rather than
              claiming certification. Both themes were measured independently
              for text contrast, and two light-theme failures found that way —
              the condition badge at 4.32:1 and the footer copy at 4.39:1 — were
              corrected to 5.68:1 and 6.96:1. Focus rings are 3px, touch targets
              are about 44px, selected filters carry a dot marker as well as
              colour, and reduced-motion users get nonessential transitions
              removed.
            </p>
            <p>
              Layout was checked at 320, 375, 390, 768, 1024, and 1440 pixels
              with no horizontal overflow, and text resized to 200% still keeps
              the helper usable. Listing cards now lead with a category marker,
              title, price, and condition, surface a listed defect instead of
              hiding it, and never imply that an empty defects list means
              defect-free.
            </p>
            <p>
              None of this touched behaviour. The routes, provider adapters,
              retrieval, intent routing, constraints, catalogue facts, and
              package dependencies are unchanged; the helper only gained
              buyer-facing copy for its result modes and three example chips
              that run through the same router and validation as typed input.
            </p>
          </section>

          <section className="panel notes-section">
            <h2 id="what-i-would-build-next">What I would build next</h2>
            <p>
              In rough order of value per unit of risk. Nothing here is required
              for the current demo, and none of it is started.
            </p>
            <ol>
              <li>
                <strong>Distributed rate limiting.</strong> A public
                model-backed endpoint should be throttled per caller before it
                is advertised. This is the single largest gap between the demo
                and something I would let strangers hammer.
              </li>
              <li>
                <strong>Item-page Q&amp;A.</strong> The API already accepts an
                optional <code>item_id</code>, so the item page can pass context
                without changing the route, retrieval, or response schema.
              </li>
              <li>
                <strong>Database-backed retrieval.</strong> The lexical layer is
                tuned for 15 records. Past a few hundred listings I would move
                the catalogue into a database with full-text search, and only
                consider embeddings if relevance measurements showed lexical
                search plateauing.
              </li>
              <li>
                <strong>Structured provider output.</strong> The application
                validates JSON itself because the gateway does not document
                native schema support. If that lands, the prompt and parser can
                shrink.
              </li>
              <li>
                <strong>
                  A second live verification of corrected study retrieval.
                </strong>
                The post-correction behaviour is proven by deterministic and
                mocked tests only. One controlled live request would close that
                gap.
              </li>
              <li>
                <strong>Device testing.</strong> Physical-phone checks and a
                desktop Playwright project would turn the automated 375-pixel
                evidence into a broader matrix.
              </li>
              <li>
                <strong>
                  Seller accounts, messaging, and real reservations.
                </strong>
                These need authentication, moderation, and a payment decision,
                so they are a different product rather than a next increment.
              </li>
            </ol>
          </section>

          <h2 id="known-issues-and-unfinished-work">
            Known issues and unfinished work
          </h2>
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
