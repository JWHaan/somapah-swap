import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found page-container" id="main-content">
      <p className="eyebrow">404</p>
      <h1>Listing not found</h1>
      <p>
        This seeded catalogue does not contain the requested listing. Browse the
        available course, dorm, and tech items instead.
      </p>
      <Link className="primary-link" href="/#catalogue">
        Browse listings
      </Link>
    </main>
  );
}
