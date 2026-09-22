import Link from "next/link";

import { ThemeSelector } from "@/components/ThemeSelector";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner page-container">
        <Link className="brand" href="/">
          <span className="brand__mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path d="M6 9h9l-2.4-2.4" />
              <path d="M18 15H9l2.4 2.4" />
            </svg>
          </span>
          <span className="brand__text">
            <span className="brand__name">Somapah Swap</span>
            <span className="brand__descriptor">SUTD campus exchange</span>
          </span>
        </Link>
        <nav className="site-nav" aria-label="Primary navigation">
          <Link href="/#catalogue">Browse</Link>
          <Link href="/notes">Notes</Link>
        </nav>
        <ThemeSelector />
      </div>
    </header>
  );
}
