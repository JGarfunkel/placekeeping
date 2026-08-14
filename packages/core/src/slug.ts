import { db, spots, stewards } from "@placekeeping/db";
import { and, eq, ne } from "drizzle-orm";

// Hyphen-based, for URL path segments — distinct from the underscore-based
// slugify in packages/importer/src/fields.ts, which normalizes spreadsheet
// headers/enum values instead.
export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type SpotSlugSource = {
  name: string | null | undefined;
  state: string | null | undefined;
  municipality: string | null | undefined;
  postalCity: string | null | undefined;
  useMunicipalityForSlug: boolean | null | undefined;
  // Manual override for the slug's final path segment -- takes precedence
  // over `name` when non-blank, but still runs through slugify() and the
  // collision-suffix loop below like a name-derived slug would.
  slug?: string | null | undefined;
};

export type SpotSlugFields = {
  slugState: string | null;
  slugLocality: string | null;
  slug: string | null;
};

// Recomputes the /<state>/<locality>/<spot-name> URL segments for a spot,
// preferring municipality or postalCity as the locality per
// useMunicipalityForSlug, but falling back to whichever of the two is
// actually set when the preferred one isn't -- e.g. bulk-imported spots
// (packages/importer/src/load-places.ts) carry municipality but never
// postalCity, and reverse-geocoding a rural/unincorporated point can return
// an administrative municipality with no finer-grained locality/sublocality
// to serve as postalCity. Without the fallback, spots like that would never
// get a slug even once every other field is filled in. Returns all-null
// fields (no friendly URL yet) when state, a locality, or name is missing.
// excludeSpotId should be the spot's own id on update, so it doesn't
// collide with its own previous slug.
export async function computeSpotSlug(
  source: SpotSlugSource,
  excludeSpotId?: number,
): Promise<SpotSlugFields> {
  const locality = source.useMunicipalityForSlug
    ? (source.municipality ?? source.postalCity)
    : (source.postalCity ?? source.municipality);

  const slugState = source.state ? slugify(source.state) : "";
  const slugLocality = locality ? slugify(locality) : "";
  const baseSlug = source.slug?.trim()
    ? slugify(source.slug)
    : source.name
      ? slugify(source.name)
      : "";

  if (!slugState || !slugLocality || !baseSlug) {
    return { slugState: null, slugLocality: null, slug: null };
  }

  let candidate = baseSlug;
  let suffix = 2;
  for (;;) {
    const conditions = [
      eq(spots.slugState, slugState),
      eq(spots.slugLocality, slugLocality),
      eq(spots.slug, candidate),
    ];
    if (excludeSpotId !== undefined) {
      conditions.push(ne(spots.spotId, excludeSpotId));
    }
    const [existing] = await db
      .select({ spotId: spots.spotId })
      .from(spots)
      .where(and(...conditions))
      .limit(1);
    if (!existing) break;
    candidate = `${baseSlug}-${suffix}`;
    suffix++;
  }

  return { slugState, slugLocality, slug: candidate };
}

// Globally unique (unlike computeSpotSlug, which is scoped per state+
// locality) -- stewards have no location field to scope by, and forcing
// name uniqueness would block unrelated same-named groups (e.g. two "Vine
// Squad" chapters in different towns), so collisions get a numeric suffix
// instead. excludeStewardId should be the steward's own id on update, so it
// doesn't collide with its own previous slug.
export async function computeStewardSlug(
  name: string,
  excludeStewardId?: string,
): Promise<string> {
  const baseSlug = slugify(name) || "steward";

  let candidate = baseSlug;
  let suffix = 2;
  for (;;) {
    const conditions = [eq(stewards.slug, candidate)];
    if (excludeStewardId !== undefined) {
      conditions.push(ne(stewards.stewardId, excludeStewardId));
    }
    const [existing] = await db
      .select({ stewardId: stewards.stewardId })
      .from(stewards)
      .where(and(...conditions))
      .limit(1);
    if (!existing) break;
    candidate = `${baseSlug}-${suffix}`;
    suffix++;
  }

  return candidate;
}
