import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner page-container">
        <div className="site-footer__brand">
          <p className="site-footer__name">Somapah Swap</p>
          <p className="site-footer__note">
            A trusted, lightweight exchange for the SUTD campus community.
          </p>
        </div>
        <p className="site-footer__disclosure">
          Listings are seeded demonstration data. Reserve is simulated — no
          payment is taken and no seller is contacted.
        </p>
        <nav aria-label="Footer navigation" className="site-footer__nav">
          <Link href="/notes">Assessment notes</Link>
          <Link href="/#catalogue">Browse listings</Link>
        </nav>
      </div>
    </footer>
  );
}
