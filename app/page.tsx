import { CatalogueAssistant } from "@/components/CatalogueAssistant";
import { MarketplaceCatalogue } from "@/components/MarketplaceCatalogue";
import { getListings } from "@/lib/catalogue";

export default function Home() {
  const listings = getListings();

  return (
    <main id="main-content">
      <section className="hero page-container" aria-labelledby="page-title">
        <div className="hero__copy">
          <p className="eyebrow">SUTD campus marketplace demo</p>
          <h1 id="page-title">Somapah Swap</h1>
          <p>
            Used course, dorm, and tech gear for SUTD students. Review
            seller-provided pickup details and arrange meetups around Somapah.
          </p>
        </div>
        <div className="hero__notice" role="note">
          <strong>Demo catalogue</strong>
          <p>
            Listings are seeded. Reserve is simulated. No payment is taken and
            no real seller is contacted.
          </p>
        </div>
      </section>

      <CatalogueAssistant />

      <MarketplaceCatalogue listings={listings} />
    </main>
  );
}
