import { CatalogueHelper } from "@/components/CatalogueHelper";
import { getListings } from "@/lib/catalogue";

export default function Home() {
  const listings = getListings();

  return (
    <main id="main-content">
      <section className="hero page-container" aria-labelledby="page-title">
        <div className="hero__copy">
          <p className="eyebrow">SUTD campus exchange</p>
          <h1 id="page-title">Somapah Swap</h1>
          <p>
            A trusted, lightweight exchange for the SUTD campus community. Find
            seeded course, dorm, and tech gear, then arrange a meetup around
            Somapah.
          </p>
          <ul className="hero__meta">
            <li className="hero__stat">{listings.length} seeded listings</li>
            <li className="hero__stat">Meetups on campus</li>
            <li className="hero__stat">No account needed</li>
          </ul>
        </div>
        <div className="hero__notice" role="note">
          <strong>Demo catalogue</strong>
          <p>
            Listings are seeded demonstration data. Reserve is simulated — no
            payment is taken and no seller is contacted.
          </p>
        </div>
      </section>

      <CatalogueHelper listings={listings} />
    </main>
  );
}
