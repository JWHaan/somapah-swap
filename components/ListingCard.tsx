import Link from "next/link";

import type { Listing } from "@/lib/catalogue";

type ListingCardProps = {
  listing: Listing;
  reason?: string;
};

function formatLabel(value: string): string {
  return value
    .split("-")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

export function ListingCard({ listing, reason }: ListingCardProps) {
  return (
    <article className="listing-card" data-listing-id={listing.id}>
      <Link className="listing-card__link" href={`/item/${listing.id}`}>
        <span className="listing-card__visual" aria-hidden="true">
          {listing.image_emoji}
        </span>
        <span className="listing-card__body">
          <h3>{listing.title}</h3>
          <p className="listing-card__price">SGD {listing.price_sgd}</p>
          <span className="listing-card__meta">
            <span className="tag">{formatLabel(listing.condition)}</span>
            <span className="tag">{formatLabel(listing.category)}</span>
          </span>
          <p className="listing-card__detail">
            <strong>Pickup:</strong> {listing.pickup}
          </p>
          <p className="listing-card__detail">
            <strong>Meetup:</strong> {listing.meetup_window}
          </p>
          {reason ? (
            <p className="listing-card__reason">
              <span className="listing-card__reason-label">
                Why it matches:
              </span>{" "}
              {reason}
            </p>
          ) : null}
        </span>
      </Link>
    </article>
  );
}
