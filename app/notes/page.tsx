import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Notes",
};

export default function NotesPage() {
  return (
    <main className="page-section page-container" id="main-content">
      <header className="page-heading">
        <p className="eyebrow">Assessment notes</p>
        <h1>What is built so far</h1>
        <p>
          This page documents the current milestone honestly. The marketplace is
          deployed, and a minimal server-side model connection has been verified
          locally. Natural-language search and catalogue Q&amp;A are still
          pending.
        </p>
      </header>

      <div className="notes-layout">
        <section className="panel notes-section">
          <h2>Product and intended buyer</h2>
          <p>
            Somapah Swap is a mobile-first second-hand marketplace demo for SUTD
            students looking for course, dorm, or tech items around the Somapah
            campus.
          </p>
        </section>

        <section className="panel notes-section">
          <h2>Core buyer journey</h2>
          <p>
            A buyer can browse the catalogue, filter it by category, open an
            item, review its stated condition and meetup details, and try a
            clearly simulated reservation.
          </p>
        </section>

        <section className="panel notes-section">
          <h2>Seeded and simulated</h2>
          <ul>
            <li>All 15 listings are seeded demonstration records.</li>
            <li>No real sellers or user accounts exist.</li>
            <li>Reserve does not contact anyone or take payment.</li>
          </ul>
        </section>

        <section className="panel notes-section">
          <h2>Current architecture</h2>
          <p>
            The app uses Next.js App Router and TypeScript. A validated local
            JSON catalogue supplies the browse page and item routes. Client
            components are limited to category filtering and the reserve
            interaction. A centralized server-only adapter owns the fixed
            Cognitio gateway request and credential access.
          </p>
        </section>

        <section className="panel notes-section">
          <h2>Implemented so far</h2>
          <ul>
            <li>Responsive browse and item-detail routes</li>
            <li>Deterministic category filters</li>
            <li>Runtime catalogue validation and focused tests</li>
            <li>Accessible simulated reserve feedback</li>
            <li>Bounded, fixed-model server-side gateway adapter</li>
            <li>Locally verified temporary diagnostic route</li>
          </ul>
        </section>

        <section className="panel notes-section">
          <h2>Pending AI work</h2>
          <p>
            <span className="status-badge">Gateway connection only</span>
          </p>
          <p>
            Natural-language search, keyword fallback, catalogue Q&amp;A,
            grounding, citation validation, and model evaluation are not
            implemented. The diagnostic route is temporary, is not linked from
            marketplace navigation, and will not become the final search or
            Q&amp;A API.
          </p>
        </section>

        <section className="panel notes-section">
          <h2>Known limitations</h2>
          <p>
            The catalogue is fixed, reserve is non-persistent, no seller can
            respond, and production model verification is pending Vercel
            configuration and redeployment. Pickup and meetup availability are
            only the seller-provided seeded statements.
          </p>
        </section>
      </div>
    </main>
  );
}
