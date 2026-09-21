import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner page-container">
        <Link className="brand" href="/">
          <span className="brand__mark" aria-hidden="true">
            S
          </span>
          <span>Somapah Swap</span>
        </Link>
        <nav className="site-nav" aria-label="Primary navigation">
          <Link href="/#catalogue">Browse</Link>
          <Link href="/notes">Notes</Link>
        </nav>
      </div>
    </header>
  );
}
