import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SimulatedReserve } from "@/components/SimulatedReserve";
import { getListingById, getListings } from "@/lib/catalogue";

type ItemPageProps = {
  params: Promise<{ id: string }>;
};

function formatLabel(value: string): string {
  return value
    .split("-")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

export function generateStaticParams() {
  return getListings().map((listing) => ({ id: listing.id }));
}

export async function generateMetadata({
  params,
}: ItemPageProps): Promise<Metadata> {
  const { id } = await params;
  const listing = getListingById(id);

  return {
    title: listing?.title ?? "Listing not found",
  };
}

export default async function ItemPage({ params }: ItemPageProps) {
  const { id } = await params;
  const listing = getListingById(id);

  if (!listing) {
    notFound();
  }

  return (
    <main className="page-section page-container" id="main-content">
      <Link className="back-link" href="/#catalogue">
        ← Back to listings
      </Link>

      <header className="item-heading">
        <span className="item-visual" aria-hidden="true">
          {listing.image_emoji}
        </span>
        <div>
          <p className="eyebrow">Seeded marketplace listing</p>
          <h1>{listing.title}</h1>
          <p className="item-heading__price">SGD {listing.price_sgd}</p>
        </div>
      </header>

      <div className="item-layout">
        <section className="panel" aria-labelledby="details-heading">
          <h2 id="details-heading">Listing details</h2>
          <dl className="fact-list">
            <div>
              <dt>Category</dt>
              <dd>{formatLabel(listing.category)}</dd>
            </div>
            <div>
              <dt>Condition</dt>
              <dd>{formatLabel(listing.condition)}</dd>
            </div>
            <div>
              <dt>Pickup</dt>
              <dd>{listing.pickup}</dd>
            </div>
            <div>
              <dt>Meetup window</dt>
              <dd>{listing.meetup_window}</dd>
            </div>
          </dl>
        </section>

        <section className="panel" aria-labelledby="included-heading">
          <h2 id="included-heading">Included items</h2>
          {listing.includes.length > 0 ? (
            <ul className="detail-list">
              {listing.includes.map((includedItem) => (
                <li key={includedItem}>{includedItem}</li>
              ))}
            </ul>
          ) : (
            <p className="detail-empty">No included extras listed.</p>
          )}
        </section>

        <section className="panel" aria-labelledby="defects-heading">
          <h2 id="defects-heading">Defects listed by the seller</h2>
          {listing.defects.length > 0 ? (
            <ul className="detail-list">
              {listing.defects.map((defect) => (
                <li key={defect}>{defect}</li>
              ))}
            </ul>
          ) : (
            <p className="detail-empty">No defects listed by the seller.</p>
          )}
        </section>

        <section className="panel" aria-labelledby="seller-note-heading">
          <h2 id="seller-note-heading">Seller note</h2>
          <p className="seller-note">{listing.seller_note}</p>
        </section>

        <SimulatedReserve />
      </div>
    </main>
  );
}
