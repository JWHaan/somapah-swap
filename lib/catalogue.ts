import { z } from "zod";

import rawListings from "@/data/listings.json";

export const categorySchema = z.enum(["course", "dorm", "tech"]);
export const conditionSchema = z.enum(["new", "like-new", "used", "well-used"]);

export const listingSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.string().min(1),
    category: categorySchema,
    price_sgd: z.number().nonnegative(),
    condition: conditionSchema,
    pickup: z.string().min(1),
    meetup_window: z.string().min(1),
    includes: z.array(z.string().min(1)),
    defects: z.array(z.string().min(1)),
    seller_note: z.string().min(1),
    image_emoji: z.string().min(1),
  })
  .strict();

export const catalogueSchema = z
  .array(listingSchema)
  .length(15, "Catalogue must contain exactly 15 listings.")
  .superRefine((listings, context) => {
    const seenIds = new Set<string>();

    listings.forEach((listing, index) => {
      if (seenIds.has(listing.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate listing ID: ${listing.id}`,
          path: [index, "id"],
        });
      }

      seenIds.add(listing.id);
    });
  });

export type Category = z.infer<typeof categorySchema>;
export type Condition = z.infer<typeof conditionSchema>;
export type Listing = z.infer<typeof listingSchema>;
export type CategoryFilter = "all" | Category;

export function parseCatalogue(input: unknown): Listing[] {
  const result = catalogueSchema.safeParse(input);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "catalogue";
        return `${path}: ${issue.message}`;
      })
      .join("; ");

    throw new Error(`Invalid catalogue data: ${details}`);
  }

  return result.data;
}

const listings = parseCatalogue(rawListings);

export function getListings(): readonly Listing[] {
  return listings;
}

export function getListingById(id: string): Listing | undefined {
  return listings.find((listing) => listing.id === id);
}

export function filterListingsByCategory(
  catalogue: readonly Listing[],
  category: CategoryFilter,
): Listing[] {
  if (category === "all") {
    return [...catalogue];
  }

  return catalogue.filter((listing) => listing.category === category);
}
